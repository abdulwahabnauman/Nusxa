/**
 * Provider retry-delay parsing and failure classification.
 *
 * Imported by BOTH the app (`src/ai/client.ts`) and the Cloudflare worker
 * (`worker/src/index.js`) so the two layers cannot disagree about what is
 * retryable — the same way `src/constants/ai-models.ts` keeps model constants
 * in sync. Keep this file dependency-free: it must bundle cleanly in both
 * runtimes (no React Native imports).
 */

/** Stable, provider-independent failure codes. The worker returns these in
 * `errorDetail.code`; the app maps them to localized copy. */
export type AiErrorCode =
  /** Daily provider cap — retrying again today cannot succeed. */
  | 'quota_exhausted'
  /** Short per-minute 429 burst — worth one delayed retry. */
  | 'rate_limited'
  /** Upstream 5xx (Gemini 503 UNAVAILABLE is model overload). */
  | 'overloaded'
  /** Our own timeout fired; the provider never answered. */
  | 'timeout'
  /** Any other provider rejection: bad key, malformed request, 4xx. */
  | 'upstream'
  /** HTTP 200 but no usable content in the response. */
  | 'empty_response'
  /** Device-side network failure (airplane mode, DNS, no signal). */
  | 'offline'
  /** No key and no proxy available to make the call with. */
  | 'not_configured'
  /** The proxy rejected the shared app key — a build/config problem, not a
   * transient one. Emitted by the worker, never by classifyFailure. */
  | 'unauthorized'
  /** The proxy could not parse the request it was sent. */
  | 'invalid_request'
  /** The proxy URL points at a path that does not exist. */
  | 'not_found';

/** A 429 advertising a delay longer than this is a daily quota rather than a
 * per-minute burst. Observed in the field: `retryDelay: "57s"` on a per-minute
 * cap, versus daily exhaustion which reports no usable short delay. */
export const TERMINAL_QUOTA_AFTER_SECONDS = 60;

/** Longest delay we will wait through silently before retrying. Past this the
 * user is better served by a message plus the Retry button than by a
 * minute-long spinner with no feedback. */
export const MAX_RETRY_WAIT_MS = 20_000;

/** Pull a retry delay out of a provider response.
 *
 * Standard HTTP advertises `Retry-After` in seconds; Gemini instead nests
 * `retryDelay: "57s"` inside `error.details[]`. Both are checked, header first.
 * Returns undefined when neither is present so callers fall back to their own
 * exponential backoff.
 */
export function parseRetryAfterSeconds(
  headerValue: string | null | undefined,
  bodyText: string
): number | undefined {
  if (headerValue) {
    const seconds = Number(headerValue);
    if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds);
  }

  try {
    const details = JSON.parse(bodyText)?.error?.details;
    if (Array.isArray(details)) {
      for (const detail of details) {
        const delay = detail?.retryDelay;
        if (typeof delay === 'string' && delay.endsWith('s')) {
          const seconds = parseFloat(delay);
          if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds);
        }
      }
    }
  } catch {
    // Body wasn't JSON — the provider advertised no delay.
  }

  return undefined;
}

/** Map a failed provider call onto a stable code.
 *
 * `aborted` covers our own AbortController firing, which surfaces as an
 * AbortError with no HTTP status at all — without it a timeout is
 * indistinguishable from a network failure.
 */
export function classifyFailure(input: {
  status?: number;
  retryAfterSeconds?: number;
  aborted?: boolean;
}): AiErrorCode {
  if (input.aborted) return 'timeout';
  if (input.status === 429) {
    return (input.retryAfterSeconds ?? 0) > TERMINAL_QUOTA_AFTER_SECONDS
      ? 'quota_exhausted'
      : 'rate_limited';
  }
  if (typeof input.status === 'number' && input.status >= 500) return 'overloaded';
  return 'upstream';
}

/** Whether a code is worth an automatic retry.
 *
 * `timeout` is deliberately excluded: the full time budget was already spent,
 * so silently spending another one is worse than surfacing the Retry button.
 * `upstream` covers bad keys and malformed requests, and `quota_exhausted` a
 * daily cap — all three fail identically every time.
 */
export function isRetryableCode(code: AiErrorCode): boolean {
  return (
    code === 'rate_limited' ||
    code === 'overloaded' ||
    code === 'empty_response' ||
    code === 'offline'
  );
}

/** Milliseconds to wait before the next attempt: the provider's own delay when
 * it advertised one, otherwise exponential backoff with jitter. Returns
 * undefined when the wait would exceed MAX_RETRY_WAIT_MS, meaning the caller
 * should give up now rather than hang — a retry before the advertised delay
 * has elapsed just fails again.
 */
export function retryDelayMs(attempt: number, retryAfterSeconds?: number): number | undefined {
  if (retryAfterSeconds !== undefined) {
    const wait = retryAfterSeconds * 1000;
    return wait <= MAX_RETRY_WAIT_MS ? wait : undefined;
  }
  // 2s, 4s, 8s + up to 500ms jitter. The previous 1s/2s ladder usually landed
  // inside the same overload window it was waiting out.
  const backoff = 2000 * 2 ** attempt + Math.random() * 500;
  return backoff <= MAX_RETRY_WAIT_MS ? backoff : undefined;
}

/** Classify a failure that never became an HTTP response: our own deadline
 * firing, or the device having no route to the provider.
 *
 * React Native reports an aborted fetch as a bare Error whose message is
 * "Aborted" — no `AbortError` name — so the message has to be matched as well,
 * otherwise a timeout is indistinguishable from any other failure and the user
 * is shown the raw word "Aborted".
 */
export function classifyThrownError(error: unknown): { code: AiErrorCode; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof Error && error.name === 'AbortError') return { code: 'timeout', message };
  if (/abort/i.test(message)) return { code: 'timeout', message };
  if (/network request failed|networkerror|failed to fetch/i.test(message)) {
    return { code: 'offline', message };
  }
  return { code: 'upstream', message };
}

/** Keys of the localized `aiErrors` dictionary section. */
export type AiErrorCopyKey = 'quota' | 'busy' | 'timeout' | 'offline' | 'notConfigured' | 'generic';

/** Which localized string describes a code. Screens use this instead of
 * showing — or pattern-matching — the raw provider message. */
export function copyKeyForCode(code: AiErrorCode): AiErrorCopyKey {
  switch (code) {
    case 'quota_exhausted':
      return 'quota';
    case 'rate_limited':
    case 'overloaded':
    case 'empty_response':
      return 'busy';
    case 'timeout':
      return 'timeout';
    case 'offline':
      return 'offline';
    case 'not_configured':
      return 'notConfigured';
    default:
      return 'generic';
  }
}

import {
  MAX_RETRY_WAIT_MS,
  TERMINAL_QUOTA_AFTER_SECONDS,
  classifyFailure,
  classifyThrownError,
  copyKeyForCode,
  isRetryableCode,
  parseRetryAfterSeconds,
  retryDelayMs,
  type AiErrorCode,
} from '../retry-after';
import { VISION_TIMEOUT_MS, WORKER_VISION_TIMEOUT_MS } from '../../constants/ai-models';

/** The real shape of Gemini's 429: the delay is nested in error.details[], not
 * in a Retry-After header. */
const GEMINI_429_BODY = JSON.stringify({
  error: {
    code: 429,
    message: 'You exceeded your current quota.',
    details: [
      { reason: 'RATE_LIMIT_EXCEEDED' },
      { retryDelay: '57s' },
    ],
  },
});

describe('parseRetryAfterSeconds', () => {
  it('prefers the Retry-After header over the body', () => {
    expect(parseRetryAfterSeconds('30', GEMINI_429_BODY)).toBe(30);
  });

  it('reads Gemini\'s nested retryDelay when there is no header', () => {
    expect(parseRetryAfterSeconds(null, GEMINI_429_BODY)).toBe(57);
    expect(parseRetryAfterSeconds(undefined, GEMINI_429_BODY)).toBe(57);
  });

  it('ignores a non-positive header and falls through to the body', () => {
    expect(parseRetryAfterSeconds('0', GEMINI_429_BODY)).toBe(57);
  });

  it('ignores a header that is not a number', () => {
    expect(parseRetryAfterSeconds('Wed, 21 Oct 2026 07:28:00 GMT', GEMINI_429_BODY)).toBe(57);
  });

  it('returns undefined when neither source advertises a delay', () => {
    expect(parseRetryAfterSeconds(null, '{"error":{"code":503}}')).toBeUndefined();
  });

  it('returns undefined instead of throwing on a non-JSON body', () => {
    // An HTML error page from the edge must not mask the real failure.
    expect(parseRetryAfterSeconds(null, '<html><body>502 Bad Gateway</body></html>')).toBeUndefined();
  });

  it('ignores a malformed retryDelay', () => {
    const body = JSON.stringify({ error: { details: [{ retryDelay: 'soon' }] } });
    expect(parseRetryAfterSeconds(null, body)).toBeUndefined();
  });
});

describe('classifyFailure', () => {
  it('treats our own abort as a timeout whatever the status', () => {
    expect(classifyFailure({ aborted: true })).toBe('timeout');
    expect(classifyFailure({ aborted: true, status: 429 })).toBe('timeout');
  });

  it('treats a short 429 delay as a retryable burst', () => {
    expect(classifyFailure({ status: 429, retryAfterSeconds: 57 })).toBe('rate_limited');
  });

  it('treats a long 429 delay as daily quota exhaustion', () => {
    expect(
      classifyFailure({ status: 429, retryAfterSeconds: TERMINAL_QUOTA_AFTER_SECONDS + 1 })
    ).toBe('quota_exhausted');
  });

  it('treats the boundary delay as still retryable', () => {
    expect(
      classifyFailure({ status: 429, retryAfterSeconds: TERMINAL_QUOTA_AFTER_SECONDS })
    ).toBe('rate_limited');
  });

  it('treats a 429 with no advertised delay as retryable', () => {
    expect(classifyFailure({ status: 429 })).toBe('rate_limited');
  });

  it('treats any 5xx as overload', () => {
    expect(classifyFailure({ status: 500 })).toBe('overloaded');
    expect(classifyFailure({ status: 503 })).toBe('overloaded');
    expect(classifyFailure({ status: 504 })).toBe('overloaded');
  });

  it('treats every other status as an unrecoverable upstream rejection', () => {
    expect(classifyFailure({ status: 400 })).toBe('upstream');
    expect(classifyFailure({ status: 403 })).toBe('upstream');
    expect(classifyFailure({ status: 404 })).toBe('upstream');
    expect(classifyFailure({})).toBe('upstream');
  });
});

describe('isRetryableCode', () => {
  const retryable: AiErrorCode[] = ['rate_limited', 'overloaded', 'empty_response', 'offline'];
  const terminal: AiErrorCode[] = [
    'timeout',
    'quota_exhausted',
    'upstream',
    'not_configured',
    'unauthorized',
    'invalid_request',
    'not_found',
  ];

  it.each(retryable)('retries %s', (code) => {
    expect(isRetryableCode(code)).toBe(true);
  });

  // A timeout already spent the whole budget, and the rest fail identically
  // every time — retrying them just delays the message the user needs.
  it.each(terminal)('gives up on %s', (code) => {
    expect(isRetryableCode(code)).toBe(false);
  });
});

describe('retryDelayMs', () => {
  it('waits the delay the provider advertised', () => {
    expect(retryDelayMs(0, 5)).toBe(5000);
    expect(retryDelayMs(1, 20)).toBe(MAX_RETRY_WAIT_MS);
  });

  it('gives up when the advertised delay exceeds the cap', () => {
    expect(retryDelayMs(0, 21)).toBeUndefined();
    expect(retryDelayMs(0, 3600)).toBeUndefined();
  });

  it('backs off exponentially with jitter when no delay was advertised', () => {
    expect(retryDelayMs(0)).toBeGreaterThanOrEqual(2000);
    expect(retryDelayMs(0)).toBeLessThanOrEqual(2500);
    expect(retryDelayMs(1)).toBeGreaterThanOrEqual(4000);
    expect(retryDelayMs(1)).toBeLessThanOrEqual(4500);
    expect(retryDelayMs(2)).toBeGreaterThanOrEqual(8000);
    expect(retryDelayMs(2)).toBeLessThanOrEqual(8500);
  });

  it('gives up once the backoff passes the cap', () => {
    expect(retryDelayMs(3)).toBeLessThanOrEqual(MAX_RETRY_WAIT_MS);
    expect(retryDelayMs(4)).toBeUndefined();
  });
});

describe('classifyThrownError', () => {
  it('classifies React Native\'s bare "Aborted" as a timeout', () => {
    // RN hands back a plain Error whose message is "Aborted" with no
    // AbortError name — matching the name alone showed users that raw word.
    const { code, message } = classifyThrownError(new Error('Aborted'));
    expect(code).toBe('timeout');
    expect(message).toBe('Aborted');
  });

  it('classifies a named AbortError as a timeout', () => {
    const error = new Error('The operation was aborted');
    error.name = 'AbortError';
    expect(classifyThrownError(error).code).toBe('timeout');
  });

  it('classifies network failures as offline', () => {
    expect(classifyThrownError(new Error('Network request failed')).code).toBe('offline');
    expect(classifyThrownError(new TypeError('Failed to fetch')).code).toBe('offline');
    expect(classifyThrownError(new Error('NetworkError when attempting to fetch')).code).toBe(
      'offline'
    );
  });

  it('leaves anything else as upstream and preserves the message', () => {
    expect(classifyThrownError(new Error('Gemini error: bad key')).code).toBe('upstream');
    expect(classifyThrownError(new Error('Gemini error: bad key')).message).toBe(
      'Gemini error: bad key'
    );
  });

  it('handles a thrown non-Error', () => {
    expect(classifyThrownError('boom')).toEqual({ code: 'upstream', message: 'boom' });
    expect(classifyThrownError(undefined)).toEqual({ code: 'upstream', message: 'undefined' });
  });
});

describe('copyKeyForCode', () => {
  it('maps every code onto a localized string', () => {
    expect(copyKeyForCode('quota_exhausted')).toBe('quota');
    expect(copyKeyForCode('rate_limited')).toBe('busy');
    expect(copyKeyForCode('overloaded')).toBe('busy');
    expect(copyKeyForCode('empty_response')).toBe('busy');
    expect(copyKeyForCode('timeout')).toBe('timeout');
    expect(copyKeyForCode('offline')).toBe('offline');
    expect(copyKeyForCode('not_configured')).toBe('notConfigured');
    expect(copyKeyForCode('upstream')).toBe('generic');
    expect(copyKeyForCode('unauthorized')).toBe('generic');
    expect(copyKeyForCode('invalid_request')).toBe('generic');
    expect(copyKeyForCode('not_found')).toBe('generic');
  });
});

describe('vision timeout budget', () => {
  it('gives the worker room to answer before the app aborts', () => {
    expect(WORKER_VISION_TIMEOUT_MS).toBeLessThan(VISION_TIMEOUT_MS);
  });
});

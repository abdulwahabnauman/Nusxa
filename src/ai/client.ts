import {
  GEMINI_API_BASE,
  GEMINI_MODEL,
  OPENROUTER_API_BASE,
  NEMOTRON_MODEL,
  GROQ_API_BASE,
  GROQ_MODEL,
  API_TIMEOUT_MS,
  API_MAX_RETRIES,
  VISION_TIMEOUT_MS,
  VISION_MAX_RETRIES,
  AI_PROXY_URL,
  AI_PROXY_APP_KEY,
  isAiProxyConfigured,
} from '../constants/config';
import { shouldUseProxy } from './routing';
import {
  classifyFailure,
  classifyThrownError,
  copyKeyForCode,
  isRetryableCode,
  parseRetryAfterSeconds,
  retryDelayMs,
  type AiErrorCode,
  type AiErrorCopyKey,
} from './retry-after';
import { useSettingsStore } from '../stores/settings-store';

interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

interface GeminiContent {
  role?: string;
  parts: GeminiPart[];
}

interface GeminiRequest {
  systemInstruction?: {
    parts: GeminiPart[];
  };
  contents: GeminiContent[];
  generationConfig: {
    temperature: number;
    maxOutputTokens: number;
    responseMimeType?: string;
    responseSchema?: unknown;
  };
}

interface GeminiResponse {
  candidates?: {
    content: {
      parts: { text: string }[];
    };
    finishReason?: string;
  }[];
  error?: {
    code: number;
    message: string;
  };
}

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  temperature: number;
  max_tokens: number;
  response_format?: { type: 'json_object' };
}

interface OpenRouterResponse {
  choices?: {
    message: { content: string };
    finish_reason?: string;
  }[];
  error?: {
    code: number | string;
    message: string;
  };
}

export class AIError extends Error {
  /** Stable, provider-independent failure code — what the UI switches on. */
  code: AiErrorCode;
  statusCode?: number;
  retryable: boolean;
  /** Delay the provider itself advertised, when it gave one. */
  retryAfterMs?: number;
  /** Daily provider cap. Retrying again today cannot succeed, so the UI says
   * "try again tomorrow" instead of offering an immediate Retry. */
  quotaExhausted: boolean;

  constructor(
    message: string,
    options: { code?: AiErrorCode; statusCode?: number; retryAfterSeconds?: number } = {}
  ) {
    super(message);
    this.name = 'AIError';
    this.code = options.code ?? 'upstream';
    this.statusCode = options.statusCode;
    this.retryAfterMs =
      options.retryAfterSeconds !== undefined ? options.retryAfterSeconds * 1000 : undefined;
    this.quotaExhausted = this.code === 'quota_exhausted';
    this.retryable = isRetryableCode(this.code);
  }
}

/** Network failures and our own aborts arrive as plain Errors. Give them a
 * code so every caller can classify failures the same way. */
function toAIError(error: unknown): AIError {
  if (error instanceof AIError) return error;
  const { code, message } = classifyThrownError(error);
  return new AIError(message, { code });
}

/** Classify a non-OK provider response. The raw body is logged in dev only:
 * it is an English JSON blob that means nothing to the user and discloses
 * provider and account-tier details, so it never enters the error message. */
async function throwForResponse(response: Response, provider: string): Promise<never> {
  const bodyText = await response.text();
  const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get('retry-after'), bodyText);
  const code = classifyFailure({ status: response.status, retryAfterSeconds });
  if (__DEV__) console.warn(`[ai] ${provider} ${response.status}`, bodyText.slice(0, 500));
  throw new AIError(`${provider} error ${response.status}`, {
    code,
    statusCode: response.status,
    retryAfterSeconds,
  });
}

/** One retry loop for every transport. Retries only what isRetryableCode
 * allows, and waits the provider's own advertised delay when it gave one —
 * except when that delay exceeds the shared cap, where failing fast with a
 * clear message beats a minute-long spinner. */
async function withRetry<T>(attempt: () => Promise<T>, maxRetries: number): Promise<T> {
  let lastError: AIError | null = null;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await attempt();
    } catch (error) {
      lastError = toAIError(error);
      if (!lastError.retryable || i === maxRetries) throw lastError;

      const wait = retryDelayMs(
        i,
        lastError.retryAfterMs !== undefined ? lastError.retryAfterMs / 1000 : undefined
      );
      if (wait === undefined) throw lastError;
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }

  throw lastError ?? new AIError('Unknown error calling AI service');
}

/** Which `aiErrors` dictionary key describes this failure. Screens use it to
 * pick localized copy instead of showing — or pattern-matching — the raw
 * provider message. */
export function aiErrorCopyKey(error: unknown): AiErrorCopyKey {
  return copyKeyForCode(toAIError(error).code);
}

function proxyHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (AI_PROXY_APP_KEY) headers['x-app-key'] = AI_PROXY_APP_KEY;
  return headers;
}

interface ProxyReply {
  content?: string;
  /** Short human-safe summary — the worker never forwards upstream bodies. */
  error?: string;
  errorDetail?: { code?: AiErrorCode; status?: number; retryAfterSeconds?: number };
}

/** Post to the serverless proxy and return the generated content. The proxy
 * holds the provider keys server-side, so the device never needs any.
 *
 * The proxy makes one attempt per request and retry lives here, so a slow
 * provider is visible to the caller instead of hiding inside a proxy that
 * looks hung. */
async function callProxy(
  pathname: string,
  body: unknown,
  timeoutMs: number = API_TIMEOUT_MS,
  maxRetries: number = API_MAX_RETRIES
): Promise<string> {
  return withRetry(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${AI_PROXY_URL}${pathname}`, {
        method: 'POST',
        headers: proxyHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      // Read the body once as text: a non-JSON reply (an HTML error page from
      // the edge, say) must not throw a parse error on top of the real failure.
      const rawText = await response.text();
      let data: ProxyReply = {};
      try {
        data = JSON.parse(rawText) as ProxyReply;
      } catch {
        data = {};
      }

      if (!response.ok) {
        const detail = data.errorDetail;
        throw new AIError(data.error ?? `AI proxy error ${response.status}`, {
          code: detail?.code ?? classifyFailure({ status: response.status }),
          statusCode: detail?.status ?? response.status,
          retryAfterSeconds:
            detail?.retryAfterSeconds ??
            parseRetryAfterSeconds(response.headers.get('retry-after'), rawText),
        });
      }

      if (!data.content) {
        throw new AIError(data.error ?? 'Empty response from AI proxy', {
          code: 'empty_response',
          statusCode: response.status,
        });
      }
      return data.content;
    } finally {
      clearTimeout(timeout);
    }
  }, maxRetries);
}

function buildGeminiUrl(apiKey: string): string {
  return `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
}

async function callGemini(
  systemPrompt: string,
  contents: GeminiContent[],
  apiKey: string,
  temperature = 0.1,
  jsonResponse = true,
  responseSchema?: unknown,
  timeoutMs: number = API_TIMEOUT_MS,
  maxRetries: number = API_MAX_RETRIES
): Promise<string> {
  return withRetry(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const body: GeminiRequest = {
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents,
        generationConfig: {
          temperature,
          maxOutputTokens: 4096,
          ...(jsonResponse ? { responseMimeType: 'application/json' } : {}),
          // Controlled generation: hard-enforces the JSON shape server-side
          ...(responseSchema ? { responseSchema } : {}),
        },
      };

      const response = await fetch(buildGeminiUrl(apiKey), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) await throwForResponse(response, 'Gemini API');

      const data: GeminiResponse = await response.json();

      if (data.error) {
        throw new AIError(`Gemini error: ${data.error.message}`, {
          code: classifyFailure({ status: data.error.code }),
          statusCode: data.error.code,
        });
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        throw new AIError('Empty response from AI service', { code: 'empty_response' });
      }

      return text;
    } finally {
      clearTimeout(timeout);
    }
  }, maxRetries);
}

/** Call an OpenAI-compatible chat completions endpoint (used for both OpenRouter/Nemotron and Groq) */
async function callOpenAICompatible(
  baseUrl: string,
  model: string,
  systemPrompt: string,
  messages: OpenRouterMessage[],
  apiKey: string,
  temperature = 0.1,
  jsonResponse = true
): Promise<string> {
  return withRetry(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
      const body: OpenRouterRequest = {
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature,
        max_tokens: 4096,
        ...(jsonResponse ? { response_format: { type: 'json_object' } } : {}),
      };

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) await throwForResponse(response, 'AI API');

      const data: OpenRouterResponse = await response.json();

      if (data.error) {
        const status = Number(data.error.code) || undefined;
        throw new AIError(`AI service error: ${data.error.message}`, {
          code: classifyFailure({ status }),
          statusCode: status,
        });
      }

      const text = data.choices?.[0]?.message?.content;

      if (!text) {
        throw new AIError('Empty response from AI service', { code: 'empty_response' });
      }

      return text;
    } finally {
      clearTimeout(timeout);
    }
  }, API_MAX_RETRIES);
}

/** Text keys needed for the primary (Groq) + fallback (Nemotron/OpenRouter) chain */
export interface TextProviderKeys {
  openRouterKey: string;
  groqKey: string;
}

/**
 * Call Groq's gpt-oss-120b first (free, 1,000 req/day), and if that's out of
 * quota or down, drop to Nemotron 3 Ultra via OpenRouter (free, ~50 req/day).
 */
async function callTextModel(
  systemPrompt: string,
  messages: OpenRouterMessage[],
  keys: TextProviderKeys,
  temperature = 0.1,
  jsonResponse = true
): Promise<string> {
  let lastError: Error | null = null;

  if (keys.groqKey) {
    try {
      return await callOpenAICompatible(
        GROQ_API_BASE,
        GROQ_MODEL,
        systemPrompt,
        messages,
        keys.groqKey,
        temperature,
        jsonResponse
      );
    } catch (primaryError) {
      // Groq is unavailable. Fall back to Nemotron via OpenRouter
      lastError = primaryError as Error;
    }
  }

  if (!keys.openRouterKey) {
    throw lastError ?? new Error('No AI API key configured');
  }

  return callOpenAICompatible(
    OPENROUTER_API_BASE,
    NEMOTRON_MODEL,
    systemPrompt,
    messages,
    keys.openRouterKey,
    temperature,
    jsonResponse
  );
}

/** Send a text-only prompt to Groq's gpt-oss-120b (free), falling back to Nemotron 3 Ultra (free) if that's exhausted */
export async function chatCompletion(
  systemPrompt: string,
  userMessage: string,
  keys: TextProviderKeys
): Promise<string> {
  const hasTextKeys = keys.groqKey.trim().length > 0 || keys.openRouterKey.trim().length > 0;
  if (
    shouldUseProxy(
      isAiProxyConfigured(),
      useSettingsStore.getState().useOwnKeys,
      hasTextKeys
    )
  ) {
    return callProxy('/chat', {
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      temperature: 0.1,
      json: true,
    });
  }

  return callTextModel(
    systemPrompt,
    [{ role: 'user', content: userMessage }],
    keys,
    0.1,
    true
  );
}

/** Options for vision calls. OCR uses temperature 0 plus a response schema
 * so extraction is deterministic and the JSON shape is hard-enforced. */
export interface VisionOptions {
  temperature?: number;
  responseSchema?: unknown;
}

/** Send one or more images + a text prompt to Gemini (Vision). Multiple
 * images let a multi-page prescription be read as a single document. */
export async function visionCompletion(
  systemPrompt: string,
  userText: string,
  imagesBase64: string[],
  apiKey: string,
  options?: VisionOptions
): Promise<string> {
  const temperature = options?.temperature ?? 0;
  const viaProxy = shouldUseProxy(
    isAiProxyConfigured(),
    useSettingsStore.getState().useOwnKeys,
    apiKey.trim().length > 0
  );
  // A saved key is ignored while "Use my own keys" is off, which reads as a bug
  // from the outside — make the actual route observable in dev.
  if (__DEV__) {
    console.log(
      `[ai] vision via ${viaProxy ? 'proxy' : 'own Gemini key'} (${imagesBase64.length} page(s))`
    );
  }

  if (viaProxy) {
    return callProxy(
      '/vision',
      {
        system: systemPrompt,
        text: userText,
        // `image` keeps older workers working; `images` carries every page
        image: imagesBase64[0],
        images: imagesBase64,
        temperature,
        responseSchema: options?.responseSchema,
      },
      VISION_TIMEOUT_MS,
      VISION_MAX_RETRIES
    );
  }

  return callGemini(
    systemPrompt,
    [
      {
        role: 'user',
        parts: [
          { text: userText },
          ...imagesBase64.map((b64) => ({
            inlineData: {
              mimeType: 'image/jpeg',
              data: b64,
            },
          })),
        ],
      },
    ],
    apiKey,
    temperature,
    true,
    options?.responseSchema,
    VISION_TIMEOUT_MS,
    VISION_MAX_RETRIES
  );
}

/** Multi-turn chat completion (Groq's gpt-oss-120b first, falling back to Nemotron 3 Ultra when Groq is unavailable) */
export async function multiTurnChat(
  messages: { role: string; content: string }[],
  keys: TextProviderKeys
): Promise<string> {
  // Extract system prompt from messages
  const systemMsg = messages.find((m) => m.role === 'system');
  const systemPrompt = systemMsg?.content ?? '';

  // Convert remaining messages to OpenRouter's OpenAI-style format
  const chatMessages: OpenRouterMessage[] = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

  if (
    shouldUseProxy(
      isAiProxyConfigured(),
      useSettingsStore.getState().useOwnKeys,
      keys.groqKey.trim().length > 0 || keys.openRouterKey.trim().length > 0
    )
  ) {
    return callProxy('/chat', {
      system: systemPrompt,
      messages: chatMessages,
      temperature: 0.3,
      json: false,
    });
  }

  return callTextModel(systemPrompt, chatMessages, keys, 0.3, false);
}
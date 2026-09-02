/**
 * Nusxa AI proxy — holds all AI provider keys server-side so app users
 * (elderly, non-technical) never have to obtain or configure API keys.
 *
 * Endpoints:
 *   POST /chat   { system, messages: [{ role, content }], temperature?, json? }
 *   POST /vision { system, text, images: [base64 jpeg, ...] | image: base64 jpeg }
 *   GET  /       health check
 *
 * Required secrets (set with `wrangler secret put <NAME>`):
 *   GEMINI_API_KEY, OPENROUTER_API_KEY, GROQ_API_KEY, APP_KEY
 *
 * Model constants are imported from the shared app module, so the worker and
 * the app can never drift apart (single source of truth).
 *
 * Error contract: failures reply with a short human-safe `error` summary plus
 * a structured `errorDetail: { code, status, retryAfterSeconds? }`. Upstream
 * response bodies are logged here and never forwarded — they are English JSON
 * blobs that mean nothing to the app's users and disclose provider details.
 *
 * Retry ownership lives in the app, not here: a proxy that silently retried
 * for 90s was indistinguishable from a hang, and the client outlived none of
 * it. Each attempt below is bounded by WORKER_VISION_TIMEOUT_MS, which is kept
 * under the app's VISION_TIMEOUT_MS so the client always gets a real reply.
 */

import {
  GEMINI_MODEL,
  GEMINI_API_BASE as GEMINI_BASE,
  OPENROUTER_API_BASE as OPENROUTER_BASE,
  NEMOTRON_MODEL,
  GROQ_API_BASE as GROQ_BASE,
  GROQ_MODEL,
  API_TIMEOUT_MS as TIMEOUT_MS,
  WORKER_VISION_TIMEOUT_MS as VISION_TIMEOUT_MS,
} from '../../src/constants/ai-models';
import {
  parseRetryAfterSeconds,
  classifyFailure,
} from '../../src/ai/retry-after';

const ERROR_SUMMARIES = {
  quota_exhausted: 'The AI service has reached its daily limit. Please try again tomorrow.',
  rate_limited: 'The AI service is busy. Please try again in a moment.',
  overloaded: 'The AI service is temporarily unavailable. Please try again.',
  timeout: 'The AI service took too long to respond. Please try again.',
  upstream: 'The AI service failed. Please try again.',
  empty_response: 'The AI service returned nothing usable. Please try again.',
  not_configured: 'The AI service is not configured.',
  invalid_request: 'Invalid request.',
  unauthorized: 'Unauthorized.',
  not_found: 'Not found.',
};

function jsonReply(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorReply(code, status, retryAfterSeconds) {
  return jsonReply(
    {
      error: ERROR_SUMMARIES[code] ?? ERROR_SUMMARIES.upstream,
      errorDetail: {
        code,
        status,
        ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
      },
    },
    status,
  );
}

/** Carry just enough provider detail to classify the failure. The upstream
 * body is deliberately not attached — it must not reach the client. */
function upstreamError(reason, { status, retryAfterSeconds, aborted } = {}) {
  const error = new Error(reason);
  error.status = status;
  error.retryAfterSeconds = replyAfterSeconds(retryAfterSeconds);
  error.aborted = aborted;
  return error;
}

function replyAfterSeconds(seconds) {
  return typeof seconds === 'number' && seconds > 0 ? seconds : undefined;
}

/** Classify a provider failure into the reply the client should see. */
function upstreamErrorReply(error, context) {
  const code = classifyFailure({
    status: error?.status,
    retryAfterSeconds: error?.retryAfterSeconds,
    aborted: error?.aborted,
  });
  // Server-side only: this is the sole place the raw provider body survives,
  // which is where it belongs for debugging quota and overload failures.
  console.error(`[proxy] ${context} failed`, { code, status: error?.status, reason: error?.message });

  const status =
    code === 'quota_exhausted' || code === 'rate_limited'
      ? 429
      : code === 'timeout'
        ? 504
        : code === 'overloaded'
          ? (error?.status ?? 502)
          : 502;
  return errorReply(code, status, error?.retryAfterSeconds);
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url, options, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    // Flag our own deadline separately from a network failure: a timeout means
    // the provider is slow, not unreachable, and the client says so differently.
    if (error?.name === 'AbortError') {
      throw upstreamError(`Upstream request timed out after ${timeoutMs}ms`, { aborted: true });
    }
    throw upstreamError('Upstream request failed');
  } finally {
    clearTimeout(timer);
  }
}

/** OpenAI-compatible chat completion (used for both OpenRouter and Groq) */
async function chatCompletion(baseUrl, model, apiKey, system, messages, temperature, json) {
  const body = {
    model,
    messages: [{ role: 'system', content: system }, ...messages],
    temperature,
    max_tokens: 4096,
  };
  if (json) body.response_format = { type: 'json_object' };

  const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw upstreamError('Text provider rejected the request', {
      status: response.status,
      retryAfterSeconds: parseRetryAfterSeconds(response.headers.get('retry-after'), errorBody),
    });
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw upstreamError('Empty response from text provider', { status: 200 });
  }
  return content;
}

/** Text chat: Groq first, Nemotron via OpenRouter fallback when quota/error */
async function handleChat(request, env) {
  const body = await readJson(request);
  if (!body || typeof body.system !== 'string' || !Array.isArray(body.messages)) {
    return errorReply('invalid_request', 400);
  }

  const temperature = typeof body.temperature === 'number' ? body.temperature : 0.1;
  const json = body.json !== false;

  let primaryError = null;
  if (env.GROQ_API_KEY) {
    try {
      const content = await chatCompletion(
        GROQ_BASE, GROQ_MODEL, env.GROQ_API_KEY,
        body.system, body.messages, temperature, json,
      );
      return jsonReply({ content });
    } catch (error) {
      primaryError = error;
    }
  }

  if (env.OPENROUTER_API_KEY) {
    try {
      const content = await chatCompletion(
        OPENROUTER_BASE, NEMOTRON_MODEL, env.OPENROUTER_API_KEY,
        body.system, body.messages, temperature, json,
      );
      return jsonReply({ content });
    } catch (error) {
      // The fallback also failed, so report the fallback's reason: it is the
      // provider the client would have to wait on anyway.
      return upstreamErrorReply(error, 'chat fallback');
    }
  }

  if (primaryError) return upstreamErrorReply(primaryError, 'chat');
  return errorReply('not_configured', 502);
}

async function callGeminiOnce(env, system, text, images, temperature, responseSchema) {
  const generationConfig = {
    temperature,
    maxOutputTokens: 4096,
    responseMimeType: 'application/json',
  };
  // Controlled generation: the app sends a response schema so the OCR JSON
  // shape is hard-enforced. Older app versions omit it — keep working.
  if (responseSchema && typeof responseSchema === 'object') {
    generationConfig.responseSchema = responseSchema;
  }
  const geminiBody = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{
      role: 'user',
      parts: [
        { text },
        ...images.map((data) => ({ inlineData: { mimeType: 'image/jpeg', data } })),
      ],
    }],
    generationConfig,
  };

  const response = await fetchWithTimeout(
    `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
    },
    VISION_TIMEOUT_MS,
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw upstreamError('Gemini rejected the request', {
      status: response.status,
      retryAfterSeconds: parseRetryAfterSeconds(response.headers.get('retry-after'), errorBody),
    });
  }

  const data = await response.json();
  // Named apart from the `text` prompt parameter above — redeclaring that name
  // here is a SyntaxError in an ES module and silently blocks every deploy.
  const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!replyText) {
    throw upstreamError('Empty response from Gemini', { status: 200 });
  }
  return replyText;
}

/** Prescription OCR via Gemini Vision. Accepts a multi-page prescription as
 * `images` (up to 3) or a single `image` from older app versions.
 *
 * One attempt only: the client owns retry, because only the client can show
 * progress or offer a Retry button. */
async function handleVision(request, env) {
  if (!env.GEMINI_API_KEY) {
    return errorReply('not_configured', 502);
  }

  const body = await readJson(request);
  if (!body || typeof body.system !== 'string' || typeof body.text !== 'string') {
    return errorReply('invalid_request', 400);
  }

  const images = Array.isArray(body.images) && body.images.length > 0
    ? body.images.filter((img) => typeof img === 'string' && img.length > 0).slice(0, 3)
    : typeof body.image === 'string' && body.image.length > 0
      ? [body.image]
      : [];
  if (images.length === 0) {
    return errorReply('invalid_request', 400);
  }

  // OCR is deterministic (temperature 0) on newer app versions; older
  // versions that don't send the field keep the previous 0.1 behavior.
  const temperature = typeof body.temperature === 'number' ? body.temperature : 0.1;

  try {
    const content = await callGeminiOnce(env, body.system, body.text, images, temperature, body.responseSchema);
    return jsonReply({ content });
  } catch (error) {
    // An empty 200 is its own code so the client can retry it; every other
    // failure is classified from the status the provider returned.
    if (error?.status === 200) return errorReply('empty_response', 502);
    return upstreamErrorReply(error, 'vision');
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/') {
      return jsonReply({ ok: true, service: 'nusxa-ai-proxy' });
    }
    if (request.method !== 'POST') {
      return errorReply('not_found', 404);
    }

    // Fail closed. A worker deployed without the APP_KEY secret used to skip
    // this check entirely, handing the providers' quota to anyone who found
    // the URL. GET / above stays open so a broken deploy is still diagnosable.
    if (!env.APP_KEY) {
      console.error('[proxy] APP_KEY secret is not set — refusing all requests');
      return errorReply('not_configured', 503);
    }

    // Shared app secret stops strangers from burning the provider quotas.
    if (request.headers.get('x-app-key') !== env.APP_KEY) {
      return errorReply('unauthorized', 401);
    }

    if (url.pathname === '/chat') return handleChat(request, env);
    if (url.pathname === '/vision') return handleVision(request, env);
    return errorReply('not_found', 404);
  },
};

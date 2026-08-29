/**
 * Nusxa AI proxy — holds all AI provider keys server-side so app users
 * (elderly, non-technical) never have to obtain or configure API keys.
 *
 * Endpoints:
 *   POST /chat   { system, messages: [{ role, content }], temperature?, json? }
 *   POST /vision { system, text, image (base64 jpeg) }
 *   GET  /       health check
 *
 * Required secrets (set with `wrangler secret put <NAME>`):
 *   GEMINI_API_KEY, OPENROUTER_API_KEY, GROQ_API_KEY, APP_KEY
 *
 * Model constants mirror src/constants/config.ts in the app — keep in sync.
 */

const GEMINI_MODEL = 'gemini-3.6-flash';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const NEMOTRON_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free';
const GROQ_BASE = 'https://api.groq.com/openai/v1';
const GROQ_MODEL = 'openai/gpt-oss-120b';
const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

function jsonReply(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
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
    throw new Error(`AI API error ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from AI service');
  return text;
}

/** Text chat: Nemotron via OpenRouter first, Groq fallback when quota/error */
async function handleChat(request, env) {
  const body = await readJson(request);
  if (!body || typeof body.system !== 'string' || !Array.isArray(body.messages)) {
    return jsonReply({ error: 'Invalid request body' }, 400);
  }

  const temperature = typeof body.temperature === 'number' ? body.temperature : 0.1;
  const json = body.json !== false;

  let primaryError = null;
  if (env.OPENROUTER_API_KEY) {
    try {
      const content = await chatCompletion(
        OPENROUTER_BASE, NEMOTRON_MODEL, env.OPENROUTER_API_KEY,
        body.system, body.messages, temperature, json,
      );
      return jsonReply({ content });
    } catch (error) {
      primaryError = error;
    }
  }

  if (env.GROQ_API_KEY) {
    try {
      const content = await chatCompletion(
        GROQ_BASE, GROQ_MODEL, env.GROQ_API_KEY,
        body.system, body.messages, temperature, json,
      );
      return jsonReply({ content });
    } catch (error) {
      return jsonReply({ error: `AI service failed: ${error.message}` }, 502);
    }
  }

  return jsonReply(
    { error: primaryError ? `AI service failed: ${primaryError.message}` : 'No text provider configured' },
    502,
  );
}

async function callGeminiOnce(env, body) {
  const geminiBody = {
    systemInstruction: { parts: [{ text: body.system }] },
    contents: [{
      role: 'user',
      parts: [
        { text: body.text },
        { inlineData: { mimeType: 'image/jpeg', data: body.image } },
      ],
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
    },
  };

  const response = await fetchWithTimeout(
    `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
    },
  );

  if (!response.ok) {
    const error = new Error(`Gemini API error ${response.status}: ${await response.text()}`);
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const error = new Error('Empty response from Gemini');
    error.status = 502;
    throw error;
  }
  return text;
}

/** Prescription OCR via Gemini Vision, with retry on rate-limit/server errors */
async function handleVision(request, env) {
  if (!env.GEMINI_API_KEY) {
    return jsonReply({ error: 'Vision provider not configured' }, 502);
  }

  const body = await readJson(request);
  if (!body || typeof body.system !== 'string' || typeof body.text !== 'string' || typeof body.image !== 'string') {
    return jsonReply({ error: 'Invalid request body' }, 400);
  }

  let lastError = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const content = await callGeminiOnce(env, body);
      return jsonReply({ content });
    } catch (error) {
      lastError = error;
      const retryable = error.status === 429 || error.status >= 500;
      if (!retryable || attempt === MAX_RETRIES) break;
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }

  return jsonReply({ error: `Vision service failed: ${lastError?.message ?? 'unknown error'}` }, 502);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/') {
      return jsonReply({ ok: true, service: 'nusxa-ai-proxy' });
    }
    if (request.method !== 'POST') {
      return jsonReply({ error: 'Not found' }, 404);
    }

    // Shared app secret stops strangers from burning the provider quotas.
    if (env.APP_KEY && request.headers.get('x-app-key') !== env.APP_KEY) {
      return jsonReply({ error: 'Unauthorized' }, 401);
    }

    if (url.pathname === '/chat') return handleChat(request, env);
    if (url.pathname === '/vision') return handleVision(request, env);
    return jsonReply({ error: 'Not found' }, 404);
  },
};

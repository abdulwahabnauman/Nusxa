import {
  GEMINI_API_BASE,
  GEMINI_MODEL,
  OPENROUTER_API_BASE,
  NEMOTRON_MODEL,
  GROQ_API_BASE,
  GROQ_MODEL,
  API_TIMEOUT_MS,
  API_MAX_RETRIES,
  AI_PROXY_URL,
  AI_PROXY_APP_KEY,
  isAiProxyConfigured,
} from '../constants/config';
import { shouldUseProxy } from './routing';
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
  };
}

interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{ text: string }>;
    };
    finishReason?: string;
  }>;
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
  choices?: Array<{
    message: { content: string };
    finish_reason?: string;
  }>;
  error?: {
    code: number | string;
    message: string;
  };
}

export class AIError extends Error {
  statusCode?: number;
  retryable: boolean;

  constructor(message: string, statusCode?: number, retryable = true) {
    super(message);
    this.name = 'AIError';
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

function proxyHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (AI_PROXY_APP_KEY) headers['x-app-key'] = AI_PROXY_APP_KEY;
  return headers;
}

/** Post to the serverless proxy and return the generated content. The proxy
 * holds the provider keys server-side, so the device never needs any. */
async function callProxy(pathname: string, body: unknown): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(`${AI_PROXY_URL}${pathname}`, {
      method: 'POST',
      headers: proxyHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new AIError(
        `AI proxy error ${response.status}: ${errorBody}`,
        response.status,
        response.status === 429 || response.status >= 500
      );
    }

    const data = (await response.json()) as { content?: string; error?: string };
    if (!data.content) {
      throw new AIError(data.error ?? 'Empty response from AI proxy');
    }
    return data.content;
  } finally {
    clearTimeout(timeout);
  }
}

function buildGeminiUrl(apiKey: string): string {
  return `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
}

async function callGemini(
  systemPrompt: string,
  contents: GeminiContent[],
  apiKey: string,
  temperature = 0.1,
  jsonResponse = true
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= API_MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

      const body: GeminiRequest = {
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents,
        generationConfig: {
          temperature,
          maxOutputTokens: 4096,
          ...(jsonResponse ? { responseMimeType: 'application/json' } : {}),
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

      clearTimeout(timeout);

      if (!response.ok) {
        const errorBody = await response.text();
        const retryable = response.status === 429 || response.status >= 500;
        throw new AIError(
          `Gemini API error ${response.status}: ${errorBody}`,
          response.status,
          retryable
        );
      }

      const data: GeminiResponse = await response.json();

      if (data.error) {
        throw new AIError(`Gemini error: ${data.error.message}`, data.error.code);
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        throw new AIError('Empty response from AI service');
      }

      return text;
    } catch (error) {
      lastError = error as Error;

      if (error instanceof AIError && !error.retryable) {
        throw error;
      }

      if (attempt < API_MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  }

  throw lastError ?? new Error('Unknown error calling Gemini');
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
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= API_MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

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

      clearTimeout(timeout);

      if (!response.ok) {
        const errorBody = await response.text();
        const retryable = response.status === 429 || response.status >= 500;
        throw new AIError(
          `AI API error ${response.status}: ${errorBody}`,
          response.status,
          retryable
        );
      }

      const data: OpenRouterResponse = await response.json();

      if (data.error) {
        throw new AIError(`AI service error: ${data.error.message}`, Number(data.error.code) || undefined);
      }

      const text = data.choices?.[0]?.message?.content;

      if (!text) {
        throw new AIError('Empty response from AI service');
      }

      return text;
    } catch (error) {
      lastError = error as Error;

      if (error instanceof AIError && !error.retryable) {
        throw error;
      }

      if (attempt < API_MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  }

  throw lastError ?? new Error('Unknown error calling AI service');
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

/** Send an image + text prompt to Gemini (Vision) */
export async function visionCompletion(
  systemPrompt: string,
  userText: string,
  imageBase64: string,
  apiKey: string
): Promise<string> {
  if (
    shouldUseProxy(
      isAiProxyConfigured(),
      useSettingsStore.getState().useOwnKeys,
      apiKey.trim().length > 0
    )
  ) {
    return callProxy('/vision', {
      system: systemPrompt,
      text: userText,
      image: imageBase64,
    });
  }

  return callGemini(
    systemPrompt,
    [
      {
        role: 'user',
        parts: [
          { text: userText },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: imageBase64,
            },
          },
        ],
      },
    ],
    apiKey,
    0.1,
    true
  );
}

/** Multi-turn chat completion (Groq's gpt-oss-120b first, falling back to Nemotron 3 Ultra when Groq is unavailable) */
export async function multiTurnChat(
  messages: Array<{ role: string; content: string }>,
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
import { GEMINI_API_BASE, GEMINI_MODEL, API_TIMEOUT_MS, API_MAX_RETRIES } from '../constants/config';

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

/** Send a text-only prompt to Gemini */
export async function chatCompletion(
  systemPrompt: string,
  userMessage: string,
  apiKey: string
): Promise<string> {
  return callGemini(
    systemPrompt,
    [{ role: 'user', parts: [{ text: userMessage }] }],
    apiKey,
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

/** Multi-turn chat completion */
export async function multiTurnChat(
  messages: Array<{ role: string; content: string }>,
  apiKey: string
): Promise<string> {
  // Extract system prompt from messages
  const systemMsg = messages.find((m) => m.role === 'system');
  const systemPrompt = systemMsg?.content ?? '';

  // Convert remaining messages to Gemini contents
  const contents: GeminiContent[] = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  return callGemini(systemPrompt, contents, apiKey, 0.3, false);
}

/**
 * Optional serverless proxy (worker/ directory) that holds the AI provider
 * keys server-side, so end users never have to obtain or configure API keys.
 * When set, all AI calls route through the proxy and locally stored keys are
 * ignored. When empty, the app falls back to bring-your-own-key mode.
 */
export const AI_PROXY_URL = (process.env.EXPO_PUBLIC_AI_PROXY_URL ?? '').replace(/\/+$/, '');
export const AI_PROXY_APP_KEY = process.env.EXPO_PUBLIC_AI_PROXY_APP_KEY ?? '';

export function isAiProxyConfigured(): boolean {
  return AI_PROXY_URL.trim().length > 0;
}

/**
 * AI model + endpoint constants live in ./ai-models, shared verbatim with the
 * Cloudflare worker (worker/src/index.js) so the two can never drift apart.
 */
export {
  GEMINI_MODEL,
  GEMINI_API_BASE,
  OPENROUTER_API_BASE,
  NEMOTRON_MODEL,
  GROQ_API_BASE,
  GROQ_MODEL,
  API_TIMEOUT_MS,
  API_MAX_RETRIES,
} from './ai-models';

/** Maximum image file size in bytes (10 MB) */
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

/** Supported image formats */
export const SUPPORTED_IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'heic', 'webp'];

/** Minimum confidence threshold to flag a field for review */
export const LOW_CONFIDENCE_THRESHOLD = 0.6;

/**
 * Blur gate: a Laplacian-variance sharpness score below this (measured on a
 * 512px-wide downsample) is treated as blurry and the user is asked to retake
 * before an API call is spent on it.
 */
export const BLUR_VARIANCE_THRESHOLD = 55;

/** Maximum images (pages) allowed in a single prescription scan session */
export const MAX_PRESCRIPTION_PAGES = 3;

/** Default database name */
export const DB_NAME = 'nusxa.db';

/** Reminder snooze duration in minutes */
export const SNOOZE_MINUTES = 15;

/** Undo window duration in seconds */
export const UNDO_WINDOW_SECONDS = 30;

/** Maximum prescription images to retain */
export const MAX_RETAINED_IMAGES = 100;
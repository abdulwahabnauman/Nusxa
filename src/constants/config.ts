/** Google Gemini API configuration (free tier with vision) — used only for prescription OCR */
export const GEMINI_MODEL = 'gemini-2.5-flash';
export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** OpenRouter configuration — used for text-only chat/explanation, routed to Nemotron 3 Ultra (free) */
export const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';
export const NEMOTRON_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free';

/** API timeout in milliseconds */
export const API_TIMEOUT_MS = 30_000;

/** Maximum retry attempts for API calls */
export const API_MAX_RETRIES = 2;

/** Maximum image file size in bytes (10 MB) */
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

/** Supported image formats */
export const SUPPORTED_IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'heic', 'webp'];

/** Minimum confidence threshold to flag a field for review */
export const LOW_CONFIDENCE_THRESHOLD = 0.6;

/** Default database name */
export const DB_NAME = 'nusxa.db';

/** Reminder snooze duration in minutes */
export const SNOOZE_MINUTES = 15;

/** Undo window duration in seconds */
export const UNDO_WINDOW_SECONDS = 30;

/** Maximum prescription images to retain */
export const MAX_RETAINED_IMAGES = 100;
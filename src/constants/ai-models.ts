/**
 * Single source of truth for AI model + endpoint constants.
 * Imported by BOTH the app (via src/constants/config.ts) and the Cloudflare
 * worker proxy (worker/src/index.js), so the two can never drift apart.
 * Keep this file dependency-free: it must bundle cleanly in both runtimes.
 */

/** Google Gemini (free tier with vision) — used for prescription OCR */
export const GEMINI_MODEL = 'gemini-3.6-flash'; // Latest stable free tier model
export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** OpenRouter — fallback text provider when Groq is unavailable, routed to Nemotron 3 Ultra (free, ~50 req/day) */
export const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';
export const NEMOTRON_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free';

/** Groq — primary text provider (1,000 req/day, far above OpenRouter's 50/day) */
export const GROQ_API_BASE = 'https://api.groq.com/openai/v1';
export const GROQ_MODEL = 'openai/gpt-oss-120b';

/** API timeout in milliseconds */
export const API_TIMEOUT_MS = 30_000;

/** Maximum retry attempts for API calls */
export const API_MAX_RETRIES = 2;

/** OCR sends up to MAX_PRESCRIPTION_PAGES full-resolution JPEGs in one body,
 * so it needs a longer budget than a chat turn. */
export const VISION_TIMEOUT_MS = 60_000;

/** The worker's own per-attempt upstream limit. Must stay below
 * VISION_TIMEOUT_MS so the app receives the worker's structured `timeout`
 * reply instead of aborting first and reporting a bare "Aborted". */
export const WORKER_VISION_TIMEOUT_MS = 45_000;

/** Vision retries once at most, and only for rate-limit/overload/empty
 * responses — see isRetryableCode in src/ai/retry-after.ts. */
export const VISION_MAX_RETRIES = 1;

/** Gemini output cap for both the direct and proxied paths. The OCR schema
 * requires every field on every medicine — verbatim `original_text` plus four
 * `field_confidence` scores among them — so 4096 truncated longer
 * prescriptions mid-JSON and the parse then failed outright. */
export const MAX_OUTPUT_TOKENS = 8192;

/** Longest pixel edge sent to Gemini for OCR. Anything larger is downscaled
 * server-side regardless, so the extra pixels buy no accuracy — they only
 * lengthen the upload and the inference that has to fit inside
 * VISION_TIMEOUT_MS. Bounds the throwaway OCR copy only; the image persisted
 * for the review and history screens keeps its full resolution. */
export const OCR_MAX_IMAGE_EDGE = 1568;

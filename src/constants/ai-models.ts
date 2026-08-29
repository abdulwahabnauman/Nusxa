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

/**
 * Cache & Intelligent Query Router for Nusxa Chat.
 * 
 * Provides:
 * 1. Semantic & Exact Cache: Instant (0ms, $0 token) responses for greetings,
 *    common FAQs, acknowledgments, and repeated queries.
 * 2. Multi-tier Query Router: Dispatches user inputs to:
 *    - EMERGENCY: Immediate emergency triage response (0ms)
 *    - CACHE: Cached answer (0ms)
 *    - LOCAL_TOOL: SQLite grounded data (schedule, stock, adherence) (<15ms)
 *    - LLM: Complex multi-turn clinical chat (network model)
 */

import { checkEmergencyTriage } from './guardrails';
import { matchToolForQuery, executeTool } from './tools';

export type RouteType = 'emergency' | 'cache' | 'local_tool' | 'llm';

export interface RouteResolution {
  route: RouteType;
  immediateResponse?: string;
  toolName?: string;
  cacheKey?: string;
  source: 'guardrail' | 'cache' | 'local_database' | 'llm';
}

/** In-memory LRU response cache with TTL */
interface CacheEntry {
  response: string;
  timestamp: number;
  source: 'static' | 'dynamic';
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes for dynamic responses
const queryCache = new Map<string, CacheEntry>();
const MAX_CACHE_SIZE = 100;

/** Normalize queries for resilient semantic matching */
export function normalizeQueryKey(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[?!.,;:_'"~`@#$%^&*()[\]{}|\\/<>+=]/g, '')
    .replace(/\s+/g, ' ');
}

/** Pre-computed static knowledge base for zero-cost instant conversational routing */
const STATIC_INTENT_RESPONSES: Record<string, { en: string; ur: string }> = {
  // English / Urdu Greetings
  'hi': {
    en: 'Hello! I am Nusxa, your medication companion. How can I help you with your prescriptions or health schedule today?',
    ur: 'السلام علیکم! میں نُسخہ ہوں، آپ کا ادویاتی معاون۔ آج میں آپ کی ادویات یا اوقات کار میں کیا مدد کر سکتا ہوں؟',
  },
  'hello': {
    en: 'Hello! How can I assist you with your medications today?',
    ur: 'السلام علیکم! میں آپ کی ادویات کے بارے میں کس طرح مدد کر سکتا ہوں؟',
  },
  'hey': {
    en: 'Hi there! How can I help you today?',
    ur: 'السلام علیکم! فرمائیے، میں آپ کی کیا مدد کر سکتا ہوں؟',
  },
  'assalam o alaikum': {
    en: 'Wa Alaikum Assalam! How can I assist you with your prescriptions today?',
    ur: 'وعلیکم السلام! میں آپ کی ادویات کے متعلق کیا رہنمائی فراہم کر سکتا ہوں؟',
  },
  'aoa': {
    en: 'Wa Alaikum Assalam! How can I help you today?',
    ur: 'وعلیکم السلام! میں آپ کی کیا مدد کر سکتا ہوں؟',
  },
  'kaise ho': {
    en: 'I am doing well, thank you! I am ready to help you with your medicines, schedules, or prescriptions.',
    ur: 'میں بالکل ٹھیک ہوں، شکریہ! میں آپ کی ادویات اور اوقات کار میں رہنمائی کے لیے حاضر ہوں۔',
  },
  'kese ho': {
    en: 'I am doing well! How can I assist you with your medicines today?',
    ur: 'الحمدللہ میں ٹھیک ہوں! بتائیے ادویات کے متعلق کیا سوال ہے؟',
  },

  // Polite acknowledgments
  'thank you': {
    en: "You're very welcome! Stay healthy, and let me know whenever you have questions about your medicines.",
    ur: 'خوش آمدید! اپنی صحت کا خیال رکھیں، اور ادویات کے بارے میں کوئی بھی سوال ہو تو ضرور پوچھیں۔',
  },
  'thanks': {
    en: "You're welcome! Feel free to ask if you need anything else.",
    ur: 'خوش آمدید! اگر مزید کچھ پوچھنا ہو تو بلا جھجھک کہیے۔',
  },
  'shukriya': {
    en: 'Most welcome! Wishing you great health.',
    ur: 'بہت شکریہ! اللہ آپ کو صحت و تندرستی عطا فرمائے۔',
  },
  'jazakallah': {
    en: 'Wa iyyakum! May you stay in good health.',
    ur: 'جزاک اللہ خیراً! اللہ تعالیٰ آپ کو صحتِ کاملہ عطا فرمائے۔',
  },

  // Identity & capabilities
  'who are you': {
    en: 'I am Nusxa, an AI medication companion designed to help you organize your verified prescriptions, track your doses, understand instructions, and maintain your health adherence.',
    ur: 'میں نُسخہ (Nusxa) ہوں، ایک ذمہ دار ادویاتی معاون جو آپ کی تصدیق شدہ ادویات کو سمجھنے، یاددہانیوں اور پرہیز کے متعلق رہنمائی فراہم کرتا ہے۔',
  },
  'tum kon ho': {
    en: 'I am Nusxa, your personal medication assistant.',
    ur: 'میں نُسخہ (Nusxa) ہوں، آپ کا ادویاتی اور طبی معاون۔',
  },
  'help': {
    en: 'I can help you with:\n- Explaining your active medicines & dosages\n- Checking today’s dose schedule\n- Checking pill inventory and refill status\n- Explaining food interactions & side effects\n\nWhat would you like to know?',
    ur: 'میں ان امور میں آپ کی مدد کر سکتا ہوں:\n- ادویات اور خوراک کی تفصیلات\n- آج کی ادویات کا شیڈول\n- گولیوں کا بچا ہوا اسٹاک\n- کھانے پینے کی احتیاطیں اور ضمنی اثرات\n\nآپ کیا جاننا چاہتے ہیں؟',
  },
};

/**
 * Intelligent Router: determines if the query can be resolved locally or
 * requires an LLM call.
 */
export async function routeChatQuery(
  rawText: string,
  locale: 'en' | 'ur' = 'en'
): Promise<RouteResolution> {
  const normalized = normalizeQueryKey(rawText);

  // 1. Triage: Emergency red flags check (Priority 1)
  const triage = checkEmergencyTriage(rawText, locale);
  if (triage.isEmergency && triage.emergencyResponse) {
    return {
      route: 'emergency',
      immediateResponse: triage.emergencyResponse,
      source: 'guardrail',
    };
  }

  // 2. Exact match in static conversational cache (Priority 2)
  const staticHit = STATIC_INTENT_RESPONSES[normalized];
  if (staticHit) {
    return {
      route: 'cache',
      immediateResponse: locale === 'ur' ? staticHit.ur : staticHit.en,
      cacheKey: normalized,
      source: 'cache',
    };
  }

  // 3. Dynamic session cache check
  const cached = queryCache.get(normalized);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return {
      route: 'cache',
      immediateResponse: cached.response,
      cacheKey: normalized,
      source: 'cache',
    };
  }

  // 4. Local SQLite tool match (Priority 3)
  const toolMatch = matchToolForQuery(rawText);
  if (toolMatch) {
    try {
      const toolDataStr = await executeTool(toolMatch.name, toolMatch.args);
      const formattedResponse = formatToolResultForUser(toolMatch.name, toolDataStr, locale);
      if (formattedResponse) {
        // Return freshly queried SQLite record (always real-time, never stale)
        return {
          route: 'local_tool',
          immediateResponse: formattedResponse,
          toolName: toolMatch.name,
          source: 'local_database',
        };
      }
    } catch {
      // Fall through to LLM on tool execution error
    }
  }

  // 5. Default route: LLM network completion
  return {
    route: 'llm',
    cacheKey: normalized,
    source: 'llm',
  };
}

/** Formats structured tool data directly into friendly patient messages */
function formatToolResultForUser(
  toolName: string,
  dataJson: string,
  locale: 'en' | 'ur'
): string | null {
  try {
    const data = JSON.parse(dataJson);

    if (toolName === 'get_today_schedule') {
      const doses = data.schedule as { medicine_name: string; scheduled_time: string; status: string }[];
      if (!doses || doses.length === 0) {
        return locale === 'ur'
          ? 'آج کے دن آپ کے لیے کوئی خوراک شیڈول نہیں ہے۔'
          : 'You have no doses scheduled for today.';
      }
      const lines = doses.map((d) => {
        const time = d.scheduled_time.includes('T') ? d.scheduled_time.split('T')[1].slice(0, 5) : d.scheduled_time;
        const icon = d.status === 'taken' ? '✅' : d.status === 'missed' ? '❌' : '⏳';
        return `${icon} **${d.medicine_name}** at ${time} (${d.status.toUpperCase()})`;
      });

      return locale === 'ur'
        ? `📋 **آج کی ادویات کا شیڈول (${doses.length} کل خوراکیں):**\n\n${lines.join('\n')}`
        : `📋 **Your Schedule for Today (${doses.length} doses total):**\n\n${lines.join('\n')}`;
    }

    if (toolName === 'get_inventory_levels') {
      const items = data.inventory as { medicine_name: string; remaining_quantity: number | null; is_low_stock: boolean }[];
      if (!items || items.length === 0) return null;

      const lines = items.map((i) => {
        const badge = i.is_low_stock ? '⚠️ LOW STOCK' : '✅ In stock';
        const qty = i.remaining_quantity !== null ? `${i.remaining_quantity} remaining` : 'Quantity not tracked';
        return `- **${i.medicine_name}**: ${qty} (${badge})`;
      });

      return locale === 'ur'
        ? `💊 **ادویات کا اسٹاک لیول:**\n\n${lines.join('\n')}`
        : `💊 **Medication Inventory Levels:**\n\n${lines.join('\n')}`;
    }

    if (toolName === 'get_adherence_summary') {
      return locale === 'ur'
        ? `📊 **گزشتہ 7 دنوں کی پابندی:**\n\n- کل شیڈول خوراکیں: **${data.total_scheduled_doses}**\n- لی گئی خوراکیں: **${data.total_taken_doses}**\n- پابندی کی شرح: **${data.adherence_rate_percent}%**`
        : `📊 **Your 7-Day Adherence Summary:**\n\n- Total Scheduled Doses: **${data.total_scheduled_doses}**\n- Doses Taken: **${data.total_taken_doses}**\n- Adherence Rate: **${data.adherence_rate_percent}%**\n\nKeep up the great routine!`;
    }

    return null;
  } catch {
    return null;
  }
}

/** Cache an assistant answer under the normalized query */
export function saveToCache(rawQuery: string, response: string): void {
  const key = normalizeQueryKey(rawQuery);
  if (!key || response.length < 5) return;

  if (queryCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = queryCache.keys().next().value;
    if (oldestKey) queryCache.delete(oldestKey);
  }

  queryCache.set(key, {
    response,
    timestamp: Date.now(),
    source: 'dynamic',
  });
}

/** Clear dynamic cache (e.g. on chat clear or prescription update) */
export function clearChatCache(): void {
  queryCache.clear();
}

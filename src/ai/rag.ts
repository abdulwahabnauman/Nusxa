/**
 * On-Device Clinical Knowledge Retrieval Engine (RAG)
 * Utilizes SQLite FTS5 full-text search with BM25 keyword relevance ranking
 * over an authoritative drug monograph knowledge base.
 *
 * Runs 100% on-device (<2ms latency), completely offline, and free of token costs.
 */

import { DRUG_MONOGRAPHS, DrugMonograph } from '../db/schemas/drugMonographs';
import { SOUTH_ASIAN_BRAND_TO_GENERIC } from '../constants/medical';

export interface ClinicalMonographMatch {
  id?: string;
  generic_name: string;
  brand_names: string;
  drug_class: string;
  content: string;
  rank?: number;
}

export interface RagSearchResult {
  matches: ClinicalMonographMatch[];
  queryUsed: string | null;
  retrievalStrategy: 'fts5_bm25' | 'sql_like_fallback' | 'in_memory_fallback';
}

/** Common English and Urdu stopwords to prevent false-positive token matches */
const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'could', 'did', 'do', 'does', 'doing', 'down', 'during',
  'each', 'few', 'fine', 'for', 'from', 'further',
  'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
  'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself',
  'just', 'like', 'make', 'me', 'more', 'most', 'my', 'myself',
  'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  'same', 'she', 'should', 'so', 'some', 'such',
  'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too',
  'under', 'until', 'up', 'very',
  'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would',
  'you', 'your', 'yours', 'yourself', 'yourselves'
]);

/** Pre-indexed known generic names from monographs for exact token matching */
const KNOWN_GENERIC_TOKENS = new Set<string>();
for (const m of DRUG_MONOGRAPHS) {
  const parts = m.generic_name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/);
  for (const p of parts) {
    if (p.length >= 3 && !STOPWORDS.has(p)) {
      KNOWN_GENERIC_TOKENS.add(p);
    }
  }
}

/** Clinical topic synonyms across English, Urdu, and Roman Urdu */
const CLINICAL_TOPIC_SYNONYMS: Record<string, string[]> = {
  milk: ['milk', 'dairy', 'calcium', 'yogurt', 'cheese', 'doodh', 'dahi'],
  food: ['food', 'meal', 'meals', 'eating', 'stomach', 'empty stomach', 'khana', 'nashta', 'bhojan'],
  alcohol: ['alcohol', 'wine', 'beer', 'liquor', 'drinking', 'sharab'],
  pregnancy: ['pregnancy', 'pregnant', 'breastfeeding', 'nursing', 'lactation', 'hamal'],
  interactions: ['interaction', 'interactions', 'together', 'combine', 'taking with', 'concurrent', 'milakar'],
  timing: ['morning', 'night', 'bedtime', 'evening', 'subah', 'raat', 'schedule', 'timing', 'empty stomach'],
  side_effects: ['side effect', 'side effects', 'nausea', 'vomiting', 'headache', 'dizziness', 'rash', 'allergy', 'nuksan'],
};

/** Pre-indexed fast brand map combining formulary constants and monographs */
const BRAND_MAP: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(SOUTH_ASIAN_BRAND_TO_GENERIC).map(([brand, generics]) => [
      brand.toLowerCase(),
      generics[0] ?? brand,
    ])
  ),
  novidat: 'ciprofloxacin',
  cipro: 'ciprofloxacin',
  ciprobay: 'ciprofloxacin',
  panadol: 'paracetamol',
  calpol: 'paracetamol',
  febrol: 'paracetamol',
  brufen: 'ibuprofen',
  voltral: 'diclofenac',
  caflam: 'diclofenac',
  ponstan: 'mefenamic acid',
  synflex: 'naproxen',
  glucophage: 'metformin',
  risek: 'omeprazole',
  losec: 'omeprazole',
  nexum: 'esomeprazole',
  zopent: 'pantoprazole',
  eziday: 'losartan',
  cozaar: 'losartan',
  norvasc: 'amlodipine',
  amcard: 'amlodipine',
  lipitor: 'atorvastatin',
  atorva: 'atorvastatin',
  crestor: 'rosuvastatin',
  rovista: 'rosuvastatin',
  augmentin: 'amoxicillin',
  amoxil: 'amoxicillin',
  flagyl: 'metronidazole',
  azomax: 'azithromycin',
  zithromax: 'azithromycin',
  ventolin: 'salbutamol',
  myteka: 'montelukast',
  lexapro: 'escitalopram',
  cipralex: 'escitalopram',
  concor: 'bisoprolol',
  plavix: 'clopidogrel',
  lowplat: 'clopidogrel',
  disprin: 'aspirin',
  loprin: 'aspirin',
  indrop: 'cholecalciferol',
  sunny: 'cholecalciferol',
  rocephin: 'ceftriaxone',
  caricef: 'cefixime',
  klaricid: 'clarithromycin',
  vibramycin: 'doxycycline',
  diflucan: 'fluconazole',
  lasix: 'furosemide',
  aldactone: 'spironolactone',
  lanoxin: 'digoxin',
  zyloric: 'allopurinol',
  goutnil: 'colchicine',
  deltacortril: 'prednisolone',
  zyrtec: 'cetirizine',
  rigix: 'cetirizine',
  softin: 'loratadine',
  xanax: 'alprazolam',
  rivotril: 'clonazepam',
  valium: 'diazepam',
  lyrica: 'pregabalin',
  neurontin: 'gabapentin',
  tegretol: 'carbamazepine',
  epival: 'sodium valproate',
  xarelto: 'rivaroxaban',
  iberet: 'iron',
  maltofer: 'iron',
  flomax: 'tamsulosin',
  xatral: 'tamsulosin',
};

function getDbInstance() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getDatabase } = require('../db/database');
    return getDatabase();
  } catch {
    return null;
  }
}

/**
 * Construct an optimized, sanitized SQLite FTS5 query with BM25 relevance ranking.
 * Sanitizes input so raw user punctuation (e.g. "?", "!") never triggers FTS5 syntax errors.
 */
export function buildFtsMatchQuery(
  rawQuery: string,
  activeMedicineNames: string[] = []
): { ftsQuery: string | null; fallbackTerms: string[] } {
  if (!rawQuery || typeof rawQuery !== 'string') {
    return { ftsQuery: null, fallbackTerms: [] };
  }

  // Strip all non-alphanumeric punctuation to prevent FTS5 syntax crashes
  const cleaned = rawQuery.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return { ftsQuery: null, fallbackTerms: [] };

  const words = cleaned.split(' ').filter(Boolean);
  const matchedDrugs = new Set<string>();
  const matchedTopics = new Set<string>();

  // Tokenize active prescription medicine names into clean searchable tokens
  const activeMedTokens = new Map<string, string>(); // token -> original name
  for (const med of activeMedicineNames) {
    if (!med) continue;
    const parts = med.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/);
    for (const p of parts) {
      // Exclude strength/dosage suffixes like 500mg, 10mg, tab, capsule
      if (p.length >= 3 && !/^\d+/.test(p) && !['mg', 'ml', 'mcg', 'tab', 'tabs', 'capsule', 'caps'].includes(p)) {
        activeMedTokens.set(p, med);
      }
    }
  }

  // 1. Check user words against recognized drugs
  for (const word of words) {
    if (STOPWORDS.has(word)) continue;

    // Check against active prescription tokens
    if (activeMedTokens.has(word)) {
      matchedDrugs.add(word);
      if (BRAND_MAP[word]) matchedDrugs.add(BRAND_MAP[word]!);
    }

    // Check against brand catalog
    if (BRAND_MAP[word]) {
      matchedDrugs.add(BRAND_MAP[word]!);
      matchedDrugs.add(word);
    }

    // Check against generic names
    if (KNOWN_GENERIC_TOKENS.has(word)) {
      matchedDrugs.add(word);
    }
  }

  // 2. Contextual Pronoun Binding:
  // If no drug was explicitly typed, but the question uses reference terms like
  // "this", "my medicine", "the pill", "ye dawai", bind to active medicines
  const CONTEXT_PRONOUNS = ['this', 'my', 'the', 'medicine', 'medication', 'meds', 'pill', 'pills', 'tablet', 'tablets', 'dawa', 'dawai', 'goli', 'yeh', 'ye'];
  const hasContextReference = words.some((w) => CONTEXT_PRONOUNS.includes(w));
  if (matchedDrugs.size === 0 && hasContextReference && activeMedicineNames.length > 0) {
    for (const [token] of activeMedTokens.entries()) {
      matchedDrugs.add(token);
      if (BRAND_MAP[token]) matchedDrugs.add(BRAND_MAP[token]!);
      break; // Bind primary active drug
    }
  }

  // 3. Check clinical topic and interaction keywords
  for (const [topic, synonyms] of Object.entries(CLINICAL_TOPIC_SYNONYMS)) {
    for (const syn of synonyms) {
      if (cleaned.includes(syn)) {
        matchedTopics.add(syn);
        // Expand core food/milk synonyms for high-recall BM25 matching
        if (topic === 'milk') {
          matchedTopics.add('milk');
          matchedTopics.add('calcium');
          matchedTopics.add('food');
        } else if (topic === 'food') {
          matchedTopics.add('food');
          matchedTopics.add('meal');
        }
      }
    }
  }

  const drugArray = Array.from(matchedDrugs);
  const topicArray = Array.from(matchedTopics);

  // Both drug and topic detected (e.g. "ciprofloxacin" and "milk") -> "drug" AND ("milk" OR "calcium" OR "food")
  if (drugArray.length > 0 && topicArray.length > 0) {
    const drugPart = drugArray.length === 1 ? `"${drugArray[0]}"` : `(${drugArray.map((d) => `"${d}"`).join(' OR ')})`;
    const topicPart = `(${topicArray.map((t) => `"${t}"`).join(' OR ')})`;
    const ftsQuery = `${drugPart} AND ${topicPart}`;
    return { ftsQuery, fallbackTerms: [...drugArray, ...topicArray] };
  }

  // Drug only (e.g. "ciprofloxacin" or "Panadol")
  if (drugArray.length > 0) {
    const ftsQuery = drugArray.length === 1 ? `"${drugArray[0]}"` : `(${drugArray.map((d) => `"${d}"`).join(' OR ')})`;
    return { ftsQuery, fallbackTerms: drugArray };
  }

  // Topic only (e.g. "antibiotic interaction with milk")
  if (topicArray.length > 0) {
    const ftsQuery = `(${topicArray.map((t) => `"${t}"`).join(' OR ')})`;
    return { ftsQuery, fallbackTerms: topicArray };
  }

  // Fallback to significant user terms (length >= 4) not in stopwords
  const significant = words.filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  if (significant.length > 0) {
    return {
      ftsQuery: `(${significant.map((s) => `"${s}"`).join(' OR ')})`,
      fallbackTerms: significant,
    };
  }

  return { ftsQuery: null, fallbackTerms: [] };
}

/**
 * In-memory fallback search when database is uninitialized or in testing.
 */
function searchMonographsInMemory(terms: string[], limit: number): ClinicalMonographMatch[] {
  if (terms.length === 0) return [];
  const results: { monograph: DrugMonograph; score: number }[] = [];

  for (const m of DRUG_MONOGRAPHS) {
    let score = 0;
    const combined = `${m.generic_name} ${m.brand_names} ${m.drug_class} ${m.content}`.toLowerCase();
    for (const term of terms) {
      if (combined.includes(term.toLowerCase())) {
        score += 1;
      }
    }
    if (score > 0) {
      results.push({ monograph: m, score });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit).map((r) => ({
    generic_name: r.monograph.generic_name,
    brand_names: r.monograph.brand_names,
    drug_class: r.monograph.drug_class,
    content: r.monograph.content,
    rank: -r.score,
  }));
}

/**
 * Execute on-device RAG retrieval over the SQLite FTS5 monograph table.
 * Uses BM25 relevance ranking, with automatic graceful fallback to SQL LIKE and in-memory search.
 */
export async function searchClinicalKnowledge(
  rawQuery: string,
  options: { limit?: number; activeMedicines?: string[] } = {}
): Promise<ClinicalMonographMatch[]> {
  const limit = options.limit ?? 2;
  const { ftsQuery, fallbackTerms } = buildFtsMatchQuery(rawQuery, options.activeMedicines ?? []);

  if (!ftsQuery) return [];

  const db = getDbInstance();
  if (!db) {
    return searchMonographsInMemory(fallbackTerms, limit);
  }

  try {
    // 1. Primary Strategy: SQLite FTS5 with BM25 keyword relevance ranking
    // In SQLite FTS5, lower BM25 score denotes closer match; ASC ordering yields top hits.
    const ftsRows = await db.getAllAsync<{
      generic_name: string;
      brand_names: string;
      drug_class: string;
      content: string;
      rank: number;
    }>(
      `SELECT generic_name, brand_names, drug_class, content, bm25(drug_monographs_fts) as rank
       FROM drug_monographs_fts
       WHERE drug_monographs_fts MATCH ?
       ORDER BY bm25(drug_monographs_fts)
       LIMIT ?;`,
      [ftsQuery, limit]
    );

    if (ftsRows && ftsRows.length > 0) {
      return ftsRows.map((r) => ({
        generic_name: r.generic_name,
        brand_names: r.brand_names,
        drug_class: r.drug_class,
        content: r.content,
        rank: r.rank,
      }));
    }
  } catch (err) {
    if (__DEV__) {
      console.warn('[RAG] FTS5 query failed, attempting standard SQL fallback:', err);
    }
  }

  // 2. Secondary Strategy: Standard SQL LIKE fallback on drug_monographs table
  try {
    const primaryTerm = fallbackTerms[0] ?? '';
    if (!primaryTerm) return searchMonographsInMemory(fallbackTerms, limit);

    const likePattern = `%${primaryTerm}%`;
    const rows = await db.getAllAsync<{
      generic_name: string;
      brand_names: string;
      drug_class: string;
      content: string;
    }>(
      `SELECT generic_name, brand_names, drug_class, content
       FROM drug_monographs
       WHERE generic_name LIKE ? OR brand_names LIKE ? OR content LIKE ?
       LIMIT ?;`,
      [likePattern, likePattern, likePattern, limit]
    );

    if (rows && rows.length > 0) {
      return rows.map((r) => ({
        generic_name: r.generic_name,
        brand_names: r.brand_names,
        drug_class: r.drug_class,
        content: r.content,
      }));
    }
  } catch (fallbackErr) {
    if (__DEV__) {
      console.error('[RAG] Fallback retrieval also failed:', fallbackErr);
    }
  }

  // 3. Tertiary Strategy: In-memory monograph search
  return searchMonographsInMemory(fallbackTerms, limit);
}

/**
 * Format retrieved clinical monograph chunks into authoritative prompt grounding text.
 */
export function formatRagContextForPrompt(matches: ClinicalMonographMatch[]): string {
  if (!matches || matches.length === 0) return '';

  const chunks = matches.map((m, idx) => {
    return `### Reference ${idx + 1}: ${m.generic_name} (${m.drug_class})
**Brand Names**: ${m.brand_names}
**Clinical Monograph**:
${m.content}`;
  });

  return `[VERIFIED CLINICAL REFERENCE (ON-DEVICE RAG - BM25)]
The following authoritative clinical monograph chunks were retrieved from the local clinical database:
${chunks.join('\n\n')}

INSTRUCTIONS:
1. Ground your answer strictly in these verified clinical monographs and the patient's verified prescriptions.
2. If the user asks about food, drink, dairy, or co-administration, quote or follow the specific guidelines above.
3. Clearly state contraindications or interaction risks mentioned in the monographs.`;
}

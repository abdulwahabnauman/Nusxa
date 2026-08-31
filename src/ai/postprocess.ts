/**
 * Deterministic post-processor for OCR output.
 *
 * The vision model does the heavy lifting; this module then applies cheap,
 * rule-based corrections that never require another API call:
 * - Fuzzy-corrects misread medicine names against the known-generics
 *   dictionaries in src/constants/medical.ts (Levenshtein similarity
 *   >= NAME_SIMILARITY_THRESHOLD), e.g. "Amoxlcillin" -> "Amoxicillin".
 * - Expands frequency abbreviations (TDS, BD, OD, ...) deterministically
 *   instead of trusting the model.
 * - Normalizes strength units ("0.5 g" -> "500 mg", "500mg" -> "500 mg").
 * - Tracks every correction in `field_sources` ('ocr' vs 'corrected') so the
 *   review screen can show which fields were read vs adjusted.
 */
import { MEDICAL_ABBREVIATIONS, CATEGORY_KEYWORDS } from '../constants/medical';
import type { MedicineJSON, PrescriptionJSON } from './types';

/** Minimum normalized Levenshtein similarity to accept a name correction */
export const NAME_SIMILARITY_THRESHOLD = 0.82;

/** Known generic names, flattened from the category keyword dictionaries */
const KNOWN_GENERICS: string[] = [...new Set(Object.values(CATEGORY_KEYWORDS).flat())];

/** Frequency abbreviations that map onto meal instructions instead */
const MEAL_ABBREVIATIONS: Record<string, 'before' | 'after'> = {
  AC: 'before',
  PC: 'after',
};

/** Levenshtein edit distance (classic DP, O(a*b)) */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (curr[j - 1] ?? 0) + 1, // insertion
        (prev[j] ?? 0) + 1, // deletion
        (prev[j - 1] ?? 0) + cost, // substitution
      );
    }
    prev = curr;
  }
  return prev[b.length] ?? 0;
}

/** Normalized similarity in [0, 1]: 1 = identical, 0 = nothing in common */
export function levenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/** Compact form for matching: lowercase, letters/digits only */
const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** True when the string contains non-Latin script (e.g. Urdu) — fuzzy
 * matching against Latin dictionaries would be meaningless there. */
const hasNonLatin = (s: string) => /[^\u0000-\u024F]/.test(s);

/** "amoxicillin" -> "Amoxicillin" (simple display casing) */
const titleCase = (s: string) =>
  s
    .split(' ')
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');

export interface Correction<T> {
  value: T;
  changed: boolean;
}

/**
 * Fuzzy-correct a medicine name against known generics. Only accepts
 * similarity >= NAME_SIMILARITY_THRESHOLD so legitimate brand names and
 * Urdu names are never rewritten.
 */
export function correctMedicineName(raw: string | null): Correction<string | null> {
  if (!raw) return { value: raw, changed: false };
  const trimmed = raw.trim();
  if (trimmed.length < 4 || hasNonLatin(trimmed)) return { value: raw, changed: false };

  const norm = compact(trimmed);
  if (norm.length < 4) return { value: raw, changed: false };

  let best: { entry: string; score: number } | null = null;
  for (const entry of KNOWN_GENERICS) {
    const entryNorm = compact(entry);
    if (!entryNorm) continue;
    // Exact (after normalization) is always a correction-free match — but
    // re-case it for consistent display.
    const score = entryNorm === norm ? 1 : levenshteinSimilarity(norm, entryNorm);
    if (!best || score > best.score) best = { entry, score };
  }

  if (!best || best.score < NAME_SIMILARITY_THRESHOLD) return { value: raw, changed: false };
  const corrected = titleCase(best.entry);
  if (corrected.toLowerCase() === trimmed.toLowerCase()) {
    // Same word, only casing differs — not a meaningful correction
    return { value: raw, changed: false };
  }
  return { value: corrected, changed: true };
}

/**
 * Expand a frequency abbreviation deterministically ("TDS" -> "Three times
 * daily"). Only fires when the whole field is the abbreviation, so free-text
 * frequencies coming from the model pass through untouched. AC/PC are meal
 * instructions, not frequencies — callers handle them via MEAL_ABBREVIATIONS.
 */
export function expandFrequency(raw: string | null): Correction<string | null> {
  if (!raw) return { value: raw, changed: false };
  const key = raw.trim().toUpperCase().replace(/\.$/, '');
  const expanded = MEDICAL_ABBREVIATIONS[key];
  if (!expanded || key in MEAL_ABBREVIATIONS) return { value: raw, changed: false };
  if (expanded.toLowerCase() === raw.trim().toLowerCase()) return { value: raw, changed: false };
  return { value: expanded, changed: true };
}

/** When the "frequency" field is really AC/PC, move it to meal_instruction */
export function mealFromFrequency(raw: string | null): 'before' | 'after' | null {
  if (!raw) return null;
  const key = raw.trim().toUpperCase().replace(/\.$/, '');
  return MEAL_ABBREVIATIONS[key] ?? null;
}

/** Unit groups for strength normalization */
const GRAM_UNITS = new Set(['g', 'gm', 'gram', 'grams']);
const MG_UNITS = new Set(['mg', 'milligram', 'milligrams']);
const MCG_UNITS = new Set(['mcg', 'ug', 'µg', 'microgram', 'micrograms']);

/**
 * Normalize a strength string: converts sub-gram values to mg
 * ("0.5 g" -> "500 mg"), unifies microgram spellings, and fixes spacing
 * ("500mg" -> "500 mg"). Anything unparseable passes through untouched.
 */
export function normalizeStrength(raw: string | null): Correction<string | null> {
  if (!raw) return { value: raw, changed: false };
  const match = raw.match(/(\d+(?:[.,]\d+)?)\s*(g|gm|grams?|mg|milligrams?|mcg|ug|µg|micrograms?|ml|milliliters?|iu|units?)\b/i);
  if (!match) return { value: raw, changed: false };

  const numStr = match[1]!.replace(',', '.');
  const value = parseFloat(numStr);
  const unit = match[2]!.toLowerCase();
  if (!Number.isFinite(value)) return { value: raw, changed: false };

  let num = value;
  let outUnit: string;
  if (GRAM_UNITS.has(unit)) {
    if (value < 1) {
      num = value * 1000;
      outUnit = 'mg';
    } else {
      outUnit = 'g';
    }
  } else if (MG_UNITS.has(unit)) {
    outUnit = 'mg';
  } else if (MCG_UNITS.has(unit)) {
    outUnit = 'mcg';
  } else {
    // ml / iu / units: only fix spacing, never convert
    outUnit = unit;
  }

  const formatted = `${Number.isInteger(num) ? num : parseFloat(num.toFixed(2))} ${outUnit}`;
  // Replace only the matched "500 mg" portion, keep any surrounding text
  const rebuilt = raw.replace(match[0]!, formatted);
  return { value: rebuilt, changed: rebuilt !== raw };
}

/** Core fields the post-processor may correct, for field_sources tracking */
const TRACKED_FIELDS = ['name', 'strength', 'frequency', 'meal_instruction'] as const;

/** Apply all deterministic corrections to one medicine */
export function postProcessMedicine(med: MedicineJSON): MedicineJSON {
  const field_sources: MedicineJSON['field_sources'] = { ...med.field_sources };
  let meal_instruction = med.meal_instruction;

  const name = correctMedicineName(med.name);
  const strength = normalizeStrength(med.strength);
  const frequency = expandFrequency(med.frequency);

  // AC/PC sitting in frequency is a meal instruction, not a frequency
  const mealFromFreq = mealFromFrequency(med.frequency);
  let frequencyValue = frequency.value;
  if (mealFromFreq && !meal_instruction) {
    meal_instruction = mealFromFreq;
    frequencyValue = null;
    field_sources['meal_instruction'] = 'corrected';
    field_sources['frequency'] = field_sources['frequency'] ?? 'unknown';
  }

  const updates: Partial<Record<(typeof TRACKED_FIELDS)[number], boolean>> = {
    name: name.changed,
    strength: strength.changed,
    frequency: frequency.changed || (mealFromFreq !== null && !med.meal_instruction && frequencyValue !== med.frequency),
    meal_instruction: mealFromFreq !== null && !med.meal_instruction,
  };
  for (const field of TRACKED_FIELDS) {
    if (updates[field]) field_sources[field] = 'corrected';
  }

  return {
    ...med,
    name: name.value,
    strength: strength.value,
    frequency: frequencyValue,
    meal_instruction,
    field_sources,
  };
}

/** Run the post-processor over a full extraction */
export function postProcessPrescription(data: PrescriptionJSON): PrescriptionJSON {
  return {
    ...data,
    medicines: data.medicines.map(postProcessMedicine),
  };
}

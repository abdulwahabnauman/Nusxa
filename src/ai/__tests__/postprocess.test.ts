import {
  levenshteinSimilarity,
  correctMedicineName,
  expandFrequency,
  mealFromFrequency,
  normalizeStrength,
  postProcessMedicine,
  NAME_SIMILARITY_THRESHOLD,
} from '../postprocess';
import type { MedicineJSON } from '../types';

const makeMedicine = (overrides: Partial<MedicineJSON> = {}): MedicineJSON => ({
  name: 'Amoxicillin',
  generic_name: null,
  brand_name: null,
  strength: '500 mg',
  form: 'capsule',
  dosage: '1 capsule',
  frequency: 'Three times daily',
  meal_instruction: 'after',
  duration: '7 days',
  original_text: null,
  purpose: null,
  side_effects: [],
  food_interactions: [],
  storage: null,
  confidence: 0.9,
  field_confidence: {},
  field_sources: {},
  warnings: [],
  verification_status: 'pending',
  ...overrides,
});

describe('levenshteinSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(levenshteinSimilarity('amoxicillin', 'amoxicillin')).toBe(1);
  });

  it('scores a one-letter misread above the acceptance threshold', () => {
    // "Amoxlcillin" (l for i) — the classic OCR misread from the roadmap
    expect(levenshteinSimilarity('amoxlcillin', 'amoxicillin')).toBeGreaterThanOrEqual(
      NAME_SIMILARITY_THRESHOLD
    );
  });

  it('scores unrelated names far below the threshold', () => {
    expect(levenshteinSimilarity('panadol', 'metformin')).toBeLessThan(0.5);
  });
});

describe('correctMedicineName', () => {
  it('fixes a one-letter misread against known generics', () => {
    expect(correctMedicineName('Amoxlcillin')).toEqual({ value: 'Amoxicillin', changed: true });
  });

  it('leaves a correctly spelled generic untouched', () => {
    expect(correctMedicineName('Amoxicillin')).toEqual({ value: 'Amoxicillin', changed: false });
  });

  it('leaves brand names that are not close to any generic untouched', () => {
    // Panadol is a real brand but not in the generic dictionaries and not
    // similar enough to any of them — it must never be rewritten.
    expect(correctMedicineName('Panadol')).toEqual({ value: 'Panadol', changed: false });
  });

  it('never rewrites Urdu text', () => {
    expect(correctMedicineName('اموکسی سلن')).toEqual({ value: 'اموکسی سلن', changed: false });
  });

  it('never rewrites very short names', () => {
    expect(correctMedicineName('Znc')).toEqual({ value: 'Znc', changed: false });
  });
});

describe('expandFrequency', () => {
  it.each([
    ['TDS', 'Three times daily'],
    ['bd', 'Twice daily'],
    ['OD.', 'Once daily'],
    ['Q8H', 'Every 8 hours'],
  ])('expands %s to %s', (input, expected) => {
    expect(expandFrequency(input)).toEqual({ value: expected, changed: true });
  });

  it('passes already-expanded frequencies through untouched', () => {
    expect(expandFrequency('Three times daily')).toEqual({
      value: 'Three times daily',
      changed: false,
    });
  });

  it('does not expand AC/PC (those are meal instructions, not frequencies)', () => {
    expect(expandFrequency('AC')).toEqual({ value: 'AC', changed: false });
    expect(mealFromFrequency('AC')).toBe('before');
    expect(mealFromFrequency('pc')).toBe('after');
    expect(mealFromFrequency('Three times daily')).toBeNull();
  });
});

describe('normalizeStrength', () => {
  it('converts sub-gram values to milligrams', () => {
    expect(normalizeStrength('0.5 g')).toEqual({ value: '500 mg', changed: true });
  });

  it('fixes missing spacing', () => {
    expect(normalizeStrength('500mg')).toEqual({ value: '500 mg', changed: true });
  });

  it('keeps whole-gram values in grams', () => {
    expect(normalizeStrength('1 g')).toEqual({ value: '1 g', changed: false });
  });

  it('unifies microgram spellings', () => {
    expect(normalizeStrength('25 ug')).toEqual({ value: '25 mcg', changed: true });
  });

  it('leaves unparseable strengths untouched', () => {
    expect(normalizeStrength('as directed')).toEqual({ value: 'as directed', changed: false });
    expect(normalizeStrength(null)).toEqual({ value: null, changed: false });
  });
});

describe('postProcessMedicine', () => {
  it('applies all corrections and marks changed fields in field_sources', () => {
    const result = postProcessMedicine(
      makeMedicine({
        name: 'Amoxlcillin',
        strength: '500mg',
        frequency: 'TDS',
        meal_instruction: null,
        field_sources: { name: 'ocr', strength: 'ocr', frequency: 'ocr' },
      })
    );
    expect(result.name).toBe('Amoxicillin');
    expect(result.strength).toBe('500 mg');
    expect(result.frequency).toBe('Three times daily');
    expect(result.field_sources['name']).toBe('corrected');
    expect(result.field_sources['strength']).toBe('corrected');
    expect(result.field_sources['frequency']).toBe('corrected');
  });

  it('keeps untouched fields marked as ocr', () => {
    const result = postProcessMedicine(
      makeMedicine({ field_sources: { name: 'ocr', frequency: 'ocr' } })
    );
    expect(result.field_sources['name']).toBe('ocr');
    expect(result.field_sources['frequency']).toBe('ocr');
  });

  it('moves AC from frequency into meal_instruction', () => {
    const result = postProcessMedicine(
      makeMedicine({ frequency: 'AC', meal_instruction: null })
    );
    expect(result.meal_instruction).toBe('before');
    expect(result.frequency).toBeNull();
    expect(result.field_sources['meal_instruction']).toBe('corrected');
  });
});

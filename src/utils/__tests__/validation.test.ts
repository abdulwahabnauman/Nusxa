/**
 * Unit tests for src/utils/validation.ts — the review-screen guard rails
 * (required fields, duplicates, schedule conflicts, time format).
 */
import type { MedicineJSON } from '../../ai/types';
import {
  isMedicineComplete,
  getMissingFields,
  findDuplicateMedicines,
  findScheduleConflicts,
  isValidTimeFormat,
} from '../validation';

const makeMedicine = (overrides: Partial<MedicineJSON> = {}): MedicineJSON => ({
  name: 'Amoxicillin',
  generic_name: 'amoxicillin',
  brand_name: null,
  strength: '500 mg',
  form: 'capsule',
  dosage: '1 capsule',
  frequency: 'Three times daily',
  meal_instruction: 'after',
  duration: '7 days',
  purpose: 'Infection',
  side_effects: [],
  food_interactions: [],
  storage: null,
  confidence: 0.9,
  field_sources: {},
  warnings: [],
  verification_status: 'verified',
  ...overrides,
});

describe('isMedicineComplete', () => {
  it('accepts a fully populated medicine', () => {
    expect(isMedicineComplete(makeMedicine())).toBe(true);
  });

  it.each(['name', 'dosage', 'frequency', 'duration'] as const)(
    'rejects when %s is missing',
    (field) => {
      expect(isMedicineComplete(makeMedicine({ [field]: null }))).toBe(false);
      expect(isMedicineComplete(makeMedicine({ [field]: '' }))).toBe(false);
    }
  );

  it('does not require optional fields like strength or form', () => {
    expect(isMedicineComplete(makeMedicine({ strength: null, form: null }))).toBe(true);
  });
});

describe('getMissingFields', () => {
  it('returns an empty list for a complete medicine', () => {
    expect(getMissingFields(makeMedicine())).toEqual([]);
  });

  it('lists every missing required field', () => {
    const missing = getMissingFields(makeMedicine({ name: null, duration: '' }));
    expect(missing).toEqual(['name', 'duration']);
  });
});

describe('findDuplicateMedicines', () => {
  it('finds nothing in a unique list', () => {
    const meds = [makeMedicine({ name: 'A' }), makeMedicine({ name: 'B' })];
    expect(findDuplicateMedicines(meds)).toEqual([]);
  });

  it('flags duplicates case-insensitively and trims whitespace', () => {
    const meds = [
      makeMedicine({ name: 'Panadol' }),
      makeMedicine({ name: '  panadol ' }),
      makeMedicine({ name: 'Brufen' }),
    ];
    expect(findDuplicateMedicines(meds)).toEqual(['  panadol ']);
  });

  it('reports a name only once even with three copies', () => {
    const meds = [
      makeMedicine({ name: 'X' }),
      makeMedicine({ name: 'x' }),
      makeMedicine({ name: 'X' }),
    ];
    expect(findDuplicateMedicines(meds)).toEqual(['x']);
  });
});

describe('findScheduleConflicts', () => {
  it('returns no conflicts for distinct times', () => {
    const schedules = [
      { medicineName: 'A', time: '08:00' },
      { medicineName: 'B', time: '20:00' },
    ];
    expect(findScheduleConflicts(schedules)).toEqual([]);
  });

  it('pairs up medicines sharing the same time', () => {
    const schedules = [
      { medicineName: 'A', time: '08:00' },
      { medicineName: 'B', time: '08:00' },
      { medicineName: 'C', time: '08:00' },
    ];
    const conflicts = findScheduleConflicts(schedules);
    expect(conflicts).toHaveLength(2);
    expect(conflicts[0]).toEqual({ medicine1: 'A', medicine2: 'B', time: '08:00' });
    expect(conflicts[1]).toEqual({ medicine1: 'B', medicine2: 'C', time: '08:00' });
  });
});

describe('isValidTimeFormat', () => {
  it.each(['00:00', '08:05', '13:30', '23:59'])('accepts %s', (time) => {
    expect(isValidTimeFormat(time)).toBe(true);
  });

  it.each(['24:00', '12:60', '8:00', '0800', '08:5', 'abc', ''])('rejects %s', (time) => {
    expect(isValidTimeFormat(time)).toBe(false);
  });
});

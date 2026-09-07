/**
 * Unit tests for src/utils/interactions.ts — the on-device interaction
 * checker behind the regimen banners on the Medicines tab.
 */
import { findInteractionPairs, findCrossInteractions, medicineLabel } from '../interactions';
import type { MedicineLike } from '../interactions';

describe('medicineLabel', () => {
  it('prefers name, then generic, then brand', () => {
    expect(medicineLabel({ name: 'Panadol', generic_name: 'paracetamol' })).toBe('Panadol');
    expect(medicineLabel({ name: '', generic_name: 'paracetamol' })).toBe('paracetamol');
    expect(medicineLabel({ brand_name: 'Augmentin' })).toBe('Augmentin');
    expect(medicineLabel({})).toBe('Unknown medicine');
  });
});

describe('findInteractionPairs', () => {
  it('flags two blood thinners as a high-severity pair', () => {
    const pairs = findInteractionPairs([{ name: 'Warfarin' }, { name: 'Aspirin' }]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.severity).toBe('high');
    expect(pairs[0]!.first).toBe('Warfarin');
    expect(pairs[0]!.second).toBe('Aspirin');
  });

  it('matches via brand/parenthetical labels, not just the exact name', () => {
    // "Brufen" is an ibuprofen brand; the bracketed label still contains
    // the generic term the rule keys on.
    const pairs = findInteractionPairs([
      { name: 'Brufen', generic_name: 'ibuprofen' },
      { name: 'Warfarin (Coumadin)' },
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.severity).toBe('high');
  });

  it('is symmetric — order of the list does not matter', () => {
    const a = findInteractionPairs([{ name: 'Amiodarone' }, { name: 'Warfarin' }]);
    const b = findInteractionPairs([{ name: 'Warfarin' }, { name: 'Amiodarone' }]);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0]!.severity).toBe(b[0]!.severity);
  });

  it('reports nothing for unrelated medicines', () => {
    const pairs = findInteractionPairs([
      { name: 'Paracetamol' },
      { name: 'Amoxicillin' },
      { name: 'Omeprazole' },
    ]);
    expect(pairs).toEqual([]);
  });

  it('finds multiple pairs in a longer regimen', () => {
    const list: MedicineLike[] = [
      { name: 'Warfarin' },
      { name: 'Aspirin' },
      { name: 'Ibuprofen' },
    ];
    // Every pair inside the anticoagulant/NSAID group is flagged
    expect(findInteractionPairs(list)).toHaveLength(3);
  });
});

describe('findCrossInteractions', () => {
  it('checks an incoming scan batch against the existing regimen', () => {
    const pairs = findCrossInteractions(
      [{ name: 'Aspirin' }],
      [{ name: 'Warfarin' }, { name: 'Omeprazole' }]
    );
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.first).toBe('Aspirin');
    expect(pairs[0]!.second).toBe('Warfarin');
  });

  it('returns nothing when the new medicine is unrelated', () => {
    const pairs = findCrossInteractions(
      [{ name: 'Amoxicillin' }],
      [{ name: 'Warfarin' }]
    );
    expect(pairs).toEqual([]);
  });
});

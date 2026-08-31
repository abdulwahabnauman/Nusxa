import { normalizeMedicineForm } from '../PillIcon';

describe('normalizeMedicineForm', () => {
  it('defaults to capsule for missing values', () => {
    expect(normalizeMedicineForm(null)).toBe('capsule');
    expect(normalizeMedicineForm(undefined)).toBe('capsule');
    expect(normalizeMedicineForm('')).toBe('capsule');
  });

  it('maps canonical enum values', () => {
    expect(normalizeMedicineForm('tablet')).toBe('tablet');
    expect(normalizeMedicineForm('capsule')).toBe('capsule');
    expect(normalizeMedicineForm('syrup')).toBe('syrup');
    expect(normalizeMedicineForm('injection')).toBe('injection');
    expect(normalizeMedicineForm('cream')).toBe('cream');
    expect(normalizeMedicineForm('drops')).toBe('drops');
    expect(normalizeMedicineForm('inhaler')).toBe('inhaler');
    expect(normalizeMedicineForm('patch')).toBe('patch');
  });

  it('maps prescription abbreviations', () => {
    expect(normalizeMedicineForm('Tab')).toBe('tablet');
    expect(normalizeMedicineForm('Tab Amoxicillin')).toBe('tablet');
    expect(normalizeMedicineForm('1 tab twice daily')).toBe('tablet');
    expect(normalizeMedicineForm('Cap')).toBe('capsule');
    expect(normalizeMedicineForm('Caps')).toBe('capsule');
    expect(normalizeMedicineForm('Syp Paracetamol')).toBe('syrup');
    expect(normalizeMedicineForm('Susp.')).toBe('syrup');
    expect(normalizeMedicineForm('Elixir')).toBe('syrup');
    expect(normalizeMedicineForm('Inj. Diclofenac')).toBe('injection');
    expect(normalizeMedicineForm('Ampoule')).toBe('injection');
    expect(normalizeMedicineForm('Vial')).toBe('injection');
    expect(normalizeMedicineForm('Dps')).toBe('drops');
    expect(normalizeMedicineForm('Nasal spray')).toBe('drops');
    expect(normalizeMedicineForm('Oint.')).toBe('cream');
    expect(normalizeMedicineForm('Nebulizer')).toBe('inhaler');
    expect(normalizeMedicineForm('nebuliser')).toBe('inhaler');
    expect(normalizeMedicineForm('inhalation')).toBe('inhaler');
    expect(normalizeMedicineForm('Puffer')).toBe('inhaler');
  });

  it('maps Urdu form words', () => {
    expect(normalizeMedicineForm('گولی')).toBe('tablet');
    expect(normalizeMedicineForm('کیپسول')).toBe('capsule');
    expect(normalizeMedicineForm('شربت')).toBe('syrup');
    expect(normalizeMedicineForm('انجیکشن')).toBe('injection');
    expect(normalizeMedicineForm('قطرے')).toBe('drops');
    expect(normalizeMedicineForm('مرہم')).toBe('cream');
    expect(normalizeMedicineForm('انسپائرر')).toBe('inhaler');
    expect(normalizeMedicineForm('پیچ')).toBe('patch');
  });

  it('does not trip short abbreviations on drug names', () => {
    expect(normalizeMedicineForm('Nebivolol')).toBe('other');
    expect(normalizeMedicineForm('Captor')).toBe('other');
    expect(normalizeMedicineForm('Injeksi')).toBe('other');
  });

  it('falls back to other for unknown forms', () => {
    expect(normalizeMedicineForm('suppository')).toBe('other');
    expect(normalizeMedicineForm('sachet')).toBe('other');
    expect(normalizeMedicineForm('some unknown form')).toBe('other');
  });
});

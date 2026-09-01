import { getDayPart } from '../date';

describe('getDayPart', () => {
  it('treats late night and pre-dawn hours as night', () => {
    expect(getDayPart(0)).toBe('night');
    expect(getDayPart(4)).toBe('night');
  });

  it('treats 5 through 11 as morning', () => {
    expect(getDayPart(5)).toBe('morning');
    expect(getDayPart(11)).toBe('morning');
  });

  it('treats 12 through 16 as afternoon', () => {
    expect(getDayPart(12)).toBe('afternoon');
    expect(getDayPart(16)).toBe('afternoon');
  });

  it('treats 17 through 23 as night', () => {
    expect(getDayPart(17)).toBe('night');
    expect(getDayPart(23)).toBe('night');
  });
});

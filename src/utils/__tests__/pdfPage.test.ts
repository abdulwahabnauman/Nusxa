import {
  PAGE_SIZE_MM,
  PAGE_MARGIN_MM,
  PAGE_CSS,
  mmToPoints,
  getPrintFileOptions,
} from '../pdfPage';

describe('PDF page geometry', () => {
  it('converts millimetres to points', () => {
    expect(mmToPoints(25.4)).toBe(72);
    expect(mmToPoints(PAGE_MARGIN_MM.top)).toBe(51);
    expect(mmToPoints(PAGE_MARGIN_MM.left)).toBe(45);
  });

  it('builds the @page rule from the shared constants (Android path)', () => {
    expect(PAGE_CSS).toContain('size: A4');
    expect(PAGE_CSS).toContain(`${PAGE_MARGIN_MM.top}mm`);
    expect(PAGE_CSS).toContain(`${PAGE_MARGIN_MM.left}mm`);
  });

  it('passes explicit A4 size and margins natively on iOS', () => {
    const options = getPrintFileOptions('ios');
    expect(options.width).toBe(mmToPoints(PAGE_SIZE_MM.width));
    expect(options.height).toBe(mmToPoints(PAGE_SIZE_MM.height));
    expect(options.margins).toEqual({ top: 51, right: 45, bottom: 51, left: 45 });
  });

  it('leaves Android to the @page CSS so margins are not applied twice', () => {
    expect(getPrintFileOptions('android')).toEqual({});
  });
});

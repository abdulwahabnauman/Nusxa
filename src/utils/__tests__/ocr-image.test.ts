import { resizeToFit } from '../ocr-image';
import { OCR_MAX_IMAGE_EDGE } from '../../constants/ai-models';

describe('resizeToFit', () => {
  it('leaves an image that already fits untouched', () => {
    expect(resizeToFit(1000, 1400, OCR_MAX_IMAGE_EDGE)).toBeNull();
    expect(resizeToFit(OCR_MAX_IMAGE_EDGE, 900, OCR_MAX_IMAGE_EDGE)).toBeNull();
  });

  it('constrains the long edge of a portrait camera frame', () => {
    // A phone sensor's native portrait output: far past the cap on height.
    expect(resizeToFit(3000, 4000, OCR_MAX_IMAGE_EDGE)).toEqual({
      height: OCR_MAX_IMAGE_EDGE,
    });
  });

  it('constrains the long edge of a landscape frame', () => {
    expect(resizeToFit(4000, 3000, OCR_MAX_IMAGE_EDGE)).toEqual({
      width: OCR_MAX_IMAGE_EDGE,
    });
  });

  it('resizes a square on the width axis', () => {
    expect(resizeToFit(2000, 2000, OCR_MAX_IMAGE_EDGE)).toEqual({
      width: OCR_MAX_IMAGE_EDGE,
    });
  });

  // Naming one axis is what keeps the aspect ratio: passing both would stretch
  // the prescription and distort the handwriting OCR has to read.
  it('names exactly one axis so the aspect ratio survives', () => {
    const target = resizeToFit(3000, 4000, OCR_MAX_IMAGE_EDGE);
    expect(Object.keys(target ?? {})).toHaveLength(1);
  });

  it('resizes when only one edge exceeds the cap', () => {
    expect(resizeToFit(OCR_MAX_IMAGE_EDGE, 1800, OCR_MAX_IMAGE_EDGE)).toEqual({
      height: OCR_MAX_IMAGE_EDGE,
    });
  });
});

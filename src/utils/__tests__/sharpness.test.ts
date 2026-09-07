import { laplacianStats, isBlurry } from '../sharpness';

/** Build a grayscale buffer from a per-pixel generator */
function makeImage(
  width: number,
  height: number,
  pixel: (x: number, y: number) => number
): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      gray[y * width + x] = pixel(x, y);
    }
  }
  return gray;
}

/** 3x3 box blur — simulates defocus/motion blur smearing the edges */
function boxBlur(src: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          sum += src[ny * width + nx]!;
          n++;
        }
      }
      out[y * width + x] = Math.round(sum / n);
    }
  }
  return out;
}

const SIZE = 64;

describe('laplacianStats', () => {
  it('scores a uniform image as perfectly flat (no edges)', () => {
    const gray = makeImage(SIZE, SIZE, () => 200);
    const result = laplacianStats(gray, SIZE, SIZE);
    expect(result.score).toBe(0);
    expect(result.edgeRatio).toBe(0);
  });

  it('scores sharp high-contrast text-like edges far above a blurred version', () => {
    // Checkerboard = dense, crisp edges (proxy for sharp print)
    const sharp = makeImage(SIZE, SIZE, (x, y) => ((x + y) % 2 === 0 ? 255 : 15));
    const blurred = boxBlur(boxBlur(sharp, SIZE, SIZE), SIZE, SIZE);

    const sharpResult = laplacianStats(sharp, SIZE, SIZE);
    const blurredResult = laplacianStats(blurred, SIZE, SIZE);

    expect(sharpResult.score).toBeGreaterThan(blurredResult.score * 3);
    expect(sharpResult.edgeRatio).toBeGreaterThan(blurredResult.edgeRatio);
  });

  it('scores a smooth gradient low (below the blur threshold shape)', () => {
    const gradient = makeImage(SIZE, SIZE, (x) => Math.round((x / SIZE) * 255));
    const result = laplacianStats(gradient, SIZE, SIZE);
    // Linear gradient has a zero second derivative everywhere
    expect(result.score).toBeLessThan(5);
  });

  it('ignores tiny images instead of crashing', () => {
    const gray = makeImage(2, 2, () => 128);
    const result = laplacianStats(gray, 2, 2);
    expect(result.score).toBe(0);
    expect(result.edgeRatio).toBe(0);
  });
});

describe('isBlurry', () => {
  it('lets unmeasurable images (null) through', () => {
    expect(isBlurry(null)).toBe(false);
  });

  it('flags low-variance scores and passes high-variance ones', () => {
    expect(isBlurry({ score: 10, edgeRatio: 0.5 })).toBe(true);
    expect(isBlurry({ score: 500, edgeRatio: 0.5 })).toBe(false);
  });
});

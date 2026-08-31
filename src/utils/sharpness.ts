import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { decode } from 'jpeg-js';
import { BLUR_VARIANCE_THRESHOLD } from '../constants/config';

/**
 * On-device blur detection (Laplacian-variance style) so a bad photo never
 * burns an OCR API call. The image is downsampled, decoded to pixels with a
 * pure-JS JPEG decoder, converted to grayscale, and the variance of the
 * discrete Laplacian is computed over its edge pixels: sharp text produces
 * strong second-derivative responses, blur smears them away.
 */

export interface SharpnessResult {
  /** Variance of the Laplacian over edge pixels. Higher means sharper. */
  score: number;
  /** Fraction of pixels that read as edges/text (0..1). */
  edgeRatio: number;
}

/** Sample width the Laplacian is measured on (height follows aspect) */
const SAMPLE_WIDTH = 512;

/**
 * Responses below this magnitude are sensor noise, not real edges. Ignoring
 * them keeps uniform paper backgrounds from diluting the score and makes the
 * metric robust across devices with different noise floors.
 */
const NOISE_FLOOR = 2;

/**
 * Pure Laplacian stats over a grayscale buffer. Exported for unit tests.
 * Uses the classic 4-neighbour kernel: L = 4c - n - s - e - w.
 */
export function laplacianStats(
  gray: Uint8Array,
  width: number,
  height: number
): SharpnessResult {
  if (width < 3 || height < 3 || gray.length < width * height) {
    return { score: 0, edgeRatio: 0 };
  }

  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    for (let x = 1; x < width - 1; x++) {
      const i = row + x;
      const lap =
        4 * gray[i]! - gray[i - width]! - gray[i + width]! - gray[i - 1]! - gray[i + 1]!;
      if (Math.abs(lap) < NOISE_FLOOR) continue;
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }

  const total = (width - 2) * (height - 2);
  if (count === 0) return { score: 0, edgeRatio: 0 };

  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  return { score: Math.max(0, variance), edgeRatio: count / total };
}

/** Convert base64 to bytes without relying on atob (consistent across Hermes/web) */
function base64ToBytes(input: string): Uint8Array {
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = input.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i + 3 < clean.length + 1 && i + 1 < clean.length; i += 4) {
    const b0 = ALPHABET.indexOf(clean[i]!);
    const b1 = ALPHABET.indexOf(clean[i + 1]!);
    const c2 = clean[i + 2];
    const c3 = clean[i + 3];
    out[o++] = (b0 << 2) | (b1 >> 4);
    if (c2 !== undefined && o < out.length) {
      out[o++] = ((b1 & 15) << 4) | (ALPHABET.indexOf(c2) >> 2);
      if (c3 !== undefined && o < out.length) {
        out[o++] = ((ALPHABET.indexOf(c2) & 3) << 6) | ALPHABET.indexOf(c3);
      }
    }
  }
  return out;
}

/** RGBA pixel buffer → luminance grayscale */
function toGrayscale(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = Math.round(0.299 * rgba[p]! + 0.587 * rgba[p + 1]! + 0.114 * rgba[p + 2]!);
  }
  return gray;
}

/**
 * Measure the sharpness of an image file. Returns null when the image cannot
 * be measured (unsupported format, decode failure); callers should treat null
 * as "let it through", never as blurry.
 */
export async function measureSharpness(uri: string): Promise<SharpnessResult | null> {
  try {
    // Probe true pixel dimensions and bake EXIF orientation in
    const probe = await ImageManipulator.manipulateAsync(uri, [], {
      format: ImageManipulator.SaveFormat.JPEG,
      compress: 0.9,
    });

    // Downsample wide images so the pure-JS decode stays fast
    let sampleUri = probe.uri;
    if (probe.width > SAMPLE_WIDTH) {
      const resized = await ImageManipulator.manipulateAsync(
        probe.uri,
        [{ resize: { width: SAMPLE_WIDTH } }],
        { format: ImageManipulator.SaveFormat.JPEG, compress: 0.9 }
      );
      sampleUri = resized.uri;
    }

    const base64 = await FileSystem.readAsStringAsync(sampleUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const { data, width, height } = decode(base64ToBytes(base64), {
      maxMemoryUsageInMB: 128,
    });

    const gray = toGrayscale(data, width, height);
    return laplacianStats(gray, width, height);
  } catch {
    return null;
  }
}

/** True when the measurement is usable and indicates a blurry photo */
export function isBlurry(result: SharpnessResult | null): boolean {
  return result !== null && result.score < BLUR_VARIANCE_THRESHOLD;
}

/**
 * Sizing maths for the throwaway image copy sent to OCR.
 *
 * Deliberately free of `expo-image-manipulator` so the rules are unit-testable
 * without a native runtime; the resize itself happens in `src/ai/pipeline.ts`.
 */

/** A single resize dimension. `expo-image-manipulator` stretches an image when
 * given both width and height, and preserves the aspect ratio when given one. */
export type ResizeTarget = { width: number } | { height: number };

/** The resize that brings `width` x `height` inside `maxEdge`, or null when the
 * image already fits.
 *
 * Null means "leave the file alone" rather than "resize to the same size":
 * re-encoding costs a generation of JPEG quality and buys nothing, and small
 * images must reach OCR byte-identical to how they did before this existed.
 *
 * Callers pass dimensions read back from a no-op `manipulateAsync`, which bakes
 * EXIF orientation in, so `width >= height` names the axis that is actually
 * longer on screen.
 */
export function resizeToFit(
  width: number,
  height: number,
  maxEdge: number
): ResizeTarget | null {
  if (Math.max(width, height) <= maxEdge) return null;
  return width >= height ? { width: maxEdge } : { height: maxEdge };
}

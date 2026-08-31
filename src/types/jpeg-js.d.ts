/** Minimal type declaration for jpeg-js (ships without its own types) */
declare module 'jpeg-js' {
  export interface RawImageData {
    data: Uint8Array;
    width: number;
    height: number;
  }

  export function decode(
    buffer: Uint8Array | ArrayBuffer,
    options?: { maxMemoryUsageInMB?: number; maxResolutionInMP?: number }
  ): RawImageData;

  export function encode(
    imageData: { data: Uint8Array | Buffer; width: number; height: number },
    quality?: number
  ): { data: Buffer };
}

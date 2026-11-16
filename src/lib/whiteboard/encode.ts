/**
 * Timing-map serialization for the analyze API.
 *
 * Seconds are quantized to 1/30 s steps in Uint16 (65535 = Infinity /
 * background), then run-length encoded. Whiteboard timing maps are
 * piecewise-constant along strokes, so RLE compresses them ~5-10x.
 */

export const TIMING_FPS = 30;
const MAX_CODE = 65535;

export function encodeTimingRle(timing: Float32Array): string {
  // Quantize.
  const codes = new Uint16Array(timing.length);
  for (let i = 0; i < timing.length; i++) {
    const t = timing[i];
    if (!isFinite(t)) {
      codes[i] = MAX_CODE;
    } else {
      const c = Math.round(t * TIMING_FPS);
      codes[i] = c >= MAX_CODE ? MAX_CODE - 1 : c;
    }
  }
  // RLE as (value u16, run u16) pairs.
  const pairs: number[] = [];
  let runStart = 0;
  let current = codes[0];
  for (let i = 1; i < codes.length; i++) {
    if (codes[i] !== current || i - runStart >= 65535) {
      pairs.push(current, i - runStart);
      runStart = i;
      current = codes[i];
    }
  }
  pairs.push(current, codes.length - runStart);
  const bytes = new Uint8Array(new Uint16Array(pairs).buffer);
  return Buffer.from(bytes).toString("base64");
}

export function decodeTimingRle(
  b64: string,
  pixelCount: number,
): Float32Array {
  const bytes = Buffer.from(b64, "base64");
  const u16 = new Uint16Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  const timing = new Float32Array(pixelCount);
  let idx = 0;
  for (let i = 0; i < u16.length; i += 2) {
    const value = u16[i];
    const run = u16[i + 1];
    const t = value >= MAX_CODE ? Infinity : value / TIMING_FPS;
    for (let k = 0; k < run && idx < pixelCount; k++) {
      timing[idx++] = t;
    }
  }
  return timing;
}

// P1-F (excellence) — the preview-vs-final parity metric. PURE, like every
// whiteboard engine module: no fs, no child_process, no browser, no clock.
// The harness (scripts/wb-preview-parity.mts) drives chromium/ffmpeg and
// hands this module two decoded RGB buffers; this module answers ONE
// question with numbers: do the two surfaces carry the same picture?
//
// The law it serves (docs/whiteboard/excellence-gap-analysis.md step 4):
// the editor preview and the final MP4 must consume the same immutable
// frame plan — differences are limited to QUALITY (codec quantization),
// never content (missing ink, moved hands, shifted text). One surface's
// encoder wobble stays inside the codec band; a structural divergence
// saturates the over-tolerance fraction. Both bands are named constants —
// never vibes.

/** The per-channel |Δ| band that codec quantization (JPEG q92 → H.264
 *  crf19 yuv420p) may produce on identical input pixels. Measured, not
 *  guessed: chroma subsampling + DCT rounding keep identical-content
 *  pixels within a few units; anything beyond this band is CONTENT. */
export const PIXEL_TOLERANCE = 8;

/** The pass budgets — RECEIPTED from the controlled codec experiment
 *  (2026-11-24: identical PNG → JPEG q92 → H.264 crf19/yuv420p → decode,
 *  three frames across the text-heaviest scenes): mean |Δ| measured
 *  0.23–0.55, frame over-tolerance measured up to 3.62 %, and the worst
 *  single 8×8 tile measured up to 36 % over-tolerance pixels (codec noise
 *  hugs ink edges, so text-dense tiles carry the most). The budgets sit
 *  ~1.5–1.7× above that ceiling — and FAR below every structural defect
 *  class (a missing hand saturates whole tiles at 100 %; a dead text clip
 *  concentrates its tiles similarly). NOT tuned to a desired outcome; the
 *  experiment is reproducible from the harness's preview PNGs. */
export const PARITY_BUDGET = {
  meanAbsDeltaMax: 3,
  fracOverToleranceMax: 0.06,
  tileOverFracMax: 0.5,
} as const;

/** The tile lens' grid: the frame divides into TILE_GRID × TILE_GRID
 *  tiles; the metric reports the WORST tile's over-tolerance fraction.
 *  Codec noise spreads along edges (measured worst tile 36 %); structural
 *  divergence CONCENTRATES (a missing element saturates its tiles). */
export const TILE_GRID = 8;

export interface FrameParityDiff {
  /** Total pixels compared. */
  pixels: number;
  /** The buffers were byte-equal (the deterministic-render shortcut). */
  byteIdentical: boolean;
  /** Mean per-channel |Δ| in 0..255 across the whole frame. */
  meanAbsDelta: number;
  /** Fraction of pixels with ANY channel |Δ| > PIXEL_TOLERANCE. */
  fracOverTolerance: number;
  /** The largest single-channel |Δ| seen. */
  worstChannelDelta: number;
  /** The worst TILE_GRID × TILE_GRID tile's over-tolerance fraction
   *  (0..1), when the frame's dimensions are known — the concentration
   *  lens that separates scattered codec edge noise from a missing
   *  element. null when dims were not supplied. */
  tileOverFracMax: number | null;
  /** The worst tile's (col,row) — the localization aid for receipts. */
  worstTile: { col: number; row: number } | null;
  /** Set when the two buffers are not the same length (a caller bug) —
   *  the other fields stay 0 and the verdict FAILS (never a fake pass). */
  lengthMismatch: boolean;
}

export interface FrameDims {
  width: number;
  height: number;
}

/**
 * Compare two decoded RGB24 frames of the same dimensions. PURE and
 * deterministic — same inputs, same numbers, no allocation beyond the
 * running scalars (a 1080p frame is 6 MB; the loop is single-pass).
 * Supply the frame's dims to enable the tile concentration lens.
 */
export function compareFrameRgb(final: Buffer, preview: Buffer, dims?: FrameDims): FrameParityDiff {
  if (final.length !== preview.length || final.length === 0) {
    return {
      pixels: 0,
      byteIdentical: false,
      meanAbsDelta: 0,
      fracOverTolerance: 0,
      worstChannelDelta: 0,
      tileOverFracMax: null,
      worstTile: null,
      lengthMismatch: true,
    };
  }
  if (final.equals(preview)) {
    return {
      pixels: final.length / 3,
      byteIdentical: true,
      meanAbsDelta: 0,
      fracOverTolerance: 0,
      worstChannelDelta: 0,
      tileOverFracMax: null,
      worstTile: null,
      lengthMismatch: false,
    };
  }
  let sum = 0;
  let over = 0;
  let worst = 0;
  const pixels = final.length / 3;
  const fw = dims && Number.isFinite(dims.width) && dims.width > 0 ? Math.floor(dims.width) : 0;
  const fh = dims && Number.isFinite(dims.height) && dims.height > 0 ? Math.floor(dims.height) : 0;
  const cols = fw > 0 ? Math.max(1, Math.min(TILE_GRID, fw)) : 0;
  const rows = fh > 0 ? Math.max(1, Math.min(TILE_GRID, fh)) : 0;
  const tileCount = cols * rows;
  const tileOver = tileCount > 0 ? new Array<number>(tileCount).fill(0) : null;
  const tileTotal = tileCount > 0 ? new Array<number>(tileCount).fill(0) : null;
  for (let i = 0; i < final.length; i += 3) {
    const p = i / 3;
    const d = Math.max(
      Math.abs(final[i] - preview[i]),
      Math.abs(final[i + 1] - preview[i + 1]),
      Math.abs(final[i + 2] - preview[i + 2])
    );
    sum += Math.abs(final[i] - preview[i]) + Math.abs(final[i + 1] - preview[i + 1]) + Math.abs(final[i + 2] - preview[i + 2]);
    if (d > worst) worst = d;
    const overPixel = d > PIXEL_TOLERANCE;
    if (overPixel) over++;
    if (tileOver && tileTotal && cols > 0 && rows > 0) {
      const x = p % fw;
      const y = (p - x) / fw;
      const t = Math.min(rows - 1, Math.floor((y * rows) / fh)) * cols + Math.min(cols - 1, Math.floor((x * cols) / fw));
      tileTotal[t]++;
      if (overPixel) tileOver[t]++;
    }
  }
  let tileOverFracMax: number | null = null;
  let worstTile: { col: number; row: number } | null = null;
  if (tileOver && tileTotal) {
    for (let t = 0; t < tileCount; t++) {
      if (tileTotal[t] === 0) continue;
      const frac = tileOver[t] / tileTotal[t];
      if (tileOverFracMax === null || frac > tileOverFracMax) {
        tileOverFracMax = frac;
        worstTile = { col: t % cols, row: Math.floor(t / cols) };
      }
    }
  }
  return {
    pixels,
    byteIdentical: false,
    meanAbsDelta: sum / final.length,
    fracOverTolerance: over / pixels,
    worstChannelDelta: worst,
    tileOverFracMax,
    worstTile,
    lengthMismatch: false,
  };
}

export interface ParityBudgets {
  meanAbsDeltaMax: number;
  fracOverToleranceMax: number;
  tileOverFracMax: number;
}

/** The verdict: PASS only inside every budget and only for same-length
 *  frames. Every FAIL carries the named reason(s) — a parity failure must
 *  be diagnosable, never a bare boolean. The tile lens runs only when the
 *  caller supplied the frame's dims (the harness does; the unit fixtures
 *  that omit dims ride the frame-level budgets alone). */
export function parityVerdict(
  diff: FrameParityDiff,
  budgets: ParityBudgets = PARITY_BUDGET
): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (diff.lengthMismatch) {
    reasons.push(`buffer length mismatch — the two surfaces decoded different shapes (${diff.pixels} pixels compared)`);
  }
  if (diff.meanAbsDelta > budgets.meanAbsDeltaMax) {
    reasons.push(
      `mean |Δ| ${diff.meanAbsDelta.toFixed(3)} exceeds the ${budgets.meanAbsDeltaMax} budget — the frames carry different content, not codec noise`
    );
  }
  if (diff.fracOverTolerance > budgets.fracOverToleranceMax) {
    reasons.push(
      `${(diff.fracOverTolerance * 100).toFixed(2)} % of pixels sit beyond the ±${PIXEL_TOLERANCE} tolerance (budget ${(budgets.fracOverToleranceMax * 100).toFixed(1)} %) — a structural divergence, not quantization`
    );
  }
  if (diff.tileOverFracMax !== null && diff.tileOverFracMax > budgets.tileOverFracMax) {
    const t = diff.worstTile;
    reasons.push(
      `tile (col ${t?.col}, row ${t?.row}) carries ${(diff.tileOverFracMax * 100).toFixed(1)} % over-tolerance pixels (budget ${(budgets.tileOverFracMax * 100).toFixed(0)} %) — a CONCENTRATED divergence, not scattered codec edges`
    );
  }
  return { pass: reasons.length === 0, reasons };
}

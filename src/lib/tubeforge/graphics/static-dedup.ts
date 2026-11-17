// S165 — static-frame dedup for the kenburns/holds lane (the audit's
// staging: "anchor frame + PSNR spot check — hold stretches emit the
// anchor frame once and reuse it when PSNR confirms sameness; a PSNR
// below the floor falls back to per-frame rendering; the delivered clock
// NEVER changes").
//
// The throughput shape of a hold-heavy program: after a graphics scene's
// motion windows end, the scene LEGALLY holds (the qc.ts hold windows —
// the freeze lens books them as designed). Every held frame applies an
// identical payload onto the same static page, screenshots it, and hands
// it to the encoder — N chromium screenshots for N identical pixels. The
// dedup lane buys those back:
//
//   1. the PURE payload scan (this module): each delivered frame's applier
//      input serializes to a key; a maximal run of equal keys is a static
//      stretch. Equal payload strings are the applier's ENTIRE input, and
//      the applier writes ABSOLUTE state (the idempotence pins) — so equal
//      keys ⇒ equal DOM ⇒ equal pixels, by the determinism law itself.
//   2. the render walks the stretches: shoot the ANCHOR frame once, PSNR
//      spot-check the stretch's middle frame against it through the real
//      raster, and on a pass write the anchor's bytes for the whole run
//      (the encoder's image2 sequence reads the same f%05d.jpg count at
//      the same framerate — the delivered clock is untouched, frame for
//      frame). A PSNR below the floor (or an unmeasurable one) falls back
//      to per-frame rendering for that stretch — fail-closed.
//
// The spot check is the audit's belt-and-braces: it verifies the
// payload-equality ⇒ pixel-equality implication against the REAL raster
// (a page-side drift — a banned CSS animation, a font stack that shades —
// would show up as a real PSNR drop and trip the fallback instead of
// shipping a lie). THE TWO-CLOCK LAW HOLDS BY CONSTRUCTION: the plan is
// read nowhere in the dedup path; the frames dir and the encode args are
// shape-identical with and without dedup; only the screenshot count moves.
//
// This module is PURE (the source-pin suite scans it with the frame-truth
// modules): string/array math only — no fs, no clock, no randomness.

/** A static stretch — inclusive delivered-frame indices [start, end] whose
 *  applier payloads serialize identically. The first index is the anchor. */
export interface StaticStretch {
  start: number;
  end: number;
}

/** The minimum stretch worth deduplicating: the spot check costs one
 *  screenshot + one ffmpeg psnr run, so short holds must clear a real
 *  bar before the lane pays for itself. 8 frames ≈ ⅓s at 24fps. */
export const DEDUP_MIN_STRETCH_FRAMES = 8;

/** The spot-check PSNR floor (dB). Identical pixels PSNR to infinity; a
 *  uniform 1-value drift on 8-bit measures ≈ 48 dB; real motion lands
 *  under 30. 60 dB therefore passes only "the same picture" — anything
 *  that actually moved fails and the stretch renders per-frame. */
export const DEDUP_PSNR_FLOOR_DB = 60;

/** Maximal runs of equal payload keys with length ≥ `minStretch`. Pure:
 *  adjacent equal keys merge; a run shorter than the floor never returns
 *  (its frames ride per-frame rendering untouched — the absent-feature
 *  byte-identity law, inside the lane). */
export function findStaticStretches(
  payloadKeys: readonly string[],
  minStretch: number = DEDUP_MIN_STRETCH_FRAMES,
): StaticStretch[] {
  const stretches: StaticStretch[] = [];
  let runStart = 0;
  for (let i = 1; i <= payloadKeys.length; i++) {
    if (i < payloadKeys.length && payloadKeys[i] === payloadKeys[runStart]) continue;
    if (i - runStart >= minStretch && payloadKeys[runStart] !== undefined) {
      stretches.push({ start: runStart, end: i - 1 });
    }
    runStart = i;
  }
  return stretches;
}

/** The spot-check frame inside a stretch — the middle. Never the anchor
 *  (a stretch is ≥ 2 frames by the floor above, so the midpoint is
 *  strictly past it): checking the middle probes the run's center of
 *  mass, the cheapest frame that still spans both halves of the claim. */
export function dedupSpotFrame(stretch: StaticStretch): number {
  return stretch.start + Math.floor((stretch.end - stretch.start) / 2);
}

/** The dedup decision (pure; fail-closed): `reuse` only on a MEASURED PSNR
 *  at or above the floor — Infinity (identical pixels) is the strongest
 *  measured pass there is, never a fallback case. An UNmeasurable run
 *  (null — the psnr pass crashed — or NaN, garbage the tool printed)
 *  falls back, never ships. */
export function dedupDecision(
  psnrDb: number | null,
  floorDb: number = DEDUP_PSNR_FLOOR_DB,
): "reuse" | "fallback" {
  if (psnrDb === null || Number.isNaN(psnrDb)) return "fallback";
  if (psnrDb < floorDb) return "fallback";
  return "reuse";
}

/** One delivered frame's step in the dedup plan — the PURE shape the pins
 *  hold (the render walks the same law through findStaticStretches).
 *  `shoot` frames render through chromium; `reuse` frames take the
 *  stretch anchor's bytes verbatim (pending the render-time PSNR spot
 *  check — a failed check re-shoots the whole stretch per-frame). */
export type DedupFrameStep =
  | { kind: "shoot"; frame: number }
  | { kind: "reuse"; frame: number; anchor: number };

/** The full per-frame plan: every delivered frame gets exactly one step,
 *  the count is the delivered count (the two-clock law), every stretch's
 *  anchor shoots, every other stretch member reuses that anchor, and
 *  everything outside a stretch shoots. */
export function staticDedupPlan(
  payloadKeys: readonly string[],
  minStretch: number = DEDUP_MIN_STRETCH_FRAMES,
): DedupFrameStep[] {
  const plan: DedupFrameStep[] = payloadKeys.map((_, frame) => ({ kind: "shoot", frame }));
  for (const st of findStaticStretches(payloadKeys, minStretch)) {
    for (let f = st.start + 1; f <= st.end; f++) plan[f] = { kind: "reuse", frame: f, anchor: st.start };
  }
  return plan;
}

// ---------------------------------------------------------------------------
// The PSNR reading law — one parser for both consumers (the render's spot
// check reads ffmpeg's summary line; the golden harness reads the
// per-frame stats_file lines). ffmpeg prints `inf` for identical frames;
// a missing or unparseable value reads as null and every consumer treats
// null as a failure (fail-closed, never a vacuous pass).
// ---------------------------------------------------------------------------

/** Parse ffmpeg's psnr SUMMARY line (the last `PSNR ... average:X ...` on
 *  stderr): the mean average PSNR across the compared stream, or null. */
export function parsePsnrSummary(stderr: string): number | null {
  const matches = [...stderr.matchAll(/PSNR y:.*?average:([0-9.]+|inf)/g)];
  const last = matches[matches.length - 1];
  if (!last) return null;
  return last[1] === "inf" ? Infinity : Number(last[1]);
}

export interface PsnrRunStats {
  /** Compared frame count (the stats_file's line count). */
  frames: number;
  /** Per-frame psnr_avg — `inf` preserved as Infinity. */
  psnrAvg: number[];
  /** Frames whose psnr_avg fell below `floorDb` (unparseable counts too). */
  failures: number;
  /** The mean per-frame psnr_avg (Infinity when any frame is identical —
   *  the honest encoding of "the same bytes"); null with zero frames. */
  averagePsnr: number | null;
}

/** Parse a psnr `stats_file` dump (one `n:N ... psnr_avg:X ...` line per
 *  compared frame) into the run's measurement against `floorDb`. */
export function parsePsnrFrameStats(text: string, floorDb: number): PsnrRunStats {
  const psnrAvg: number[] = [];
  for (const line of text.split("\n")) {
    if (!line.includes("psnr_avg:")) continue;
    const m = line.match(/psnr_avg:([0-9.]+|inf)/);
    psnrAvg.push(m ? (m[1] === "inf" ? Infinity : Number(m[1])) : NaN);
  }
  let failures = 0;
  for (const v of psnrAvg) {
    // Infinity is a PASS — it is the exact encoding of identical pixels.
    // Only NaN (unparseable) or a finite value below the floor fails.
    if (Number.isNaN(v) || (Number.isFinite(v) && v < floorDb)) failures++;
  }
  const averagePsnr =
    psnrAvg.length === 0
      ? null
      : psnrAvg.reduce((a, b) => a + b, 0) / psnrAvg.length;
  return { frames: psnrAvg.length, psnrAvg, failures, averagePsnr };
}

// qc-gates.ts — LANE-SCOPED STATIC QC GATES (roadmap item 9).
//
// scene-qc.ts measures MEDIA (the rendered bytes: blackdetect, silencedetect,
// freezedetect, loudness). This module gates the PLAN-STATIC facts a lane can
// verify WITHOUT rendering a frame:
//
//   * slides — display type must FIT its box: a binary-search fit estimate
//     (the remotion layout-utils pattern) with a hard 12px floor and the
//     Marp law: downscale-ONLY (a planned size may shrink to fit, never
//     enlarge, and never shrink below the floor — overflow below the floor
//     is a "shorten the text" failure, not a silent squeeze).
//   * classic/story/character (the scene-compositor family) — the scene
//     chain declares a Ken Burns focal point per scene, and — once scene
//     durations are planned — the narration windows TILE the timeline:
//     gaps beyond tolerance and unexplained overlaps fail with their exact
//     location (the remotion validate-chunks law, generalized to beats).
//     The blended timeline deliberately overlaps consecutive windows by the
//     transition length, so the overlap tolerance is a declared constant,
//     not zero.
//   * acceptance ranges — Av1an's score_within_target pattern, exported for
//     any future measured-quality gate (VMAF-style) to consume.
//
// THE STATUS LAW (scene-qc's, inherited): every gate reports pass | fail |
// unmeasured, and "unmeasured" is NOT a pass — a gate that could not run
// says so, never silently green.
//
// Run: npm run test:qc-gates   (pure — no DB, no DOM, no FS; CI step)

export type QCGateStatus = "pass" | "fail" | "unmeasured";

export interface QCGateFinding {
  status: QCGateStatus;
  detail: string;
}

// ---------- the acceptance-range pattern (Av1an) ----------

/**
 * Av1an's acceptance law: a measured score passes only when it lands INSIDE
 * the declared inclusive target range; non-finite measurements never pass.
 */
export function scoreWithinTarget(value: number, target: readonly [number, number]): boolean {
  if (!Number.isFinite(value)) return false;
  const [lo, hi] = target;
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi) return false;
  return value >= lo && value <= hi;
}

// ---------- the slide text-fit gate (slides lane) ----------

export const SLIDE_FIT_LIMITS = {
  /** The 12px floor law — the smallest display type the studio ships. */
  minFontPx: 12,
  /** Average glyph advance as a fraction of the font size. The deck's
   *  Carlito/Noto stack measures ~0.5em for mixed-case Latin; 0.55 is the
   *  deliberately conservative (wide) estimate — the gate prefers warning
   *  early to approving a squeeze. */
  avgGlyphEm: 0.55,
  /** Binary-search iterations before the bisection settles (the remotion
   *  layout-utils pattern; the linear model converges far earlier). */
  maxFitIterations: 40,
  /** The deck's content column at 1080x1920 (slides.ts BASE_CSS). */
  contentWidthPx: 880,
  /** Headline wrap budget — four lines of display type before it must shrink. */
  headlineMaxLines: 4,
} as const;

export interface SlideFitInput {
  text: string;
  plannedFontPx: number;
  boxWidthPx?: number;
  maxLines?: number;
}

export interface SlideFitVerdict extends QCGateFinding {
  fittedFontPx?: number;
  lines?: number;
}

/**
 * Largest font size (px) whose estimated wrapped line count stays within
 * maxLines in a boxWidthPx-wide column. Deterministic: same text, same box,
 * same verdict — no DOM, no measurement nondeterminism.
 */
export function fitSlideText(
  text: string,
  boxWidthPx: number,
  maxLines: number = SLIDE_FIT_LIMITS.headlineMaxLines,
): { fittedFontPx: number; lines: number } {
  const clean = text.replace(/\s+/g, " ").trim();
  const n = Math.max(clean.length, 1);
  const box = Math.max(boxWidthPx, 1);
  const advance = (size: number) => n * SLIDE_FIT_LIMITS.avgGlyphEm * size;
  const linesAt = (size: number) => Math.max(1, Math.ceil(advance(size) / box));
  // The bisection reports the TRUE largest fitting size — possibly below the
  // 12px floor. The floor is the GATE's law (evaluateSlideTextGate), not the
  // estimator's: a fit that only "passes" because the estimator clamped at
  // the floor would be a gate that can no longer fail.
  let lo = 1;
  let hi = 400;
  for (let i = 0; i < SLIDE_FIT_LIMITS.maxFitIterations && hi - lo > 0.5; i++) {
    const mid = (lo + hi) / 2;
    if (linesAt(mid) <= maxLines) lo = mid;
    else hi = mid;
  }
  return { fittedFontPx: lo, lines: linesAt(lo) };
}

/**
 * The slides display-type gate. Downscale-only: a planned size that fits
 * passes as-is; one that overflows passes with a DECLARED shrink above the
 * floor; one that cannot fit even at the floor fails (shorten the text —
 * the squeeze is never silent).
 */
export function evaluateSlideTextGate(input: SlideFitInput): SlideFitVerdict {
  const text = (input.text ?? "").trim();
  if (!text) return { status: "unmeasured", detail: "slide text is empty — nothing to fit" };
  const planned = input.plannedFontPx;
  if (!Number.isFinite(planned) || planned <= 0)
    return { status: "unmeasured", detail: "planned font size is not a positive number" };
  if (planned < SLIDE_FIT_LIMITS.minFontPx)
    return {
      status: "fail",
      detail: `planned ${planned}px is below the ${SLIDE_FIT_LIMITS.minFontPx}px floor (the 12px law)`,
    };
  const box = input.boxWidthPx ?? SLIDE_FIT_LIMITS.contentWidthPx;
  const maxLines = input.maxLines ?? SLIDE_FIT_LIMITS.headlineMaxLines;
  const { fittedFontPx, lines } = fitSlideText(text, box, maxLines);
  if (fittedFontPx >= planned)
    return {
      status: "pass",
      detail: `fits at the planned ${planned}px (~${lines} line(s) in a ${box}px box)`,
      fittedFontPx,
      lines,
    };
  if (fittedFontPx >= SLIDE_FIT_LIMITS.minFontPx)
    return {
      status: "pass",
      detail: `downscale-only shrink: planned ${planned}px → fits at ~${Math.round(fittedFontPx)}px (shrink, never enlarge; floor ${SLIDE_FIT_LIMITS.minFontPx}px)`,
      fittedFontPx,
      lines,
    };
  return {
    status: "fail",
    detail: `text cannot fit a ${box}px box within ${maxLines} lines above the ${SLIDE_FIT_LIMITS.minFontPx}px floor — shorten the text`,
    fittedFontPx,
    lines,
  };
}

export interface SlideGateRow {
  index: number;
  layout: string;
  gate: SlideFitVerdict;
}

export interface SlideDeckGateReport {
  status: QCGateStatus;
  detail: string;
  rows: SlideGateRow[];
}

/** Whole-deck report: every headline through the fit gate at its planned
 *  display size (headlineFontPx — the deck's own length→size heuristic). */
export function slideDeckGateReport(
  specs: Array<{ layout: string; headline: string }>,
  plannedFontPxFor: (headline: string) => number,
): SlideDeckGateReport {
  if (!Array.isArray(specs) || specs.length === 0)
    return { status: "unmeasured", detail: "no deck saved yet — the gate runs once a deck exists", rows: [] };
  const rows: SlideGateRow[] = specs.map((s, i) => ({
    index: i + 1,
    layout: s.layout,
    gate: evaluateSlideTextGate({ text: s.headline, plannedFontPx: plannedFontPxFor(s.headline ?? "") }),
  }));
  const failed = rows.filter((r) => r.gate.status === "fail");
  const unmeasured = rows.filter((r) => r.gate.status === "unmeasured");
  if (failed.length > 0)
    return {
      status: "fail",
      detail: `${failed.length} of ${rows.length} slide headline(s) cannot fit above the 12px floor — shorten the flagged headline(s)`,
      rows,
    };
  if (unmeasured.length === rows.length)
    return { status: "unmeasured", detail: "every slide headline is empty", rows };
  return { status: "pass", detail: `${rows.length} headline(s) fit (downscale-only law holds)`, rows };
}

// ---------- the classic/story/character beat gate (scene-compositor family) ----------

export const CLASSIC_BEAT_LIMITS = {
  /** A narration window under half a second cannot hold a beat. */
  minBeatMs: 500,
  /** The blended timeline deliberately overlaps consecutive windows by the
   *  transition length; overlaps within this tolerance ARE the blend window.
   *  Anything larger is a plan error, not a crossfade. */
  overlapToleranceMs: 1500,
  /** Maximum declared dead air between consecutive beats. */
  maxGapMs: 1200,
} as const;

export interface ClassicBeatInput {
  id: string;
  startMs: number;
  endMs: number;
  focalPoint?: string | null;
}

export interface ClassicBeatGateReport {
  status: QCGateStatus;
  detail: string;
  findings: string[];
  coverage: { beats: number; spanMs: number | null; gaps: number; overlaps: number; missingFocal: number };
}

/**
 * The focal-point hardening: every scene of the compositor family declares
 * WHAT the camera anchors on (the Ken Burns focal token). A scene without
 * one is not a style choice — it is an undeclared camera.
 */
export function evaluateClassicFocalGate(
  beats: Array<{ id: string; focalPoint?: string | null }>,
): ClassicBeatGateReport {
  if (!Array.isArray(beats) || beats.length === 0)
    return {
      status: "unmeasured",
      detail: "no scenes yet — the focal gate runs once the plan exists",
      findings: [],
      coverage: { beats: 0, spanMs: null, gaps: 0, overlaps: 0, missingFocal: 0 },
    };
  const findings: string[] = [];
  for (const b of beats) {
    if (!b.focalPoint || !String(b.focalPoint).trim())
      findings.push(`scene "${b.id}" declares no focal point — the Ken Burns lane needs one (focal hardening)`);
  }
  return {
    status: findings.length === 0 ? "pass" : "fail",
    detail:
      findings.length === 0
        ? `${beats.length} scene(s) all declare their focal point`
        : `${findings.length} of ${beats.length} scene(s) miss a focal point`,
    findings,
    coverage: { beats: beats.length, spanMs: null, gaps: 0, overlaps: 0, missingFocal: findings.length },
  };
}

/**
 * The tiling gate: once scene durations are planned, narration windows must
 * tile — invalid windows, sub-minimum beats, over-tolerance overlaps, gaps
 * and an uncovered timeline tail all fail WITH their location (remotion's
 * validate-chunks law, generalized to narration beats).
 */
export function evaluateClassicBeatGate(
  beats: ClassicBeatInput[],
  totalDurationMs?: number,
): ClassicBeatGateReport {
  if (!Array.isArray(beats) || beats.length === 0)
    return {
      status: "unmeasured",
      detail: "no scene windows to gate — the plan has no beats yet",
      findings: [],
      coverage: { beats: 0, spanMs: null, gaps: 0, overlaps: 0, missingFocal: 0 },
    };
  const findings: string[] = [];
  let overlaps = 0;
  let gaps = 0;
  let missingFocal = 0;
  for (const b of beats) {
    if (!Number.isFinite(b.startMs) || !Number.isFinite(b.endMs) || b.endMs <= b.startMs) {
      findings.push(`beat "${b.id}" has an invalid window (${b.startMs}..${b.endMs})`);
      continue;
    }
    if (b.endMs - b.startMs < CLASSIC_BEAT_LIMITS.minBeatMs)
      findings.push(
        `beat "${b.id}" is ${b.endMs - b.startMs}ms — under the ${CLASSIC_BEAT_LIMITS.minBeatMs}ms minimum a narration window must hold`,
      );
    if (!b.focalPoint || !String(b.focalPoint).trim()) missingFocal++;
  }
  const valid = beats
    .filter((b) => Number.isFinite(b.startMs) && Number.isFinite(b.endMs) && b.endMs > b.startMs)
    .sort((a, b) => a.startMs - b.startMs);
  for (let i = 1; i < valid.length; i++) {
    const prev = valid[i - 1];
    const cur = valid[i];
    const overlap = prev.endMs - cur.startMs;
    if (overlap > CLASSIC_BEAT_LIMITS.overlapToleranceMs) {
      findings.push(
        `beats "${prev.id}" and "${cur.id}" overlap by ${overlap}ms — beyond the ${CLASSIC_BEAT_LIMITS.overlapToleranceMs}ms blend-window tolerance, narration windows must tile`,
      );
      overlaps++;
    } else if (cur.startMs - prev.endMs > CLASSIC_BEAT_LIMITS.maxGapMs) {
      findings.push(
        `${cur.startMs - prev.endMs}ms dead air between "${prev.id}" and "${cur.id}" — over the ${CLASSIC_BEAT_LIMITS.maxGapMs}ms gap tolerance`,
      );
      gaps++;
    }
  }
  const spanMs = valid.length ? valid[valid.length - 1].endMs - valid[0].startMs : null;
  if (Number.isFinite(totalDurationMs) && (totalDurationMs as number) > 0 && valid.length) {
    const tail = (totalDurationMs as number) - valid[valid.length - 1].endMs;
    if (tail > CLASSIC_BEAT_LIMITS.maxGapMs)
      findings.push(
        `the timeline tail is uncovered: beats end at ${valid[valid.length - 1].endMs}ms of a ${totalDurationMs}ms timeline (${tail}ms uncovered)`,
      );
  }
  return {
    status: findings.length === 0 ? "pass" : "fail",
    detail:
      findings.length === 0
        ? `${valid.length} beat(s) tile the timeline within tolerance`
        : `${findings.length} tiling finding(s)`,
    findings,
    coverage: { beats: beats.length, spanMs, gaps, overlaps, missingFocal },
  };
}

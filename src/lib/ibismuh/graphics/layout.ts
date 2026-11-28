// layout.ts — the GRAPHICS RESPONSIVE LAYOUT SOLVER (the engineering
// master plan's WS8: "responsive layout solver").
//
// The remap law (native-defaults.ts) scales positions by axis and ink by
// the width ratio — geometric truth, but not a DELIBERATE layout: a 9:16
// board with six simultaneous elements and 28px type is remapped, not
// recomposed. The master plan's ask is constraint-based recomposition with
// per-aspect policies and GATES: "fail or request repair for text
// overflow, component collision, clipped citation, unreadable chart
// labels, subject outside safe area, minimum-size violation, excessive
// density, no clear focal hierarchy".
//
// This module is that gate layer:
//   · the closed aspect vocabulary rides the house surfaces table;
//   · each aspect has a NAMED policy (variant) — the deliberate layout —
//     with its own safe-margin ratio, simultaneous-element cap, and type
//     floor (9:16 stacks vertically, carries fewer elements, demands
//     larger type; 1:1 centers the hierarchy; 16:9 opens the stage);
//   · the solver walks every scene's elements through the gates and
//     reports every finding with the element id and the constraint NAMED
//     ("Layout warnings identify the exact component and constraint");
//   · the solver is PURE over the doc — preview and final select the
//     same variant by construction (the plan's parity ask).
//
// The gate classes, honestly split:
//   · GATE (fails the QC row): SAFE-AREA (element center outside the
//     aspect's safe rect) and MIN-SIZE (text below the aspect's readable
//     floor — the house 12px floor's per-aspect strengthening);
//   · NOTE (reported, never fails): COLLISION (estimated text-box
//     overlap beyond the conservative band) and DENSITY (simultaneous
//     elements past the aspect cap) — estimates, not measurements, so a
//     note never blocks a render.
//
// Pure and deterministic: same doc → the same report, byte for byte.
// No fs, no clock, no randomness.
import type {
  GraphicsDoc,
  GraphicsElement,
} from "./types";
import { DEFAULT_SIZE_PX } from "./native-defaults";

// ---------------------------------------------------------------------------
// The closed aspect vocabulary (the house surfaces table, named)
// ---------------------------------------------------------------------------

export type GraphicsAspect = "16:9" | "9:16" | "1:1";

export const GRAPHICS_ASPECTS: readonly GraphicsAspect[] = ["16:9", "9:16", "1:1"];

/** Exact-table resolution — the validator only accepts the three native
 *  sizes, so the solver refuses anything else (fail-closed, never a
 *  silent nearest-snap: the QC row must judge the surface it renders). */
export function aspectForSurface(width: number, height: number): GraphicsAspect {
  if (width === 1920 && height === 1080) return "16:9";
  if (width === 1080 && height === 1920) return "9:16";
  if (width === 1080 && height === 1080) return "1:1";
  throw new Error(
    `layout: ${String(width)}×${String(height)} is not a house surface — the solver judges exactly [1920×1080, 1080×1920, 1080×1080]`,
  );
}

// ---------------------------------------------------------------------------
// The aspect policies — the plan's §13 layout policies, named variants
// ---------------------------------------------------------------------------

export interface AspectPolicy {
  aspect: GraphicsAspect;
  /** The named variant — the deliberate layout this aspect designs. */
  variant: string;
  /** The safe-margin ratio (each side) — the focal band the subject must
   *  stay inside. */
  safeMarginRatio: number;
  /** The simultaneous-element cap past which density is a note. */
  maxSimultaneous: number;
  /** The per-aspect readable type floor (px, post-scale) — the house 12px
   *  floor strengthened where the plan demands larger type. */
  typeFloorPx: number;
  note: string;
}

export const ASPECT_POLICIES: Readonly<Record<GraphicsAspect, AspectPolicy>> = {
  "16:9": {
    aspect: "16:9",
    variant: "wide-stage",
    safeMarginRatio: 0.06,
    maxSimultaneous: 6,
    typeFloorPx: 12,
    note: "side-by-side visual relationships and wider timelines — the stage opens horizontally",
  },
  "9:16": {
    aspect: "9:16",
    variant: "portrait-stack",
    safeMarginRatio: 0.08,
    maxSimultaneous: 4,
    typeFloorPx: 15,
    note: "vertical stacking, fewer simultaneous elements, larger type, portrait-safe focal areas",
  },
  "1:1": {
    aspect: "1:1",
    variant: "centered-square",
    safeMarginRatio: 0.07,
    maxSimultaneous: 5,
    typeFloorPx: 14,
    note: "centered hierarchy and simplified diagrams",
  },
};

// ---------------------------------------------------------------------------
// The estimate model (conservative, declared)
// ---------------------------------------------------------------------------

const CHAR_W_RATIO = 0.55;
const LINE_H_RATIO = 1.4;
// THE ONE METRIC TABLE (master plan Phase 6, the single-source law): the
// restatement in repair.ts is gone — the repair seam imports THESE. A
// second table would drift and the collision/wrap gates would judge
// different boxes than the repair solves against.
export const GRAPHICS_CHAR_W_RATIO = CHAR_W_RATIO;
export const GRAPHICS_LINE_H_RATIO = LINE_H_RATIO;

// THE MEASURED-TYPE SEAM (Phase 6): the ratio model above is a declared
// ESTIMATE — layout.ts's own comment names the day "until the estimator
// is measured". This seam is that day's arrival, honestly additive: a
// rich client (or the render proof harness) may install a REAL glyph
// measurer; without one, every consumer falls back to the ratio model
// byte-identically (the default law — no consumer behavior changes until
// a measurer is actually installed). The seam is deliberately NOT
// persisted anywhere: it is a per-process capability, the deterministic
// battery always runs provider-less.
//
// Phase 7 — the seam is now INSTALLED IN PRODUCTION by
// font-metrics.ts (installGraphicsFontMetrics): the provider measures
// REAL advance widths from the committed Liberation Sans table (the
// face the render farm's fontconfig resolves the stack below onto),
// and every solve labels which model judged it through the LAYOUT
// RECEIPT (below). Provider-less runs stay byte-identical to this file's
// Phase 6 law — the fallback is retained, but it is LABELED, not hidden.
export interface GraphicsTextMetricsProvider {
  /** Width of one text line at sizePx (px) — the caller's real font.
   *  Phase 7: the optional weight selects the face the composer draws
   *  (compose.ts's font-weight law — 700 default, the chart labels'
   *  400); a provider may ignore it (the ratio model is weight-blind). */
  measure(text: string, sizePx: number, weight?: number): number;
  /** The real face's line-height ratio; absent = the ratio model's 1.4.
   *  The installed provider reports the composer's DRAWN line advance
   *  (the tspan spacing law — what the box must bound), not the face's
   *  hhea gap (SVG text advances by the composer's spacing). */
  lineHeightRatio?: number;
  /** Phase 7 — the provider describes itself for the layout receipt
   *  (the honest-labeling law): which model it runs and which face it
   *  reads. Absent = the provider does not name itself, and the receipt
   *  records the ratio fallback's honest nulls. */
  describeMetrics?(): GraphicsMetricsProvenance;
}
let metricsProvider: GraphicsTextMetricsProvider | null = null;
export function setTextMetricsProvider(p: GraphicsTextMetricsProvider | null): void {
  metricsProvider = p;
}
/** Measured width of the widest line (px). Provider present → the real
 *  measurement; absent → the conservative ratio model. Provider-less
 *  behavior is PINNED byte-identical (the existing law) — weight rides
 *  only when a provider is installed. */
export function measureTextWidth(text: string, sizePx: number, weight?: number): number {
  if (metricsProvider !== null) return metricsProvider.measure(text, sizePx, weight);
  return sizePx * CHAR_W_RATIO;
}
/** The active line-height ratio (provider's, else the model's). */
export function activeLineHeightRatio(): number {
  return metricsProvider?.lineHeightRatio ?? LINE_H_RATIO;
}

// ---------------------------------------------------------------------------
// THE LAYOUT RECEIPT (Phase 7 — the plan's demand: the font identity and
// the metric source ride every layout judgment, labeled, never hidden)
// ---------------------------------------------------------------------------

/** The font family the graphics composer DRAWS with (compose.ts's CSS
 *  rule rides THIS constant — one source). The render farm's
 *  fontconfig resolves Arial onto Liberation Sans (Dockerfile:
 *  fonts-liberation) — the face the committed advance table measures. */
export const GRAPHICS_TEXT_FONT_STACK = "Arial,Helvetica,sans-serif";

/** Which model produced the numbers. "real-glyph-table" = the committed
 *  advance table (font-metrics.ts); "ratio-estimate-fallback" = the
 *  declared 0.55 estimate — legal, but it must SAY so. */
export type GraphicsMetricSource = "real-glyph-table" | "ratio-estimate-fallback";

/** The provider's self-description (the seam's describeMetrics law).
 *  `faces` is empty for the ratio fallback (no committed face to name). */
export interface GraphicsMetricsProvenance {
  source: GraphicsMetricSource;
  fontFamily: string;
  /** One row per committed face the provider reads. */
  faces: { weightClass: number; fontFile: string; fontSha256: string }[];
}

/** THE LAYOUT RECEIPT — the plain record of WHAT MEASURED. Emitted by
 *  the solver (and available to any seam that judges a box): the font
 *  family, the face file + hash the numbers came from, the weight/size
 *  profile the receipt's line-height rode, the locale, and — the honest
 *  part — WHICH MODEL ran and whether it was the fallback. */
export interface GraphicsLayoutReceipt {
  fontFamily: string;
  /** The face file the receipt's weight profile resolves to (repo
   *  path); null = no committed face (the ratio fallback). */
  fontFile: string | null;
  /** The face file's sha256; null = no committed face. */
  fontSha256: string | null;
  /** The receipt profile's weight (the compose draw law: text defaults
   *  to 700, chart labels draw 400). */
  weight: number;
  /** The receipt profile's drawn size (px). */
  sizePx: number;
  /** sizePx × the ACTIVE line-height ratio — the box height's actual
   *  multiplier at solve time. */
  lineHeightPx: number;
  /** The measurement's locale assumption (the graphics lane's house
   *  content is ASCII/English — "en"; no doc field exists yet, and the
   *  receipt says so rather than inventing one). */
  locale: string;
  metricSource: GraphicsMetricSource;
  /** True = the numbers came from the declared estimate, not the face. */
  fallback: boolean;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The receipt of the ACTIVE seam state — the builder every emission
 *  point shares (one builder, one vocabulary). `sizePx`/`weight` name
 *  the receipt's type profile (the solver passes the doc's headline;
 *  the compose defaults stand in when absent). Deterministic: reads no
 *  clock, no fs — only the installed provider's self-description. */
export function activeLayoutReceipt(
  opts?: { sizePx?: number; weight?: number; locale?: string }
): GraphicsLayoutReceipt {
  const sizePx = round2(opts?.sizePx ?? 48); // the compose default (textSizePx's own floor)
  const weight = opts?.weight ?? 700; // the compose draw default (compose.ts's weight law)
  const locale = opts?.locale ?? "en";
  const prov = metricsProvider?.describeMetrics?.() ?? {
    source: "ratio-estimate-fallback" as const,
    fontFamily: GRAPHICS_TEXT_FONT_STACK,
    faces: [],
  };
  // The face the receipt's weight resolves to (chromium's face pick for
  // a two-face family: ≥600 draws the bold class, else the regular). A
  // provider with faces always carries both classes of the family.
  const sorted = [...prov.faces].sort((a, b) => a.weightClass - b.weightClass);
  const face = sorted.length > 0
    ? [...sorted].reverse().find((f) => f.weightClass <= weight) ?? sorted[0]
    : undefined;
  return {
    fontFamily: prov.fontFamily,
    fontFile: face?.fontFile ?? null,
    fontSha256: face?.fontSha256 ?? null,
    weight,
    sizePx,
    lineHeightPx: round2(sizePx * activeLineHeightRatio()),
    locale,
    metricSource: prov.source,
    fallback: prov.source === "ratio-estimate-fallback",
  };
}

/** The compose chart box fraction + the chart label size — the estimator
 *  rides the SAME constants the renderer draws with (one estimate model,
 *  restated from compose.ts's DrawDefaults; the repair math needs them
 *  too, so they are exported with the box estimator). */
export const GRAPHICS_CHART_BOX_FRACTION = 0.5;
export const GRAPHICS_CHART_LABEL_SIZE_PX = 20;
/** Estimated text-box overlap past which the collision note fires (a
 *  fraction of the smaller box) — loose enough that tight-but-legal
 *  stacking never notes, tight enough that a real overlap always does. */
const COLLISION_NOTE_AT = 0.4;

export interface EstimatedBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function textSizePx(el: GraphicsElement): number {
  if (el.text !== undefined) return el.text.sizePx ?? DEFAULT_SIZE_PX[el.kind] ?? 48;
  return 48; // the compose default (counter + callout render at this)
}

function textLines(el: GraphicsElement): number {
  if (el.text !== undefined) return Math.max(1, el.text.text.split("\n").length);
  return 1;
}

function textChars(el: GraphicsElement): string | null {
  if (el.text !== undefined) return el.text.text;
  if (el.counter !== undefined) return formatCounterEstimate(el.counter.to, el.counter.unit);
  return null;
}

/** The weight the composer DRAWS this element's text with — the
 *  payload's, else compose.ts's draw default 700 (the payload law:
 *  text weight ?? GRAPHICS_COMPOSE_DEFAULTS.weight; counters draw the
 *  same default). Restated here because layout cannot import compose
 *  (the import would cycle: compose rides this module's font stack) —
 *  the comment cites the source, the battery pins the pair. */
function textWeight(el: GraphicsElement): number {
  if (el.text !== undefined) return el.text.weight ?? 700;
  return 700; // counters (and every payload-less draw) ride the compose default
}

function formatCounterEstimate(to: number, unit?: string): string {
  const digits = Math.max(1, Math.floor(Math.log10(Math.max(1, Math.abs(to)))) + 1);
  return "8".repeat(digits) + (unit ?? "");
}

/** The conservative drawn box for an element (surface px, center-anchored
 *  like compose). Icons estimate 24 grid-units × scale square; text
 *  estimates chars × size × 0.55 wide × lines × size × 1.4 tall; charts
 *  estimate the compose chart box (50% of the surface, centered).
 *  EXPORTED — the repair seam (repair.ts) solves against the same boxes
 *  the gates judge; a second estimator would drift. */
export function estimateBox(el: GraphicsElement, doc: GraphicsDoc): EstimatedBox {
  const { x, y, scale } = el.at;
  if (el.kind === "barChart" || el.kind === "bar") {
    const w = doc.width * GRAPHICS_CHART_BOX_FRACTION;
    const h = doc.height * GRAPHICS_CHART_BOX_FRACTION;
    return { x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 };
  }
  if (el.icon !== undefined) {
    const s = 24 * scale;
    return { x0: x - s / 2, y0: y - s / 2, x1: x + s / 2, y1: y + s / 2 };
  }
  const content = textChars(el);
  if (content !== null) {
    const size = textSizePx(el) * scale;
    const lines = textLines(el);
    const lines_ = content.split("\n");
    // Phase 7: the measured width rides the element's DRAWN weight (the
    // provider picks the face); provider-less the weight is ignored and
    // the ratio model's bytes are untouched (the pinned law).
    const widest = Math.max(...lines_.map((l) => measureTextWidth(l, size, textWeight(el))), size * CHAR_W_RATIO);
    const w = Math.max(widest, 60);
    const h = size * activeLineHeightRatio() * lines;
    return { x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 };
  }
  const s = 120 * scale; // shapes/groups: the compose default mark band
  return { x0: x - s / 2, y0: y - s / 2, x1: x + s / 2, y1: y + s / 2 };
}

function overlapFraction(a: EstimatedBox, b: EstimatedBox): number {
  const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (ox <= 0 || oy <= 0) return 0;
  const areaA = (a.x1 - a.x0) * (a.y1 - a.y0);
  const areaB = (b.x1 - b.x0) * (b.y1 - b.y0);
  const smaller = Math.max(1, Math.min(areaA, areaB));
  return (ox * oy) / smaller;
}

// ---------------------------------------------------------------------------
// The solver
// ---------------------------------------------------------------------------

export type LayoutGateId = "SAFE-AREA" | "MIN-SIZE";
export type LayoutNoteId = "COLLISION" | "DENSITY" | "LABEL-FIT";

export interface LayoutFinding {
  sceneId: string;
  elementId: string;
  /** The gate (fails the QC row) or note (reported, never blocks). */
  gate: LayoutGateId | LayoutNoteId;
  detail: string;
}

export interface SceneLayoutSolve {
  sceneId: string;
  variant: string;
  findings: LayoutFinding[];
}

export interface LayoutSolveReport {
  aspect: GraphicsAspect;
  variant: string;
  policyNote: string;
  scenes: SceneLayoutSolve[];
  /** The gate-class findings — the QC row's fail set. */
  violations: LayoutFinding[];
  notes: LayoutFinding[];
  /** Phase 7 — WHAT MEASURED: the font identity + metric source this
   *  solve judged with (the honest-labeling law). The doc's headline
   *  profile rides as the receipt's weight/size pair. */
  receipt: GraphicsLayoutReceipt;
}

/** The doc's headline profile — the LARGEST drawn text (scaled), the
 *  element whose box the gates judge hardest; the compose defaults (48
 *  / 700 — the draw law) stand in when the doc draws no text. */
function headlineProfile(doc: GraphicsDoc): { sizePx: number; weight: number } {
  let best: { sizePx: number; weight: number } | null = null;
  for (const scene of doc.scenes) {
    for (const el of scene.elements) {
      if (el.text === undefined && el.counter === undefined) continue;
      const size = round2(textSizePx(el) * el.at.scale);
      if (best === null || size > best.sizePx) best = { sizePx: size, weight: textWeight(el) };
    }
  }
  return best ?? { sizePx: 48, weight: 700 }; // the compose defaults (no text in the doc)
}

/** Solve the layout for a whole doc: per scene, per element, through the
 *  aspect's gates. PURE — same doc, same report. */
export function solveGraphicsLayout(doc: GraphicsDoc): LayoutSolveReport {
  const aspect = aspectForSurface(doc.width, doc.height);
  const policy = ASPECT_POLICIES[aspect];
  const mx = doc.width * policy.safeMarginRatio;
  const my = doc.height * policy.safeMarginRatio;
  const violations: LayoutFinding[] = [];
  const notes: LayoutFinding[] = [];

  const scenes: SceneLayoutSolve[] = doc.scenes.map((scene) => {
    const findings: LayoutFinding[] = [];
    const boxes = new Map<string, EstimatedBox>();
    for (const el of scene.elements) {
      boxes.set(el.id, estimateBox(el, doc));
    }

    for (const el of scene.elements) {
      const box = boxes.get(el.id);
      if (box === undefined) continue;
      // GATE — SAFE-AREA: the element's center must sit inside the safe
      // rect (the subject's focal band; the plan's "subject outside safe
      // area").
      const cx = el.at.x;
      const cy = el.at.y;
      if (cx < mx || cx > doc.width - mx || cy < my || cy > doc.height - my) {
        findings.push({
          sceneId: scene.id,
          elementId: el.id,
          gate: "SAFE-AREA",
          detail: `center (${cx}, ${cy}) outside the safe rect [${Math.round(mx)}, ${Math.round(my)} .. ${Math.round(doc.width - mx)}, ${Math.round(doc.height - my)}] (${policy.variant})`,
        });
      }
      // GATE — MIN-SIZE: drawn text below the aspect's readable floor.
      const size = textSizePx(el) * el.at.scale;
      if ((el.text !== undefined || el.counter !== undefined) && size < policy.typeFloorPx) {
        findings.push({
          sceneId: scene.id,
          elementId: el.id,
          gate: "MIN-SIZE",
          detail: `drawn text ${Math.round(size * 100) / 100}px below the ${aspect} readable floor ${policy.typeFloorPx}px (${policy.variant})`,
        });
      }
    }

    // NOTE — COLLISION: estimated text/icon boxes overlapping past the
    // conservative band (estimates never fail a render — they ask for a
    // look; the plan's "component collision" gate lands here until the
    // estimator is measured).
    const visible = scene.elements.filter((el) => el.kind !== "group");
    for (let i = 0; i < visible.length; i++) {
      for (let j = i + 1; j < visible.length; j++) {
        const a = boxes.get(visible[i].id);
        const b = boxes.get(visible[j].id);
        if (a === undefined || b === undefined) continue;
        const frac = overlapFraction(a, b);
        if (frac >= COLLISION_NOTE_AT) {
          findings.push({
            sceneId: scene.id,
            elementId: visible[j].id,
            gate: "COLLISION",
            detail: `estimated box overlaps "${visible[i].id}" by ${Math.round(frac * 100)}% of the smaller box (estimate, never a fail)`,
          });
        }
      }
    }

    // NOTE — DENSITY: simultaneous elements past the aspect cap.
    if (visible.length > policy.maxSimultaneous) {
      findings.push({
        sceneId: scene.id,
        elementId: "*",
        gate: "DENSITY",
        detail: `${visible.length} simultaneous elements past the ${aspect} cap ${policy.maxSimultaneous} (${policy.variant})`,
      });
    }

    // NOTE — LABEL-FIT (the re-audit's step 5: chart-label fitting): a
    // chart's bar labels render at the compose label size (fixed, unscaled)
    // inside per-bar slots; a label wider than its slot overlaps its
    // neighbor's label — an ESTIMATE (the same char-width model against
    // the SAME constants compose draws with), never a fail. The labels are
    // the payload's own data, so the fix is an authoring act (shorten or
    // split the labels) — repair.ts declares this note unrepairable.
    for (const el of visible) {
      if (el.kind !== "barChart" && el.kind !== "bar") continue;
      const data = el.bar?.data ?? [];
      if (data.length < 2) continue;
      const box = boxes.get(el.id);
      if (box === undefined) continue;
      const slotW = (box.x1 - box.x0) / data.length;
      const widest = Math.max(...data.map((r) => r.label.length), 1) * GRAPHICS_CHART_LABEL_SIZE_PX * CHAR_W_RATIO;
      if (widest > slotW) {
        findings.push({
          sceneId: scene.id,
          elementId: el.id,
          gate: "LABEL-FIT",
          detail: `bar labels ≈${Math.round(widest)}px wide against the ${Math.round(slotW)}px slot (estimate, never a fail) — shorten or split the labels`,
        });
      }
    }

    for (const f of findings) {
      if (f.gate === "SAFE-AREA" || f.gate === "MIN-SIZE") violations.push(f);
      else notes.push(f);
    }
    return { sceneId: scene.id, variant: policy.variant, findings };
  });

  return {
    aspect,
    variant: policy.variant,
    policyNote: policy.note,
    scenes,
    violations,
    notes,
    // Phase 7 — the receipt rides every solve: the QC row names the
    // metric source, the studio and the repair seam read the same
    // record, and a provider-less solve SAYS it estimated.
    receipt: activeLayoutReceipt(headlineProfile(doc)),
  };
}

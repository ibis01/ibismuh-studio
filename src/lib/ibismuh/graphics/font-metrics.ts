// font-metrics.ts — the GRAPHICS FONT METRICS PROVIDER (Phase 7).
//
// Phase 6 left the measured-type seam installed nowhere: every consumer
// rode the declared 0.55 ratio estimate and the layout receipt did not
// exist. Phase 7 is the seam's production arrival, on the whiteboard
// glyph-table's exact pattern (glyphs.ts): the advances are COMMITTED —
// generated once from the face files by
// scripts/phase7-generate-graphics-advances.py, read as pure table math
// at runtime. No font parsing, no DOM canvas, no fs — the same doc
// measures byte-identically on every machine, so a server-side solve is
// as stable as the renderer's pixels.
//
// WHICH FACE, honestly: the composer draws every <text> with the CSS
// stack `Arial,Helvetica,sans-serif` (compose.ts, riding layout.ts's
// GRAPHICS_TEXT_FONT_STACK). The render farm installs fonts-liberation
// (Dockerfile) and fontconfig maps Arial onto LIBERATION SANS — the
// metrics-compatible Arial substitute whose files the repo commits
// (public/fonts/liberation/, SIL OFL 1.1). Measuring the committed
// Liberation Sans advances is therefore measuring the face the farm
// rasterizes with — not a lookalike's guess.
//
// The fallback law is RETAINED, not removed: uninstalling the provider
// (or a process that never installs) rides the ratio model byte
// identically — and every solve now LABELS which model ran through the
// layout receipt (the honest-labeling law; an estimate may never pass
// itself off as a measurement).
//
// Uncovered characters (outside the committed ASCII 0x20–0x7E charset):
// the run never fails and never NaNs the gates — an uncovered char
// contributes the declared per-char ratio estimate
// (sizePx × GRAPHICS_CHAR_W_RATIO, ONE source with the fallback law).
// The graphics grammar's authoring surface is ASCII; the degradation is
// documented here rather than silently pretended away.
import {
  activeLayoutReceipt,
  GRAPHICS_CHAR_W_RATIO,
  setTextMetricsProvider,
  type GraphicsLayoutReceipt,
  type GraphicsMetricsProvenance,
  type GraphicsTextMetricsProvider,
} from "./layout";
import { GRAPHICS_ADVANCE_TABLE, type GraphicsAdvanceFace } from "./font-advances";
import { GRAPHICS_COMPOSE_DEFAULTS } from "./compose";

// The faces sorted by weight class — the weight → face resolution walks
// this once at module init (deterministic; the table is committed).
const FACES_BY_CLASS: GraphicsAdvanceFace[] = [...GRAPHICS_ADVANCE_TABLE.faces].sort(
  (a, b) => a.weightClass - b.weightClass,
);

/** The face the composer's font-weight resolves to — chromium's pick
 *  for a two-face family: ≥600 draws the bold class, else the regular.
 *  An absent/weightless call rides the compose draw default (700). */
function faceForWeight(weight?: number): GraphicsAdvanceFace {
  const w = typeof weight === "number" && Number.isFinite(weight) ? weight : 700;
  for (let i = FACES_BY_CLASS.length - 1; i >= 0; i--) {
    const f = FACES_BY_CLASS[i];
    if (f !== undefined && f.weightClass <= w) return f;
  }
  return FACES_BY_CLASS[0] as GraphicsAdvanceFace;
}

/** Measured run width (px) — the committed advances, scaled by
 *  sizePx/upem, summed per char, fixed 2dp (the whiteboard text-draw
 *  discipline: the same call twice is byte-identical). Deterministic:
 *  pure table math, no clock, no randomness. */
function measure(text: string, sizePx: number, weight?: number): number {
  const face = faceForWeight(weight);
  const s = sizePx / GRAPHICS_ADVANCE_TABLE.upem;
  let w = 0;
  for (const ch of text) {
    const adv = face.advances[ch];
    // The honest per-char degradation: an uncovered char rides the
    // declared ratio estimate (ONE constant with the fallback law) —
    // never NaN, never a zero-width lie into the gates.
    w += adv !== undefined ? adv * s : sizePx * GRAPHICS_CHAR_W_RATIO;
  }
  return Math.round(w * 100) / 100;
}

function describeMetrics(): GraphicsMetricsProvenance {
  return {
    source: "real-glyph-table",
    fontFamily: GRAPHICS_ADVANCE_TABLE.family,
    faces: GRAPHICS_ADVANCE_TABLE.faces.map((f) => ({
      weightClass: f.weightClass,
      fontFile: f.fontFile,
      fontSha256: f.fontSha256,
    })),
  };
}

/** THE provider — the seam's production citizen. lineHeightRatio is the
 *  composer's DRAWN line advance (GRAPHICS_COMPOSE_DEFAULTS.textLineHeight
 *  — the tspan spacing the box must bound), not the face's hhea gap:
 *  SVG text advances by the composer's spacing, and the collision/wrap
 *  gates must judge the ink that actually renders. */
export const GRAPHICS_FONT_METRICS_PROVIDER: GraphicsTextMetricsProvider = {
  measure,
  lineHeightRatio: GRAPHICS_COMPOSE_DEFAULTS.textLineHeight,
  describeMetrics,
};

/** Install the real provider ONCE at a process's entry (the render
 *  pipeline, the QC matrix, the design seat — every layout consumer in
 *  that process then measures the committed table). IDEMPOTENT by
 *  construction (setting the same provider twice ≡ once) and pure (a
 *  committed table read — no fs, no DOM). Returns the receipt of the
 *  just-installed state (compose defaults stand in for the profile) —
 *  the caller's evidence that the seam is measured, with the family,
 *  file, hash and metric source named. */
export function installGraphicsFontMetrics(): GraphicsLayoutReceipt {
  setTextMetricsProvider(GRAPHICS_FONT_METRICS_PROVIDER);
  return activeLayoutReceipt();
}

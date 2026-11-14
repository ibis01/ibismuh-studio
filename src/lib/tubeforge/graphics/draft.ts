// S123 (G1) — the draft viewport (P3, spec §7 #3): the Stickman b6
// draft-iteration pattern (references/b6_iteration.py — scale ∈ {0.5, 0.75,
// 1.0}, drafts non-reviewable, inherited_review_credit: false) applied to
// the graphics lane.
//
// A DRAFT IS A LOOK, NOT A CERTIFIED OUTPUT (the S45 law's engine twin):
//   • the draft renders the doc's OWN frame truth at a scaled raster —
//     the composer, the frame truth and the doc are untouched; only the
//     chromium viewport (and a CSS transform) shrink, so draft pixels are
//     the final pixels at a smaller raster (never a different path);
//   • a draft is labelled non-reviewable: it sets hasPreview (the
//     product-wide preview contract) but NEVER writes a render manifest,
//     NEVER runs the QC battery, and carries inherited_review_credit:
//     false — looking at a draft earns no approval credit on any gate;
//   • the scale set is closed: {0.5, 0.75, 1.0}. A junk scale clamps to
//     the nearest legal one (the validator's clamp-with-warning posture) —
//     it never fails the render.
//
// PURE — no fs, no DOM, no clock; the renderer and the routes consume this.
import type { GraphicsDoc } from "./types";

/** The closed draft-scale set (the Stickman b6 scales, verbatim). */
export const GRAPHICS_DRAFT_SCALES = [0.5, 0.75, 1.0] as const;

export type GraphicsDraftScale = (typeof GRAPHICS_DRAFT_SCALES)[number];

/** The draft raster floor — below 64 px on a side the preview stops being
 *  a look at anything (the b6 viewport law). */
export const GRAPHICS_DRAFT_MIN_DIM = 64;

/** Even-dimension rounding — the encoder's yuv420p chroma subsampling
 *  needs even frame dimensions (the whiteboard preview's round-to-even). */
function evenDown(n: number): number {
  return Math.max(2, Math.floor(n / 2) * 2);
}

export function isGraphicsDraftScale(scale: unknown): scale is GraphicsDraftScale {
  return (GRAPHICS_DRAFT_SCALES as readonly unknown[]).includes(scale);
}

/** The nearest LEGAL draft scale — a junk request clamps, never fails. */
export function graphicsDraftScale(requested: unknown): GraphicsDraftScale {
  const n = typeof requested === "number" && Number.isFinite(requested) ? requested : 0.5;
  let best: GraphicsDraftScale = GRAPHICS_DRAFT_SCALES[0];
  let bestDist = Infinity;
  for (const s of GRAPHICS_DRAFT_SCALES) {
    const d = Math.abs(s - n);
    if (d < bestDist) {
      best = s;
      bestDist = d;
    }
  }
  return best;
}

export interface GraphicsDraftViewport {
  /** The scaled raster dims (even, ≥ the floor) — what chromium opens. */
  width: number;
  height: number;
  /** The scale the raster came from (the effective pick, not the request). */
  scale: GraphicsDraftScale;
}

/** The draft frame-rate floor — the b6 philosophy applied to TIME: a draft
 *  previews the choreography, not the smoothness. At a sub-1.0 scale the
 *  draft raster halves its frame rate (min(doc.fps, 12)) and delivers the
 *  SAME seconds (frameCountOf(ms, 12) / 12 ≡ the ms truth) with half the
 *  screenshots — the house precedent is the whiteboard's scene preview,
 *  which pins its own fps 24 regardless of the project's. A 1.0-scale draft
 *  keeps the doc's fps (a full-size draft is a near-final look). */
export const GRAPHICS_DRAFT_FPS = 12;

/** The draft's render fps for a doc at a scale (see GRAPHICS_DRAFT_FPS). */
export function graphicsDraftFps(doc: GraphicsDoc, requested: unknown): number {
  const scale = graphicsDraftScale(requested);
  return scale < 1 ? Math.min(doc.fps, GRAPHICS_DRAFT_FPS) : doc.fps;
}

/** The draft viewport for a doc at a scale: the doc's own aspect, shrunk,
 *  even-dimensioned, floored at 64 px per side. The frame truth is NEVER
 *  scaled — this is a raster size, nothing else. */
export function graphicsDraftViewport(doc: GraphicsDoc, requested: unknown): GraphicsDraftViewport {
  const scale = graphicsDraftScale(requested);
  // Floor both sides first (a tiny scale on a small doc still reads), then
  // even-down; the even pass can only shave 1 px per side from the floored
  // value, so the floor holds after it.
  const width = Math.max(GRAPHICS_DRAFT_MIN_DIM, evenDown(doc.width * scale));
  const height = Math.max(GRAPHICS_DRAFT_MIN_DIM, evenDown(doc.height * scale));
  return { width, height, scale };
}

// ---------------------------------------------------------------------------
// The non-reviewable mark
// ---------------------------------------------------------------------------

/** The draft's own self-description — what the job stamps into its activity
 *  record and what the API echoes, so no surface can mistake a draft for a
 *  certified output. `inheritedReviewCredit: false` is the b6 law verbatim:
 *  a draft inherits NO review credit from the doc it previews. */
export interface GraphicsDraftMark {
  draft: true;
  reviewable: false;
  inheritedReviewCredit: false;
  scale: GraphicsDraftScale;
  width: number;
  height: number;
}

export function graphicsDraftMark(doc: GraphicsDoc, requested: unknown): GraphicsDraftMark {
  const vp = graphicsDraftViewport(doc, requested);
  return {
    draft: true,
    reviewable: false,
    inheritedReviewCredit: false,
    scale: vp.scale,
    width: vp.width,
    height: vp.height,
  };
}

/** The activity-record label — one string, one truth (the whiteboard's
 *  "silent draft" pattern: the label travels with the artifact). */
export function graphicsDraftLabel(mark: GraphicsDraftMark): string {
  return `graphics draft (non-reviewable, ${mark.scale}×, ${mark.width}×${mark.height})`;
}

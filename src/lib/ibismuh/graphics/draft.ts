// S123 (G1) P3 — the draft viewport (the Stickman b6_iteration pattern,
// spec §7): cheap looks at the working doc, labelled NON-REVIEWABLE, that
// never enter the review chain and never certify anything.
//
// THE LAWS (the external acceptance record's structure — adapt, don't
// import):
//   - scale ∈ {0.5, 0.75, 1.0} — a closed set; anything else refuses (a
//     "quick look" that quietly re-renders the final is a spend bug).
//   - even dimensions, ≥ 64 px — the encoder's macroblock floor and the
//     chromium minimum, derived from the scaled surface, never assumed.
//   - `inherited_review_credit: false` — a draft consumes no review credit
//     and grants none; the QC badge never cites a draft.
//   - drafts never enter render-assembly.ts — the draft path renders to
//     its own artifact key; it touches no manifest, no hasVideo, no
//     final.mp4 (the S117 approved-only rule's draft half).
//   - ONE renderer: a draft is the SAME renderGraphics on a scaled doc —
//     the doc clock, the frame truth and the applier are untouched (the
//     one-renderer rule; a draft differs only in surface and label).
//
// PURE — no fs, no DOM, no clock; the route/job call these and pass the
// scaled doc to the renderer.
import type { GraphicsDoc } from "./types";

/** The closed draft-scale set (the b6 viewport law). */
export const GRAPHICS_DRAFT_SCALES = [0.5, 0.75, 1.0] as const;

export type GraphicsDraftScale = (typeof GRAPHICS_DRAFT_SCALES)[number];

export function isGraphicsDraftScale(v: unknown): v is GraphicsDraftScale {
  return v === 0.5 || v === 0.75 || v === 1.0;
}

export interface GraphicsDraftPlan {
  /** The viewport scale — the closed set, verbatim. */
  scale: GraphicsDraftScale;
  /** The scaled surface — even dims, ≥ 64 px (the encoder floor). */
  width: number;
  height: number;
  /** A draft is NEVER reviewable — constant false, the label IS the law. */
  reviewable: false;
  /** A draft inherits no review credit and grants none. */
  inheritedReviewCredit: false;
  /** The deterministic artifact label the UI surfaces verbatim. */
  label: string;
}

/** Even + ≥ 64 enforcement — pure, exported for the pins. The house
 *  surfaces are even at every legal scale; the clamp is the law for the
 *  day a surface joins at an odd pixel count. */
export function draftSurfaceDim(scaled: number): number {
  const v = Math.max(64, Math.round(scaled));
  return v % 2 === 0 ? v : v + 1;
}

/** The draft plan for one scale — null on an illegal scale (never a
 *  silent snap to the nearest legal one: the caller's number is either a
 *  viewport pick or a bug, and a bug must say so). */
export function graphicsDraftPlan(doc: GraphicsDoc, scale: number): GraphicsDraftPlan | null {
  if (!isGraphicsDraftScale(scale)) return null;
  return {
    scale,
    width: draftSurfaceDim(doc.width * scale),
    height: draftSurfaceDim(doc.height * scale),
    reviewable: false,
    inheritedReviewCredit: false,
    label: `graphics draft @ ${scale}× — a look at the working doc, not a reviewable render`,
  };
}

/** The scaled draft doc: the SAME scenes, clock and fps on the scaled
 *  surface. The composer's geometry derives from doc.width/height, and the
 *  frame truth is surface-free (ms clocks + scene-local windows), so a
 *  draft is pixel-identical per element state — same frameAt, same
 *  applier, smaller raster. */
export function graphicsDraftDoc(doc: GraphicsDoc, scale: number): GraphicsDoc | null {
  if (!isGraphicsDraftScale(scale)) return null;
  return { ...doc, width: draftSurfaceDim(doc.width * scale), height: draftSurfaceDim(doc.height * scale) };
}

/** The draft artifact key — namespaced under graphics/, carrying the scale
 *  so a 0.5× and a 0.75× look never overwrite each other. `sceneId` null =
 *  the whole-doc look. The key family stays OUT of the standard preview/
 *  final namespaces by construction (a draft can never shadow an
 *  artifact a gate reads). */
export function graphicsDraftKey(videoId: string, scale: number, sceneId: string | null): string | null {
  if (!isGraphicsDraftScale(scale)) return null;
  const scope = sceneId ? `scene-${sceneId}` : "full";
  return `${videoId}/graphics/draft-${scope}-${scale}.mp4`;
}

// S123 (G1) — the render pre-flight wall (the Stickman preflight-before-
// spend pattern, spec §7): the frame budget is enforced at doc.fps BEFORE
// any renderer work launches.
//
// THE R-1 LAW (the merge-readiness review's finding): the wall is checked
// against the DELIVERED frame count — Σ per-scene frameCountOf(sceneMs,
// fps) frames, exactly what the encoder lays down (framePlanWindows) —
// never against graphicsFrameCount's whole-doc figure. Per-scene rounding
// can exceed the whole-doc figure (24 scenes × 1010 ms @ 30 fps: 744
// delivered vs 728 whole-doc), so a whole-doc preflight could pass while
// the actual render exceeds the budget. The delivered count is the truth;
// the unit suite pins the two arithmetics apart.
//
// The budget wall is FRAME-based: GRAPHICS_FRAME_BUDGET = 25,920 frames =
// 18.0 min at 24 fps, 14.4 min at 30 fps — the duration cap is derived
// from doc.fps, never assumed (the D3 law: a 30 fps doc refuses at 864 s,
// not 1080 s).
//
// PURE — no fs, no DOM, no clock, no randomness; the renderer calls this
// at admission time. The draft viewport and the QC matrix join this module
// at P3 (gated); the wall is the P2 core.
import { framePlanWindows } from "../anim/clock";
import { graphicsSceneDurationsMs } from "./frame";
import { GRAPHICS_FRAME_BUDGET } from "./types";
import type { GraphicsDoc } from "./types";

/** The named-wall refusal message — cites the fps-derived cap, never a
 *  hardcoded duration. Deterministic strings (no locale arithmetic). */
export function graphicsBudgetRefusal(fps: 24 | 30, frames: number, totalMs: number): string {
  const wallSec = GRAPHICS_FRAME_BUDGET / fps;
  return (
    `the graphics frame budget wall (${GRAPHICS_FRAME_BUDGET} frames) is exceeded at ${fps} fps: ` +
    `${frames} delivered frames for ${(totalMs / 1000).toFixed(1)}s of scenes — ` +
    `the cap at ${fps} fps is ${wallSec.toFixed(1)}s (${(wallSec / 60).toFixed(1)} min); ` +
    `split or shorten the project before rendering`
  );
}

export interface GraphicsBudgetReport {
  /** The doc's own fps — the wall's ONLY rate source (never assumed). */
  fps: 24 | 30;
  /** The DELIVERED count — Σ per-scene framePlanWindows frames (R-1). */
  frames: number;
  /** Σ scene clocks in ms (the ms truth the frames encode). */
  totalMs: number;
  /** The wall — one wall, two engines (anim/clock). */
  wall: number;
  /** The wall's duration cap at THIS fps (derived, never assumed). */
  capSec: number;
  /** frames ≤ wall — false means the renderer must refuse. */
  ok: boolean;
  /** When ok is false: the named-wall refusal message. */
  refusal: string | null;
}

/** The preflight budget report — the DELIVERED frame arithmetic (R-1):
 *  per-scene frames via framePlanWindows(sceneMs, doc.fps), summed; the
 *  scene clocks come from the ONE clock rule (frame.ts
 *  graphicsSceneDurationsMs — explicit > measured VO + tail > the house
 *  estimate, S152). Pure;
 *  throws on a doc with no scenes (a caller bug, same as frameAt). */
export function graphicsBudgetReport(
  doc: GraphicsDoc,
  voMsBySceneId?: Map<string, number>
): GraphicsBudgetReport {
  if (doc.scenes.length === 0) {
    throw new Error("graphicsBudgetReport: the doc has no scenes — pass a validated GraphicsDoc");
  }
  const sceneMs = graphicsSceneDurationsMs(doc, voMsBySceneId);
  const plan = framePlanWindows(sceneMs, doc.fps);
  const frames = plan.scenes.reduce((sum, w) => sum + w.frames, 0);
  const totalMs = sceneMs.reduce((sum, ms) => sum + ms, 0);
  const ok = frames <= GRAPHICS_FRAME_BUDGET;
  return {
    fps: doc.fps,
    frames,
    totalMs,
    wall: GRAPHICS_FRAME_BUDGET,
    capSec: GRAPHICS_FRAME_BUDGET / doc.fps,
    ok,
    refusal: ok ? null : graphicsBudgetRefusal(doc.fps, frames, totalMs),
  };
}

/** The admission gate — throws the named-wall refusal when the DELIVERED
 *  count exceeds the wall at doc.fps; returns the report otherwise. The
 *  renderer calls this BEFORE chromium launches (the E0 audit §6 risk-4
 *  receipt: 4 GB workers OOM on long renders). S152 — pass the MEASURED
 *  narration map so the wall judges the SAME extended clock the render
 *  will deliver (an estimate-only admission could pass a program the
 *  VO-extended clock refuses). */
export function assertGraphicsBudget(
  doc: GraphicsDoc,
  voMsBySceneId?: Map<string, number>
): GraphicsBudgetReport {
  const report = graphicsBudgetReport(doc, voMsBySceneId);
  if (!report.ok) throw new Error(report.refusal ?? "graphics budget wall exceeded");
  return report;
}

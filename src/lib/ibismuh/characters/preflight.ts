// S125 (K1) — the render pre-flight wall: the frame budget is enforced
// BEFORE any renderer work launches (the graphics preflight.ts law,
// mirrored — one wall, two engines, three now: the anim substrate's
// ANIM_FRAME_BUDGET is the shared constant and this module cites it).
//
// THE R-1 LAW (the merge-readiness review's finding, restated for K1): the
// wall is checked against the DELIVERED frame count — Σ per-slot
// frameCountOf(slotMs, fps) frames, exactly what the encoder lays down
// (framePlanWindows) — never a whole-program estimate. Per-slot rounding
// can exceed a whole-program figure, so a whole-program preflight could
// pass while the actual render exceeds the budget. The delivered count is
// the truth; the unit suite pins the two arithmetics apart.
//
// PURE — no fs, no DOM, no clock, no randomness; the renderer calls this at
// admission time. The render hook asserts before chromium launches.
import { framePlanWindows } from "../anim/clock";
import { ANIM_FRAME_BUDGET } from "../anim/clock";
import type { RigSceneSlot } from "./tracks";

/** The named-wall refusal message — cites the fps-derived cap, never a
 *  hardcoded duration. Deterministic strings (no locale arithmetic). */
export function rigBudgetRefusal(fps: 24 | 30, frames: number, totalMs: number): string {
  const wallSec = ANIM_FRAME_BUDGET / fps;
  return (
    `the character frame budget wall (${ANIM_FRAME_BUDGET} frames) is exceeded at ${fps} fps: ` +
    `${frames} delivered frames for ${(totalMs / 1000).toFixed(1)}s of rig scenes — ` +
    `the cap at ${fps} fps is ${wallSec.toFixed(1)}s (${(wallSec / 60).toFixed(1)} min); ` +
    `split or shorten the program before rendering`
  );
}

export interface RigBudgetReport {
  /** The program's render rate — the wall's ONLY rate source (never assumed). */
  fps: 24 | 30;
  /** The DELIVERED count — Σ per-slot framePlanWindows frames (R-1). */
  frames: number;
  /** Σ slot clocks in ms (the ms truth the frames encode). */
  totalMs: number;
  /** The wall — one wall, the engines (anim/clock). */
  wall: number;
  /** The wall's duration cap at THIS fps (derived, never assumed). */
  capSec: number;
  /** frames ≤ wall — false means the renderer must refuse. */
  ok: boolean;
  /** When ok is false: the named-wall refusal message. */
  refusal: string | null;
}

/** The preflight budget report — the DELIVERED frame arithmetic (R-1):
 *  per-slot frames via framePlanWindows(slotMs, fps), summed. Pure; throws
 *  on an empty slot list (a caller bug — the hook only calls it with real
 *  cast scenes). */
export function rigBudgetReport(slots: RigSceneSlot[], fps: 24 | 30): RigBudgetReport {
  if (slots.length === 0) {
    throw new Error("rigBudgetReport: no slots — the hook renders only real cast scenes");
  }
  const plan = framePlanWindows(
    slots.map((s) => s.durationMs),
    fps
  );
  const frames = plan.scenes.reduce((sum, w) => sum + w.frames, 0);
  const totalMs = slots.reduce((sum, s) => sum + s.durationMs, 0);
  const ok = frames <= ANIM_FRAME_BUDGET;
  return {
    fps,
    frames,
    totalMs,
    wall: ANIM_FRAME_BUDGET,
    capSec: ANIM_FRAME_BUDGET / fps,
    ok,
    refusal: ok ? null : rigBudgetRefusal(fps, frames, totalMs),
  };
}

/** The admission gate — throws the named-wall refusal when the DELIVERED
 *  count exceeds the wall at fps; returns the report otherwise. The
 *  renderer calls this BEFORE chromium launches (the E0 audit receipt:
 *  4 GB workers learn about unbounded renders from the OOM killer). */
export function assertRigBudget(slots: RigSceneSlot[], fps: 24 | 30): RigBudgetReport {
  const report = rigBudgetReport(slots, fps);
  if (!report.ok) throw new Error(report.refusal ?? "rig budget wall exceeded");
  return report;
}

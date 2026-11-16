// S149 (B4) — the locomotion rung: the dormant anim substrate (gait, IK)
// becomes the rig director's compile-time vocabulary.
//
// Provenance: the substrate is S121 P2 — the "Stickman Video Director"
// algorithms (MIT-licensed source, audited 2026-11-14) REIMPLEMENTED
// independently in TypeScript. They were written and pinned (the S121 P2
// suite) but consumed by nothing — dormant. This module is the rung that
// wakes them: the walk compiles gait-driven leg rows, the reach compiles
// IK-solved arm rows, both into the EXISTING inline-joint row shape the
// authored-mocap lane already ships.
//
// Laws. COMPILE-ONLY (the rig-director law): rows are a planning artifact —
// nothing rides the doc, no grammar grows, the FK math stays in rig-frame.ts.
// THE PHASE-RIDES-DISTANCE LAW (anim/gait verbatim): the leg cycle advances
// ONLY by the body's own covered distance — gaitPhaseAt receives the
// distance model, never the bare clock; the forbidden shape
// (distance/stride + cadence·t — the legs sprinting while the body stands)
// is structurally unreachable here. REFUSE-NOT-CLAMP (anim/ik verbatim):
// an unreachable or degenerate reach returns null — the director degrades
// to the honest rest; the solver never clamps a lie onto the boundary.
// PURITY (S64): no fs, no clock, no randomness, no globals.
//
// THE WALK ARC: both leg channels derive from footArcAt — the sweep rides
// the arc's x (one full cos oscillation per stride, continuous across the
// wrap), the lift rides the arc's y (stance lift EXACTLY zero, swing lift
// on the sine arc), the legs ride anti-phase (the right leg leads by half
// a stride). The honest scope claim: this is beat-sync locomotion — the
// authored BVH lane stays the ladder's top rung for capture-quality walks.
import { footArcAt, gaitPhaseAt, type GaitParams } from "../anim/gait";
import { isReachable, solveTwoBone, type TwoBoneChain } from "../anim/ik";
import type { CharacterRigDoc, RigJointState, RigPartSlot, RigPose } from "./rig2d";
import type { RigPoseRow } from "./rig-frame";

// ---------------------------------------------------------------------------
// The tuning table (the walk's ONE table — the pins read it, nothing else
// carries these numbers)
// ---------------------------------------------------------------------------

/** cadence is strides per second (explainer tempo); stridePx is stage px
 *  per full stride; sweepDeg is the hip's fore/aft arc; liftPx is the
 *  swing foot's peak rise; rowStepMs spaces the compiled samples (poseAt's
 *  POSE_TWEEN pursuit smooths them into a walk). */
export const WALK_TUNING = {
  cadenceSps: 1.5,
  stridePx: 180,
  sweepDeg: 24,
  liftPx: 26,
  rowStepMs: 110,
} as const;

// ---------------------------------------------------------------------------
// The walk lexicon (the byte-identity law's lexical half: a word that only
// sometimes means walking must not steal the window — "moves the part",
// "runs the pipeline" and "cross-fades" stay gestures; the list is closed
// and deliberately tight)
// ---------------------------------------------------------------------------

const WALK_WORDS: ReadonlySet<string> = new Set([
  "walk",
  "walks",
  "walking",
  "walked",
  "stroll",
  "strolls",
  "strolling",
  "stride",
  "strides",
  "striding",
  "march",
  "marches",
  "marching",
  "step",
  "steps",
  "stepping",
]);

/** Whether the sentence's OWN words name a walk. Word-boundary match on
 *  the lowercased text. Pure, deterministic. */
export function sentenceWalks(text: string): boolean {
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean)
    .some((w) => WALK_WORDS.has(w));
}

// ---------------------------------------------------------------------------
// The gait → leg mapping
// ---------------------------------------------------------------------------

/** The stride phase for the walk at `elapsedMs` into the beat — THE
 *  PHASE-RIDES-DISTANCE LAW's call site: the body's own distance model
 *  (cadence strides/s over the stride length) feeds gaitPhaseAt; the clock
 *  rides the signature only. The body genuinely translates at
 *  cadence · stride px/s, so phase = distance / strideLength exactly. */
export function walkPhaseAt(elapsedMs: number): number {
  const params: GaitParams = { strideLength: WALK_TUNING.stridePx, cadence: WALK_TUNING.cadenceSps };
  const distancePx = WALK_TUNING.cadenceSps * (elapsedMs / 1000) * WALK_TUNING.stridePx;
  return gaitPhaseAt(params, distancePx, elapsedMs / 1000);
}

/** The leg joints for one stride phase — BOTH channels derive from
 *  footArcAt(phase, 1) (stepHeight 1 makes the arc's y the lift FRACTION):
 *  the sweep = sweepDeg · cos(2π·arc.x) (continuous across the wrap), the
 *  lift = −liftPx · arc.y (stage y grows downward — up is negative). The
 *  stance lift is EXACTLY zero; the swing lift rides the sine arc. Pure. */
export function walkLegJoints(phase: number): Required<RigJointState> {
  const arc = footArcAt(phase, 1);
  const sweep = WALK_TUNING.sweepDeg * Math.cos(2 * Math.PI * arc.x);
  const lift = -WALK_TUNING.liftPx * arc.y;
  return { rotateDeg: sweep, x: 0, y: lift, scale: 1 };
}

/** A walk window on the scene clock (the sentence's own envelope — the
 *  director's sentenceWindows output). Planning input; never doc grammar. */
export interface WalkBeat {
  startMs: number;
  endMs: number;
}

/** The row count a walk window compiles (the wall's arithmetic — the
 *  director checks BEFORE compiling, the wall never truncates a stride). */
export function walkRowCount(beat: WalkBeat): number {
  if (!(beat.endMs > beat.startMs)) return 0;
  return Math.ceil((beat.endMs - beat.startMs) / WALK_TUNING.rowStepMs) + 1; // + the home row
}

/** The walk's compiled rows: stride-keyed samples across the window on the
 *  EXISTING inline-joint row shape (the mocap lane's rows — no grammar
 *  grows), the legs riding anti-phase (`right` leads by half a stride),
 *  ONE trailing rest row at the beat's end (poseId null, NO joints — the
 *  legs tween home over the POSE_TWEEN window). Pure; time-ascending. */
export function planWalkRows(
  beat: WalkBeat,
  legIds: { left: string; right: string }
): RigPoseRow[] {
  const rows: RigPoseRow[] = [];
  if (!(beat.endMs > beat.startMs)) return rows;
  for (let t = beat.startMs; t < beat.endMs; t += WALK_TUNING.rowStepMs) {
    const phase = walkPhaseAt(t - beat.startMs);
    const left = walkLegJoints(phase);
    const right = walkLegJoints(phase + 0.5);
    rows.push({
      tMs: Math.round(t),
      poseId: null,
      joints: {
        [legIds.left]: { rotateDeg: left.rotateDeg, y: left.y },
        [legIds.right]: { rotateDeg: right.rotateDeg, y: right.y },
      },
    });
  }
  rows.push({ tMs: Math.max(Math.round(beat.endMs), Math.round(beat.startMs) + 1), poseId: null });
  return rows;
}

// ---------------------------------------------------------------------------
// The IK reach
// ---------------------------------------------------------------------------

/** One authored reach beat — IK places the arm's HAND exactly on the stage
 *  target. Planning input (the director's `reaches`), never doc grammar. */
export interface RigReachBeat {
  atMs: number;
  /** Stage-coordinate target the HAND lands on. */
  target: { x: number; y: number };
  arm: Extract<RigPartSlot, "arm-l" | "arm-r">;
}

/** The arm chain's geometry at REST, read from the rig's OWN pivots (the
 *  art IS the rest — no separate skeleton model): bone lengths and rest
 *  directions from the arm→forearm→hand pivot vectors. A rig without the
 *  full three-part chain returns null (a two-part arm degrades — no
 *  invented bones). Pure. */
export interface ArmChain {
  upperId: string;
  foreId: string;
  chain: TwoBoneChain;
  restUpperDeg: number;
  restForeDeg: number;
  shoulder: { x: number; y: number };
}

const FORE_SLOT = { "arm-l": "forearm-l", "arm-r": "forearm-r" } as const;
const HAND_SLOT = { "arm-l": "hand-l", "arm-r": "hand-r" } as const;

export function armChainOf(rig: CharacterRigDoc, armSlot: "arm-l" | "arm-r"): ArmChain | null {
  const upper = rig.parts.find((p) => p.slot === armSlot);
  const fore = rig.parts.find((p) => p.slot === FORE_SLOT[armSlot]);
  const hand = rig.parts.find((p) => p.slot === HAND_SLOT[armSlot]);
  if (!upper || !fore || !hand) return null;
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(b.x - a.x, b.y - a.y);
  const upperLen = dist(upper.pivot, fore.pivot);
  const foreLen = dist(fore.pivot, hand.pivot);
  if (!(upperLen > 0) || !(foreLen > 0)) return null;
  const ang = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return {
    upperId: upper.id,
    foreId: fore.id,
    chain: { upper: upperLen, fore: foreLen },
    restUpperDeg: ang(upper.pivot, fore.pivot),
    restForeDeg: ang(fore.pivot, hand.pivot),
    shoulder: upper.pivot,
  };
}

/** The reach pose for one arm — solveTwoBone places the HAND exactly on
 *  the target (chain-local: the solver's shoulder sits at the origin), the
 *  pole hanging the elbow DOWN (the resting arm carriage — the
 *  deterministic choice; a pole riding the line keeps the solver's CCW
 *  tie-break). REFUSE-NOT-CLAMP: an unreachable, degenerate or
 *  missing-chain reach returns null — the director degrades to the honest
 *  rest; nothing is clamped onto the boundary. Pure. */
export function reachPose(rig: CharacterRigDoc, beat: RigReachBeat): RigPose | null {
  const arm = armChainOf(rig, beat.arm);
  if (!arm) return null;
  if (!Number.isFinite(beat.target.x) || !Number.isFinite(beat.target.y)) return null;
  const local = { x: beat.target.x - arm.shoulder.x, y: beat.target.y - arm.shoulder.y };
  if (!isReachable(arm.chain, local)) return null;
  let solved: ReturnType<typeof solveTwoBone>;
  try {
    solved = solveTwoBone(arm.chain, local, { x: 0, y: 1 });
  } catch {
    return null; // the solver's named degeneracies — degrade, never clamp
  }
  // The FK composition law: the child inherits the parent's rotation, so
  // the forearm's LOCAL delta = absolute fore angle − rest fore angle −
  // upper delta. The upper's local delta is the plain absolute delta.
  const upperAbs = (Math.atan2(solved.elbow.y, solved.elbow.x) * 180) / Math.PI;
  const foreAbs =
    (Math.atan2(solved.hand.y - solved.elbow.y, solved.hand.x - solved.elbow.x) * 180) / Math.PI;
  const upperDelta = upperAbs - arm.restUpperDeg;
  const foreDelta = foreAbs - arm.restForeDeg - upperDelta;
  return {
    id: "__reach__",
    name: "reach",
    joints: {
      [arm.upperId]: { rotateDeg: upperDelta },
      [arm.foreId]: { rotateDeg: foreDelta },
    },
  };
}

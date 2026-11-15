// S125 (K1) — the rig's PURE frame truth: poseAt(rig, timeline, tMs) and the
// mouth-beat compiler (roadmap §6: "keyframed joint states over the scene
// clock using the shared anim.ts easings; speaking = mouth-shape schedule
// derived from W4 word anchors").
//
// THE ONE-MOTION-TRUTH LAW: the same shape as the graphics engine's
// frame.ts — a pure function from (doc, clock) to an absolute frame state a
// dumb applier can set. The FK math lives HERE and nowhere else; the applier
// (rig-compose.ts APPLY_RIG_FRAME_FN) only writes what this module computed.
//
// FK MODEL (v1 — FK only, no IK, no skinning, the §6 non-goals):
//   every part's local transform is its JOINT DELTA about its pivot —
//     M_local = T(dx,dy) ∘ R(pivot, dRot) ∘ S(pivot, dScale),
//   and the absolute matrix is the parent chain's composition
//     M_abs(part) = M_abs(parent) ∘ M_local(part).
//   The art is authored at REST in stage coordinates (rest = identity), so
//   deltas are the only motion — pose deltas ARE the animation. The applier
//   receives absolute `matrix6` values (absolute-set writes, the graphics
//   applier discipline; never incremental CSS transforms — determinism).
//
// THE POSE ROWS: hold semantics with a fixed tween window — from a row's
// tMs, the pose tweens from the PREVIOUS row's pose (or rest) over
// POSE_TWEEN_MS, then holds until the next row. Joints absent from a pose
// tween back to rest. Segment easing is the ROW's (the destination keyframe
// owns the segment easing — the anim/keyframe law).
//
// THE MOUTH SCHEDULE (§6 verbatim: "mouth-shape schedule derived from W4
// word anchors (syllable-counted open/close beats inside each word span —
// the honest, deterministic alternative to phoneme lip-sync; scope-claimed
// as 'beat-sync', not phoneme lip-sync, in all docs/UI)"):
//   W4 word anchors (the captions lane's per-word spans, beat-plan's
//   tokenizer index space) → per-word syllable counts (deterministic
//   vowel-group counter) → open/close beats strictly INSIDE each word span;
//   closed fills the gaps. Speech cycles open|wide|oh deterministically;
//   smile exists ONLY as a gesture override (timeline rows); closed at rest.
//   Degradation ladder: anchors absent/mismatched → the word-proportional
//   house estimator over the scene clock (the W4 fallback shape); no
//   narration → no beats (the character is not speaking — closed mouth).
//
// PURE — no fs, no clock, no randomness (the S64 law generalizes). Callers
// pass VALIDATED rigs (rig2d) and COMPILED timelines (rig-director); this
// module carries no defensive re-validation.
import { evalEase, isEaseName, type EaseName } from "../anim/easing";
import { splitSentences, words } from "../whiteboard/beat-plan";
import type { WordAnchors } from "../whiteboard/timing";
import { isMouthSlot, type CharacterRigDoc, type RigJointState, type RigMouthSlot, type RigPart, type RigPose } from "./rig2d";

// ---------------------------------------------------------------------------
// The named constants (the schedule's ONE table — no magic numbers elsewhere)
// ---------------------------------------------------------------------------

/** The pose tween window — a gesture lands in ~1/3 s, explainer tempo. */
export const POSE_TWEEN_MS = 320;

/** The mouth open ratio + floors: an open beat fills ~55% of its slot
 *  (closed fills the remainder — mouths close between beats), never shorter
 *  than MOUTH_MIN_OPEN_MS; spans below MOUTH_SHORT_SPAN_MS carry ONE beat. */
export const MOUTH_OPEN_RATIO = 0.55;
export const MOUTH_MIN_OPEN_MS = 40;
export const MOUTH_SHORT_SPAN_MS = 90;

/** The speech cycle — deterministic per (word, syllable) parity; smile is a
 *  GESTURE (never speech); closed is the rest. Exported for the pins. */
export const SPEECH_CYCLE: readonly RigMouthSlot[] = ["open", "wide", "oh"];

// ---------------------------------------------------------------------------
// The frame contracts
// ---------------------------------------------------------------------------

/** Absolute 2×3 affine matrix [a, b, c, d, e, f] —
 *  x' = a·x + c·y + e, y' = b·x + d·y + f (SVG matrix() order). */
export type Matrix6 = [number, number, number, number, number, number];

/** One part's absolute frame state — what the applier writes, nothing else. */
export interface RigPartFrame {
  id: string;
  /** Mouth parts: visible only for the frame's variant. Others: always. */
  visible: boolean;
  opacity: number;
  /** The absolute FK matrix in stage coordinates. */
  matrix: Matrix6;
}

/** The rig's frame state — the pure truth at one clock time. */
export interface RigFrameState {
  /** Parts in DRAW order (z-ascending, id tiebreak — the compose order). */
  parts: RigPartFrame[];
  /** The visible mouth variant this frame (closed = no speech/gesture). */
  mouthVariant: RigMouthSlot;
  /** True when a speech beat (or a smile gesture) owns this frame's mouth. */
  speaking: boolean;
}

/** One pose-timeline row: the pose held FROM tMs (compiled by the
 *  rig-director; compiled output only — the doc carries no timelines in v1,
 *  the compile-only law). `mouth` pins a gesture variant for the row's
 *  window (until the next row). */
export interface RigPoseRow {
  tMs: number;
  /** The pose id (must exist on the sheet; `null` = rest). An unknown id
   *  resolves to rest — the planner only emits known ids; the resolution
   *  rule keeps authored timelines honest without defensive branches. */
  poseId: string | null;
  /** The segment easing INTO this row's pose (destination owns the segment). */
  ease?: EaseName;
  /** Gesture mouth override for this row's window (e.g. a smile). */
  mouth?: RigMouthSlot;
}

/** The compiled pose timeline for ONE scene (never persisted — beats are a
 *  planning artifact that dies at the renderer, the whiteboard beat law). */
export interface RigPoseTimeline {
  durationMs: number;
  rows: RigPoseRow[];
}

// ---------------------------------------------------------------------------
// The FK math (module-private — the applier consumes states, not matrices)
// ---------------------------------------------------------------------------

const IDENTITY: Matrix6 = [1, 0, 0, 1, 0, 0];

const REST_JOINT: Required<RigJointState> = { rotateDeg: 0, x: 0, y: 0, scale: 1 };

function compose(out: Matrix6, over: Matrix6): Matrix6 {
  // out ∘ over  (apply `over` first, then `out`)
  const [pa, pb, pc, pd, pe, pf] = out;
  const [la, lb, lc, ld, le, lf] = over;
  return [
    pa * la + pc * lb,
    pb * la + pd * lb,
    pa * lc + pc * ld,
    pb * lc + pd * ld,
    pa * le + pc * lf + pe,
    pb * le + pd * lf + pf,
  ];
}

/** The local delta matrix about the part's pivot:
 *  M = T(dx,dy) ∘ R(pivot, dRot) ∘ S(pivot, dScale)
 *    = translate(dx+px, dy+py) ∘ rotate ∘ scale ∘ translate(-px,-py). */
function localMatrix(j: Required<RigJointState>, pivot: { x: number; y: number }): Matrix6 {
  const r = (j.rotateDeg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const s = j.scale;
  const a = s * cos;
  const b = s * sin;
  const c = -s * sin;
  const d = s * cos;
  const px = j.x + pivot.x;
  const py = j.y + pivot.y;
  return [a, b, c, d, px - (a * pivot.x + c * pivot.y), py - (b * pivot.x + d * pivot.y)];
}

function lerpJoint(a: Required<RigJointState>, b: Required<RigJointState>, u: number): Required<RigJointState> {
  return {
    rotateDeg: a.rotateDeg + (b.rotateDeg - a.rotateDeg) * u,
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    scale: a.scale + (b.scale - a.scale) * u,
  };
}

function jointOf(pose: RigPose | null, partId: string): Required<RigJointState> {
  const j = pose?.joints[partId];
  return j ? { ...REST_JOINT, ...j } : { ...REST_JOINT };
}

// ---------------------------------------------------------------------------
// The syllable counter (the beat-sync arithmetic — deterministic, honest
// about being an approximation)
// ---------------------------------------------------------------------------

/** Vowel-group syllable estimate, clamped to 1..5. A BEAT estimate — the
 *  scope claim is beat-sync, never phoneme lip-sync (the §6 honesty law). */
export function countSyllables(raw: string): number {
  const w = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 1;
  const groups = w.match(/[aeiouy]+/g);
  let n = groups ? groups.length : 1;
  if (w.length > 2 && w.endsWith("e") && n > 1) n -= 1; // the silent trailing e
  return Math.max(1, Math.min(n, 5));
}

// ---------------------------------------------------------------------------
// The mouth schedule
// ---------------------------------------------------------------------------

/** One mouth segment — a variant window. Between segments the mouth is
 *  closed. Segments are non-overlapping, time-ascending, clock-clamped. */
export interface MouthSegment {
  startMs: number;
  endMs: number;
  variant: RigMouthSlot;
}

/** Word spans — the schedule's input shape (from anchors or the estimator). */
export interface WordSpan {
  word: string;
  startMs: number;
  endMs: number;
}

/** The word-proportional estimator (the W4 fallback shape): even slices of
 *  the scene clock across the narration's beat-tokenized words. */
export function wordSpansFromEstimate(narration: string, durationMs: number): WordSpan[] {
  const tokens = words(narration);
  if (tokens.length === 0 || !(durationMs > 0)) return [];
  const step = durationMs / tokens.length;
  return tokens.map((word, i) => ({
    word,
    startMs: Math.round(i * step),
    endMs: Math.max(Math.round((i + 1) * step), Math.round(i * step) + 1),
  }));
}

/** Anchors → spans, paired with the narration's tokenizer index space (the
 *  ONE tokenizer law — voice-anchors indexes words in beat-plan's space).
 *  A count mismatch degrades to null (the caller falls back to the
 *  estimator) — a misheard ASR pass degrades, never corrupts. */
export function wordSpansFromAnchors(narration: string, anchors: WordAnchors | null, durationMs: number): WordSpan[] | null {
  if (!anchors || anchors.byWord.length === 0) return null;
  const tokens = words(narration);
  if (tokens.length !== anchors.byWord.length) return null;
  const sorted = [...anchors.byWord].sort((a, b) => a.index - b.index);
  const spans: WordSpan[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    if (a.index !== i) return null; // the index space must be contiguous
    if (!(a.endMs > a.startMs) || a.startMs < 0 || a.endMs > durationMs) return null;
    spans.push({ word: tokens[i], startMs: a.startMs, endMs: a.endMs });
  }
  return spans;
}

/** The open/close beat compiler: per word span, `countSyllables` slots; each
 *  slot opens for its OPEN_RATIO slice (≥ MOUTH_MIN_OPEN_MS when the span
 *  can hold it), the remainder closes. Every open beat sits STRICTLY INSIDE
 *  its span (the W4 tolerance pin — beats never bleed across word bounds). */
export function mouthBeatsFromSpans(spans: WordSpan[], durationMs: number): MouthSegment[] {
  const out: MouthSegment[] = [];
  const clampMs = (v: number) => Math.max(0, Math.min(durationMs, v));
  for (let wi = 0; wi < spans.length; wi++) {
    const span = spans[wi];
    const start = clampMs(span.startMs);
    const end = clampMs(span.endMs);
    if (!(end > start)) continue;
    const syllables = countSyllables(span.word);
    const slotMs = (end - start) / syllables;
    const openMs = slotMs >= MOUTH_SHORT_SPAN_MS
      ? Math.max(MOUTH_MIN_OPEN_MS, slotMs * MOUTH_OPEN_RATIO)
      : Math.min(slotMs, Math.max(MOUTH_MIN_OPEN_MS, (end - start) * MOUTH_OPEN_RATIO));
    for (let s = 0; s < syllables; s++) {
      const openStart = clampMs(start + s * slotMs);
      const openEnd = clampMs(openStart + openMs);
      if (openEnd > openStart) {
        out.push({
          startMs: openStart,
          endMs: openEnd,
          variant: SPEECH_CYCLE[(wi + s) % SPEECH_CYCLE.length],
        });
      }
    }
  }
  return out;
}

export interface MouthScheduleInput {
  narration: string;
  /** W4 word anchors when the captions lane answered; null → the estimator. */
  anchors?: WordAnchors | null;
  durationMs: number;
}

export interface MouthSchedule {
  segments: MouthSegment[];
  speaking: boolean;
}

/** The scene's mouth schedule — anchors first, estimator fallback, no
 *  narration → no speech (the honesty ladder). PURE. */
export function mouthSchedule(input: MouthScheduleInput): MouthSchedule {
  const { narration, anchors, durationMs } = input;
  if (!narration || narration.trim() === "" || !(durationMs > 0)) {
    return { segments: [], speaking: false };
  }
  const spans =
    wordSpansFromAnchors(narration, anchors ?? null, durationMs) ??
    wordSpansFromEstimate(narration, durationMs);
  const segments = mouthBeatsFromSpans(spans, durationMs);
  return { segments, speaking: segments.length > 0 };
}

// ---------------------------------------------------------------------------
// poseAt — the pure frame truth
// ---------------------------------------------------------------------------

function orderedRows(timeline: RigPoseTimeline): RigPoseRow[] {
  // The compiler emits ascending rows; an authored timeline re-sorts stably
  // here (sort is deterministic; the semantic stays "hold from tMs").
  return [...timeline.rows].sort((a, b) => a.tMs - b.tMs);
}

function poseById(sheet: readonly RigPose[], id: string | null): RigPose | null {
  if (!id) return null;
  return sheet.find((p) => p.id === id) ?? null; // unknown ids resolve to rest
}

/** The absolute frame state at tMs. Deterministic; no defensive branches —
 *  callers pass validated rigs (rig2d) and compiled timelines. */
export function poseAt(
  rig: CharacterRigDoc,
  timeline: RigPoseTimeline,
  tMs: number,
  speech?: MouthSchedule
): RigFrameState {
  const rows = orderedRows(timeline);

  // The pose state: the last row at/before tMs, tweening from the previous
  // row's pose (or rest) over POSE_TWEEN_MS, then holding.
  let rowIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].tMs <= tMs) rowIndex = i;
    else break;
  }
  const row = rowIndex >= 0 ? rows[rowIndex] : null;
  const prevRow = rowIndex > 0 ? rows[rowIndex - 1] : null;
  const prevPose = poseById(rig.poses, prevRow ? prevRow.poseId : null);
  const targetPose = poseById(rig.poses, row ? row.poseId : null);
  const ease: EaseName = row?.ease && isEaseName(row.ease) ? row.ease : "ease-in-out";
  const u =
    row && tMs < row.tMs + POSE_TWEEN_MS
      ? evalEase(ease, Math.max(0, Math.min(1, (tMs - row.tMs) / POSE_TWEEN_MS)))
      : 1;

  // FK composition — parents BEFORE children (the validator guarantees a
  // forest, not an ordering; depth-bucketing makes the walk topological).
  const depthOf = new Map<string, number>();
  const depth = (p: RigPart, seen: Set<string>): number => {
    const known = depthOf.get(p.id);
    if (known !== undefined) return known;
    if (!p.parent || seen.has(p.id)) return 0;
    seen.add(p.id);
    const up = rig.parts.find((q) => q.id === p.parent);
    const d = up ? depth(up, seen) + 1 : 0;
    depthOf.set(p.id, d);
    return d;
  };
  for (const p of rig.parts) depth(p, new Set());
  const topological = [...rig.parts].sort(
    (a, b) => (depthOf.get(a.id) ?? 0) - (depthOf.get(b.id) ?? 0)
  );
  const absolute = new Map<string, Matrix6>();
  for (const part of topological) {
    const parentAbs = part.parent ? (absolute.get(part.parent) ?? IDENTITY) : IDENTITY;
    const target = jointOf(targetPose, part.id);
    const prev = jointOf(prevPose, part.id);
    const j = lerpJoint(prev, target, u);
    const local = localMatrix(j, part.pivot);
    absolute.set(part.id, compose(parentAbs, local));
  }
  const frames: RigPartFrame[] = rig.parts.map((part) => ({
    id: part.id,
    visible: true,
    opacity: 1,
    matrix: absolute.get(part.id) ?? IDENTITY,
  }));

  // The mouth: gesture override first (a row's window runs to the next row),
  // then the speech schedule, then closed.
  let override: { variant: RigMouthSlot; untilMs: number } | null = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.mouth && r.tMs <= tMs) {
      const next = rows[i + 1];
      override = { variant: r.mouth, untilMs: next ? next.tMs : timeline.durationMs };
    }
  }
  let variant: RigMouthSlot = "closed";
  let speaking = false;
  if (override && tMs < override.untilMs && isMouthSlot(override.variant)) {
    variant = override.variant;
    speaking = variant !== "closed";
  } else if (speech) {
    for (const seg of speech.segments) {
      if (tMs >= seg.startMs && tMs < seg.endMs) {
        variant = seg.variant;
        speaking = true;
        break;
      }
    }
  }
  const hasMouth = rig.parts.some((p) => p.slot === "mouth" && p.variant === variant);
  if (!hasMouth && variant !== "closed") {
    variant = "closed";
    speaking = false;
  }

  // Draw order (z asc, id tiebreak) + mouth visibility (the art swap).
  const ordered = [...rig.parts]
    .map((p, i) => ({ part: p, frame: frames[i] }))
    .sort((a, b) => a.part.z - b.part.z || (a.part.id < b.part.id ? -1 : a.part.id > b.part.id ? 1 : 0))
    .map(({ part, frame }) => ({
      id: part.id,
      visible: part.slot === "mouth" ? part.variant === variant : true,
      opacity: frame.opacity,
      matrix: frame.matrix,
    }));

  return { parts: ordered, mouthVariant: variant, speaking };
}

/** The rest/poster state — the frame the editor composes at rest (the
 *  placedGraphicsFrame twin: edit-mode preview == poster). Mouth closed
 *  (no speech, no gesture). */
export function restRigFrame(rig: CharacterRigDoc): RigFrameState {
  return poseAt(rig, { durationMs: 0, rows: [] }, 0);
}

// ---------------------------------------------------------------------------
// The narration sentence split the planner shares with the whiteboard —
// re-exported here so rig-director imports ONE segmenter (one tokenizer, one
// segmenter, three consumers: beat-plan, llm-planner, rig-director).
// ---------------------------------------------------------------------------

export { splitSentences, words };

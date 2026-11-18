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
// S166 — THE MOUTH CLASSES (the six-engine audit Part 2.5: OT names ten
// lip-sync classes; ours was missing "mbp" (bilabial closure) and "rest" —
// the two cheapest accuracy wins) and THE POSE SCHEMA V-NEXT (the OT
// polar-delta pose model + per-part rigidity, additive optional fields):
//   The syllable→class map: a syllable whose ONSET letter is a bilabial
//   (m/b/p — letters, not sounds: the honest beat-sync approximation) rides
//   the closure class "mbp" — a lips-pressed window where the vowel beats
//   open; pauses (inter-word gaps ≥ MOUTH_REST_MIN_MS, plus leading and
//   trailing silence) ride the rest class — a PAUSE, never speech. The
//   vowel cycle keeps the S125 parity law, so non-bilabial words beat
//   BYTE-IDENTICALLY (the estimator's spans tile the clock, so its schedules
//   are untouched too — rests only exist where an anchor clock leaves gaps).
//   A rig without the new art degrades to closed (the honest ladder; the
//   closure beat's speech-ness survives the art fallback).
//   The v-next FK: a joint state may carry `polar` (ANGLE Δ/DISTANCE Δ off
//   the part's pivot — OT plasticskeletondeformation) and `rigid` (the pose
//   never scales the part and inherited pose scale is stripped — sub-
//   drawings stay rigid). Absent fields ⇒ byte-identical legacy FK (the
//   additive-absent law, pinned against the S125 goldens).
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

/** The pause floor (S166): an inter-word gap at least this long is a PAUSE
 *  and rides the rest class; shorter gaps are articulation and stay closed.
 *  Named + pinned — the one table, no magic numbers elsewhere. */
export const MOUTH_REST_MIN_MS = 120;

/** The S166 mouth classes — the syllable→class map's domain (the audit's
 *  staging: "SPEECH_CYCLE gains mbp + rest classes"). The S125 vowel cycle
 *  rides MOUTH_VOWEL_CYCLE (indices 0..2 — the parity law, byte-stable
 *  beats); the closure class overrides a bilabial syllable's window; rest
 *  owns pauses (never a beat — silence is not speech). Exported for pins. */
export const MOUTH_VOWEL_CYCLE: readonly RigMouthSlot[] = ["open", "wide", "oh"];
export const MOUTH_CLOSURE_CLASS: RigMouthSlot = "mbp";
export const MOUTH_REST_CLASS: RigMouthSlot = "rest";
export const SPEECH_CYCLE: readonly RigMouthSlot[] = [
  ...MOUTH_VOWEL_CYCLE,
  MOUTH_CLOSURE_CLASS,
  MOUTH_REST_CLASS,
];

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
 *  window (until the next row).
 *
 *  K1-ext — `joints` (inline): an AUTHORED mocap row carries its own joint
 *  state directly (the BVH adapter's output — authored DATA, senior to the
 *  compiled gesture beats in the ladder). A row with joints overrides the
 *  poseId channel; tweening lerps the inline states like sheet poses. */
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
  /** K1-ext — inline authored joints (mocap rows); they override poseId. */
  joints?: Record<string, RigJointState>;
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
function localMatrix(
  j: { rotateDeg: number; x: number; y: number; scale: number },
  pivot: { x: number; y: number }
): Matrix6 {
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

// ---------------------------------------------------------------------------
// S166 v-next — the resolved-delta FK (the polar + rigid adoption)
// ---------------------------------------------------------------------------

/** One joint's delta RESOLVED to FK-ready numbers: the polar fields (when
 *  authored) derived to (x, y), rigidity normalized. Same inputs,
 *  byte-identical outputs — a legacy joint (no polar/rigid) resolves to
 *  exactly the S125 numbers (the additive-absent law). */
interface ResolvedJoint {
  rotateDeg: number;
  x: number;
  y: number;
  scale: number;
  /** The authored polar keys (null when the delta is cartesian) — the
   *  tween's representation switch: two polar keys blend on the arc. */
  polar: { angleDeg: number; distance: number } | null;
  rigid: boolean;
}

const REST_RESOLVED: ResolvedJoint = { rotateDeg: 0, x: 0, y: 0, scale: 1, polar: null, rigid: false };

function resolveJoint(j: RigJointState | undefined): ResolvedJoint {
  // A keyless/undefined joint IS rest (the jointOf law, unchanged).
  if (!j || typeof j.rotateDeg !== "number") return { ...REST_RESOLVED };
  const polar = j.polar ? { angleDeg: j.polar.angleDeg, distance: j.polar.distance } : null;
  const r = polar ? (polar.angleDeg * Math.PI) / 180 : 0;
  return {
    rotateDeg: j.rotateDeg,
    x: polar ? polar.distance * Math.cos(r) : (j.x ?? 0),
    y: polar ? polar.distance * Math.sin(r) : (j.y ?? 0),
    scale: j.scale ?? 1,
    polar,
    rigid: j.rigid === true,
  };
}

/** The v-next tween: when BOTH segment keys ride polar, angle+distance tween
 *  as scalars and the position derives at each u — the part sweeps the ARC
 *  (the OT "keys blend trivially"; the midpoint sits at the half-angle, off
 *  the straight chord). Any cartesian key falls back to the legacy chord
 *  lerp of the derived (x, y) — the additive law. A RIGID destination keeps
 *  its scale contribution inert (1): the blend returns the part to authored
 *  size and the pose holds it there. The destination owns the segment (the
 *  easing-ownership law), so `rigid` reads the target side. */
function lerpResolved(a: ResolvedJoint, b: ResolvedJoint, u: number): ResolvedJoint {
  const rotateDeg = a.rotateDeg + (b.rotateDeg - a.rotateDeg) * u;
  const scale = a.scale + ((b.rigid ? 1 : b.scale) - a.scale) * u;
  if (a.polar && b.polar) {
    const angleDeg = a.polar.angleDeg + (b.polar.angleDeg - a.polar.angleDeg) * u;
    const distance = a.polar.distance + (b.polar.distance - a.polar.distance) * u;
    const r = (angleDeg * Math.PI) / 180;
    return {
      rotateDeg,
      x: distance * Math.cos(r),
      y: distance * Math.sin(r),
      scale,
      polar: { angleDeg, distance },
      rigid: b.rigid,
    };
  }
  return {
    rotateDeg,
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    scale,
    polar: null,
    rigid: b.rigid,
  };
}

/** Strip the uniform scale from an inherited affine frame (rotation +
 *  translation kept) — a rigid part's chain reads authored size. Our pose
 *  scales are ONE uniform multiplier (the joint bands), so s = √(a²+b²)
 *  recovers it; scale 0 cannot arise (bands floor at 0.2, rest = identity).
 *  Runs ONLY on rigid segments — the legacy FK bytes never pass through. */
function stripScale(m: Matrix6): Matrix6 {
  const s = Math.sqrt(m[0] * m[0] + m[1] * m[1]);
  if (s === 0) return m;
  return [m[0] / s, m[1] / s, m[2] / s, m[3] / s, m[4], m[5]];
}

/**
 * S136 — the mocap binding bridge. Authored rows arrive with joints keyed
 * by rig SLOT (the converter's vocabulary); parts are addressed by PART ID.
 * Expand slot keys onto the ids of the parts that carry that slot, so the
 * capture reaches the parts it names. Rules, in order:
 *   1. a part-id key is SENIOR — an explicit `joints[part.id]` is never
 *      overwritten by its slot twin;
 *   2. the slot twin binds only through a part that actually carries that
 *      slot (unknown slot keys stay inert — they bind nothing);
 *   3. the original keys survive (a rig whose ids EQUAL its slots — every
 *      pre-S136 fixture — behaves byte-identically).
 * Pure; deterministic; runs only on rows that carry inline joints.
 */
function jointsReachableByParts(
  rig: CharacterRigDoc,
  rowJoints: Record<string, RigJointState>
): Record<string, RigJointState> {
  const bridged: Record<string, RigJointState> = { ...rowJoints };
  for (const part of rig.parts) {
    const fromSlot = rowJoints[part.slot];
    if (fromSlot && bridged[part.id] === undefined) bridged[part.id] = fromSlot;
  }
  return bridged;
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
// S166 — the syllable chunker (the syllable→class map's unit)
// ---------------------------------------------------------------------------

/** The syllable chunks of a word: each vowel group owns the consonants
 *  since the previous group's end (its ONSET — the onset-maximization the
 *  beat estimator already leans on); trailing consonants ride the last
 *  chunk as a coda (never an onset). chunks.length ≡ countSyllables(word)
 *  ALWAYS — the same vowel-group law, the same silent-trailing-e, the same
 *  1..5 clamp (a capped word's last chunk absorbs the overflow letters) —
 *  so the beat slots and the classes stay in lockstep. PURE. */
export function syllableChunks(raw: string): string[] {
  const w = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return [""];
  const groups = [...w.matchAll(/[aeiouy]+/g)];
  if (groups.length === 0) return [w];
  let n = groups.length;
  if (w.length > 2 && w.endsWith("e") && n > 1) n -= 1; // the silent trailing e
  if (n > 5) n = 5; // the countSyllables clamp
  const groupEnd = (i: number) => (groups[i].index as number) + groups[i][0].length;
  const chunks: string[] = [];
  for (let i = 0; i < n; i++) {
    const prevEnd = i > 0 ? groupEnd(i - 1) : 0;
    // The last kept chunk spans to the word's end (it owns its coda — and,
    // when the count was clamped, the dropped groups' letters too).
    chunks.push(w.slice(prevEnd, i === n - 1 ? w.length : groupEnd(i)));
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// The mouth schedule
// ---------------------------------------------------------------------------

/** One mouth segment — a variant window. Between segments the mouth is
 *  closed. Segments are non-overlapping, time-ascending, clock-clamped.
 *  S166 — `speaking` is the segment's own speech-ness: rest windows are a
 *  PAUSE (speaking false); absent ⇒ speech (every legacy segment beats). */
export interface MouthSegment {
  startMs: number;
  endMs: number;
  variant: RigMouthSlot;
  speaking?: boolean;
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

/** The bilabial onset test — the syllable→class map's closure rule. A
 *  syllable whose first ONSET LETTER is m, b or p rides the closure class
 *  (the lips-pressed window). Letters, not sounds: the honest beat-sync
 *  approximation — "ph" misrides (it sounds /f/), the doc says so. */
function isBilabialOnset(chunk: string): boolean {
  const c = chunk[0];
  return c === "m" || c === "b" || c === "p";
}

/** The open/close beat compiler: per word span, `countSyllables` slots; each
 *  slot opens for its OPEN_RATIO slice (≥ MOUTH_MIN_OPEN_MS when the span
 *  can hold it), the remainder closes. Every open beat sits STRICTLY INSIDE
 *  its span (the W4 tolerance pin — beats never bleed across word bounds).
 *  S166 — the syllable→class map names each slot's variant: a bilabial
 *  onset rides the closure class (MOUTH_CLOSURE_CLASS); every other
 *  syllable keeps the S125 (word, syllable) parity over the vowel cycle —
 *  non-bilabial words beat BYTE-IDENTICALLY to the S125 schedule. */
export function mouthBeatsFromSpans(spans: WordSpan[], durationMs: number): MouthSegment[] {
  const out: MouthSegment[] = [];
  const clampMs = (v: number) => Math.max(0, Math.min(durationMs, v));
  for (let wi = 0; wi < spans.length; wi++) {
    const span = spans[wi];
    const start = clampMs(span.startMs);
    const end = clampMs(span.endMs);
    if (!(end > start)) continue;
    const syllables = countSyllables(span.word);
    const chunks = syllableChunks(span.word); // same count — the shared vowel-group law
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
          variant: isBilabialOnset(chunks[s] ?? "")
            ? MOUTH_CLOSURE_CLASS
            : MOUTH_VOWEL_CYCLE[(wi + s) % MOUTH_VOWEL_CYCLE.length],
        });
      }
    }
  }
  return out;
}

/** The rest half of the S166 mapping — "rest on pauses": the gaps BETWEEN
 *  word spans (plus leading/trailing silence) that clear MOUTH_REST_MIN_MS
 *  ride the rest class; intra-word beat gaps stay closed (the mouth is
 *  still shaping speech there). Rest is a PAUSE, never speech: the segments
 *  carry speaking false. PURE. */
export function restSegmentsFromSpans(spans: WordSpan[], durationMs: number): MouthSegment[] {
  if (spans.length === 0 || !(durationMs > 0)) return [];
  const clampMs = (v: number) => Math.max(0, Math.min(durationMs, v));
  const clamped = spans
    .map((s) => ({ word: s.word, startMs: clampMs(s.startMs), endMs: clampMs(s.endMs) }))
    .filter((s) => s.endMs > s.startMs);
  const out: MouthSegment[] = [];
  const push = (startMs: number, endMs: number) => {
    if (endMs - startMs >= MOUTH_REST_MIN_MS) {
      out.push({ startMs, endMs, variant: MOUTH_REST_CLASS, speaking: false });
    }
  };
  if (clamped.length === 0) return out;
  push(0, clamped[0].startMs);
  for (let i = 1; i < clamped.length; i++) push(clamped[i - 1].endMs, clamped[i].startMs);
  push(clamped[clamped.length - 1].endMs, durationMs);
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
 *  narration → no speech (the honesty ladder). S166: the beats gain the
 *  closure class, and the anchor clock's pauses ride rest segments (the
 *  estimator's spans TILE the clock — no gaps ≥ the floor — so its
 *  schedules stay byte-identical to the S125 shape). PURE. */
export function mouthSchedule(input: MouthScheduleInput): MouthSchedule {
  const { narration, anchors, durationMs } = input;
  if (!narration || narration.trim() === "" || !(durationMs > 0)) {
    return { segments: [], speaking: false };
  }
  const spans =
    wordSpansFromAnchors(narration, anchors ?? null, durationMs) ??
    wordSpansFromEstimate(narration, durationMs);
  const beats = mouthBeatsFromSpans(spans, durationMs);
  const segments = [...beats, ...restSegmentsFromSpans(spans, durationMs)].sort(
    (a, b) => a.startMs - b.startMs || a.endMs - b.endMs
  );
  // speaking is the BEATS' truth — a schedule of only rest windows is not
  // speech (the rig will not fake speech).
  return { segments, speaking: beats.length > 0 };
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
  // K1-ext — inline authored joints override the pose channel (the mocap
  // ladder's seniority: authored DATA > compiled beats > sheet poses). A
  // synthetic pose carries the row's joints; pose resolution stays one call.
  //
  // S136 — THE MOCAP BINDING LAW: buildMocapTimeline writes inline joints
  // keyed by rig SLOT (BVH joints map through MOCAP_JOINT_MAP into the
  // closed slot vocabulary), but parts address their joints by PART ID
  // (rig2d's part.id is free-form kebab — the auto-rig keeps the art ids).
  // A slot-keyed row therefore reached jointOf(pose, part.id), missed, and
  // every bound part resolved to rest: an uploaded capture silently
  // outranked the compiled beats yet moved NOTHING — the silent statue
  // (reproduced 2026-11-15: id "upper-limb-left" slot "arm-l", row joint
  // "arm-l" 45° → impliedRotation 0.00). The bridge lives HERE, the one
  // seam every consumer shares (the render hook and the editor preview both
  // read poseAt): slot keys expand to the parts carrying them; part-id keys
  // stay senior (id-keyed authored data wins its own binding); unknown
  // keys stay inert (they bind nothing).
  const targetPose: RigPose | null = row?.joints
    ? { id: "__row__", name: "row", joints: jointsReachableByParts(rig, row.joints) }
    : poseById(rig.poses, row ? row.poseId : null);
  const prevPose: RigPose | null = prevRow?.joints
    ? { id: "__row__", name: "row", joints: jointsReachableByParts(rig, prevRow.joints) }
    : poseById(rig.poses, prevRow ? prevRow.poseId : null);
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
    // S166 v-next — the resolved-delta FK. resolveJoint derives polar to
    // cartesian and normalizes rigidity; lerpResolved keeps the legacy
    // chord math byte-identical when the fields are absent.
    const target = resolveJoint(targetPose?.joints[part.id]);
    const prev = resolveJoint(prevPose?.joints[part.id]);
    const j = lerpResolved(prev, target, u);
    // S166 v-next — per-part rigidity: the DESTINATION owns the segment, so
    // a rigid target strips the parent chain's pose scale for the whole
    // segment while its own scale contribution blends back to authored size.
    const parentFrame = target.rigid ? stripScale(parentAbs) : parentAbs;
    const local = localMatrix(j, part.pivot);
    absolute.set(part.id, compose(parentFrame, local));
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
    // S166 — rest is a PAUSE, never speech (the class carries its own truth).
    speaking = variant !== "closed" && variant !== MOUTH_REST_CLASS;
  } else if (speech) {
    for (const seg of speech.segments) {
      if (tMs >= seg.startMs && tMs < seg.endMs) {
        variant = seg.variant;
        // S166 — a segment carries its own speech-ness (rest windows ride
        // speaking false); absent ⇒ speech (every legacy segment beats).
        speaking = seg.speaking !== false;
        break;
      }
    }
  }
  const hasMouth = rig.parts.some((p) => p.slot === "mouth" && p.variant === variant);
  if (!hasMouth && variant !== "closed") {
    // S166 degradation: a rig without the new class's art renders closed —
    // but the closure beat's speech-ness SURVIVES the art fallback (pressed
    // lips are still speech); rest stays non-speech. Every other missing
    // variant keeps the S125 honest fallback (closed, not speaking).
    if (variant === MOUTH_CLOSURE_CLASS) {
      variant = "closed";
    } else {
      variant = "closed";
      speaking = false;
    }
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

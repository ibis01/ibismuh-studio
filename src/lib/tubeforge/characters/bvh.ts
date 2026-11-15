// S125-ext (K1-ext) — the FreeMoCap sidecar adapter: a clean-room BVH
// parser and a BVH→pose-timeline mapper (the roadmap's K1-i2v/K1-ext tail:
// "motion capture rides the VoiceStudio sidecar precedent").
//
// THE CLEAN-ROOM BOUNDARY (docs/audits/external-six-repo-reception.md §2.6):
// FreeMoCap is AGPL-3.0 — the boundary line is the PROCESS boundary: this
// module parses the DOCUMENTED BVH interchange format (a public spec text,
// re-derived from it, never from their source); our parser, their files,
// no linkage. No dependency, no source consultation, no code transcription.
//
// THE FORMAT (the public BVH spec, as re-derived): a text file with a
// HIERARCHY section (ROOT/JOINT/End Site blocks — name, OFFSET x y z,
// CHANNELS count + names) and a MOTION section (Frames: N, Frame Time: T,
// then one whitespace-separated float row per frame, each value in the
// channel order the hierarchy declared). Position channels are skipped by
// this adapter (the rig's joints are rotations and offsets in stage space);
// the FIRST rotation channel per joint is the mapped verb (v1 maps the
// primary-axis rotation — the honest explainer approximation; full
// Euler-order FK is the recorded follow-up).
//
// THE LADDER (the §6 law, extended): an AUTHORED mocap timeline (this
// adapter's output, stored per video) > the compiled gesture beats
// (rig-director) > the S93 breath > the auto KB plan. The render hook
// consumes the authored timeline when present; beats stay compile-only —
// mocap conversion is DATA (the user's own capture), not a compiled beat,
// so it may persist (the compile-only law governs BEATS, not authored art).
//
// PURE — no fs, no clock, no randomness. Same text → byte-identical
// timeline rows (pinned).
import type { RigPoseRow, RigPoseTimeline } from "./rig-frame";
import { RIG_BUDGETS, type RigJointState } from "./rig2d";

/** One parsed BVH joint — the hierarchy node + its motion channel slice. */
export interface BvhJoint {
  name: string;
  parent: string | null;
  /** The channel names in the file's order (positions + rotations). */
  channels: string[];
  /** The offset this joint's parent block declared (stage units). */
  offset: [number, number, number];
  /** The motion-frame column where this joint's channels begin. */
  columnStart: number;
}

export interface BvhDoc {
  joints: BvhJoint[];
  frames: number;
  frameTimeMs: number;
  /** The raw motion rows (one float array per frame, hierarchy column order). */
  motion: Float64Array[];
}

export interface BvhParseResult {
  doc: BvhDoc | null;
  errors: string[];
}

/** Parse BVH text (the public format). Tolerant of whitespace depth;
 *  strict about structure — a file the gates cannot trust refuses with
 *  named errors, never guesses. */
export function parseBvh(text: string): BvhParseResult {
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith("#"));
  if (lines.length === 0) return { doc: null, errors: ["empty BVH text"] };
  if (!/^HIERARCHY$/i.test(lines[0])) {
    return { doc: null, errors: ['a BVH starts with "HIERARCHY"'] };
  }
  const joints: BvhJoint[] = [];
  const stack: { name: string; channels: string[]; columnStart: number }[] = [];
  let column = 0;
  let i = 1;
  let sawRoot = false;
  let motionIndex = -1;
  // The hierarchy walk.
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (/^MOTION$/i.test(line)) {
      motionIndex = i + 1;
      break;
    }
    let m = /^ROOT\s+(\S+)$/i.exec(line) ?? /^JOINT\s+(\S+)$/i.exec(line);
    if (m) {
      const isRoot = /^ROOT/i.test(line);
      if (isRoot && sawRoot) {
        errors.push(`a second ROOT at "${m[1]}" — the hierarchy is a tree`);
        return { doc: null, errors };
      }
      if (isRoot) sawRoot = true;
      const parent = stack.length > 0 ? stack[stack.length - 1].name : null;
      stack.push({ name: m[1], channels: [], columnStart: column });
      joints.push({ name: m[1], parent, channels: [], offset: [0, 0, 0], columnStart: -1 });
      continue;
    }
    if (/^End\s+Site$/i.test(line)) {
      // A leaf marker: consumes the following OFFSET block, contributes no
      // channels (the spec's law).
      stack.push({ name: "__end__", channels: [], columnStart: column });
      continue;
    }
    m = /^OFFSET\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)$/i.exec(line);
    if (m) {
      const top = stack[stack.length - 1];
      if (!top) {
        errors.push("OFFSET outside a joint block");
        return { doc: null, errors };
      }
      const joint = joints.find((j) => j.name === top.name && j.columnStart === -1);
      if (joint) joint.offset = [Number(m[1]), Number(m[2]), Number(m[3])];
      continue;
    }
    m = /^CHANNELS\s+(\d+)((?:\s+\S+)*?)\s*$/i.exec(line);
    if (m) {
      const top = stack[stack.length - 1];
      if (!top) {
        errors.push("CHANNELS outside a joint block");
        return { doc: null, errors };
      }
      const count = Number(m[1]);
      const names = m[2].trim().length > 0 ? m[2].trim().split(/\s+/) : [];
      if (names.length !== count) {
        errors.push(`CHANNELS declares ${count} names but carries ${names.length}`);
        return { doc: null, errors };
      }
      top.channels = names;
      top.columnStart = column;
      column += count;
      const joint = joints.find((j) => j.name === top.name && j.columnStart === -1);
      if (joint) {
        joint.channels = names;
        joint.columnStart = top.columnStart;
      }
      continue;
    }
    if (/^\{$/.test(line) || /^\}$/.test(line)) {
      if (/^\}$/.test(line)) {
        const top = stack.pop();
        if (!top) {
          errors.push("an unbalanced closing brace");
          return { doc: null, errors };
        }
      }
      continue;
    }
    // An unknown hierarchy line is tolerated (vendor extensions) — the
    // gates judge structure by the blocks they NEED.
  }
  if (!sawRoot) {
    errors.push('no ROOT block — a BVH hierarchy starts with one');
    return { doc: null, errors };
  }
  if (motionIndex < 0) {
    errors.push('no MOTION section');
    return { doc: null, errors };
  }
  // The motion header.
  let frames = 0;
  let frameTimeMs = 0;
  let rowsStart = -1;
  for (let k = motionIndex; k < lines.length; k++) {
    let m = /^Frames:\s*(\d+)$/i.exec(lines[k]);
    if (m) {
      frames = Number(m[1]);
      continue;
    }
    m = /^Frame\s+Time:\s*([\d.]+)$/i.exec(lines[k]);
    if (m) {
      frameTimeMs = Number(m[2] ?? m[1]) * 1000;
      rowsStart = k + 1;
      break;
    }
  }
  if (frames <= 0 || rowsStart < 0 || !(frameTimeMs > 0)) {
    errors.push('the MOTION header needs "Frames: N" and "Frame Time: T"');
    return { doc: null, errors };
  }
  if (column === 0) {
    errors.push("no CHANNELS in the hierarchy — nothing to map");
    return { doc: null, errors };
  }
  // The motion rows.
  const motion: Float64Array[] = [];
  for (let k = rowsStart; k < lines.length && motion.length < frames; k++) {
    const parts = lines[k].split(/\s+/).map(Number);
    if (parts.some((v) => !Number.isFinite(v))) {
      errors.push(`motion row ${motion.length + 1} carries a non-numeric value`);
      return { doc: null, errors };
    }
    if (parts.length !== column) {
      errors.push(`motion row ${motion.length + 1} carries ${parts.length} values, the hierarchy declared ${column}`);
      return { doc: null, errors };
    }
    motion.push(Float64Array.from(parts));
  }
  if (motion.length !== frames) {
    errors.push(`the motion section carries ${motion.length} rows, the header declared ${frames}`);
    return { doc: null, errors };
  }
  return { doc: { joints, frames, frameTimeMs, motion }, errors };
}

/** The joint→rig-slot name table — the ONE mapping (FreeMoCap-style
 *  skeleton names are the common BVH naming; aliases resolve lowercase
 *  contains-match in priority order). Deterministic. */
const MOCAP_JOINT_MAP: ReadonlyArray<{ slot: string; names: RegExp }> = [
  { slot: "torso", names: /^(hips|pelvis|spine)$/i },
  { slot: "head", names: /^(head|neck)$/i },
  { slot: "arm-l", names: /^(leftarm|larm|leftupperarm)$/i },
  { slot: "arm-r", names: /^(rightarm|rarm|rightupperarm)$/i },
  { slot: "forearm-l", names: /^(leftforearm|lforearm)$/i },
  { slot: "forearm-r", names: /^(rightforearm|rforearm)$/i },
  { slot: "leg-l", names: /^(leftupleg|lupleg|leftthigh)$/i },
  { slot: "leg-r", names: /^(rightupleg|rupleg|rightthigh)$/i },
];

/** Map a BVH joint name to the rig slot — first table hit wins. */
export function mapJointToSlot(name: string): string | null {
  const compact = name.replace(/[\s_:.-]/g, "");
  for (const entry of MOCAP_JOINT_MAP) {
    if (entry.names.test(compact)) return entry.slot;
  }
  return null;
}

/** The joint's primary-axis rotation for one frame — the FIRST *rotation
 *  channel in its declared order (the v1 mapping; documented as the honest
 *  explainer approximation). */
function primaryRotation(joint: BvhJoint, row: Float64Array): number | null {
  for (let c = 0; c < joint.channels.length; c++) {
    if (/rotation$/i.test(joint.channels[c])) {
      const v = row[joint.columnStart + c];
      return Number.isFinite(v) ? v : null;
    }
  }
  return null;
}

export interface MocapTimelineInput {
  /** The PARSED BVH (parseBvh's doc — the route owns the fs half). */
  bvh: BvhDoc;
  /** The rig the slots map INTO (unmapped joints are skipped honestly). */
  rigSlots: Iterable<string>;
  /** The scene clock (ms) — rows clamp inside it. */
  durationMs: number;
  /** The playback rate the rows ride is the SCENE clock's own (the rows
   *  are ms-keyed — the fps field records the shared timebase for the
   *  caller's bookkeeping; the applier never sees it). */
  fps: 24 | 30;
}

/** Convert BVH motion to a RigPoseTimeline: rows carry INLINE joints (the
 *  authored-data law), sampled on a stride that keeps the compile wall —
 *  the row cadence is max(frameTime, durationMs/rows-target), ascending,
 *  clamped to the scene clock. Deterministic: same inputs → byte-identical
 *  rows. */
export function buildMocapTimeline(input: MocapTimelineInput): { timeline: RigPoseTimeline; mapped: string[]; skipped: string[] } {
  const { bvh, rigSlots, durationMs } = input;
  void input.fps; // recorded for the caller's bookkeeping (see the input doc)
  const slots = new Set(rigSlots);
  const mapped: string[] = [];
  const skipped: string[] = [];
  const jointForSlot = new Map<string, BvhJoint>();
  for (const joint of bvh.joints) {
    const slot = mapJointToSlot(joint.name);
    if (slot === null || !slots.has(slot)) {
      if (slot !== null && !slots.has(slot)) skipped.push(joint.name);
      continue;
    }
    if (!jointForSlot.has(slot)) {
      jointForSlot.set(slot, joint);
      mapped.push(slot);
    }
  }
  // The row cadence: one row per BVH frame would blow the compile wall on
  // real captures (240+ frames) — the stride targets ≤ the wall rows
  // across the scene clock, never coarser than the source frame time.
  const sourceRows = Math.max(1, Math.round(durationMs / Math.max(1, bvh.frameTimeMs)));
  const stride = Math.max(1, Math.ceil(sourceRows / RIG_BUDGETS.timelineRows));
  const stepMs = Math.max(bvh.frameTimeMs * stride, (durationMs / RIG_BUDGETS.timelineRows));
  const rows: RigPoseRow[] = [];
  for (let tMs = 0; tMs < durationMs && rows.length < RIG_BUDGETS.timelineRows; tMs += stepMs) {
    const frameIndex = Math.min(bvh.frames - 1, Math.floor(tMs / Math.max(1, bvh.frameTimeMs)));
    const row = bvh.motion[frameIndex];
    if (!row) break;
    const joints: Record<string, RigJointState> = {};
    for (const [slot, joint] of jointForSlot) {
      const deg = primaryRotation(joint, row);
      if (deg === null) continue;
      // The band clamp (the never-NaN floor's input side): the BVH's
      // degrees clamp into the grammar's ±360 band.
      const clamped = Math.max(-360, Math.min(360, deg));
      joints[slot] = { rotateDeg: Math.round(clamped * 100) / 100 };
    }
    if (Object.keys(joints).length === 0) break; // nothing maps — honest empty
    rows.push({ tMs: Math.round(tMs), poseId: null, joints });
  }
  return { timeline: { durationMs, rows }, mapped, skipped };
}

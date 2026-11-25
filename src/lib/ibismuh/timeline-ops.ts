// timeline-ops.ts — THE SHARED TIMELINE OPERATION CONTRACT (master plan §4.4).
//
// All six lanes compile their lane-specific plans into ONE typed timeline.
// The render engines stay different underneath — what unifies is the
// operation vocabulary, the stable ids, the timing windows, the source
// beat linkage, and the asset references. Preview and final rendering
// consume the SAME compiled timeline; only quality and resolution differ.
//
// THE LAW: every op carries a stable id, a closed operation id, a sane
// [startMs, endMs] window, and (when it acts on one) a declared asset or
// scene reference. Ops are ordered by start time; ids are unique across
// the document. Run: npm run test:timeline-ops   (pure — CI step)

import { canonicalStringify, sha256Hex } from "./canonical";

export const TIMELINE_OPS_VERSION = 1;

export type TimelineOpId =
  | "showAsset"
  | "hideAsset"
  | "drawPath"
  | "writeText"
  | "fillRegion"
  | "cameraMove"
  | "poseCharacter"
  | "revealSlide"
  | "hold"
  | "transition"
  | "caption"
  | "sfxCue";

export const TIMELINE_OP_IDS: readonly TimelineOpId[] = [
  "showAsset",
  "hideAsset",
  "drawPath",
  "writeText",
  "fillRegion",
  "cameraMove",
  "poseCharacter",
  "revealSlide",
  "hold",
  "transition",
  "caption",
  "sfxCue",
];

export function isTimelineOpId(v: string): v is TimelineOpId {
  return (TIMELINE_OP_IDS as readonly string[]).includes(v);
}

export interface TimelineOp {
  /** Stable op id (unique across the timeline document). */
  id: string;
  op: TimelineOpId;
  startMs: number;
  endMs: number;
  /** The beat that scheduled this op (narration linkage). */
  beatId?: string;
  /** The scene/slide/beat this op belongs to (lane-scoped ref). */
  sceneRef?: string;
  /** The asset this op acts on (manifest linkage). */
  assetRef?: string;
  /** Semantic role (e.g. "headline", "statistic", "hand"). */
  role?: string;
  /** Lane-specific parameters (validated by the lane's compiler). */
  params?: Record<string, string | number | boolean>;
}

export interface TimelineDoc {
  version: number;
  /** The plan envelope this timeline belongs to (fingerprint linkage). */
  planRef?: string;
  ops: TimelineOp[];
}

// ---------- compilation ----------

export interface TimelineOpInput extends Omit<TimelineOp, "id"> {
  /** Explicit id, or a deterministic id derived from the op + window. */
  id?: string;
}

/**
 * Compile a timeline document from op inputs. Fail-closed: unknown op ids,
 * inverted windows, negative times, duplicate op ids, or unordered starts
 * are all rejected — a timeline that reads backwards or double-books an id
 * is a compiler bug, not a document.
 */
export function compileTimeline(planRef: string | undefined, inputs: TimelineOpInput[]): TimelineDoc {
  const ops: TimelineOp[] = inputs.map((input, i) => {
    if (!isTimelineOpId(input.op)) {
      throw new Error(`timeline: op #${i} carries unknown operation "${String(input.op)}"`);
    }
    for (const [field, v] of Object.entries({ startMs: input.startMs, endMs: input.endMs })) {
      if (!Number.isFinite(v) || (v as number) < 0) {
        throw new Error(`timeline: op #${i} (${input.op}) has a non-finite or negative ${field}`);
      }
    }
    if (input.endMs < input.startMs) {
      throw new Error(`timeline: op #${i} (${input.op}) ends at ${input.endMs}ms before it starts at ${input.startMs}ms`);
    }
    if (input.params !== undefined) {
      for (const [k, v] of Object.entries(input.params)) {
        const t = typeof v;
        if (t !== "string" && t !== "number" && t !== "boolean") {
          throw new Error(`timeline: op #${i} (${input.op}) param "${k}" must be string|number|boolean`);
        }
        if (t === "number" && !Number.isFinite(v as number)) {
          throw new Error(`timeline: op #${i} (${input.op}) param "${k}" is non-finite`);
        }
      }
    }
    return {
      id: input.id ?? `${input.op}:${input.startMs}`,
      op: input.op,
      startMs: input.startMs,
      endMs: input.endMs,
      beatId: input.beatId,
      sceneRef: input.sceneRef,
      assetRef: input.assetRef,
      role: input.role,
      params: input.params,
    };
  });

  const seen = new Set<string>();
  for (const op of ops) {
    if (seen.has(op.id)) {
      throw new Error(`timeline: duplicate op id "${op.id}" — op ids are unique across the document`);
    }
    seen.add(op.id);
  }
  for (let i = 1; i < ops.length; i++) {
    if (ops[i].startMs < ops[i - 1].startMs) {
      throw new Error(
        `timeline: op #${i} (${ops[i].id}) starts at ${ops[i].startMs}ms before op #${i - 1} (${ops[i - 1].id}) at ${ops[i - 1].startMs}ms — ops must be ordered by start`,
      );
    }
  }

  return { version: TIMELINE_OPS_VERSION, planRef, ops };
}

// ---------- serialization + parsing ----------

export function serializeTimeline(doc: TimelineDoc): string {
  return canonicalStringify(doc);
}

export function timelineHash(doc: TimelineDoc): string {
  return sha256Hex(serializeTimeline(doc));
}

function fail(msg: string): never {
  throw new Error(`timeline parse: ${msg}`);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Strict shape validation for a parsed timeline (version-first, fail-closed). */
export function validateTimelineShape(parsed: unknown): TimelineDoc {
  if (typeof parsed !== "object" || parsed === null) fail("document is not an object");
  const d = parsed as Record<string, unknown>;
  if (d.version !== TIMELINE_OPS_VERSION) {
    fail(`unsupported version ${String(d.version)} (this parser speaks version ${TIMELINE_OPS_VERSION})`);
  }
  if (!Array.isArray(d.ops)) fail("ops must be an array");
  const ids = new Set<string>();
  let prevStart = -1;
  for (const raw of d.ops as unknown[]) {
    if (typeof raw !== "object" || raw === null) fail("op must be an object");
    const o = raw as Record<string, unknown>;
    if (typeof o.id !== "string" || o.id.length === 0) fail("op.id must be a non-empty string");
    if (ids.has(o.id)) fail(`duplicate op id "${o.id}"`);
    ids.add(o.id);
    if (!isTimelineOpId(String(o.op))) fail(`op "${o.id}" carries unknown operation "${String(o.op)}"`);
    for (const field of ["startMs", "endMs"] as const) {
      if (!isFiniteNumber(o[field]) || (o[field] as number) < 0) fail(`op "${o.id}".${field} must be a finite non-negative number`);
    }
    if ((o.endMs as number) < (o.startMs as number)) fail(`op "${o.id}" ends before it starts`);
    if ((o.startMs as number) < prevStart) fail(`op "${o.id}" breaks the start-time ordering`);
    prevStart = o.startMs as number;
    if (o.params !== undefined) {
      if (typeof o.params !== "object" || o.params === null) fail(`op "${o.id}".params must be an object when present`);
      for (const v of Object.values(o.params as Record<string, unknown>)) {
        const t = typeof v;
        if (t !== "string" && t !== "number" && t !== "boolean") {
          fail(`op "${o.id}".params values must be string|number|boolean`);
        }
        if (t === "number" && !isFiniteNumber(v)) fail(`op "${o.id}".params carries a non-finite number`);
      }
    }
  }
  return parsed as unknown as TimelineDoc;
}

/** Parse + validate a stored timeline. Fail-closed on anything malformed. */
export function parseTimeline(text: string): TimelineDoc {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail("document is not valid JSON");
  }
  return validateTimelineShape(parsed);
}

// stage-cache.ts — THE STAGE FINGERPRINT CONTRACT (master plan §4.6).
//
// Ten independently cacheable stages. Each cache key DECLARES its inputs —
// a camera-only edit must not regenerate an image; a caption-only edit
// must not retrace a whiteboard asset. The fingerprint of a stage is
// sha256 over the canonical serialization of { stage, lane, inputs } —
// same inputs, same fingerprint, cache hit; any input byte differs, miss.
//
// THE LAW: every stage declares its input vocabulary (closed), every
// fingerprint computation names the stage it belongs to, and consumers
// never concatenate strings into an ad-hoc key.

import { canonicalStringify, sha256Hex } from "./canonical";
import { resolveLane, type VideoType } from "./studio-lanes";

/** The ten declared stages (master plan §4.6), in execution order. */
export const STAGE_ORDER = [
  "brief-validate",
  "content-plan",
  "asset-generate",
  "asset-normalize",
  "audio-measure",
  "lane-timeline",
  "scene-render",
  "audio-mix",
  "final-compose",
  "qc-report",
] as const;

export type StageId = (typeof STAGE_ORDER)[number];

export function isStageId(v: string): v is StageId {
  return (STAGE_ORDER as readonly string[]).includes(v);
}

/** The closed per-stage input vocabulary — what may legally feed a stage key. */
export const STAGE_INPUT_KEYS = [
  "briefHash",
  "planFingerprint",
  "assetHashes",
  "audioReceiptHash",
  "sceneRefs",
  "sceneFingerprints",
  "geometry",
  "voiceId",
  "qcProfile",
  "rendererVersion",
  "repairScope",
] as const;

export type StageInputKey = (typeof STAGE_INPUT_KEYS)[number];

export type StageInputs = Partial<Record<StageInputKey, string>>;

export interface StageFingerprint {
  stage: StageId;
  fingerprint: string;
  inputs: StageInputs;
}

/**
 * Compute a stage fingerprint: sha256 over the canonical serialization of
 * { stage, lane, inputs }. Deterministic, tamper-evident, and declared —
 * the stage id is INSIDE the hash so two stages can never collide.
 */
export function computeStageFingerprint(stage: StageId, lane: VideoType, inputs: StageInputs): StageFingerprint {
  if (!isStageId(stage)) throw new Error(`stage-cache: unknown stage "${stage}"`);
  const laneResolved = resolveLane(lane);
  for (const key of Object.keys(inputs)) {
    if (!(STAGE_INPUT_KEYS as readonly string[]).includes(key)) {
      throw new Error(`stage-cache: stage "${stage}" carries undeclared input "${key}"`);
    }
    const v = inputs[key as StageInputKey];
    if (v !== undefined && (typeof v !== "string" || v.length === 0)) {
      throw new Error(`stage-cache: stage "${stage}" input "${key}" must be a non-empty string when present`);
    }
  }
  const cleanInputs: StageInputs = {};
  for (const key of STAGE_INPUT_KEYS) {
    if (inputs[key] !== undefined) cleanInputs[key] = inputs[key];
  }
  const fingerprint = sha256Hex(canonicalStringify({ stage, lane: laneResolved.type, inputs: cleanInputs }));
  return { stage, fingerprint, inputs: cleanInputs };
}

// ---------- the stage dependency law (which stage invalidates which) ----------

/**
 * Declared dependency edges: when a stage's fingerprint changes, these
 * stages MUST be re-evaluated. Repair scoping reads this — a caption-only
 * change (planFingerprint) invalidates lane-timeline/scene-render/final
 * but NOT asset-generate (asset hashes unchanged) and NOT audio-measure.
 */
export const STAGE_DEPENDENCIES: Record<StageId, readonly StageId[]> = {
  "brief-validate": ["content-plan", "asset-generate", "asset-normalize", "audio-measure", "lane-timeline", "scene-render", "audio-mix", "final-compose", "qc-report"],
  "content-plan": ["asset-generate", "lane-timeline", "scene-render", "audio-mix", "final-compose", "qc-report"],
  "asset-generate": ["asset-normalize", "scene-render", "final-compose"],
  "asset-normalize": ["scene-render", "final-compose"],
  "audio-measure": ["lane-timeline", "scene-render", "audio-mix", "final-compose"],
  "lane-timeline": ["scene-render", "audio-mix", "final-compose", "qc-report"],
  "scene-render": ["audio-mix", "final-compose", "qc-report"],
  "audio-mix": ["final-compose"],
  "final-compose": ["qc-report"],
  "qc-report": [],
};

/** Stages downstream of `changed` (including itself) — the invalidation set. */
export function invalidationSet(changed: StageId): StageId[] {
  const set = new Set<StageId>([changed]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const stage of STAGE_ORDER) {
      if (set.has(stage)) continue;
      if (STAGE_DEPENDENCIES[stage].some((dep) => set.has(dep))) {
        set.add(stage);
        grew = true;
      }
    }
  }
  return STAGE_ORDER.filter((s) => set.has(s));
}

/**
 * Which stages may be resumed from cache given the prior run's stage
 * fingerprints and the current fingerprints. A stage resumes ONLY when its
 * current fingerprint matches the cached one — a fingerprint mismatch
 * refuses resume (master plan Workstream B acceptance gate).
 */
export function resumePlan(
  prior: StageFingerprint[],
  current: StageFingerprint[],
): Array<{ stage: StageId; cacheHit: boolean; priorFingerprint?: string; fingerprint: string }> {
  const priorMap = new Map(prior.map((s) => [s.stage, s.fingerprint]));
  return current.map((s) => ({
    stage: s.stage,
    cacheHit: priorMap.get(s.stage) === s.fingerprint,
    priorFingerprint: priorMap.get(s.stage),
    fingerprint: s.fingerprint,
  }));
}

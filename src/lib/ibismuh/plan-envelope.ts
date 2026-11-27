// plan-envelope.ts — THE VERSIONED IMMUTABLE PLAN CONTRACT (master plan §4.2).
//
// Every generation request compiles into a validated plan BEFORE expensive
// provider work begins. Once rendering starts, the plan is immutable; a
// repair creates a NEW revision linked to its parent. The envelope binds:
// the lane (resolved through the canonical registry — never a local string),
// the brief hash, the aspect/fps/size geometry, the narration + measured
// audio receipt, the beats, the asset manifest with provenance, the shared
// timeline, the DECLARED fallback decision, the QC profile, and the
// renderer version — all under one sha256 fingerprint over the canonical
// serialization.
//
// THE LAWS:
//   * version-first parsing — unknown versions fail closed;
//   * lane truth — videoType must resolve through the registry, and the
//     envelope's renderMode, qcProfile, aspect, and fps must all seat in
//     what THAT lane declares (an envelope claiming an aspect or frame
//     rate the lane does not produce is invalid by construction);
//   * declared timing — word/sentence-timestamp narration requires a
//     riding audio receipt (spans must come from somewhere);
//   * provenance — every manifest entry carries tenant ownership, a
//     content hash, a license declaration, and a storage key;
//   * tamper-evidence — the fingerprint covers the ENTIRE document sans
//     fingerprint; any edited byte fails the parse.
//
// Run: npm run test:plan-envelope   (pure — CI step)

import { canonicalStringify, sha256Hex } from "./canonical";
import { currentLaneContractStamp, type LaneContractStamp } from "./lane-contracts";
import type { AudioReceipt } from "./audio-receipt";
import { isTimingSource } from "./audio-receipt";
import { resolveLane, type VideoType } from "./video-lanes";
import type { TimelineDoc } from "./timeline-ops";
import { isTimelineOpId } from "./timeline-ops";

export const PLAN_ENVELOPE_VERSION = 1;

export type PlanAspect = "16:9" | "9:16" | "1:1";

/** §4.5 — every asset in the manifest carries provenance and ownership. */
export interface AssetManifestEntry {
  assetId: string;
  sourceKind: "generated" | "uploaded" | "stock" | "builtin" | "reused";
  /** Provider or source reference where applicable. */
  sourceRef?: string;
  /** Ownership/license declaration — never empty. */
  license: string;
  /** sha256 of the asset content bytes. */
  contentHash: string;
  width?: number;
  height?: number;
  durationMs?: number;
  storageKey: string;
  /** Tenant/org ownership — cross-tenant references fail before rendering. */
  tenantId: string;
}

/** §4.2 — the narration plan states its declared timing source. */
export interface NarrationPlan {
  source: "manual" | "word-timestamps" | "sentence-timestamps" | "estimate";
  text?: string;
  /** Present when source === "estimate" — the declared deterministic fallback. */
  estimatedDurationMs?: number;
  voiceId?: string;
}

/** §4.2 — a beat: narration window + visual intent + lane-scoped ref. */
export interface PlanBeat {
  id: string;
  narrationWindow: { startMs: number; endMs: number };
  visualIntent: string;
  /** The scene/slide/beat id in the lane's own plan. */
  sceneRef?: string;
}

/** §4.2 — the fallback decision is DECLARED, never silent. */
export interface FallbackDecision {
  /** The mode the lane actually runs in (registry mode id or lane default). */
  mode: string;
  /** Explicitly true — a fallback that is not declared does not exist. */
  declared: true;
  reason: string;
  /** Per-scene degradation (e.g. character's per-scene Ken Burns fallback). */
  perScene?: Array<{ sceneRef: string; mode: string; reason: string }>;
}

export interface VideoPlanEnvelope {
  version: number;
  planId: string;
  revision: number;
  /** Repair linkage — a repair's revision points at the plan it amends. */
  parentRevision?: number;
  videoType: VideoType;
  format: "script" | "story";
  renderMode: string;
  /** sha256 of the validated brief the plan was compiled from. */
  briefHash: string;
  aspect: PlanAspect;
  width: number;
  height: number;
  fps: number;
  narration: NarrationPlan;
  audioReceipt?: AudioReceipt;
  beats: PlanBeat[];
  assets: AssetManifestEntry[];
  timeline: TimelineDoc;
  fallback: FallbackDecision;
  qcProfile: string;
  rendererVersion: string;
  createdFrom?: string;
  /** Phase 1.3 — the lane-contract surface this plan was compiled under
   *  (version + fingerprint from lane-contracts.ts). Plans compiled before
   *  the stamp existed carry no field and stay parseable (legacy, the
   *  fingerprint still verifies); a PRESENT stamp that disagrees with the
   *  live registry refuses the parse with a named recompile error — an
   *  incompatible plan is never silently rendered. */
  laneContract?: LaneContractStamp;
  /** sha256 over the canonical serialization sans fingerprint. */
  fingerprint: string;
}

// ---------- compilation ----------

export interface PlanEnvelopeCompileInput {
  planId: string;
  revision: number;
  parentRevision?: number;
  videoType: VideoType;
  briefHash: string;
  aspect: PlanAspect;
  width: number;
  height: number;
  fps: number;
  narration: NarrationPlan;
  audioReceipt?: AudioReceipt;
  beats: PlanBeat[];
  assets: AssetManifestEntry[];
  timeline: TimelineDoc;
  fallback: FallbackDecision;
  rendererVersion: string;
  createdFrom?: string;
}

/**
 * Compile + validate + fingerprint a plan envelope. The lane registry is
 * the source of truth: format, renderMode, qcProfile, supported aspects,
 * and supported fps all come from the resolved lane, and the envelope must
 * agree with every one of them.
 */
export function compilePlanEnvelope(input: PlanEnvelopeCompileInput): VideoPlanEnvelope {
  const lane = resolveLane(input.videoType);

  if (!/^[0-9a-f]{64}$/.test(input.briefHash)) {
    throw new Error(`plan-envelope: briefHash must be a 64-char sha256 hex string`);
  }
  if (!lane.supportedAspects.includes(input.aspect)) {
    throw new Error(
      `plan-envelope: lane "${lane.type}" does not support aspect "${input.aspect}" (declared: ${lane.supportedAspects.join(", ")})`,
    );
  }
  if (!lane.supportedFps.includes(input.fps)) {
    throw new Error(
      `plan-envelope: lane "${lane.type}" does not produce ${input.fps}fps (declared: ${lane.supportedFps.join(", ")})`,
    );
  }
  if (input.width <= 0 || input.height <= 0 || !Number.isInteger(input.width) || !Number.isInteger(input.height)) {
    throw new Error("plan-envelope: width/height must be positive integers");
  }
  if (!isTimingSource(input.narration.source)) {
    throw new Error(`plan-envelope: narration.source "${String(input.narration.source)}" is not a declared timing source`);
  }
  if (input.narration.source === "estimate" && !Number.isFinite(input.narration.estimatedDurationMs)) {
    throw new Error("plan-envelope: an estimate narration must carry its estimatedDurationMs (declared, never silent)");
  }
  if ((input.narration.source === "word-timestamps" || input.narration.source === "sentence-timestamps") && !input.audioReceipt) {
    throw new Error(
      `plan-envelope: narration.source "${input.narration.source}" requires a riding audio receipt — measured spans must come from somewhere`,
    );
  }
  if (!input.fallback.declared) {
    throw new Error("plan-envelope: fallback.declared must be true — a fallback that is not declared does not exist");
  }
  if (!input.fallback.mode || !input.fallback.reason) {
    throw new Error("plan-envelope: fallback requires a mode and a reason");
  }

  const beatIds = new Set<string>();
  for (const beat of input.beats) {
    if (!beat.id || beatIds.has(beat.id)) {
      throw new Error(`plan-envelope: beat id "${String(beat.id)}" is empty or duplicated`);
    }
    beatIds.add(beat.id);
    if (
      !Number.isFinite(beat.narrationWindow.startMs) ||
      !Number.isFinite(beat.narrationWindow.endMs) ||
      beat.narrationWindow.endMs < beat.narrationWindow.startMs ||
      beat.narrationWindow.startMs < 0
    ) {
      throw new Error(`plan-envelope: beat "${beat.id}" has an invalid narration window`);
    }
    if (typeof beat.visualIntent !== "string" || beat.visualIntent.length === 0) {
      throw new Error(`plan-envelope: beat "${beat.id}" must declare its visual intent`);
    }
  }

  for (const asset of input.assets) {
    if (!asset.assetId || !asset.storageKey || !asset.license || !asset.tenantId) {
      throw new Error(
        `plan-envelope: asset "${String(asset.assetId)}" must carry assetId, storageKey, license, and tenantId (provenance is mandatory)`,
      );
    }
    if (!/^[0-9a-f]{64}$/.test(asset.contentHash)) {
      throw new Error(`plan-envelope: asset "${asset.assetId}" contentHash must be a 64-char sha256 hex string`);
    }
    const kinds = ["generated", "uploaded", "stock", "builtin", "reused"];
    if (!kinds.includes(asset.sourceKind)) {
      throw new Error(`plan-envelope: asset "${asset.assetId}" sourceKind "${String(asset.sourceKind)}" is not declared`);
    }
  }

  for (const op of input.timeline.ops) {
    if (!isTimelineOpId(op.op)) {
      throw new Error(`plan-envelope: timeline op "${op.id}" carries unknown operation "${String(op.op)}"`);
    }
  }

  const envelope: VideoPlanEnvelope = {
    version: PLAN_ENVELOPE_VERSION,
    planId: input.planId,
    revision: input.revision,
    parentRevision: input.parentRevision,
    videoType: lane.type,
    format: lane.format,
    renderMode: lane.renderMode,
    briefHash: input.briefHash,
    aspect: input.aspect,
    width: input.width,
    height: input.height,
    fps: input.fps,
    narration: input.narration,
    audioReceipt: input.audioReceipt,
    beats: input.beats,
    assets: input.assets,
    timeline: input.timeline,
    fallback: input.fallback,
    qcProfile: lane.qcProfile,
    rendererVersion: input.rendererVersion,
    createdFrom: input.createdFrom,
    // Phase 1.3: the plan identifies the contract surface that produced it.
    // Stamped BEFORE the fingerprint so the fingerprint covers it — editing
    // the stamp is tamper-evident like every other field.
    laneContract: currentLaneContractStamp(),
    fingerprint: "",
  };
  envelope.fingerprint = computePlanFingerprint(envelope);
  return envelope;
}

// ---------- serialization + parsing ----------

/** The canonical serialization of an envelope WITHOUT its fingerprint. */
export function planCanonicalForm(plan: VideoPlanEnvelope): string {
  const { fingerprint: _omit, ...rest } = plan;
  return canonicalStringify(rest);
}

export function serializePlanEnvelope(plan: VideoPlanEnvelope): string {
  return canonicalStringify(plan);
}

/** sha256 over the canonical sans-fingerprint form. */
export function computePlanFingerprint(plan: VideoPlanEnvelope): string {
  return sha256Hex(planCanonicalForm(plan));
}

function fail(msg: string): never {
  throw new Error(`plan-envelope parse: ${msg}`);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isHex64(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
}

/** Strict shape validation (version-first, fail-closed). */
export function validatePlanEnvelopeShape(parsed: unknown): VideoPlanEnvelope {
  if (typeof parsed !== "object" || parsed === null) fail("document is not an object");
  const d = parsed as Record<string, unknown>;
  if (d.version !== PLAN_ENVELOPE_VERSION) {
    fail(`unsupported version ${String(d.version)} (this parser speaks version ${PLAN_ENVELOPE_VERSION})`);
  }
  for (const field of ["planId", "videoType", "renderMode", "briefHash", "qcProfile", "rendererVersion"] as const) {
    if (typeof d[field] !== "string" || (d[field] as string).length === 0) fail(`${field} must be a non-empty string`);
  }
  if (!isHex64(d.briefHash)) fail("briefHash must be a 64-char sha256 hex string");
  if (!Number.isInteger(d.revision) || (d.revision as number) < 1) fail("revision must be a positive integer");
  if (d.parentRevision !== undefined && (!Number.isInteger(d.parentRevision) || (d.parentRevision as number) < 1)) {
    fail("parentRevision must be a positive integer when present");
  }
  if (d.aspect !== "16:9" && d.aspect !== "9:16" && d.aspect !== "1:1") {
    fail(`aspect "${String(d.aspect)}" is not a supported aspect`);
  }
  for (const field of ["width", "height", "fps"] as const) {
    if (!isFiniteNumber(d[field]) || (d[field] as number) <= 0) fail(`${field} must be a positive number`);
  }
  if (typeof d.narration !== "object" || d.narration === null) fail("narration must be an object");
  const narr = d.narration as Record<string, unknown>;
  if (!isTimingSource(String(narr.source))) fail(`narration.source "${String(narr.source)}" is not a declared timing source`);
  if (narr.source === "estimate" && !isFiniteNumber(narr.estimatedDurationMs)) {
    fail("an estimate narration must carry its estimatedDurationMs");
  }
  if (d.audioReceipt !== undefined) {
    if (typeof d.audioReceipt !== "object" || d.audioReceipt === null) fail("audioReceipt must be an object when present");
    const ar = d.audioReceipt as Record<string, unknown>;
    if (ar.version !== 1) fail("riding audioReceipt must be version 1");
    if (!isHex64(ar.sourceHash)) fail("riding audioReceipt.sourceHash must be sha256 hex");
  }
  for (const field of ["beats", "assets"] as const) {
    if (!Array.isArray(d[field])) fail(`${field} must be an array`);
  }
  for (const raw of d.beats as unknown[]) {
    if (typeof raw !== "object" || raw === null) fail("beat must be an object");
    const b = raw as Record<string, unknown>;
    if (typeof b.id !== "string" || b.id.length === 0) fail("beat.id must be a non-empty string");
    if (typeof b.narrationWindow !== "object" || b.narrationWindow === null) fail(`beat "${b.id}" needs a narration window`);
    const w = b.narrationWindow as Record<string, unknown>;
    if (!isFiniteNumber(w.startMs) || !isFiniteNumber(w.endMs) || (w.endMs as number) < (w.startMs as number)) {
      fail(`beat "${b.id}" has an invalid narration window`);
    }
    if (typeof b.visualIntent !== "string" || b.visualIntent.length === 0) fail(`beat "${b.id}" must declare its visual intent`);
  }
  for (const raw of d.assets as unknown[]) {
    if (typeof raw !== "object" || raw === null) fail("asset entry must be an object");
    const a = raw as Record<string, unknown>;
    for (const field of ["assetId", "license", "storageKey", "tenantId"] as const) {
      if (typeof a[field] !== "string" || (a[field] as string).length === 0) {
        fail(`asset "${String(a.assetId)}" must carry a non-empty ${field} (provenance is mandatory)`);
      }
    }
    if (!isHex64(a.contentHash)) fail(`asset "${String(a.assetId)}" contentHash must be sha256 hex`);
    const kinds = ["generated", "uploaded", "stock", "builtin", "reused"];
    if (!kinds.includes(String(a.sourceKind))) fail(`asset "${String(a.assetId)}" sourceKind is not declared`);
  }
  if (typeof d.timeline !== "object" || d.timeline === null) fail("timeline must be an object");
  const tl = d.timeline as Record<string, unknown>;
  if (!Array.isArray(tl.ops)) fail("timeline.ops must be an array");
  for (const op of tl.ops as unknown[]) {
    if (typeof op !== "object" || op === null) fail("timeline op must be an object");
    const o = op as Record<string, unknown>;
    if (!isTimelineOpId(String(o.op))) fail(`timeline op "${String(o.id)}" carries unknown operation "${String(o.op)}"`);
    if (!isFiniteNumber(o.startMs) || !isFiniteNumber(o.endMs) || (o.endMs as number) < (o.startMs as number)) {
      fail(`timeline op "${String(o.id)}" has an invalid window`);
    }
  }
  if (typeof d.fallback !== "object" || d.fallback === null) fail("fallback must be an object");
  const fb = d.fallback as Record<string, unknown>;
  if (fb.declared !== true) fail("fallback.declared must be true — a fallback that is not declared does not exist");
  if (typeof fb.mode !== "string" || fb.mode.length === 0) fail("fallback.mode must be a non-empty string");
  if (typeof fb.reason !== "string" || fb.reason.length === 0) fail("fallback.reason must be a non-empty string");
  if (!isHex64(d.fingerprint)) fail("fingerprint must be a 64-char sha256 hex string");

  // Phase 1.3 — the registry stamp. ABSENT = legacy plan (pre-stamp): it
  // stays parseable and its fingerprint still verifies. PRESENT = the plan
  // declares which contract surface produced it, and the surface must still
  // be the live one — a mismatch refuses the parse with the recompile law
  // instead of rendering an incompatible plan.
  if (d.laneContract !== undefined) {
    if (typeof d.laneContract !== "object" || d.laneContract === null) {
      fail("laneContract must be an object when present");
    }
    const lc = d.laneContract as Record<string, unknown>;
    if (!Number.isInteger(lc.version) || (lc.version as number) < 1) {
      fail("laneContract.version must be a positive integer");
    }
    if (!isHex64(lc.fingerprint)) fail("laneContract.fingerprint must be sha256 hex");
    const live = currentLaneContractStamp();
    if (lc.version !== live.version || lc.fingerprint !== live.fingerprint) {
      fail(
        `plan was compiled under lane-contract v${String(lc.version)} (${String(lc.fingerprint).slice(0, 12)}…) but the live registry is v${live.version} (${live.fingerprint.slice(0, 12)}…) — the contract changed after compile; recompile the plan`,
      );
    }
  }

  const envelope = parsed as unknown as VideoPlanEnvelope;

  // Lane truth: the parsed envelope must agree with what its lane declares.
  const lane = resolveLane(envelope.videoType);
  if (envelope.renderMode !== lane.renderMode) {
    fail(`renderMode "${envelope.renderMode}" contradicts lane "${lane.type}" (declared: ${lane.renderMode})`);
  }
  if (envelope.qcProfile !== lane.qcProfile) {
    fail(`qcProfile "${envelope.qcProfile}" contradicts lane "${lane.type}" (declared: ${lane.qcProfile})`);
  }
  if (!lane.supportedAspects.includes(envelope.aspect)) {
    fail(`aspect "${envelope.aspect}" is not supported by lane "${lane.type}"`);
  }
  if (!lane.supportedFps.includes(envelope.fps)) {
    fail(`fps ${envelope.fps} is not produced by lane "${lane.type}"`);
  }
  if (
    (envelope.narration.source === "word-timestamps" || envelope.narration.source === "sentence-timestamps") &&
    !envelope.audioReceipt
  ) {
    fail(`narration.source "${envelope.narration.source}" requires a riding audio receipt`);
  }

  return envelope;
}

/** Parse + validate + fingerprint-verify a stored plan. Tamper-evident. */
export function parsePlanEnvelope(text: string): VideoPlanEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail("document is not valid JSON");
  }
  const plan = validatePlanEnvelopeShape(parsed);
  const expected = computePlanFingerprint(plan);
  if (plan.fingerprint !== expected) {
    fail(`fingerprint mismatch: document says ${plan.fingerprint.slice(0, 12)}…, content hashes to ${expected.slice(0, 12)}…`);
  }
  return plan;
}

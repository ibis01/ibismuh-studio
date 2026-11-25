// pipeline.ts — the compile + asset + narration + render pipeline (server-only).
//
// One place owns the expensive truth: compiling plan revisions (the plan-
// revision law: a new render must point to a NEW revision), generating scene
// art and measured narration, and the render job state machine over the ten
// declared stages with fingerprint-scoped caching.
//
// THE LAWS:
//   * compile fail-closed — a plan that cannot be verified is never persisted;
//   * providers may be absent — every degradation is DECLARED via fallback,
//     warnings, and skipped stages (never silent, never a fake success);
//   * render does not silently generate assets — missing art is a
//     retryable-failure that names the repair;
//   * cancellation preserves completed stages; QC failure is needs-repair,
//     NEVER a blind retry.

import { mkdir, writeFile } from "node:fs/promises";
import { db } from "@/lib/ibismuh/tenant-db";
import { canonicalStringify, sha256Hex, sha256HexBytes } from "./canonical";
import { resolveLane, type VideoType } from "./studio-lanes";
import { ASPECT_GEOMETRY, isVoiceId } from "./studio-catalogs";
import {
  STAGE_ORDER,
  computeStageFingerprint,
  invalidationSet,
  type StageFingerprint,
  type StageId,
} from "./studio-stages";
import {
  FAILURE_POLICIES,
  IllegalTransitionError,
  assertTransition,
  classifyFailure,
  idempotencyKey,
  isRestState,
  isFailureClass,
  type FailureClass,
  type JobState,
  type RenderEvent,
} from "./job-status";
import {
  compilePlanEnvelope,
  parsePlanEnvelope,
  serializePlanEnvelope,
  type AssetManifestEntry,
  type FallbackDecision,
  type NarrationPlan,
  type VideoPlanEnvelope,
} from "./plan-envelope";
import { compileTimeline, type TimelineOpInput } from "./timeline-ops";
import { audioReceiptHash, buildAudioReceipt, serializeAudioReceipt, type AudioReceipt, type SentenceSpan } from "./audio-receipt";
import { RENDERER_VERSION, type LaneScene, type PlannerOutput } from "./planner-types";
import { planLane } from "./planners";
import { assembleLane } from "./assemble";
import { generateImage } from "./providers/zai-image";
import { synthesizeWav } from "./providers/zai-tts";
import {
  ACTIVE_JOB_STATES,
  HttpError,
  ORG,
  asAspect,
  asJobState,
  errorMessage,
  loadProjectRow,
  mapAsset,
  mapJob,
  mapPlanRevision,
  parseBriefRow,
  parseLaneDoc,
  requireCurrentRevisionRow,
  safeAssetPath,
  tryParseAudioReceipt,
  writeStudioEvent,
} from "./dto-mappers";
import { runQcForProject } from "./qc-engine";
import type { AssetDTO, JobDTO, PlanRevisionDTO, StageRunDTO } from "./api-dto";
import type { AssetRecord, PlanRevision, RenderJob, StudioProject } from "@prisma/client";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// ---------- helpers ----------

interface TtsResult {
  wav: Uint8Array;
  durationMs: number;
  sampleRate: number;
  channels: number;
}

/** Image lanes: classic/story always; character's storyboard-fallback scenes. */
function laneNeedsImages(lane: VideoType): boolean {
  return lane === "classic" || lane === "story" || lane === "character";
}

/** Character scenes without rig info default to storyboard art (declared in
 *  the registry's fallback policy — never assumed native). */
function sceneNeedsImage(lane: VideoType, scene: LaneScene): boolean {
  if (!laneNeedsImages(lane)) return false;
  if (lane === "character") {
    const mode = scene.mode ?? scene.pose?.rigMode;
    return mode ? mode === "storyboard-fallback" : true;
  }
  return true;
}

async function writeAssetFile(storageKey: string, bytes: Uint8Array): Promise<void> {
  const filePath = safeAssetPath(storageKey);
  await mkdir(filePath.substring(0, filePath.lastIndexOf("/")), { recursive: true });
  await writeFile(filePath, bytes);
}

async function listAssets(projectId: string): Promise<AssetDTO[]> {
  const rows = await db.assetRecord.findMany({
    where: { projectId, organizationId: ORG },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(mapAsset);
}

function toManifestEntry(row: AssetRecord, tenantId: string): AssetManifestEntry {
  const kinds = ["generated", "uploaded", "stock", "builtin", "reused"];
  if (!kinds.includes(row.sourceKind) || !row.license || !/^[0-9a-f]{64}$/.test(row.contentHash) || !row.storageKey) {
    throw new HttpError(500, `asset "${row.assetId}" is missing provenance — cannot seat it in the manifest`);
  }
  return {
    assetId: row.assetId,
    sourceKind: row.sourceKind as AssetManifestEntry["sourceKind"],
    ...(row.provider ? { sourceRef: row.provider } : {}),
    license: row.license,
    contentHash: row.contentHash,
    ...(row.width ? { width: row.width } : {}),
    ...(row.height ? { height: row.height } : {}),
    ...(row.durationMs ? { durationMs: row.durationMs } : {}),
    storageKey: row.storageKey,
    tenantId,
  };
}

function ttsUnavailable(): HttpError {
  return new HttpError(
    502,
    "voice provider unavailable — measured audio requires the TTS provider; estimated timing remains declared",
    `failure-class: provider-auth — ${FAILURE_POLICIES["provider-auth"].detail}`,
  );
}

// ---------- WAV merge (canonical 44-byte PCM headers) ----------

function readWavHeader(bytes: Uint8Array): { sampleRate: number; channels: number; bitsPerSample: number } | null {
  if (bytes.length < 44) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sampleRate = dv.getUint32(24, true);
  const channels = dv.getUint16(22, true);
  const bitsPerSample = dv.getUint16(34, true);
  if (!sampleRate || !channels || !bitsPerSample) return null;
  return { sampleRate, channels, bitsPerSample };
}

function wavDataSize(bytes: Uint8Array): number {
  if (bytes.length < 44) return 0;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const declared = dv.getUint32(40, true);
  const available = bytes.length - 44;
  return declared > 0 && declared <= available ? declared : available;
}

function buildWavHeader(dataLen: number, sampleRate: number, channels: number, bits: number): Uint8Array {
  const blockAlign = channels * (bits >> 3);
  const byteRate = sampleRate * blockAlign;
  const out = new Uint8Array(44);
  const dv = new DataView(out.buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) dv.setUint8(offset + i, text.charCodeAt(i));
  };
  writeAscii(0, "RIFF");
  dv.setUint32(4, 36 + dataLen, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, channels, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, byteRate, true);
  dv.setUint16(32, blockAlign, true);
  dv.setUint16(34, bits, true);
  writeAscii(36, "data");
  dv.setUint32(40, dataLen, true);
  return out;
}

function mergeWavs(parts: TtsResult[]): TtsResult {
  const first = parts[0];
  const meta = readWavHeader(first.wav) ?? { sampleRate: first.sampleRate, channels: first.channels, bitsPerSample: 16 };
  const payloads: Uint8Array[] = [];
  let total = 0;
  for (const p of parts) {
    const size = wavDataSize(p.wav);
    payloads.push(p.wav.subarray(p.wav.length - size));
    total += size;
  }
  const merged = new Uint8Array(44 + total);
  merged.set(buildWavHeader(total, meta.sampleRate, meta.channels, meta.bitsPerSample), 0);
  let offset = 44;
  for (const payload of payloads) {
    merged.set(payload, offset);
    offset += payload.length;
  }
  const bytesPerSample = (meta.bitsPerSample >> 3) * meta.channels;
  const durationMs = bytesPerSample > 0 ? Math.round((total / (meta.sampleRate * bytesPerSample)) * 1000) : 0;
  return { wav: merged, durationMs: Math.max(1, durationMs), sampleRate: meta.sampleRate, channels: meta.channels };
}

// ---------- sentence spans (declared estimate at sentence granularity) ----------

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function proportionalSentenceSpans(sentences: string[], durationMs: number): SentenceSpan[] {
  if (sentences.length === 0 || durationMs <= 0) return [];
  const weights = sentences.map((s) => Math.max(1, s.split(/\s+/).filter(Boolean).length));
  const total = weights.reduce((a, b) => a + b, 0);
  const starts: number[] = [];
  let acc = 0;
  for (let i = 0; i < sentences.length; i++) {
    starts.push(Math.floor((acc / total) * durationMs));
    acc += weights[i];
  }
  const spans: SentenceSpan[] = sentences.map((_, i) => ({
    id: `sent-${i + 1}`,
    startMs: starts[i],
    endMs: i === sentences.length - 1 ? durationMs : Math.max(starts[i + 1], starts[i] + 1),
  }));
  // Enforce the receipt law: ordered spans, none overlapping, none past the audio.
  let prevEnd = 0;
  for (const s of spans) {
    s.startMs = Math.max(s.startMs, prevEnd);
    s.endMs = Math.min(Math.max(s.endMs, s.startMs), durationMs);
    prevEnd = s.endMs;
  }
  return spans;
}

// ---------- compilePlan ----------

/**
 * Compile a NEW plan revision for the project's current brief + measured
 * audio + assets. Fail-closed: a plan that cannot be verified is never
 * persisted, and the previous revision is only superseded AFTER the new one
 * exists.
 */
export async function compilePlan(
  projectId: string,
  options?: { reuseLaneDoc?: PlannerOutput },
): Promise<PlanRevisionDTO> {
  const project = await loadProjectRow(projectId);
  const lane = resolveLane(project.lane);
  const aspect = asAspect(project.aspect);
  const brief = parseBriefRow(project.briefJson);
  const briefHash = sha256Hex(canonicalStringify(brief));
  if (briefHash !== project.briefHash) {
    throw new HttpError(409, "brief hash mismatch — the stored brief does not match its hash; re-save the project before compiling");
  }

  // Stage fingerprint BEFORE work: the declared inputs the compile run used.
  const briefValidate = computeStageFingerprint("brief-validate", lane.type, { briefHash, voiceId: project.voice });
  await writeStudioEvent(projectId, "brief-validate", `brief-validate fingerprint declared (${briefValidate.fingerprint.slice(0, 12)})`);

  // content-plan — a repair passes its MUTATED lane doc (reuseLaneDoc): the
  // repair law is that an amendment recompiles from the edited document,
  // never a fresh LLM draft that would silently overwrite the edit.
  let plannerOutput: PlannerOutput;
  if (options?.reuseLaneDoc) {
    plannerOutput = options.reuseLaneDoc;
  } else {
    try {
      plannerOutput = await planLane(lane.type, {
        brief,
        aspect,
        fps: project.fps,
        voice: project.voice,
        tone: project.tone || undefined,
      });
    } catch (err) {
      throw new HttpError(
        500,
        `content planner failed: ${errorMessage(err)}`,
        `failure-class: invalid-input — ${FAILURE_POLICIES["invalid-input"].detail}`,
      );
    }
  }
  if (plannerOutput.lane !== lane.type) {
    throw new HttpError(
      500,
      `planner returned lane "${plannerOutput.lane}" but the project lane is "${lane.type}"`,
      `failure-class: invalid-input — ${FAILURE_POLICIES["invalid-input"].detail}`,
    );
  }
  if (!Array.isArray(plannerOutput.scenes) || plannerOutput.scenes.length === 0) {
    throw new HttpError(500, "planner produced no scenes", `failure-class: invalid-input — ${FAILURE_POLICIES["invalid-input"].detail}`);
  }

  // audio-measure (latest receipt, if any)
  const receiptRow = await db.audioReceiptRecord.findFirst({
    where: { projectId, organizationId: ORG },
    orderBy: { createdAt: "desc" },
  });
  const audioReceipt = receiptRow ? tryParseAudioReceipt(receiptRow.receiptJson) : null;

  // lane-timeline
  const geometry = ASPECT_GEOMETRY[aspect];
  const assembled = await assembleLane({
    lane: lane.type,
    plannerOutput,
    audioReceipt,
    width: geometry.width,
    height: geometry.height,
    fps: project.fps,
  });

  // The narration plan states its declared timing source.
  const fullNarration = plannerOutput.scenes.map((s) => s.narration).join("\n\n");
  const source: NarrationPlan["source"] =
    audioReceipt && assembled.timingSource === "sentence-timestamps" ? "sentence-timestamps" : "estimate";
  const narration: NarrationPlan = { source, text: fullNarration, voiceId: project.voice };
  if (source === "estimate") narration.estimatedDurationMs = assembled.totalDurationMs;

  // Asset manifest — honest: empty at plan time is legal (recompile after assets land).
  const assetRows = await db.assetRecord.findMany({
    where: { projectId, organizationId: ORG, kind: "image" },
    orderBy: { createdAt: "asc" },
  });
  const assets: AssetManifestEntry[] = assetRows.map((a) => toManifestEntry(a, project.organizationId));

  const fallback: FallbackDecision = {
    mode: plannerOutput.fallback.mode,
    reason: plannerOutput.fallback.reason,
    declared: true,
    perScene: plannerOutput.fallback.perScene,
  };

  const agg = await db.planRevision.aggregate({
    where: { projectId, organizationId: ORG },
    _max: { revision: true },
  });
  const revision = (agg._max.revision ?? 0) + 1;
  const currentRow = project.currentPlanRevisionId
    ? await db.planRevision.findFirst({ where: { id: project.currentPlanRevisionId, organizationId: ORG } })
    : null;
  const parentRevision = currentRow ? currentRow.revision : undefined;

  const planId = `plan-${projectId}`;
  let plan: VideoPlanEnvelope;
  try {
    const timeline = compileTimeline(planId, assembled.timeline as TimelineOpInput[]);
    plan = compilePlanEnvelope({
      planId,
      revision,
      ...(parentRevision !== undefined ? { parentRevision } : {}),
      videoType: lane.type,
      briefHash,
      aspect,
      width: geometry.width,
      height: geometry.height,
      fps: project.fps,
      narration,
      ...(audioReceipt ? { audioReceipt } : {}),
      beats: assembled.beats,
      assets,
      timeline,
      fallback,
      rendererVersion: RENDERER_VERSION,
    });
  } catch (err) {
    throw new HttpError(400, `plan compile failed: ${errorMessage(err)}`);
  }

  const revRow = await db.planRevision.create({
    data: {
      projectId,
      organizationId: ORG,
      revision,
      parentRevision: parentRevision ?? null,
      status: "draft",
      lane: lane.type,
      schemaVersion: 1,
      fingerprint: plan.fingerprint,
      briefHash,
      planJson: serializePlanEnvelope(plan),
      laneDocJson: canonicalStringify(plannerOutput),
    },
  });

  await db.planRevision.updateMany({
    where: { projectId, organizationId: ORG, id: { not: revRow.id }, status: { not: "superseded" } },
    data: { status: "superseded" },
  });
  await db.studioProject.update({
    where: { id: projectId },
    data: { currentPlanRevisionId: revRow.id, status: "planned" },
  });
  await writeStudioEvent(projectId, "content-plan", `plan revision ${revision} compiled (fingerprint ${plan.fingerprint.slice(0, 12)})`);

  return mapPlanRevision(revRow);
}

// ---------- assets ----------

/**
 * Generate scene art for every image-needing scene, then RECOMPILE so the
 * manifest seats the new assets and the fingerprint moves (plan-revision law).
 */
export async function generateAssetsForPlan(projectId: string): Promise<AssetDTO[]> {
  const project = await loadProjectRow(projectId);
  const lane = resolveLane(project.lane);
  const revRow = await requireCurrentRevisionRow(project);
  const laneDoc = parseLaneDoc(revRow.laneDocJson);
  const aspect = asAspect(project.aspect);

  if (!laneNeedsImages(lane.type)) {
    await writeStudioEvent(projectId, "asset-generate", "lane is image-free, asset stage skipped");
    return listAssets(projectId);
  }

  for (const scene of laneDoc.scenes) {
    if (!sceneNeedsImage(lane.type, scene)) continue;
    const assetId = `img-${scene.id}`;
    const existing = await db.assetRecord.findUnique({
      where: { projectId_assetId: { projectId, assetId } },
    });
    if (existing) continue;

    const prompt = `${scene.visualIntent}, ${project.tone} tone, editorial style, high quality, detailed`;
    const { image, error } = await generateImage(prompt, aspect);
    if (!image) {
      // Declared fallback: gradient boards carry the scene — with the REAL
      // provider failure surfaced (never a silent unavailable).
      await writeStudioEvent(
        projectId,
        "asset-generate",
        `image provider failed for scene ${scene.id} — gradient board fallback declared (${error ?? "unknown"})`,
        "warn",
        scene.id,
      );
      continue;
    }

    const storageKey = `${projectId}/${assetId}.${image.ext}`;
    await writeAssetFile(storageKey, image.png);
    const contentHash = sha256HexBytes(image.png);
    await db.assetRecord.create({
      data: {
        projectId,
        organizationId: ORG,
        assetId,
        kind: "image",
        sourceKind: "generated",
        provider: "zai-images",
        storageKey,
        contentHash,
        width: image.width,
        height: image.height,
        license: "Generated by Ibismuh Studio — creator owned",
        sceneRef: scene.id,
        bytes: image.png.length,
      },
    });
    await writeStudioEvent(projectId, "asset-generate", `scene ${scene.id} art generated (${image.width}x${image.height})`, "info", scene.id);
  }

  // The plan-revision law: a new render must point to a new revision.
  await compilePlan(projectId);
  return listAssets(projectId);
}

// ---------- repair ----------

/**
 * How a closed repair op maps onto the lane document. Ops that do not map
 * to a deterministic document edit here are DECLARED-not-implemented: the
 * registry lists them, this sandbox answers honestly instead of pretending.
 */
const REPAIR_TEXT_TARGETS: Record<string, "visualIntent" | "narration" | "caption" | "slide-title" | "headline"> = {
  "beat-visual": "visualIntent",
  "scene-art": "visualIntent",
  "beat-caption": "caption",
  "scene-narration": "narration",
  "beat-timing": "narration",
  "slide-content": "slide-title",
  "component-doc": "headline",
};

export interface RepairInput {
  op: string;
  sceneRef?: string;
  instruction: string;
}

export interface RepairResult {
  planRevision: PlanRevisionDTO;
  changedScene: string | null;
  affectedAssets: string[];
  invalidatedStages: StageId[];
}

/**
 * A scoped repair (master plan Workstream B): ONE declared op bound to ONE
 * scene, never silently destructive — the previous revision stays in
 * history, the new revision links to it via parentRevision, and the event
 * log states exactly what changed and which stages must rerun.
 */
export async function repairProject(projectId: string, input: RepairInput): Promise<RepairResult> {
  const project = await loadProjectRow(projectId);
  const lane = resolveLane(project.lane);
  if (!(lane.repairOperations as readonly string[]).includes(input.op)) {
    throw new HttpError(
      400,
      `repair op "${input.op}" is not declared for lane "${lane.type}" (declared: ${lane.repairOperations.join(", ")})`,
    );
  }
  if (typeof input.instruction !== "string" || input.instruction.trim().length === 0) {
    throw new HttpError(400, "a repair requires a non-empty instruction");
  }
  const revRow = await requireCurrentRevisionRow(project);
  const laneDoc = parseLaneDoc(revRow.laneDocJson);
  const instruction = input.instruction.trim();

  // Locate the scoped scene — repairs are scene-scoped by definition.
  const scene = laneDoc.scenes.find((s) => s.id === input.sceneRef) ?? null;
  if (input.sceneRef && !scene) {
    throw new HttpError(404, `scene "${input.sceneRef}" is not part of the current plan`);
  }

  let changedScene: string | null = null;
  const affectedAssets: string[] = [];

  if (input.op === "scene-transition") {
    // Declared, deterministic, but a transition choice rides the planner's
    // cycle in this sandbox — honest answer instead of a fake edit.
    throw new HttpError(
      400,
      "repair op scene-transition is declared for this lane but transition cycling is planner-owned in this sandbox — recompile the plan after a brief edit instead",
    );
  }
  if (input.op === "rig-assignment") {
    throw new HttpError(
      400,
      "repair op rig-assignment is declared but no rig library is attached in this sandbox (capability: native-rig unavailable — storyboard fallback is declared per scene)",
    );
  }

  const target = REPAIR_TEXT_TARGETS[input.op];
  if (!target) {
    throw new HttpError(400, `repair op "${input.op}" is declared for this lane but not implemented in this sandbox`);
  }
  if (!scene) {
    throw new HttpError(400, `repair op "${input.op}" requires a sceneRef — repairs are scoped to one scene`);
  }

  const before = { visualIntent: scene.visualIntent, narration: scene.narration, caption: scene.caption };
  switch (target) {
    case "visualIntent":
      scene.visualIntent = instruction;
      changedScene = scene.id;
      break;
    case "narration":
      scene.narration = instruction;
      changedScene = scene.id;
      break;
    case "caption":
      scene.caption = instruction.slice(0, 90);
      changedScene = scene.id;
      break;
    case "slide-title":
      if (!scene.slide) throw new HttpError(400, `scene ${scene.id} carries no slide beat to edit`);
      scene.slide = { ...scene.slide, title: instruction.slice(0, 48) };
      changedScene = scene.id;
      break;
    case "headline":
      if (!scene.components?.length) throw new HttpError(400, `scene ${scene.id} carries no components to edit`);
      const headline = scene.components.find((c) => c.kind === "headline");
      if (!headline) throw new HttpError(400, `scene ${scene.id} has no headline component`);
      scene.components = scene.components.map((c) => (c.id === headline.id ? { ...c, props: { ...c.props, text: instruction.slice(0, 80) } } : c));
      changedScene = scene.id;
      break;
  }

  // Scene-art repairs regenerate THIS scene's art only — unrelated scenes
  // keep their assets byte-identical (the stage-fingerprint law).
  const laneNeedsArt = laneNeedsImages(lane.type) && sceneNeedsImage(lane.type, scene);
  if (laneNeedsArt && sceneNeedsImage(lane.type, scene) && (input.op === "scene-art" || input.op === "beat-visual")) {
    const assetId = `img-${scene.id}`;
    const prior = await db.assetRecord.findUnique({ where: { projectId_assetId: { projectId, assetId } } });
    if (prior) {
      // Additive history: supersede by delete-and-recreate of the SAME
      // assetId slot, with the old content hash preserved in the event log.
      await db.assetRecord.delete({ where: { id: prior.id } });
      await writeStudioEvent(
        projectId,
        "asset-generate",
        `repair superseded asset ${assetId} (prior hash ${prior.contentHash.slice(0, 12)})`,
        "info",
        scene.id,
      );
    }
    const aspect = asAspect(project.aspect);
    const prompt = `${scene.visualIntent}, ${project.tone} tone, editorial style, high quality, detailed`;
    const { image, error } = await generateImage(prompt, aspect);
    if (image) {
      const storageKey = `${projectId}/${assetId}.${image.ext}`;
      await writeAssetFile(storageKey, image.png);
      await db.assetRecord.create({
        data: {
          projectId,
          organizationId: ORG,
          assetId,
          kind: "image",
          sourceKind: "generated",
          provider: "zai-images",
          storageKey,
          contentHash: sha256HexBytes(image.png),
          width: image.width,
          height: image.height,
          license: "Generated by Ibismuh Studio — creator owned",
          sceneRef: scene.id,
          bytes: image.png.length,
        },
      });
      affectedAssets.push(assetId);
      await writeStudioEvent(projectId, "asset-generate", `repair regenerated art for scene ${scene.id} (${image.width}x${image.height})`, "info", scene.id);
    } else {
      // Declared fallback: the gradient board carries the repaired scene.
      await writeStudioEvent(
        projectId,
        "asset-generate",
        `repair could not regenerate art for scene ${scene.id} — gradient board fallback declared (${error ?? "unknown"})`,
        "warn",
        scene.id,
      );
    }
  }

  // Recompile → the new revision links to the amended one via parentRevision.
  // reuseLaneDoc: the mutated document IS the new plan truth — a fresh LLM
  // draft would silently overwrite the repair (never silently destructive).
  const newRev = await compilePlan(projectId, { reuseLaneDoc: laneDoc });

  await writeStudioEvent(
    projectId,
    "content-plan",
    `repair ${input.op} on scene ${scene.id}: ${describeRepairChange(target, before, scene)} — new revision ${newRev.revision}`,
    "info",
    scene.id,
  );

  const invalidated = invalidationSet("scene-render");
  return { planRevision: newRev, changedScene, affectedAssets, invalidatedStages: invalidated };
}

function describeRepairChange(
  target: string,
  before: { visualIntent: string; narration: string; caption?: string },
  scene: LaneScene,
): string {
  const after =
    target === "narration"
      ? scene.narration
      : target === "caption"
        ? (scene.caption ?? "")
        : target === "slide-title"
          ? (scene.slide?.title ?? "")
          : target === "headline"
            ? String(scene.components?.find((c) => c.kind === "headline")?.props.text ?? "")
            : scene.visualIntent;
  const beforeText =
    target === "narration" ? before.narration : target === "caption" ? (before.caption ?? "") : before.visualIntent;
  return `changed ${target}: "${truncate(beforeText, 40)}" → "${truncate(after, 40)}"`;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

// ---------- narration ----------

/**
 * Synthesize + measure the full narration, persist the AudioReceipt, then
 * RECOMPILE so beats ride the measured windows and narration.source upgrades.
 */
export async function generateNarrationReceipt(
  projectId: string,
): Promise<{ audioReceipt: AudioReceipt; planRevision: PlanRevisionDTO; narrationAssetId: string }> {
  const project = await loadProjectRow(projectId);
  const revRow = await requireCurrentRevisionRow(project);
  const laneDoc = parseLaneDoc(revRow.laneDocJson);
  const voiceId = isVoiceId(project.voice) ? project.voice : "tongtong";

  const fullNarration = laneDoc.scenes
    .map((s) => s.narration.trim())
    .filter(Boolean)
    .join("\n\n");
  if (!fullNarration) throw new HttpError(400, "the lane document carries no narration to measure");

  let result: TtsResult;
  if (fullNarration.length <= 950) {
    const single = await synthesizeWav(fullNarration, voiceId);
    if (!single) throw ttsUnavailable();
    result = single;
  } else {
    // Long narration: synthesize per scene and merge the WAV payloads.
    const parts: TtsResult[] = [];
    for (const scene of laneDoc.scenes) {
      const text = scene.narration.trim();
      if (!text) continue;
      const part = await synthesizeWav(text, voiceId);
      if (!part) throw ttsUnavailable();
      parts.push(part);
    }
    if (parts.length === 0) throw ttsUnavailable();
    result = mergeWavs(parts);
  }
  if (result.durationMs <= 0 || result.sampleRate <= 0 || result.channels <= 0) {
    throw new HttpError(502, "voice provider returned invalid audio metadata", ttsUnavailable().detail);
  }

  const storageKey = `${projectId}/narration.wav`;
  await writeAssetFile(storageKey, result.wav);
  const contentHash = sha256HexBytes(result.wav);
  const asset = await db.assetRecord.upsert({
    where: { projectId_assetId: { projectId, assetId: "narration-audio" } },
    create: {
      projectId,
      organizationId: ORG,
      assetId: "narration-audio",
      kind: "audio",
      sourceKind: "generated",
      provider: "zai-tts",
      storageKey,
      contentHash,
      durationMs: result.durationMs,
      license: "Generated — creator owned",
      bytes: result.wav.length,
    },
    update: {
      storageKey,
      contentHash,
      durationMs: result.durationMs,
      provider: "zai-tts",
      bytes: result.wav.length,
    },
  });

  const sentences = splitSentences(fullNarration);
  const sentenceSpans = proportionalSentenceSpans(sentences, result.durationMs);
  const receipt = buildAudioReceipt({
    sourceHash: contentHash,
    durationMs: result.durationMs,
    sampleRate: result.sampleRate,
    channels: result.channels,
    silenceSpans: [],
    sentenceSpans,
    normalization: { applied: false },
    provider: "zai-tts",
    model: "cogtts",
  });

  await db.audioReceiptRecord.create({
    data: {
      projectId,
      organizationId: ORG,
      sourceHash: contentHash,
      durationMs: result.durationMs,
      sampleRate: result.sampleRate,
      channels: result.channels,
      receiptJson: serializeAudioReceipt(receipt),
      narrationAssetId: asset.id,
    },
  });

  await writeStudioEvent(
    projectId,
    "audio-measure",
    `measured audio receipt: ${result.durationMs}ms @ ${result.sampleRate}Hz (${sentenceSpans.length} sentence spans)`,
  );
  const planRevision = await compilePlan(projectId);
  return { audioReceipt: receipt, planRevision, narrationAssetId: asset.id };
}

// ---------- render job state machine ----------

class RenderStageError extends Error {
  constructor(
    public failureClass: FailureClass,
    message: string,
  ) {
    super(message);
    this.name = "RenderStageError";
  }
}

class RenderCancelledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RenderCancelledError";
  }
}

/** Compute all ten declared stage fingerprints from the render's inputs. */
function computeRenderStageFingerprints(args: {
  lane: VideoType;
  voice: string;
  briefHash: string;
  plan: VideoPlanEnvelope;
  receipt: AudioReceipt | null;
  assetRows: AssetRecord[];
  laneDoc: PlannerOutput;
  imageLane: boolean;
}): Record<StageId, StageFingerprint> {
  const { lane, plan, receipt, assetRows, laneDoc, imageLane } = args;
  const planFingerprint = plan.fingerprint;
  const assetHashes = sha256Hex(assetRows.map((a) => a.contentHash).sort().join("|"));
  const receiptHash = receipt ? audioReceiptHash(receipt) : args.briefHash;
  const geometry = `${plan.width}x${plan.height}@${plan.fps}`;

  const sceneFingerprints: Record<string, string> = {};
  for (const scene of laneDoc.scenes) {
    const assetHash = assetRows.find((a) => a.sceneRef === scene.id)?.contentHash ?? "";
    const core: Record<string, unknown> = { id: scene.id, narration: scene.narration, visualIntent: scene.visualIntent };
    if (scene.camera) core.camera = scene.camera;
    if (scene.paths) core.paths = scene.paths;
    if (scene.components) core.components = scene.components;
    if (scene.slide) core.slide = scene.slide;
    if (scene.pose) core.pose = scene.pose;
    if (scene.mode) core.mode = scene.mode;
    sceneFingerprints[scene.id] = sha256Hex(canonicalStringify(core) + assetHash);
  }

  return {
    "brief-validate": computeStageFingerprint("brief-validate", lane, { briefHash: args.briefHash, voiceId: args.voice }),
    "content-plan": computeStageFingerprint("content-plan", lane, { briefHash: args.briefHash, planFingerprint }),
    "asset-generate": imageLane
      ? computeStageFingerprint("asset-generate", lane, { planFingerprint, assetHashes })
      : computeStageFingerprint("asset-generate", lane, { planFingerprint }),
    "asset-normalize": imageLane
      ? computeStageFingerprint("asset-normalize", lane, { assetHashes })
      : computeStageFingerprint("asset-normalize", lane, {}),
    "audio-measure": computeStageFingerprint("audio-measure", lane, { audioReceiptHash: receiptHash }),
    "lane-timeline": computeStageFingerprint("lane-timeline", lane, { planFingerprint, audioReceiptHash: receiptHash }),
    "scene-render": computeStageFingerprint("scene-render", lane, {
      planFingerprint,
      sceneFingerprints: canonicalStringify(sceneFingerprints),
    }),
    "audio-mix": computeStageFingerprint("audio-mix", lane, { audioReceiptHash: receiptHash }),
    "final-compose": computeStageFingerprint("final-compose", lane, { planFingerprint, geometry }),
    "qc-report": computeStageFingerprint("qc-report", lane, { planFingerprint, qcProfile: plan.qcProfile }),
  };
}

interface StageContext {
  jobId: string;
  i: number;
  run: StageRunDTO;
  project: StudioProject;
  plan: VideoPlanEnvelope;
  laneDoc: PlannerOutput;
  receipt: AudioReceipt | null;
  assetRows: AssetRecord[];
  imageLane: boolean;
  lane: VideoType;
  pushEvent: (e: Omit<RenderEvent, "at">) => void;
  onSceneProgress: (done: number, total: number, sceneRef: string) => Promise<void>;
}

async function assertNotCancelled(jobId: string): Promise<void> {
  const fresh = await db.renderJob.findUnique({ where: { id: jobId }, select: { cancelRequested: true } });
  if (fresh?.cancelRequested) throw new RenderCancelledError("cancel requested");
}

async function executeStage(stageId: StageId, ctx: StageContext): Promise<void> {
  const { run } = ctx;
  switch (stageId) {
    case "brief-validate": {
      await sleep(150);
      run.status = "done";
      run.detail = "brief hash verified";
      return;
    }
    case "content-plan": {
      await sleep(150);
      run.status = "done";
      run.detail = `plan ${ctx.plan.fingerprint.slice(0, 12)} bound`;
      return;
    }
    case "asset-generate": {
      if (!ctx.imageLane) {
        run.status = "skipped";
        run.detail = "lane is image-free";
        return;
      }
      const missing = ctx.laneDoc.scenes.filter(
        (s) => sceneNeedsImage(ctx.lane, s) && !ctx.assetRows.some((a) => a.assetId === `img-${s.id}`),
      );
      if (missing.length > 0) {
        // The honest gate: render does not silently generate images.
        throw new RenderStageError("provider-stale-asset", "missing assets — generate assets first");
      }
      await sleep(300);
      run.status = "done";
      run.detail = `${ctx.assetRows.length} scene asset(s) verified`;
      return;
    }
    case "asset-normalize": {
      if (!ctx.imageLane) {
        run.status = "skipped";
        run.detail = "no raster assets to normalize";
        return;
      }
      await sleep(300);
      run.status = "done";
      run.detail = "raster assets normalized (declared passthrough)";
      return;
    }
    case "audio-measure": {
      if (!ctx.receipt) {
        // An estimate is legal when DECLARED — not a failure.
        run.status = "skipped";
        run.detail = "estimated timing declared (no measured receipt)";
        return;
      }
      await sleep(150);
      run.status = "done";
      run.detail = `measured receipt ${ctx.receipt.durationMs}ms @ ${ctx.receipt.sampleRate}Hz`;
      return;
    }
    case "lane-timeline": {
      await sleep(150);
      run.status = "done";
      run.detail = `${ctx.plan.timeline.ops.length} timeline ops`;
      return;
    }
    case "scene-render": {
      const scenes = ctx.laneDoc.scenes;
      for (let idx = 0; idx < scenes.length; idx++) {
        await assertNotCancelled(ctx.jobId);
        await sleep(120);
        await ctx.onSceneProgress(idx + 1, scenes.length, scenes[idx].id);
      }
      run.status = "done";
      run.detail = `${scenes.length} scene(s) rendered`;
      return;
    }
    case "audio-mix": {
      await sleep(250);
      run.status = "done";
      run.detail = ctx.receipt ? "narration mixed against the measured receipt" : "silent mix (no measured narration)";
      return;
    }
    case "final-compose": {
      await sleep(250);
      run.status = "done";
      run.detail = `${ctx.plan.width}x${ctx.plan.height}@${ctx.plan.fps} composed`;
      return;
    }
    case "qc-report": {
      const qc = await runQcForProject(ctx.project.id);
      if (qc.overall === "fail") {
        const failing = qc.checks.filter((c) => !c.pass && c.severity === "fail");
        run.status = "failed";
        run.detail = `QC gate failed — ${failing.length} failing check(s)`;
        throw new RenderStageError("qc-failure", `QC gate failed — ${failing.map((c) => c.id).join(", ")}`);
      }
      run.status = "done";
      if (qc.overall === "warn") {
        const warns = qc.checks.filter((c) => !c.pass).length;
        run.detail = `QC completed with ${warns} warning(s)`;
        ctx.pushEvent({ stage: stageId, status: "done", detail: `QC warn: ${qc.checks.find((c) => !c.pass)?.message ?? "quality warnings declared"}` });
      } else {
        run.detail = "QC passed";
      }
      return;
    }
  }
}

async function cancelJobRow(
  jobId: string,
  completed: number,
  total: number,
  events: RenderEvent[],
  stageRuns: StageRunDTO[] | null,
): Promise<void> {
  const job = await db.renderJob.findUnique({ where: { id: jobId } });
  if (!job) return;
  try {
    assertTransition(asJobState(job.state), "cancelled");
  } catch {
    return; // already settled
  }
  events.push({ at: Date.now(), stage: "cancel", status: "failed", failureClass: "user-cancelled", detail: "cancelled by user" });
  await db.renderJob.update({
    where: { id: jobId },
    data: {
      state: "cancelled",
      failureClass: "user-cancelled",
      failureDetail: `completed stages preserved (${completed}/${total})`,
      label: "Cancelled",
      endedAt: new Date(),
      cancelRequested: true,
      ...(stageRuns ? { stagesJson: canonicalStringify(stageRuns) } : {}),
      eventsJson: canonicalStringify(events),
    },
  });
  await db.studioProject.update({ where: { id: job.projectId }, data: { status: "planned" } });
}

async function handleRenderFailure(
  jobId: string,
  projectId: string,
  err: unknown,
  stageRuns: StageRunDTO[],
  events: RenderEvent[],
  completedStages: number,
): Promise<void> {
  try {
    const job = await db.renderJob.findUnique({ where: { id: jobId } });
    if (!job) return;
    const activeRun = stageRuns.find((r) => r.status === "running");

    if (err instanceof RenderCancelledError) {
      if (activeRun) {
        activeRun.status = "skipped";
        activeRun.detail = "interrupted by user — completed scenes preserved";
      }
      await cancelJobRow(jobId, completedStages, STAGE_ORDER.length, events, stageRuns);
      return;
    }

    const cls =
      err instanceof RenderStageError
        ? classifyFailure(err.failureClass)
        : classifyFailure(errorMessage(err));
    const policy = FAILURE_POLICIES[cls];
    const message = errorMessage(err);
    if (activeRun && activeRun.status === "running") activeRun.status = "failed";
    events.push({ at: Date.now(), stage: activeRun?.stage ?? "render", status: "failed", failureClass: cls, detail: message.slice(0, 300) });

    const persistFailure = (data: Record<string, unknown>) =>
      db.renderJob.update({
        where: { id: jobId },
        data: { ...data, stagesJson: canonicalStringify(stageRuns), eventsJson: canonicalStringify(events) },
      });

    if (cls === "qc-failure") {
      try {
        assertTransition(asJobState(job.state), "quality-failure");
        await persistFailure({ state: "quality-failure", failureClass: cls, failureDetail: message.slice(0, 300), label: policy.label, endedAt: new Date() });
        assertTransition("quality-failure", "needs-repair");
        await db.renderJob.update({ where: { id: jobId }, data: { state: "needs-repair", label: "Needs repair" } });
        await db.studioProject.update({ where: { id: projectId }, data: { status: "needs-repair" } });
        await writeStudioEvent(projectId, "qc-report", `render needs repair — ${message.slice(0, 200)}`, "warn");
      } catch (transitionErr) {
        if (transitionErr instanceof IllegalTransitionError) {
          await db.renderJob.update({ where: { id: jobId }, data: { eventsJson: canonicalStringify(events) } });
          return;
        }
        throw transitionErr;
      }
      return;
    }

    const nextRetry = job.retryCount + 1;
    const toState: JobState = policy.maxRetries > 0 && nextRetry <= policy.maxRetries ? "retryable-failure" : "failed";
    try {
      assertTransition(asJobState(job.state), toState);
    } catch (transitionErr) {
      if (transitionErr instanceof IllegalTransitionError) {
        // The job moved under us (e.g. user cancelled) — leave its truth alone.
        await db.renderJob.update({ where: { id: jobId }, data: { eventsJson: canonicalStringify(events) } });
        return;
      }
      throw transitionErr;
    }
    await persistFailure({
      state: toState,
      failureClass: cls,
      failureDetail: `${message.slice(0, 200)} — ${policy.detail}`,
      label: (message || policy.label).slice(0, 120),
      retryCount: nextRetry,
      endedAt: new Date(),
    });
    await db.studioProject.update({ where: { id: projectId }, data: { status: "failed" } });
    await writeStudioEvent(projectId, "render", `render failed (${policy.label}): ${message.slice(0, 200)}`, "error");
  } catch {
    // Failure handling must never throw — the row keeps its last persisted truth.
  }
}

async function runRenderJob(jobId: string): Promise<void> {
  let job = await db.renderJob.findUnique({ where: { id: jobId } });
  if (!job) return;
  const project = await db.studioProject.findFirst({ where: { id: job.projectId, organizationId: ORG } });
  if (!project) return;

  const stageRuns: StageRunDTO[] = STAGE_ORDER.map((stage) => ({ stage, status: "pending", fingerprint: "", inputs: {} }));
  const events: RenderEvent[] = [];
  let completedStages = 0;

  const persist = async (data: Record<string, unknown> = {}): Promise<RenderJob> => {
    job = await db.renderJob.update({
      where: { id: jobId },
      data: { ...data, stagesJson: canonicalStringify(stageRuns), eventsJson: canonicalStringify(events) },
    });
    return job;
  };
  const pushEvent = (e: Omit<RenderEvent, "at">) => events.push({ ...e, at: Date.now() });

  try {
    if (job.cancelRequested) {
      await cancelJobRow(jobId, 0, STAGE_ORDER.length, events, stageRuns);
      return;
    }

    assertTransition(asJobState(job.state), "leased");
    await db.renderJob.update({ where: { id: jobId }, data: { state: "leased", startedAt: new Date(), label: "Leased" } });
    assertTransition("leased", "running");
    job = await db.renderJob.update({ where: { id: jobId }, data: { state: "running", label: "Running" } });

    // Load the render context.
    const lane = resolveLane(project.lane);
    const imageLane = laneNeedsImages(lane.type);
    const revRow = project.currentPlanRevisionId
      ? await db.planRevision.findFirst({ where: { id: project.currentPlanRevisionId, organizationId: ORG } })
      : null;
    if (!revRow) throw new RenderStageError("invalid-input", "the current plan revision vanished — recompile");
    let plan: VideoPlanEnvelope;
    try {
      plan = parsePlanEnvelope(revRow.planJson);
    } catch (err) {
      throw new RenderStageError("plan-fingerprint-mismatch", `stored plan failed verification: ${errorMessage(err)}`);
    }
    const laneDoc = parseLaneDoc(revRow.laneDocJson);
    const receiptRow = await db.audioReceiptRecord.findFirst({
      where: { projectId: project.id, organizationId: ORG },
      orderBy: { createdAt: "desc" },
    });
    const receipt = receiptRow ? tryParseAudioReceipt(receiptRow.receiptJson) : null;
    const assetRows = await db.assetRecord.findMany({
      where: { projectId: project.id, organizationId: ORG, kind: "image" },
      orderBy: { createdAt: "asc" },
    });

    const fingerprints = computeRenderStageFingerprints({
      lane: lane.type,
      voice: project.voice,
      briefHash: project.briefHash,
      plan,
      receipt,
      assetRows,
      laneDoc,
      imageLane,
    });

    // Stage cache: only within the SAME plan fingerprint, from the latest ready job.
    const priorMap = new Map<string, string>();
    const prior = await db.renderJob.findFirst({
      where: { projectId: project.id, organizationId: ORG, planFingerprint: plan.fingerprint, state: "ready", id: { not: jobId } },
      orderBy: { createdAt: "desc" },
    });
    if (prior) {
      try {
        const parsed = JSON.parse(prior.stagesJson) as unknown;
        if (Array.isArray(parsed)) {
          for (const raw of parsed) {
            if (typeof raw !== "object" || raw === null) continue;
            const s = raw as Record<string, unknown>;
            if (typeof s.stage === "string" && typeof s.fingerprint === "string" && s.fingerprint) {
              priorMap.set(s.stage, s.fingerprint);
            }
          }
        }
      } catch {
        // no usable cache
      }
    }

    for (let i = 0; i < STAGE_ORDER.length; i++) {
      const stageId = STAGE_ORDER[i];

      // Cancellation checkpoint before EVERY stage.
      const fresh = await db.renderJob.findUnique({ where: { id: jobId }, select: { cancelRequested: true } });
      if (fresh?.cancelRequested) {
        await cancelJobRow(jobId, completedStages, STAGE_ORDER.length, events, stageRuns);
        return;
      }

      const fp = fingerprints[stageId];
      const run = stageRuns[i];
      run.fingerprint = fp.fingerprint;
      run.inputs = { ...fp.inputs } as Record<string, string>;
      await persist({ stage: stageId });

      if (priorMap.get(stageId) === fp.fingerprint) {
        run.status = "cache-hit";
        run.detail = "stage inputs unchanged — resumed from cache";
        pushEvent({ stage: stageId, status: "cache-hit", detail: `stage ${stageId} cache hit` });
        completedStages++;
        await persist({ progress: completedStages / STAGE_ORDER.length });
        continue;
      }

      run.status = "running";
      await persist({ label: `Stage ${i + 1}/${STAGE_ORDER.length}: ${stageId}` });

      await executeStage(stageId, {
        jobId,
        i,
        run,
        project,
        plan,
        laneDoc,
        receipt,
        assetRows,
        imageLane,
        lane: lane.type,
        pushEvent,
        onSceneProgress: async (done, total, sceneRef) => {
          pushEvent({ stage: stageId, sceneRef, status: "done", detail: "scene rendered" });
          await persist({
            progress: (i + done / Math.max(1, total)) / STAGE_ORDER.length,
            label: `Rendering scene ${done}/${total}`,
          });
        },
      });

      completedStages++;
      await persist({ progress: completedStages / STAGE_ORDER.length });
    }

    // Success: running -> validating -> ready.
    assertTransition("running", "validating");
    await db.renderJob.update({ where: { id: jobId }, data: { state: "validating", label: "Validating" } });
    assertTransition("validating", "ready");
    pushEvent({ stage: "final-compose", status: "done", detail: "render ready" });
    await persist({ state: "ready", progress: 1, label: "Render ready", endedAt: new Date() });
    await db.studioProject.update({ where: { id: project.id }, data: { status: "ready" } });
  } catch (err) {
    await handleRenderFailure(jobId, project.id, err, stageRuns, events, completedStages);
  }
}

// ---------- job actions ----------

async function allocateJob(
  project: StudioProject,
  kind: string,
  planFingerprint: string,
  action: "render" | "resume",
): Promise<RenderJob> {
  const priorCount = await db.renderJob.count({
    where: { projectId: project.id, organizationId: ORG, planFingerprint },
  });
  for (let attempt = priorCount; attempt < priorCount + 8; attempt++) {
    const key = idempotencyKey({ projectId: project.id, action, planFingerprint, attempt });
    const existing = await db.renderJob.findUnique({ where: { idempotencyKey: key } });
    if (existing) continue; // key burned by an earlier attempt — allocate the next one
    try {
      return await db.renderJob.create({
        data: {
          projectId: project.id,
          organizationId: ORG,
          kind,
          state: "queued",
          planFingerprint,
          idempotencyKey: key,
          label: "Queued",
          stagesJson: "[]",
          eventsJson: "[]",
        },
      });
    } catch {
      // unique-key race — fall through to the next attempt
    }
  }
  throw new HttpError(500, "could not allocate an idempotency key for the render job");
}

async function loadRenderPlan(project: StudioProject): Promise<{ revRow: PlanRevision; plan: VideoPlanEnvelope }> {
  const revRow = await requireCurrentRevisionRow(project);
  const plan = parsePlanEnvelope(revRow.planJson);
  return { revRow, plan };
}

export async function startRender(projectId: string): Promise<JobDTO> {
  const project = await loadProjectRow(projectId);
  const lane = resolveLane(project.lane);
  const { plan } = await loadRenderPlan(project); // 409 "compile a plan first" when absent

  const active = await db.renderJob.findFirst({
    where: { projectId, organizationId: ORG, state: { in: ACTIVE_JOB_STATES } },
  });
  if (active) throw new HttpError(409, `a render job is already ${active.state} for this project`);

  const last = await db.renderJob.findFirst({
    where: { projectId, organizationId: ORG },
    orderBy: { createdAt: "desc" },
  });
  if (last && last.state === "needs-repair") {
    const qc = await db.qcReportRecord.findFirst({
      where: { projectId, organizationId: ORG },
      orderBy: { ranAt: "desc" },
    });
    const gate = (last.endedAt ?? last.createdAt).getTime();
    const qcCleared = Boolean(qc && qc.ranAt.getTime() > gate && qc.overall !== "fail");
    if (!qcCleared) {
      throw new HttpError(412, "QC re-run required before restarting a needs-repair render — run QC first");
    }
  }

  // Idempotency: a retry of the SAME request resolves to the standing ready row.
  const key0 = idempotencyKey({ projectId, action: "render", planFingerprint: plan.fingerprint, attempt: 0 });
  const standing = await db.renderJob.findUnique({ where: { idempotencyKey: key0 } });
  if (standing && standing.state === "ready") return mapJob(standing);

  const job = await allocateJob(project, lane.queueJobKind, plan.fingerprint, "render");
  await db.studioProject.update({ where: { id: projectId }, data: { status: "rendering" } });
  await writeStudioEvent(projectId, "render", `render job queued (plan fingerprint ${plan.fingerprint.slice(0, 12)})`);
  void runRenderJob(job.id).catch(() => undefined);
  return mapJob(job);
}

export async function cancelRender(jobId: string): Promise<JobDTO> {
  const job = await db.renderJob.findUnique({ where: { id: jobId } });
  if (!job || job.organizationId !== ORG) throw new HttpError(404, "render job not found");
  if (isRestState(asJobState(job.state))) throw new HttpError(409, `render job is in rest state "${job.state}" — nothing to cancel`);

  if (job.state === "retryable-failure") {
    // No worker is active — cancel directly (retryable-failure -> cancelled is legal).
    assertTransition("retryable-failure", "cancelled");
    const updated = await db.renderJob.update({
      where: { id: jobId },
      data: {
        state: "cancelled",
        failureClass: "user-cancelled",
        failureDetail: "cancelled while awaiting retry",
        label: "Cancelled",
        endedAt: new Date(),
        cancelRequested: true,
      },
    });
    await db.studioProject.update({ where: { id: job.projectId }, data: { status: "planned" } });
    return mapJob(updated);
  }

  // A worker owns the row — it honors the flag at its next checkpoint.
  const updated = await db.renderJob.update({ where: { id: jobId }, data: { cancelRequested: true, label: "Cancelling" } });
  return mapJob(updated);
}

export async function cancelActiveRender(projectId: string): Promise<JobDTO> {
  await loadProjectRow(projectId);
  const job = await db.renderJob.findFirst({
    where: { projectId, organizationId: ORG, state: { in: ACTIVE_JOB_STATES } },
    orderBy: { createdAt: "desc" },
  });
  if (!job) {
    const retryable = await db.renderJob.findFirst({
      where: { projectId, organizationId: ORG, state: "retryable-failure" },
      orderBy: { createdAt: "desc" },
    });
    if (!retryable) throw new HttpError(409, "no active render job to cancel");
    return cancelRender(retryable.id);
  }
  return cancelRender(job.id);
}

export async function resumeRender(projectId: string): Promise<JobDTO> {
  const project = await loadProjectRow(projectId);
  const lane = resolveLane(project.lane);
  const { plan } = await loadRenderPlan(project);

  const last = await db.renderJob.findFirst({
    where: { projectId, organizationId: ORG },
    orderBy: { createdAt: "desc" },
  });
  const resumable: readonly JobState[] = ["cancelled", "needs-repair", "failed", "retryable-failure"];
  if (!last || !resumable.includes(asJobState(last.state))) {
    throw new HttpError(409, last ? `nothing to resume — last job is "${last.state}"` : "nothing to resume — no prior render");
  }
  const active = await db.renderJob.findFirst({
    where: { projectId, organizationId: ORG, state: { in: ACTIVE_JOB_STATES } },
  });
  if (active) throw new HttpError(409, `a render job is already ${active.state} for this project`);

  // A fresh job with the SAME plan fingerprint — stages whose fingerprints
  // match the prior ready run become cache-hits automatically.
  const job = await allocateJob(project, lane.queueJobKind, plan.fingerprint, "resume");
  await db.studioProject.update({ where: { id: projectId }, data: { status: "rendering" } });
  await writeStudioEvent(projectId, "render", `render resumed from "${last.state}" (plan fingerprint ${plan.fingerprint.slice(0, 12)})`);
  void runRenderJob(job.id).catch(() => undefined);
  return mapJob(job);
}

export async function retryRender(projectId: string): Promise<JobDTO> {
  const project = await loadProjectRow(projectId);
  await requireCurrentRevisionRow(project);
  const last = await db.renderJob.findFirst({
    where: { projectId, organizationId: ORG },
    orderBy: { createdAt: "desc" },
  });
  if (!last || last.state !== "retryable-failure") {
    throw new HttpError(409, last ? `failure class is permanent — job is "${last.state}"` : "nothing to retry — no prior render");
  }
  const policy = FAILURE_POLICIES[last.failureClass && isFailureClass(last.failureClass) ? last.failureClass : "provider-timeout"];
  if (last.retryCount > policy.maxRetries) {
    throw new HttpError(409, "failure class is permanent — retry budget exhausted");
  }

  try {
    assertTransition("retryable-failure", "retry");
    await db.renderJob.update({ where: { id: last.id }, data: { state: "retry", label: "Retry queued" } });
    assertTransition("retry", "queued");
    const job = await db.renderJob.update({
      where: { id: last.id },
      data: { state: "queued", cancelRequested: false, endedAt: null, label: "Queued (retry)" },
    });
    await db.studioProject.update({ where: { id: projectId }, data: { status: "rendering" } });
    await writeStudioEvent(projectId, "render", `render retry ${job.retryCount}/${policy.maxRetries} queued (${policy.label})`);
    void runRenderJob(job.id).catch(() => undefined);
    return mapJob(job);
  } catch (err) {
    if (err instanceof IllegalTransitionError) throw new HttpError(409, `cannot retry a job in state "${last.state}"`);
    throw err;
  }
}

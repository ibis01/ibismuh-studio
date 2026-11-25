// repo.ts — tenant-safe data access for the studio (server-only).
//
// Every query filters organizationId = ORG — the tenant-scoping seam stays
// explicit even in the single-tenant sandbox, so the multi-tenant upgrade
// is a one-constant edit. This module owns the CRUD surface (projects,
// briefs, events) and delegates the expensive work to pipeline.ts (compile,
// assets, narration). The render job machine lives in pipeline.ts too.
//
// THE LAWS: lanes resolve through the registry (never a local string);
// voices validate against the catalog; a brief edit supersedes the plan
// revision (nothing is deleted — history is evidence).

import { db } from "@/lib/ibismuh/tenant-db";
import { canonicalStringify, sha256Hex } from "./canonical";
import { LANE_ORDER, isVideoType, resolveLane, resolveRenderAspect } from "./studio-lanes";
import { VOICES, isVoiceId } from "./studio-catalogs";
import type { BriefSceneInput, StudioBrief } from "./planner-types";
import {
  ACTIVE_JOB_STATES,
  HttpError,
  ORG,
  buildCapabilityFlags,
  loadProjectRow,
  loadCurrentRevisionRow,
  mapAsset,
  mapJob,
  mapPlanRevision,
  mapProjectSummary,
  mapQc,
  mapStudioEvent,
  mapTimingSource,
  parseBriefRow,
  writeStudioEvent,
  type StudioEventLevel,
} from "./dto-mappers";
import { compilePlan, generateAssetsForPlan, generateNarrationReceipt } from "./pipeline";
import type { AudioReceipt } from "./audio-receipt";
import { parseAudioReceipt } from "./audio-receipt";
import type { AssetDTO, PlanRevisionDTO, ProjectState, ProjectSummary, StudioEventDTO } from "./api-dto";

export { ORG, HttpError } from "./dto-mappers";

// ---------- validation helpers ----------

function requireTopic(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpError(400, "topic is required and must be a non-empty string");
  }
  return value.trim();
}

function optionalTrimmed(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, `${field} must be a non-empty string when present`);
  }
  return value.trim();
}

function validateScenesInput(value: unknown): BriefSceneInput[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new HttpError(400, "scenes must be an array of { narration, visualIntent?, caption? }");
  const out: BriefSceneInput[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) throw new HttpError(400, "every scene must be an object");
    const s = raw as Record<string, unknown>;
    if (typeof s.narration !== "string" || !s.narration.trim()) {
      throw new HttpError(400, "every scene needs a non-empty narration");
    }
    const scene: BriefSceneInput = { narration: s.narration.trim() };
    const id = optionalTrimmed(s.id, "scene id");
    if (id) scene.id = id;
    const visualIntent = optionalTrimmed(s.visualIntent, "scene visualIntent");
    if (visualIntent) scene.visualIntent = visualIntent;
    const caption = optionalTrimmed(s.caption, "scene caption");
    if (caption) scene.caption = caption;
    out.push(scene);
  }
  return out;
}

function buildBrief(body: Record<string, unknown>): StudioBrief {
  const brief: StudioBrief = { topic: requireTopic(body.topic) };
  const script = optionalTrimmed(body.script, "script");
  if (script) brief.script = script;
  const scenes = validateScenesInput(body.scenes);
  if (scenes) brief.scenes = scenes;
  const tone = optionalTrimmed(body.tone, "tone");
  if (tone) brief.tone = tone;
  const characterName = optionalTrimmed(body.characterName, "characterName");
  if (characterName) brief.characterName = characterName;
  const characterDescription = optionalTrimmed(body.characterDescription, "characterDescription");
  if (characterDescription) brief.characterDescription = characterDescription;
  return brief;
}

// ---------- create ----------

export async function createProject(body: unknown): Promise<ProjectState> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new HttpError(400, "request body must be a JSON object");
  }
  const b = body as Record<string, unknown>;

  if (typeof b.lane !== "string" || !isVideoType(b.lane)) {
    throw new HttpError(400, `unknown lane "${String(b.lane)}" — valid lanes: ${LANE_ORDER.join(", ")}`);
  }
  const lane = resolveLane(b.lane);
  const topic = requireTopic(b.topic);

  const voice = typeof b.voice === "string" && b.voice ? b.voice : "tongtong";
  if (!isVoiceId(voice)) {
    throw new HttpError(400, `unknown voice "${voice}" — valid voices: ${VOICES.map((v) => v.id).join(", ")}`);
  }
  const aspect = resolveRenderAspect(lane.renderMode, typeof b.aspect === "string" ? b.aspect : null);
  const tone = optionalTrimmed(b.tone, "tone") ?? "informative";
  const title = optionalTrimmed(b.title, "title") ?? topic.slice(0, 80);
  const brief = buildBrief(b);
  const briefHash = sha256Hex(canonicalStringify(brief));

  const row = await db.studioProject.create({
    data: {
      organizationId: ORG,
      title,
      lane: lane.type,
      format: lane.format,
      renderMode: lane.renderMode,
      status: "draft",
      briefJson: canonicalStringify(brief),
      briefHash,
      aspect,
      fps: lane.supportedFps.includes(30) ? 30 : lane.supportedFps[0],
      voice,
      tone,
    },
  });
  await writeStudioEvent(row.id, "project", `project created (lane ${lane.type}, aspect ${aspect}, voice ${voice})`);
  return getProjectState(row.id);
}

// ---------- list ----------

export async function listProjects(): Promise<ProjectSummary[]> {
  const rows = await db.studioProject.findMany({
    where: { organizationId: ORG },
    orderBy: { updatedAt: "desc" },
    include: {
      jobs: { orderBy: { createdAt: "desc" }, take: 1 },
      qcReports: { orderBy: { ranAt: "desc" }, take: 1 },
    },
  });
  const out: ProjectSummary[] = [];
  for (const row of rows) {
    const rev = await loadCurrentRevisionRow(row);
    out.push(mapProjectSummary(row, rev, row.jobs[0] ?? null, row.qcReports[0] ?? null));
  }
  return out;
}

// ---------- full state ----------

export async function getProjectState(id: string): Promise<ProjectState> {
  const row = await loadProjectRow(id);
  const lane = resolveLane(row.lane);
  const brief = parseBriefRow(row.briefJson);

  let planRevision: PlanRevisionDTO | null = null;
  const revRow = await loadCurrentRevisionRow(row);
  if (revRow) {
    try {
      planRevision = mapPlanRevision(revRow);
    } catch {
      // Corruption never 500s the state read — it is DECLARED and logged.
      await writeStudioEvent(id, "plan", "stored plan revision failed verification — recompile required", "warn");
      planRevision = null;
    }
  }

  const assetRows = await db.assetRecord.findMany({
    where: { projectId: id, organizationId: ORG },
    orderBy: { createdAt: "asc" },
  });

  const receiptRow = await db.audioReceiptRecord.findFirst({
    where: { projectId: id, organizationId: ORG },
    orderBy: { createdAt: "desc" },
  });
  let audioReceipt: AudioReceipt | null = null;
  if (receiptRow) {
    try {
      audioReceipt = parseAudioReceipt(receiptRow.receiptJson);
    } catch {
      audioReceipt = null;
    }
  }

  const jobRow = await db.renderJob.findFirst({ where: { projectId: id, organizationId: ORG }, orderBy: { createdAt: "desc" } });
  const qcRow = await db.qcReportRecord.findFirst({ where: { projectId: id, organizationId: ORG }, orderBy: { ranAt: "desc" } });
  const eventRows = await db.studioEvent.findMany({
    where: { projectId: id, organizationId: ORG },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  const summary = mapProjectSummary(row, revRow, jobRow, qcRow);

  return {
    project: summary,
    brief,
    planRevision,
    assets: assetRows.map(mapAsset),
    audioReceipt,
    narrationAssetId: receiptRow?.narrationAssetId ?? null,
    timingSource: planRevision ? mapTimingSource(planRevision.plan, audioReceipt) : null,
    job: jobRow ? mapJob(jobRow) : null,
    qc: qcRow ? mapQc(qcRow) : null,
    events: eventRows.map(mapStudioEvent),
    capabilities: buildCapabilityFlags(),
    fallbackPolicy: lane.fallbackPolicy,
  };
}

// ---------- update ----------

export async function updateProject(id: string, patch: unknown): Promise<ProjectState> {
  const row = await loadProjectRow(id);
  const lane = resolveLane(row.lane);
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    throw new HttpError(400, "request body must be a JSON object");
  }
  const p = patch as Record<string, unknown>;

  const active = await db.renderJob.findFirst({
    where: { projectId: id, organizationId: ORG, state: { in: ACTIVE_JOB_STATES } },
  });
  if (active) throw new HttpError(409, "cannot edit the project while a render job is active");

  let title = row.title;
  if (p.title !== undefined) title = optionalTrimmed(p.title, "title") ?? title;

  let aspect = row.aspect;
  if (p.aspect !== undefined) {
    if (p.aspect !== "16:9" && p.aspect !== "9:16" && p.aspect !== "1:1") {
      throw new HttpError(400, "aspect must be one of 16:9, 9:16, 1:1");
    }
    aspect = resolveRenderAspect(lane.renderMode, p.aspect); // slides pin 9:16
  }

  let voice = row.voice;
  if (p.voice !== undefined) {
    if (typeof p.voice !== "string" || !isVoiceId(p.voice)) {
      throw new HttpError(400, `unknown voice "${String(p.voice)}" — valid voices: ${VOICES.map((v) => v.id).join(", ")}`);
    }
    voice = p.voice;
  }

  // Brief merge — only provided fields change; undefined keys stay untouched.
  const currentBrief = parseBriefRow(row.briefJson);
  let nextBrief = currentBrief;
  let briefChanged = false;
  if (p.brief !== undefined) {
    if (typeof p.brief !== "object" || p.brief === null || Array.isArray(p.brief)) {
      throw new HttpError(400, "brief must be an object");
    }
    const bp = p.brief as Record<string, unknown>;
    nextBrief = { ...currentBrief };
    if (bp.topic !== undefined) nextBrief.topic = requireTopic(bp.topic);
    if (bp.script !== undefined) {
      const script = typeof bp.script === "string" ? bp.script.trim() : "";
      if (script) nextBrief.script = script;
      else delete nextBrief.script;
    }
    if (bp.scenes !== undefined) {
      const scenes = validateScenesInput(bp.scenes) ?? [];
      if (scenes.length > 0) nextBrief.scenes = scenes;
      else delete nextBrief.scenes;
    }
    if (bp.tone !== undefined) {
      const tone = optionalTrimmed(bp.tone, "brief.tone");
      if (tone) nextBrief.tone = tone;
      else delete nextBrief.tone;
    }
    if (bp.characterName !== undefined) {
      const name = optionalTrimmed(bp.characterName, "brief.characterName");
      if (name) nextBrief.characterName = name;
      else delete nextBrief.characterName;
    }
    if (bp.characterDescription !== undefined) {
      const desc = optionalTrimmed(bp.characterDescription, "brief.characterDescription");
      if (desc) nextBrief.characterDescription = desc;
      else delete nextBrief.characterDescription;
    }
    briefChanged = canonicalStringify(nextBrief) !== row.briefJson;
  }

  // The plan envelope binds aspect, fps, and voice — a geometry/voice edit
  // invalidates it exactly like a brief edit does.
  const geometryChanged = aspect !== row.aspect || voice !== row.voice;
  const invalidated = briefChanged || geometryChanged;
  const hadRevision = Boolean(row.currentPlanRevisionId);
  const revisionToSupersede = row.currentPlanRevisionId;

  const briefJson = canonicalStringify(nextBrief);
  const briefHash = sha256Hex(briefJson);
  await db.studioProject.update({
    where: { id },
    data: {
      title,
      aspect,
      voice,
      briefJson,
      briefHash,
      ...(invalidated && hadRevision ? { currentPlanRevisionId: null, status: "planned" } : {}),
    },
  });

  if (invalidated && hadRevision) {
    await db.planRevision.updateMany({
      where: { projectId: id, organizationId: ORG, id: revisionToSupersede ?? "", status: { not: "superseded" } },
      data: { status: "superseded" },
    });
    await writeStudioEvent(
      id,
      "brief",
      `project edited (${[briefChanged ? "brief" : null, geometryChanged ? "aspect/voice" : null].filter(Boolean).join(" + ")}) — plan superseded; recompile required`,
      "warn",
    );
  } else {
    await writeStudioEvent(id, "brief", "project updated");
  }

  return getProjectState(id);
}

// ---------- pipeline delegation ----------

export async function createPlanRevision(projectId: string): Promise<PlanRevisionDTO> {
  return compilePlan(projectId);
}

export async function generateAssets(projectId: string): Promise<AssetDTO[]> {
  return generateAssetsForPlan(projectId);
}

export async function generateNarration(
  projectId: string,
): Promise<{ audioReceipt: AudioReceipt; planRevision: PlanRevisionDTO; narrationAssetId: string }> {
  return generateNarrationReceipt(projectId);
}

export async function getCurrentPlanRevision(projectId: string): Promise<PlanRevisionDTO | null> {
  const row = await loadProjectRow(projectId);
  const rev = await loadCurrentRevisionRow(row);
  return rev ? mapPlanRevision(rev) : null;
}

// ---------- events ----------

export async function recordEvent(
  projectId: string,
  stage: string,
  message: string,
  level: StudioEventLevel = "info",
  sceneRef?: string,
): Promise<StudioEventDTO> {
  await loadProjectRow(projectId); // 404 on unknown project — events never write across tenants
  await writeStudioEvent(projectId, stage, message, level, sceneRef);
  const row = await db.studioEvent.findFirst({
    where: { projectId, organizationId: ORG, stage, message },
    orderBy: { createdAt: "desc" },
  });
  return row
    ? mapStudioEvent(row)
    : { id: "", at: new Date().toISOString(), stage, sceneRef: sceneRef ?? null, level, message };
}

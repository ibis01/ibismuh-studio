// dto-mappers.ts — shared row→DTO mappers + the platform truth seam.
//
// Every wire shape the studio serves is assembled HERE from Prisma rows so
// the routes and the repo cannot drift apart on field names, ISO date
// formatting, or capability truth. Also hosts the small shared server
// helpers (tenant seam, HttpError, JSON body reading, storage paths) that
// repo/pipeline/qc-engine/routes all need — keeping them in one cycle-free
// module instead of three files importing each other.
//
// Server-only: reads Prisma rows and verifies plan envelopes (canonical.ts).

import { NextResponse } from "next/server";
import { resolve as pathResolve } from "node:path";
import type {
  AssetRecord,
  PlanRevision,
  QcReportRecord,
  RenderJob,
  StudioEvent,
  StudioProject,
} from "@prisma/client";
import type { PlanAspect, VideoPlanEnvelope } from "./plan-envelope";
import { parsePlanEnvelope } from "./plan-envelope";
import type { AudioReceipt } from "./audio-receipt";
import { parseAudioReceipt, resolveTimingSource } from "./audio-receipt";
import type { JobState, RenderEvent } from "./job-status";
import { isFailureClass, isJobState } from "./job-status";
import { isStageId, type StageId } from "./studio-stages";
import type {
  AssetDTO,
  CapabilityFlag,
  JobDTO,
  PlanRevisionDTO,
  ProjectStatus,
  ProjectSummary,
  QcCheck,
  QcDTO,
  StageRunDTO,
  StudioEventDTO,
} from "./api-dto";
import type { PlannerOutput, StudioBrief } from "./planner-types";
import { isVideoType } from "./studio-lanes";
import { db } from "@/lib/ibismuh/tenant-db";

/**
 * The tenant-scoping seam. Single-tenant sandbox today; every query filters
 * organizationId = ORG so the multi-tenant upgrade is a one-constant edit.
 */
export const ORG = "local";

// ---------- errors + request reading ----------

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Map any thrown error to an HTTP response — HttpError carries its status,
 *  everything else fails closed as a 500 with the message (no secrets). */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message, ...(err.detail ? { detail: err.detail } : {}) }, { status: err.status });
  }
  return NextResponse.json({ error: "internal error", detail: errorMessage(err).slice(0, 300) }, { status: 500 });
}

export async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    throw new HttpError(400, "request body must be JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new HttpError(400, "request body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

// ---------- events (shared by repo, pipeline, qc-engine — no import cycles) ----------

export type StudioEventLevel = "info" | "warn" | "error";

export async function writeStudioEvent(
  projectId: string,
  stage: string,
  message: string,
  level: StudioEventLevel = "info",
  sceneRef?: string,
): Promise<void> {
  await db.studioEvent.create({
    data: { projectId, organizationId: ORG, stage, sceneRef: sceneRef ?? null, level, message },
  });
}

// ---------- row loaders (tenant-scoped, fail-closed) ----------

export async function loadProjectRow(projectId: string): Promise<StudioProject> {
  const row = await db.studioProject.findFirst({ where: { id: projectId, organizationId: ORG } });
  if (!row) throw new HttpError(404, "project not found");
  return row;
}

export async function loadCurrentRevisionRow(project: StudioProject): Promise<PlanRevision | null> {
  if (!project.currentPlanRevisionId) return null;
  return db.planRevision.findFirst({
    where: { id: project.currentPlanRevisionId, projectId: project.id, organizationId: ORG },
  });
}

export async function requireCurrentRevisionRow(project: StudioProject): Promise<PlanRevision> {
  const row = await loadCurrentRevisionRow(project);
  if (!row) throw new HttpError(409, "compile a plan first — no current plan revision");
  return row;
}

// ---------- storage paths ----------

/** Every asset byte lives under db/assets/<projectId>/<assetId>.<ext>. */
export const ASSETS_ROOT = "./db/assets";

/** Resolve a storage key under the assets root, refusing traversal. */
export function safeAssetPath(storageKey: string): string {
  const root = pathResolve(ASSETS_ROOT);
  const resolved = pathResolve(ASSETS_ROOT, storageKey);
  if (resolved !== root && !resolved.startsWith(root + "/")) {
    throw new HttpError(400, "storage key escapes the assets root");
  }
  return resolved;
}

// ---------- document parsing (stored JSON → typed docs, fail-closed) ----------

const LLM_PASSES = ["full", "partial", "skipped"] as const;

/** Parse a stored PlannerOutput lane document. Light shape validation — the
 *  planner is in-process, but a corrupted row must not poison the pipeline. */
export function parseLaneDoc(text: string): PlannerOutput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(500, "stored lane document is not valid JSON — recompile the plan");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new HttpError(500, "stored lane document is not an object — recompile the plan");
  }
  const d = parsed as Record<string, unknown>;
  if (!Array.isArray(d.scenes)) throw new HttpError(500, "stored lane document has no scenes array — recompile the plan");
  for (const raw of d.scenes) {
    if (typeof raw !== "object" || raw === null) {
      throw new HttpError(500, "stored lane document has a malformed scene — recompile the plan");
    }
    const s = raw as Record<string, unknown>;
    if (typeof s.id !== "string" || typeof s.narration !== "string" || typeof s.visualIntent !== "string") {
      throw new HttpError(500, "stored lane document has a scene missing id/narration/visualIntent — recompile the plan");
    }
  }
  if (typeof d.fallback !== "object" || d.fallback === null) {
    throw new HttpError(500, "stored lane document has no declared fallback — recompile the plan");
  }
  if (typeof d.plannerMeta !== "object" || d.plannerMeta === null) {
    throw new HttpError(500, "stored lane document has no plannerMeta — recompile the plan");
  }
  const meta = d.plannerMeta as Record<string, unknown>;
  if (typeof meta.planner !== "string" || !LLM_PASSES.includes(meta.llmPass as (typeof LLM_PASSES)[number])) {
    throw new HttpError(500, "stored lane document plannerMeta is malformed — recompile the plan");
  }
  return parsed as unknown as PlannerOutput;
}

export function parseBriefRow(text: string): StudioBrief {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(500, "stored brief is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null) throw new HttpError(500, "stored brief is not an object");
  const brief = parsed as Record<string, unknown>;
  if (typeof brief.topic !== "string") throw new HttpError(500, "stored brief is missing its topic");
  return parsed as unknown as StudioBrief;
}

export function tryParseAudioReceipt(text: string): AudioReceipt | null {
  try {
    return parseAudioReceipt(text);
  } catch {
    return null;
  }
}

export function tryParsePlanEnvelope(text: string): VideoPlanEnvelope | null {
  try {
    return parsePlanEnvelope(text);
  } catch {
    return null;
  }
}

// ---------- vocabulary coercions (fail closed) ----------

const PROJECT_STATUSES: readonly ProjectStatus[] = [
  "draft",
  "planned",
  "assets-ready",
  "narration-ready",
  "rendering",
  "ready",
  "needs-repair",
  "failed",
];

export function asProjectStatus(v: string): ProjectStatus {
  return (PROJECT_STATUSES as readonly string[]).includes(v) ? (v as ProjectStatus) : "draft";
}

export function asAspect(v: string): PlanAspect {
  if (v === "16:9" || v === "9:16" || v === "1:1") return v;
  throw new HttpError(500, `stored aspect "${v}" is not a declared aspect`);
}

/** Coerce a stored job state column to the closed JobState union (fail closed). */
export function asJobState(v: string): JobState {
  if (isJobState(v)) return v;
  throw new HttpError(500, `stored job state "${v}" is not a declared job state`);
}

/** Job states in which a worker owns (or is about to own) the row. */
export const ACTIVE_JOB_STATES: JobState[] = ["queued", "leased", "running", "validating", "retry"];

const STAGE_RUN_STATUSES = ["pending", "running", "cache-hit", "done", "skipped", "failed"] as const;
const RENDER_EVENT_STATUSES = ["start", "cache-hit", "done", "skipped", "failed"] as const;

// ---------- mappers ----------

function planDurationMs(planJson: string): number | null {
  const plan = tryParsePlanEnvelope(planJson);
  if (!plan || plan.beats.length === 0) return null;
  return Math.max(...plan.beats.map((b) => b.narrationWindow.endMs));
}

export function mapProjectSummary(
  row: StudioProject,
  rev: PlanRevision | null,
  job: RenderJob | null,
  qc: QcReportRecord | null,
): ProjectSummary {
  if (!isVideoType(row.lane)) {
    throw new HttpError(500, `stored project "${row.id}" carries unknown lane "${row.lane}"`);
  }
  return {
    id: row.id,
    title: row.title,
    lane: row.lane,
    status: asProjectStatus(row.status),
    aspect: asAspect(row.aspect),
    fps: row.fps,
    voice: row.voice,
    planRevision: rev?.revision ?? null,
    planFingerprint: rev?.fingerprint ?? null,
    renderState: job && isJobState(job.state) ? job.state : null,
    qcOverall: qc && (qc.overall === "pass" || qc.overall === "warn" || qc.overall === "fail") ? qc.overall : null,
    durationMs: rev ? planDurationMs(rev.planJson) : null,
    updatedAt: row.updatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function asSourceKind(v: string): AssetDTO["sourceKind"] {
  const kinds = ["generated", "uploaded", "stock", "builtin", "reused"];
  return (kinds as readonly string[]).includes(v) ? (v as AssetDTO["sourceKind"]) : "generated";
}

export function mapAsset(row: AssetRecord): AssetDTO {
  return {
    id: row.id,
    assetId: row.assetId,
    kind: row.kind === "audio" ? "audio" : "image",
    sourceKind: asSourceKind(row.sourceKind),
    provider: row.provider ?? null,
    // The API path that serves the bytes — never a raw storage key.
    url: `/api/assets/${row.id}`,
    contentHash: row.contentHash,
    width: row.width ?? null,
    height: row.height ?? null,
    durationMs: row.durationMs ?? null,
    license: row.license,
    sceneRef: row.sceneRef ?? null,
    bytes: row.bytes,
    createdAt: row.createdAt.toISOString(),
  };
}

function parseStages(text: string): StageRunDTO[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: StageRunDTO[] = [];
  for (const raw of parsed) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    if (!isStageId(String(r.stage))) continue;
    const status = String(r.status);
    if (!(STAGE_RUN_STATUSES as readonly string[]).includes(status)) continue;
    const inputs: Record<string, string> = {};
    if (typeof r.inputs === "object" && r.inputs !== null) {
      for (const [k, v] of Object.entries(r.inputs as Record<string, unknown>)) {
        if (typeof v === "string") inputs[k] = v;
      }
    }
    out.push({
      stage: r.stage as StageId,
      status: status as StageRunDTO["status"],
      fingerprint: typeof r.fingerprint === "string" ? r.fingerprint : "",
      inputs,
      ...(typeof r.detail === "string" ? { detail: r.detail } : {}),
    });
  }
  return out;
}

function parseEvents(text: string): RenderEvent[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: RenderEvent[] = [];
  for (const raw of parsed) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const status = String(r.status);
    if (!(RENDER_EVENT_STATUSES as readonly string[]).includes(status)) continue;
    out.push({
      at: typeof r.at === "number" && Number.isFinite(r.at) ? r.at : 0,
      stage: typeof r.stage === "string" ? r.stage : "render",
      status: status as RenderEvent["status"],
      ...(typeof r.sceneRef === "string" ? { sceneRef: r.sceneRef } : {}),
      ...(typeof r.failureClass === "string" && isFailureClass(r.failureClass) ? { failureClass: r.failureClass } : {}),
      ...(typeof r.detail === "string" ? { detail: r.detail } : {}),
    });
  }
  return out;
}

export function mapJob(row: RenderJob): JobDTO {
  return {
    id: row.id,
    state: isJobState(row.state) ? row.state : "failed",
    stage: row.stage && isStageId(row.stage) ? row.stage : null,
    progress: row.progress,
    label: row.label ?? null,
    failureClass: row.failureClass && isFailureClass(row.failureClass) ? row.failureClass : null,
    failureDetail: row.failureDetail ?? null,
    planFingerprint: row.planFingerprint ?? null,
    stages: parseStages(row.stagesJson),
    events: parseEvents(row.eventsJson),
    cancelRequested: row.cancelRequested,
    retryCount: row.retryCount,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
  };
}

function parseChecks(text: string): QcCheck[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: QcCheck[] = [];
  for (const raw of parsed) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.message !== "string") continue;
    const severity = r.severity === "warn" || r.severity === "fail" ? r.severity : "info";
    out.push({
      id: r.id,
      title: typeof r.title === "string" ? r.title : r.id,
      severity,
      pass: r.pass === true,
      message: r.message,
      ...(typeof r.sceneRef === "string" ? { sceneRef: r.sceneRef } : {}),
    });
  }
  return out;
}

export function mapQc(row: QcReportRecord): QcDTO {
  return {
    overall: row.overall === "fail" ? "fail" : row.overall === "warn" ? "warn" : "pass",
    qcProfile: row.qcProfile,
    planFingerprint: row.planFingerprint ?? null,
    checks: parseChecks(row.checksJson),
    ranAt: row.ranAt.toISOString(),
  };
}

export function mapStudioEvent(row: StudioEvent): StudioEventDTO {
  const level = row.level === "warn" ? "warn" : row.level === "error" ? "error" : "info";
  return {
    id: row.id,
    at: row.createdAt.toISOString(),
    stage: row.stage,
    sceneRef: row.sceneRef ?? null,
    level,
    message: row.message,
  };
}

export function mapPlanRevision(row: PlanRevision): PlanRevisionDTO {
  if (!isVideoType(row.lane)) throw new HttpError(500, "stored plan revision carries an unknown lane");
  const plan = parsePlanEnvelope(row.planJson); // throws on corruption — callers decide the fallback
  const doc = parseLaneDoc(row.laneDocJson);
  return {
    id: row.id,
    revision: row.revision,
    parentRevision: row.parentRevision ?? null,
    status: row.status === "approved" ? "approved" : row.status === "superseded" ? "superseded" : "draft",
    lane: row.lane,
    schemaVersion: row.schemaVersion,
    fingerprint: row.fingerprint,
    briefHash: row.briefHash,
    createdAt: row.createdAt.toISOString(),
    plan,
    laneScenes: doc.scenes,
    storyBible: doc.storyBible ?? null,
    continuity: doc.continuity ?? [],
    plannerMeta: {
      planner: doc.plannerMeta.planner,
      llmPass: doc.plannerMeta.llmPass,
      ...(doc.plannerMeta.note ? { note: doc.plannerMeta.note } : {}),
      // WS7 — the beat receipts ride through additively (typed rows only;
      // a malformed row never blocks the DTO — the receipt is observability,
      // not load-bearing data).
      ...(Array.isArray((doc.plannerMeta as { beats?: unknown }).beats)
        ? {
            beats: ((doc.plannerMeta as { beats: unknown[] }).beats).filter(
              (row): row is NonNullable<PlannerOutput["plannerMeta"]["beats"]>[number] =>
                typeof row === "object" &&
                row !== null &&
                typeof (row as { sceneId?: unknown }).sceneId === "string" &&
                typeof (row as { concept?: unknown }).concept === "string" &&
                typeof (row as { reason?: unknown }).reason === "string",
            ),
          }
        : {}),
    },
  };
}

// ---------- capability truth + timing-source display ----------

/**
 * Platform-level capability truth (per-project measured audio rides on the
 * audioReceipt field). Honest: what the sandbox cannot do, it says so.
 */
export function buildCapabilityFlags(): CapabilityFlag[] {
  return [
    { id: "image-provider", available: true, detail: "zai image provider attached" },
    { id: "voice-provider", available: true, detail: "zai tts provider attached (cogtts)" },
    { id: "measured-audio", available: true, detail: "sentence-level audio receipts measured from synthesized narration" },
    { id: "word-anchors", available: false, detail: "ASR word timestamps not available — sentence-level receipt" },
    { id: "native-rig", available: false, detail: "rig library not attached" },
    { id: "chromium-engine", available: false, detail: "sandbox preview compositor (browser canvas)" },
    { id: "ffmpeg-compositor", available: false, detail: "sandbox: export via browser capture (WebM)" },
    { id: "image-free-render", available: true, detail: "whiteboard / graphics2d / slides render without generated art" },
  ];
}

export function mapTimingSource(
  plan: VideoPlanEnvelope,
  receipt: AudioReceipt | null,
): { source: string; reason: string } {
  const decision = resolveTimingSource({
    manualEditedTiming: plan.narration.source === "manual",
    audioReceipt: receipt,
    allowEstimate: true,
  });
  return { source: decision.source, reason: decision.reason };
}

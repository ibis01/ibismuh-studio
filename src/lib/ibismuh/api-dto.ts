// api-dto.ts — THE API CONTRACT (master plan §6.1 — the shell reads these).
//
// The single source of truth for every wire shape the studio UI consumes.
// Backend routes and frontend components both import from here — a field
// rename breaks the build, not the product. All routes live under
// /api/projects (single-page studio; no page routes).

import type { VideoType } from "./studio-lanes";
import type { VideoPlanEnvelope } from "./plan-envelope";
import type { AudioReceipt } from "./audio-receipt";
import type { LaneScene, StudioBrief, ContinuityIssue, StoryBible } from "./planner-types";
import type { FailureClass, JobState, RenderEvent } from "./job-status";
import type { StageId } from "./studio-stages";

// ---------- project ----------

export type ProjectStatus =
  | "draft"
  | "planned"
  | "assets-ready"
  | "narration-ready"
  | "rendering"
  | "ready"
  | "needs-repair"
  | "failed";

export interface ProjectSummary {
  id: string;
  title: string;
  lane: VideoType;
  status: ProjectStatus;
  aspect: "16:9" | "9:16" | "1:1";
  fps: number;
  voice: string;
  planRevision: number | null;
  planFingerprint: string | null;
  renderState: JobState | null;
  qcOverall: "pass" | "warn" | "fail" | null;
  durationMs: number | null;
  updatedAt: string;
  createdAt: string;
}

export interface PlanRevisionDTO {
  id: string;
  revision: number;
  parentRevision: number | null;
  status: "draft" | "approved" | "superseded";
  lane: VideoType;
  schemaVersion: number;
  fingerprint: string;
  briefHash: string;
  createdAt: string;
  /** The full verified envelope (server parses + fingerprint-checks before responding). */
  plan: VideoPlanEnvelope;
  /** The lane document the planner produced (scenes, story bible, continuity). */
  laneScenes: LaneScene[];
  storyBible: StoryBible | null;
  continuity: ContinuityIssue[];
  plannerMeta: { planner: string; llmPass: string; note?: string };
}

// ---------- assets ----------

export interface AssetDTO {
  id: string;
  assetId: string;
  kind: "image" | "audio";
  sourceKind: "generated" | "uploaded" | "stock" | "builtin" | "reused";
  provider: string | null;
  /** The API path that serves the bytes (never a raw storage key to the browser). */
  url: string;
  contentHash: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  license: string;
  sceneRef: string | null;
  bytes: number;
  createdAt: string;
}

// ---------- render job ----------

export type StageRunStatus = "pending" | "running" | "cache-hit" | "done" | "skipped" | "failed";

export interface StageRunDTO {
  stage: StageId;
  status: StageRunStatus;
  fingerprint: string;
  /** What the stage declared as its inputs (operator-facing). */
  inputs: Record<string, string>;
  detail?: string;
}

export interface JobDTO {
  id: string;
  state: JobState;
  stage: StageId | null;
  progress: number;
  label: string | null;
  failureClass: FailureClass | null;
  failureDetail: string | null;
  planFingerprint: string | null;
  stages: StageRunDTO[];
  events: RenderEvent[];
  cancelRequested: boolean;
  retryCount: number;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
}

// ---------- QC ----------

export interface QcCheck {
  id: string;
  title: string;
  severity: "info" | "warn" | "fail";
  pass: boolean;
  message: string;
  sceneRef?: string;
}

export interface QcDTO {
  overall: "pass" | "warn" | "fail";
  qcProfile: string;
  planFingerprint: string | null;
  checks: QcCheck[];
  ranAt: string;
}

// ---------- capability truth ----------

export interface CapabilityFlag {
  id: string;
  available: boolean;
  detail: string;
}

// ---------- events ----------

export interface StudioEventDTO {
  id: string;
  at: string;
  stage: string;
  sceneRef: string | null;
  level: "info" | "warn" | "error";
  message: string;
}

// ---------- full state ----------

export interface ProjectState {
  project: ProjectSummary;
  brief: StudioBrief;
  planRevision: PlanRevisionDTO | null;
  assets: AssetDTO[];
  audioReceipt: AudioReceipt | null;
  narrationAssetId: string | null;
  timingSource: { source: string; reason: string } | null;
  job: JobDTO | null;
  qc: QcDTO | null;
  events: StudioEventDTO[];
  capabilities: CapabilityFlag[];
  /** Declared fallback chain text from the lane registry (UI honesty). */
  fallbackPolicy: string;
}

// ---------- request bodies ----------

export interface CreateProjectBody {
  lane: string;
  title?: string;
  topic: string;
  script?: string;
  scenes?: Array<{ id?: string; narration: string; visualIntent?: string; caption?: string }>;
  tone?: string;
  aspect?: "16:9" | "9:16" | "1:1";
  voice?: string;
  characterName?: string;
  characterDescription?: string;
}

export interface UpdateProjectBody {
  title?: string;
  brief?: Partial<StudioBrief>;
  aspect?: "16:9" | "9:16" | "1:1";
  voice?: string;
}

export interface RenderActionBody {
  action: "start" | "cancel" | "resume" | "retry";
}

export interface RepairBody {
  op: string;
  sceneRef?: string;
  instruction: string;
}

export interface ApiError {
  error: string;
  detail?: string;
}

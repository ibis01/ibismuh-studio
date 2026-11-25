"use client";

// api-client.ts — THE single place every studio fetch goes through.
//
// Typed helpers over the /api/projects surface with one error shape:
// non-ok responses are parsed as { error, detail? } and thrown as
// ApiClientError so UI code can toast `title=error, description=detail`
// without re-parsing anywhere else.

import type {
  AssetDTO,
  CreateProjectBody,
  JobDTO,
  PlanRevisionDTO,
  ProjectState,
  ProjectSummary,
  QcDTO,
  RenderActionBody,
  UpdateProjectBody,
} from "@/lib/ibismuh/api-dto";
import type { AudioReceipt } from "@/lib/ibismuh/audio-receipt";

export class ApiClientError extends Error {
  status: number;
  detail?: string;
  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: init?.body ? { "Content-Type": "application/json", ...(init?.headers ?? {}) } : init?.headers,
    });
  } catch (err) {
    throw new ApiClientError(
      err instanceof Error ? `Network error: ${err.message}` : "Network error — the studio API did not answer",
      0,
    );
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let detail: string | undefined;
    try {
      const parsed = (await res.json()) as { error?: string; detail?: string };
      if (parsed?.error) message = parsed.error;
      if (parsed?.detail) detail = parsed.detail;
    } catch {
      // non-JSON error body — keep the status-line message
    }
    throw new ApiClientError(message, res.status, detail);
  }
  return (await res.json()) as T;
}

function jsonBody(body: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(body) };
}

// ---------- projects ----------

/** GET /api/projects — the route returns the bare array; tolerate a
 *  { projects: [...] } wrapper too so either contract shape works. */
export async function listProjects(): Promise<ProjectSummary[]> {
  const data = await request<ProjectSummary[] | { projects: ProjectSummary[] }>("/api/projects");
  return Array.isArray(data) ? data : data.projects;
}

export async function getProject(id: string): Promise<ProjectState> {
  return request<ProjectState>(`/api/projects/${id}`);
}

export async function createProject(body: CreateProjectBody): Promise<ProjectState> {
  return request<ProjectState>("/api/projects", jsonBody(body));
}

export async function updateProject(id: string, body: UpdateProjectBody): Promise<ProjectState> {
  return request<ProjectState>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

// ---------- pipeline actions ----------

export async function compilePlan(id: string): Promise<{ planRevision: PlanRevisionDTO }> {
  return request<{ planRevision: PlanRevisionDTO }>(`/api/projects/${id}/plan`, { method: "POST" });
}

export async function generateAssets(id: string): Promise<{ assets: AssetDTO[]; planRevision: PlanRevisionDTO | null }> {
  return request<{ assets: AssetDTO[]; planRevision: PlanRevisionDTO | null }>(`/api/projects/${id}/assets`, {
    method: "POST",
  });
}

export async function generateNarration(
  id: string,
): Promise<{ audioReceipt: AudioReceipt; planRevision: PlanRevisionDTO | null; narrationAssetId: string | null }> {
  return request<{ audioReceipt: AudioReceipt; planRevision: PlanRevisionDTO | null; narrationAssetId: string | null }>(
    `/api/projects/${id}/narration`,
    { method: "POST" },
  );
}

export async function renderAction(id: string, body: RenderActionBody): Promise<{ job: JobDTO }> {
  return request<{ job: JobDTO }>(`/api/projects/${id}/render`, jsonBody(body));
}

export async function runQc(id: string): Promise<QcDTO> {
  return request<QcDTO>(`/api/projects/${id}/qc`, { method: "POST" });
}

export interface RepairResponse {
  planRevision: PlanRevisionDTO;
  changedScene: string | null;
  affectedAssets: string[];
  invalidatedStages: string[];
}

export async function repairProject(id: string, body: { op: string; sceneRef?: string; instruction: string }): Promise<RepairResponse> {
  return request<RepairResponse>(`/api/projects/${id}/repair`, jsonBody(body));
}

// ---------- exports (downloads) ----------

async function download(path: string, fallbackName: string): Promise<void> {
  const res = await fetch(path);
  if (!res.ok) {
    let message = `Export failed (${res.status})`;
    let detail: string | undefined;
    try {
      const parsed = (await res.json()) as { error?: string; detail?: string };
      if (parsed?.error) message = parsed.error;
      if (parsed?.detail) detail = parsed.detail;
    } catch {
      // keep default message
    }
    throw new ApiClientError(message, res.status, detail);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^";]+)"?/.exec(disposition);
  const name = match?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}

export function exportManifest(id: string): Promise<void> {
  return download(`/api/projects/${id}/export`, `ibismuh-${id}-manifest.json`);
}

export function exportSrt(id: string): Promise<void> {
  return download(`/api/projects/${id}/export?part=srt`, `ibismuh-${id}.srt`);
}

// ---------- assets ----------

export function assetUrl(assetId: string): string {
  return `/api/assets/${assetId}`;
}

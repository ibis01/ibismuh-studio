// /api/projects/:id/export — export the render manifest (default JSON
// attachment) or the SRT captions (?part=srt, plain text attachment).
//
// The manifest carries the full verified plan envelope, a lane-doc summary,
// the asset list, the audio receipt, the declared timing source, the latest
// QC report, and the lane registry contract summary — everything a renderer
// or downstream tool needs, with provenance intact.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/ibismuh/tenant-db";
import { parsePlanEnvelope, type VideoPlanEnvelope } from "@/lib/ibismuh/plan-envelope";
import { RENDERER_VERSION, type PlannerOutput } from "@/lib/ibismuh/planner-types";
import { resolveLane } from "@/lib/ibismuh/studio-lanes";
import {
  orgId,
  errorResponse,
  loadProjectRow,
  mapAsset,
  mapQc,
  mapTimingSource,
  parseLaneDoc,
  requireCurrentRevisionRow,
  tryParseAudioReceipt,
} from "@/lib/ibismuh/dto-mappers";
import { requireUser } from "@/lib/ibismuh/tenant";

export const dynamic = "force-dynamic";

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

function srtTimestamp(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor((total % 3_600_000) / 60_000);
  const s = Math.floor((total % 60_000) / 1000);
  const rest = total % 1000;
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(rest, 3)}`;
}

/** Sequential caption windows from the plan beats + lane-doc captions. */
function buildSrt(plan: VideoPlanEnvelope, laneDoc: PlannerOutput): string {
  const sceneById = new Map(laneDoc.scenes.map((s) => [s.id, s]));
  const blocks: string[] = [];
  let index = 0;
  for (const beat of plan.beats) {
    const scene = beat.sceneRef ? sceneById.get(beat.sceneRef) : undefined;
    const text = (scene?.caption || scene?.narration || beat.visualIntent).trim();
    if (!text) continue;
    index++;
    const start = beat.narrationWindow.startMs;
    const end = Math.max(beat.narrationWindow.endMs, start + 1);
    blocks.push(`${index}\n${srtTimestamp(start)} --> ${srtTimestamp(end)}\n${text}`);
  }
  return blocks.length ? blocks.join("\n\n") + "\n" : "";
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  // The audit's F-2: the projects/assets lane admits through the SAME gate
  // every content lane uses — signature-only middleware checks never
  // replace the route-level guard (revoked sessions, bearers of any org,
  // and the shared rate limiter all live here).
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  auth.enter(); // tenant scope: orgId() + the tenant-db query guard

  try {
    const { id } = await params;
    const project = await loadProjectRow(id);
    const lane = resolveLane(project.lane);
    const revRow = await requireCurrentRevisionRow(project);
    const plan = parsePlanEnvelope(revRow.planJson);
    const laneDoc = parseLaneDoc(revRow.laneDocJson);

    const assetRows = await db.assetRecord.findMany({
      where: { projectId: id, organizationId: orgId() },
      orderBy: { createdAt: "asc" },
    });
    const receiptRow = await db.audioReceiptRecord.findFirst({
      where: { projectId: id, organizationId: orgId() },
      orderBy: { createdAt: "desc" },
    });
    const receipt = receiptRow ? tryParseAudioReceipt(receiptRow.receiptJson) : null;
    const qcRow = await db.qcReportRecord.findFirst({
      where: { projectId: id, organizationId: orgId() },
      orderBy: { ranAt: "desc" },
    });
    const timingSource = mapTimingSource(plan, receipt);

    const srt = buildSrt(plan, laneDoc);

    const part = new URL(req.url).searchParams.get("part");
    if (part === "srt") {
      return new NextResponse(srt, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="ibismuh-${id}.srt"`,
        },
      });
    }

    const manifest = {
      plan,
      laneDoc: {
        sceneCount: laneDoc.scenes.length,
        planner: laneDoc.plannerMeta.planner,
        llmPass: laneDoc.plannerMeta.llmPass,
      },
      assets: assetRows.map(mapAsset),
      audioReceipt: receipt,
      timingSource,
      qc: qcRow ? mapQc(qcRow) : null,
      rendererVersion: RENDERER_VERSION,
      exportedAt: new Date().toISOString(),
      lane: {
        type: lane.type,
        format: lane.format,
        renderMode: lane.renderMode,
        qcProfile: lane.qcProfile,
        fallbackPolicy: lane.fallbackPolicy,
      },
    };
    return new NextResponse(JSON.stringify({ manifest, srt }, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="ibismuh-${id}-manifest.json"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

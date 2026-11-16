import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { db } from "@/lib/tubeforge/tenant-db";
import { requireUser } from "@/lib/tubeforge/tenant";
import { parseScenes } from "@/lib/tubeforge/story";
import { clearStock, readStockKeys } from "@/lib/tubeforge/stock";
import { runStockRefresh } from "@/lib/tubeforge/queue-handlers";
import {
  startJob,
  isJobRunning,
  lastJobError,
  jobProgress,
  jobFleetStatus,
} from "@/lib/tubeforge/jobs";

type Ctx = { params: Promise<{ id: string }> };

import { scratchDir, remove } from "@/lib/tubeforge/storage";

/** Renders become stale when the visual track changes.
 *  Storage seam (T-3.7): outputs die through the driver (s3-safe). */
async function invalidateRenders(videoId: string) {
  for (const f of ["final.mp4", "preview.mp4"]) {
    await remove(`${videoId}/${f}`).catch(() => {});
    fs.rmSync(path.join(scratchDir(videoId), f), { force: true });
  }
}

/** GET — stock status for the video (per-scene refs live on the scenes). */
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  auth.enter(); // tenant scope: handler + spawned job closures

  const { id } = await ctx.params;
  const video = await db.video.findUnique({ where: { id } });
  if (!video)
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  if (video.format !== "story")
    return NextResponse.json({ error: "Not a scene-based video" }, { status: 400 });

  const scenes = parseScenes(video.scenes);
  const keys = await readStockKeys();

  // S151 — fleet truth: the stock POST and this poll may land on different
  // serverless instances (same wound as the storyboard GET).
  const fleet = await jobFleetStatus(id, "stock");
  // S4 per-scene flags — now fleet-aware too: ONE grouped query over the
  // composite entityIds (the [entityId, kind] index carries it); the newest
  // row per scene is the truth.
  const stockSceneRows = await db.job.findMany({
    where: { entityId: { startsWith: `${id}#scene` }, kind: "stock" },
    orderBy: { createdAt: "desc" },
    select: { entityId: true, status: true },
  });
  const activeStockScenes = new Set<number>();
  for (const row of stockSceneRows) {
    const idx = Number(row.entityId.slice(row.entityId.lastIndexOf("#scene") + 6));
    if (
      Number.isFinite(idx) &&
      !activeStockScenes.has(idx) &&
      (row.status === "pending" || row.status === "running")
    )
      activeStockScenes.add(idx);
  }

  return NextResponse.json({
    generating: isJobRunning(id, "stock") || fleet.active,
    progress: jobProgress(id, "stock"),
    error: lastJobError(id, "stock") ?? fleet.error,
    matched: scenes.filter((s) => s.stock).length,
    total: scenes.length,
    providersConfigured: {
      pexels: Boolean(keys.pexels),
      pixabay: Boolean(keys.pixabay),
    },
    scenes: scenes.map((s) => ({
      index: s.index,
      hasStock: Boolean(s.stock),
      source: s.stock?.source ?? null,
      query: s.stock?.query ?? null,
      credit: s.stock?.credit ?? null,
      pageUrl: s.stock?.pageUrl ?? null,
      // S89 — provenance + the verification state: "pass" only exists with
      // multi-frame evidence; "unverified" is explicit, never silent.
      license: s.stock?.license ?? null,
      verified: s.stock?.verification?.verdict ?? null,
      verification: s.stock?.verification
        ? {
            framesSampled: s.stock.verification.framesSampled,
            framesPassed: s.stock.verification.framesPassed,
            motionDelta: s.stock.verification.motionDelta,
            summary: s.stock.verification.summary,
          }
        : null,
    })),
    // S4 — per-scene job flags (composite entityIds) so a studio inspector
    // can watch ONE scene's re-pick without polling the binary GET. S151 —
    // fleet truth (durable Job rows), not this instance's registry.
    sceneJobs: Object.fromEntries(
      scenes.map((s) => [
        s.index,
        isJobRunning(`${id}#scene${s.index}`, "stock") || activeStockScenes.has(s.index),
      ])
    ),
  });
}

/**
 * POST — find + download stock footage for scenes that lack a clip (202 job).
 * Body: { force?: boolean } — force re-searches every scene, replacing clips.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  auth.enter(); // tenant scope: handler + spawned job closures

  const { id } = await ctx.params;
  const video = await db.video.findUnique({ where: { id } });
  if (!video)
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  if (video.format !== "story")
    return NextResponse.json(
      { error: "Not a scene-based video — stock b-roll applies to scene-format videos" },
      { status: 400 }
    );

  const scenes = parseScenes(video.scenes);
  if (scenes.length === 0)
    return NextResponse.json(
      { error: "Video has no scenes — generate the scene script first" },
      { status: 400 }
    );

  const keys = await readStockKeys();
  if (!keys.pexels && !keys.pixabay)
    return NextResponse.json(
      { error: "No stock provider configured — add a free Pexels or Pixabay key in Settings → Stock footage" },
      { status: 400 }
    );

  const body = await req.json().catch(() => ({}));
  const force = Boolean(body?.force);

  await db.video.update({ where: { id }, data: { error: null } });

  // Stage 3 (T-3.5): the fetch body lives in queue-handlers.ts (runStockRefresh)
  // so the request path and the durable queue execute the SAME code — a restart
  // resumes from the video row (scenes re-parsed, force=false).
  const accepted = await startJob(
    id,
    "stock",
    () => runStockRefresh(id, { force }),
    { payload: { force } } // survives a crash — the handler re-runs with the same refresh semantics
  );

  return NextResponse.json(
    { accepted, generating: true },
    { status: accepted ? 202 : 200 }
  );
}

/** DELETE — remove every stock clip + ref (storyboard art is untouched). */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  auth.enter(); // tenant scope: handler + spawned job closures

  const { id } = await ctx.params;
  const video = await db.video.findUnique({ where: { id } });
  if (!video)
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  if (video.format !== "story")
    return NextResponse.json({ error: "Not a scene-based video" }, { status: 400 });

  const scenes = parseScenes(video.scenes);
  const cleared = await clearStock(id, scenes);
  await invalidateRenders(id);
  await db.video.update({
    where: { id },
    data: { hasVideo: false, videoDuration: null },
  });
  await db.activity.create({
    data: {
      organizationId: auth.ctx.organizationId,
      userId: auth.ctx.userId,
      videoId: id,
      stage: "stock",
      message: `Stock b-roll cleared — ${cleared} clip${cleared === 1 ? "" : "s"} removed`,
    },
  });

  return NextResponse.json({ cleared });
}

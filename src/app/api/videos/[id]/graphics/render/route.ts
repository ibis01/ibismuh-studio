import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/tubeforge/tenant-db";
import { requireUser } from "@/lib/tubeforge/tenant";
import { isJobRunning, startJob } from "@/lib/tubeforge/jobs";
import { runGraphicsJob } from "@/lib/tubeforge/video-jobs";
import { parseGraphicsProject, validGraphicsId, validateGraphicsDoc } from "@/lib/tubeforge/graphics/types";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST — enqueue a graphics render (the whiteboard render route, mirrored).
 * Body `{ sceneId?: string }` — absent = FULL render (job on the videoId,
 * the standard final.mp4 artifact); present = single-scene DRAFT at the
 * doc's own frame truth scaled to the 0.5× draft raster (job on
 * `<videoId>#gfx<sceneId>`, artifact `graphics/preview-<sceneId>.mp4`,
 * sets `hasPreview` — a labelled NON-REVIEWABLE look that never enters
 * the render assembly and runs no QC battery).
 *
 * Rejects when the doc is missing or invalid with the engine's verbatim
 * errors; the frame-budget wall hits at the job's own pre-flight, where
 * the exact VO-measured math lives.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  auth.enter();

  const { id } = await ctx.params;
  const video = await db.video.findUnique({ where: { id } });
  if (!video)
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  if (video.format !== "story")
    return NextResponse.json({ error: "Not a scene-based video" }, { status: 400 });
  if (video.renderMode !== "graphics")
    return NextResponse.json(
      { error: "Switch this video's render mode to Motion graphics first" },
      { status: 409 }
    );

  // S87 slice 3 — the voiceover interlock, safety parity with the story
  // and whiteboard lanes: this render reads the SAME per-scene WAVs (the
  // VO slots), so a concurrent regen would feed it half-old, half-new
  // narration — the exact hazard both lanes already gate.
  if (isJobRunning(id, "voiceover"))
    return NextResponse.json(
      { error: "The voiceover is still regenerating — wait for it to finish before rendering" },
      { status: 409 }
    );

  const env = parseGraphicsProject(video.graphicsProject);
  if (!env)
    return NextResponse.json(
      { error: "No graphics project yet — scaffold one in the Graphics Studio first" },
      { status: 409 }
    );

  // Same gate the job will apply — refuse BEFORE the queue so the user
  // sees the validator's errors on click, not in a failed job card.
  const { doc, errors } = validateGraphicsDoc(env.doc);
  if (!doc)
    return NextResponse.json(
      { error: "The graphics doc is invalid — fix it in the Studio first", errors },
      { status: 400 }
    );

  const body = await req.json().catch(() => ({}));
  const rawSceneId = (body as Record<string, unknown> | null)?.sceneId;
  let jobKey = id;
  let sceneId: string | null = null;
  if (typeof rawSceneId === "string" && rawSceneId.trim()) {
    sceneId = rawSceneId.trim().slice(0, 64);
    // The composite entity id is the DURABLE encoding — an id that breaks
    // the charset law would corrupt the #gfx split, so it dies here.
    if (!validGraphicsId(sceneId) || sceneId.includes("#"))
      return NextResponse.json({ error: `Illegal graphics scene id "${sceneId}"` }, { status: 400 });
    if (!doc.scenes.some((s) => s.id === sceneId))
      return NextResponse.json({ error: `Scene "${sceneId}" does not exist in this doc` }, { status: 400 });
    jobKey = `${id}#gfx${sceneId}`;
  }

  // Clear any stale error before the job starts (the house convention).
  await db.video.update({ where: { id }, data: { error: null } });

  const accepted = await startJob(
    jobKey,
    "graphics",
    () => runGraphicsJob(jobKey, sceneId ? { sceneId } : {})
  );

  return NextResponse.json(
    { accepted, generating: true, scope: sceneId ? "draft" : "full", sceneId },
    { status: accepted ? 202 : 200 }
  );
}

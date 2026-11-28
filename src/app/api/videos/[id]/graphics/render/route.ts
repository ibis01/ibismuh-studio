import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/ibismuh/tenant-db";
import { requireUser } from "@/lib/ibismuh/tenant";
import { isJobRunning, startJob } from "@/lib/ibismuh/jobs";
import { runGraphicsJob } from "@/lib/ibismuh/video-jobs";
import { videoDir } from "@/lib/ibismuh/ai";
import {
  parseGraphicsDoc,
  validGraphicsId,
} from "@/lib/ibismuh/graphics/types";
import { assertGraphicsBudget } from "@/lib/ibismuh/graphics/preflight";
import { measureGraphicsVoMs } from "@/lib/ibismuh/graphics/vo-ms";
import { graphicsDraftPlan } from "@/lib/ibismuh/graphics/draft";
import { gateTierRequest, gateTierRenderQuota } from "@/lib/ibismuh/tier-limits";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST — enqueue a graphics render (S123 P4; the whiteboard render route,
 * mirrored onto the graphics contract). Three grammars:
 *
 *   {}                       — FULL render (job on the videoId, the standard
 *                              final.mp4 artifact; the preflight wall runs
 *                              HERE at admission — the named-wall refusal
 *                              hits on click, never in a failed job card).
 *   { draft: true, scale }   — the whole-doc LABELLED DRAFT at a viewport
 *                              scale (∈ {0.5, 0.75, 1.0}, default 0.5): job
 *                              on the videoId with the draft payload,
 *                              artifact graphics/draft-full-<scale>.mp4.
 *   { sceneId, scale? }      — a single-scene LABELLED DRAFT: job on
 *                              `<videoId>#g<sceneId>`, artifact
 *                              graphics/draft-scene-<id>-<scale>.mp4.
 *
 * Drafts are LOOKS at the working doc — non-reviewable, no review credit,
 * and they never touch hasVideo/final.mp4/the render manifest (the b6
 * draft law; the S117 approved-only rule's draft half).
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

  // S123 — the voiceover interlock, safety parity with the story and
  // whiteboard lanes: this render reads the SAME per-scene WAVs (the VO
  // slots), so a concurrent regen would feed it half-old, half-new
  // narration. The shared POST /render path enforces the same gate.
  if (isJobRunning(id, "voiceover"))
    return NextResponse.json(
      { error: "The voiceover is still regenerating — wait for it to finish before rendering" },
      { status: 409 }
    );

  const doc = parseGraphicsDoc(video.graphicsDoc);
  if (!doc)
    return NextResponse.json(
      { error: "No graphics doc yet — scaffold one in the Graphics Studio first" },
      { status: 409 }
    );

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const rawSceneId = typeof body.sceneId === "string" ? body.sceneId.trim() : "";
  const rawScale = typeof body.scale === "number" ? body.scale : undefined;
  const wantsDraft = body.draft === true;

  // Same gate the job will apply — refuse BEFORE the queue so the user
  // sees the named-wall refusal on click, not in a failed job card.
  // S152 — the wall reads the MEASURED narration clock (the WAV truth the
  // render will extend its scenes to hold), so admission judges the
  // delivered program, not an estimate-only shadow of it.
  try {
    assertGraphicsBudget(doc, measureGraphicsVoMs(videoDir(id), doc));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "the graphics doc exceeds the frame budget" },
      { status: 400 }
    );
  }

  // Phase 9 — PER-TIER EXPENSIVE-LANE CEILING (tier-limits.ts — its header
  // is the law). Every POST here (drafts included) rides the plan's
  // per-minute ceiling for the graphics lane (fixed 60s epoch-aligned
  // window, per organization; resets in full at the next epoch minute).
  // The DAILY render quota sits on the FULL-render branch only — drafts are
  // labelled looks (the b6 draft law), not admitted renders. Refusals carry
  // code + plan + the honest retry/reset figures so the UI can show them.
  const tierGate = await gateTierRequest({
    organizationId: auth.ctx.organizationId,
    userId: auth.ctx.userId,
    scope: "graphics",
  });
  if (!tierGate.ok) return NextResponse.json(tierGate.body, { status: tierGate.status });

  // Clear any stale error before the job starts (the house convention).
  await db.video.update({ where: { id }, data: { error: null } });

  if (rawSceneId) {
    // ---- the single-scene labelled draft ----
    const sceneId = rawSceneId.slice(0, 64);
    if (!validGraphicsId(sceneId) || sceneId.includes("#"))
      return NextResponse.json({ error: `Illegal graphics scene id "${sceneId}"` }, { status: 400 });
    if (!doc.scenes.some((s) => s.id === sceneId))
      return NextResponse.json({ error: `Scene "${sceneId}" does not exist in this doc` }, { status: 400 });
    const plan = graphicsDraftPlan(doc, rawScale ?? 0.5);
    if (!plan)
      return NextResponse.json(
        { error: `"${String(rawScale)}" is not a legal draft scale (0.5 | 0.75 | 1.0)` },
        { status: 400 }
      );
    const jobKey = `${id}#g${sceneId}`;
    const accepted = await startJob(
      jobKey,
      "graphics",
      () => runGraphicsJob(jobKey, { sceneId, scale: plan.scale })
    );
    return NextResponse.json(
      {
        accepted,
        generating: true,
        scope: "draft-scene",
        sceneId,
        scale: plan.scale,
        label: plan.label,
        inheritedReviewCredit: plan.inheritedReviewCredit,
      },
      { status: accepted ? 202 : 200 }
    );
  }

  if (wantsDraft) {
    // ---- the whole-doc labelled draft ----
    const plan = graphicsDraftPlan(doc, rawScale ?? 0.5);
    if (!plan)
      return NextResponse.json(
        { error: `"${String(rawScale)}" is not a legal draft scale (0.5 | 0.75 | 1.0)` },
        { status: 400 }
      );
    const accepted = await startJob(
      id,
      "graphics",
      () => runGraphicsJob(id, { draft: true, scale: plan.scale })
    );
    return NextResponse.json(
      {
        accepted,
        generating: true,
        scope: "draft-full",
        scale: plan.scale,
        label: plan.label,
        inheritedReviewCredit: plan.inheritedReviewCredit,
      },
      { status: accepted ? 202 : 200 }
    );
  }

  // ---- the full render ----
  // Phase 9 — the DAILY per-tier render quota (tier-limits.ts): the full
  // render IS an admitted render in the policy's sense (starter 3/day/org,
  // creator 20/day, studio unmetered — the counter is structural-reset per
  // UTC day and a refused attempt never consumes quota). Drafts above ride
  // the per-minute ceiling alone.
  const quotaGate = await gateTierRenderQuota({
    organizationId: auth.ctx.organizationId,
    userId: auth.ctx.userId,
    tier: tierGate.tier, // the ceiling already resolved the tier — one read per request
  });
  if (!quotaGate.ok) return NextResponse.json(quotaGate.body, { status: quotaGate.status });
  const accepted = await startJob(id, "graphics", () => runGraphicsJob(id, {}));
  return NextResponse.json(
    { accepted, generating: true, scope: "full" },
    { status: accepted ? 202 : 200 }
  );
}

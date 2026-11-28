// POST /api/videos/[id]/script/hook-panel — S70 Creator Intelligence CI-1:
// Hook & Script Intelligence for the script lane.
//
// Two modes (zero new job kinds — this is a synchronous, budget-capped
// read the script surface calls):
//   mode "panel" (default) — generate N candidate openers through the LLM
//     and panel-score them: the DETERMINISTIC anchor (specificity/tension/
//     promise, unit-pinned) blended 60/40 with an LLM judge (strict JSON).
//     Proposes, never auto-edits — the winner is a suggestion the user
//     applies (or ignores) in the script editor.
//   mode "score" — pure, no LLM: score a hand-written hook + verify the
//     opening against the title's promise + mark the retention beats
//     (the story engine's own rehook spine, cited not re-invented).
//
// Every score carries `heuristic: true` — the honesty doctrine.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/ibismuh/tenant-db";
import { requireUser } from "@/lib/ibismuh/tenant";
import { parseScenes } from "@/lib/ibismuh/story";
import {
  generateHookPanel,
  markRetentionBeats,
  scoreHookHeuristic,
  verifyTitlePromise,
} from "@/lib/ibismuh/hook-score";
import { errorText } from "@/lib/ibismuh/redact";
import { gateTierRequest } from "@/lib/ibismuh/tier-limits";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  auth.enter();

  const { id } = await ctx.params;
  const video = await db.video.findUnique({ where: { id } });
  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    mode?: string;
    hook?: string;
    candidates?: number;
  };
  const mode = body.mode === "score" ? "score" : "panel";
  const scenes = parseScenes(video.scenes);

  // Phase 9 — PER-TIER EXPENSIVE-LANE CEILING (tier-limits.ts — its header
  // is the law), on the LLM mode only: mode "score" is pure and
  // deterministic (no provider call, no spend), so it never burns the org's
  // expensive-lane budget; mode "panel" generates N candidates through the
  // LLM and does. The ceiling is per TIER per MINUTE per organization (a
  // fixed 60s epoch-aligned window — it resets in full at the next epoch
  // minute; the honest retryAfterSec rides the refusal).
  if (mode === "panel") {
    const tierGate = await gateTierRequest({
      organizationId: auth.ctx.organizationId,
      userId: auth.ctx.userId,
      scope: "hook-panel",
    });
    if (!tierGate.ok) return NextResponse.json(tierGate.body, { status: tierGate.status });
  }

  // The retention beats + the title-promise check ride every response —
  // both deterministic, both anchored on the standing spine.
  const beats = markRetentionBeats(scenes.length);
  const opening = (video.script ?? "").split(/\n+/).filter(Boolean)[0] ?? "";
  const titlePromise = verifyTitlePromise(video.title ?? video.topic, opening);

  if (mode === "score") {
    const hook = (body.hook ?? "").trim();
    if (!hook)
      return NextResponse.json({ error: "Pass the hook to score in body.hook (mode score)" }, { status: 400 });
    return NextResponse.json({
      mode,
      score: scoreHookHeuristic(hook),
      titlePromise,
      beats,
      heuristic: true,
    });
  }

  try {
    const panel = await generateHookPanel({
      topic: video.topic,
      niche: video.niche,
      tone: video.tone,
      scriptExcerpt: video.script ?? scenes.map((s) => s.narration).join("\n\n"),
      candidates: Number(body.candidates) || 5,
    });
    return NextResponse.json({ mode, panel, titlePromise, beats, heuristic: true });
  } catch (err) {
    const message = errorText(err, "The hook panel failed");
    return NextResponse.json(
      {
        error: message,
        // The deterministic half still serves — degraded, honestly labeled.
        degraded: { titlePromise, beats, heuristic: true },
      },
      { status: 400 }
    );
  }
}

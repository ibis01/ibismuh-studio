import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/tubeforge/tenant-db";
import { requireUser } from "@/lib/tubeforge/tenant";
import type { Video } from "@prisma/client";
import { parseJsonLoose } from "@/lib/tubeforge/ai";
import { log } from "@/lib/tubeforge/log";

// S57/T-57.2 — helper-scope logger (brainstormAngles has no request in
// scope; the POST handler's own lines ride requestLog where they exist).
const batchLog = log.child({ mod: "batch" });
import { aiCall } from "@/lib/tubeforge/budget";
import { CreditBlockedError, creditBlockResponse } from "@/lib/tubeforge/billing";
import { runScriptJob } from "@/lib/tubeforge/script-job";
import { startJob } from "@/lib/tubeforge/jobs";
import { serializeVideo } from "@/lib/tubeforge/serialize";
import { chatComplete } from "@/lib/tubeforge/providers/chat";
import { FORMATS, RENDER_MODES } from "@/lib/tubeforge/types";
import { errorText } from "@/lib/tubeforge/redact";

interface Angle {
  title: string;
  topic: string;
}

/**
 * One cheap LLM call — turn a seed topic into N distinct, non-overlapping
 * video angles (the "batch" in Series batch). Falls back to numbered takes
 * of the seed topic if the model misbehaves, so the pipeline never dies here.
 */
async function brainstormAngles(opts: {
  topic: string;
  niche: string;
  count: number;
}): Promise<Angle[]> {
  const fallback: Angle[] = Array.from({ length: opts.count }, (_, i) => ({
    title: `${opts.topic} — Part ${i + 1}`,
    topic: opts.topic,
  }));

  try {
    const raw = await aiCall("llm", "batch angle brainstorm", () =>
      chatComplete({
        system:
          "You are a senior YouTube content strategist who builds bingeable series. You respond with STRICT JSON only — no markdown, no commentary.",
        user: `Seed topic: "${opts.topic}"
Niche: ${opts.niche}

Brainstorm exactly ${opts.count} DISTINCT video angles that together form a cohesive series around this seed. Each angle must:
- stand alone (a viewer who watches only that video gets full value)
- overlap as little as possible with the other angles (different sub-question, different story, different controversy)
- be equally click-worthy — no filler like "Part 2"

Return JSON: { "angles": [ { "title": "click-worthy title under 70 chars", "topic": "one-sentence specific brief for the writer" } ] }`,
      })
    );
    const parsed = parseJsonLoose(raw) as { angles?: unknown };
    const list = Array.isArray(parsed?.angles) ? parsed.angles : [];
    const angles = list
      .map((a: unknown) => {
        const o = (a ?? {}) as Record<string, unknown>;
        return {
          title: String(o.title ?? "").trim().slice(0, 90),
          topic: String(o.topic ?? "").trim().slice(0, 300) || opts.topic,
        };
      })
      .filter((a: Angle) => a.title && a.topic)
      .slice(0, opts.count);

    // Pad in the rare case the model returned fewer than asked.
    while (angles.length < opts.count) {
      const i = angles.length;
      angles.push({ title: `${opts.topic} — Part ${i + 1}`, topic: opts.topic });
    }
    return angles;
  } catch (err) {
    // Credit exhaustion is a real user-facing condition — never silently
    // degrade to filler angles (the user would queue N videos they cannot
    // script). Rethrow; POST maps it to a 402 before creating any rows.
    if (err instanceof CreditBlockedError) throw err;
    batchLog.warn("angle brainstorm failed — using fallback takes", { err: err instanceof Error ? err.message : err });
    return fallback;
  }
}

/**
 * POST — create a series: one seed topic → N videos with distinct angles,
 * each queued straight into script generation as its own background job.
 * Body mirrors POST /api/videos plus `count` (2-6).
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  auth.enter(); // tenant scope: handler + spawned job closures

  try {
    const body = await req.json();
    const topic = String(body.topic ?? "").trim();
    if (!topic)
      return NextResponse.json({ error: "Topic is required" }, { status: 400 });
    if (topic.length > 300)
      return NextResponse.json({ error: "Topic too long" }, { status: 400 });

    const count = Math.min(Math.max(Number(body.count ?? 3), 2), 6);
    const niche = String(body.niche ?? "Motivation");
    const tone = String(body.tone ?? "informative");
    const length = String(body.length ?? "medium");
    const voice = String(body.voice ?? "jam");
    const ttsSpeed = Math.min(Math.max(Number(body.ttsSpeed ?? 1.0), 0.5), 2.0);
    const thumbStyle = String(body.thumbStyle ?? "cinematic");
    const channelId = body.channelId ? String(body.channelId) : null;
    const characterId = body.characterId ? String(body.characterId) : null;
    const format = FORMATS.some((f) => f.id === body.format) ? String(body.format) : "story";
    const renderMode = RENDER_MODES.some((m) => m.id === body.renderMode)
      ? String(body.renderMode)
      : "kenburns";

    // S67 — the engine modes are STORY-format modes (the E1 design §2.2
    // law; S123: the engine lanes are a SET — graphics joins whiteboard):
    // a classic-script batch row with either is a contradiction, refused
    // here (400) instead of a video that can never render (the single-
    // create route's gate, aligned — the S155 audit's finding: a batch of
    // classic+graphics rows was accepted and could never render).
    if (
      (renderMode === "whiteboard" || renderMode === "graphics") &&
      format !== "story"
    )
      return NextResponse.json(
        { error: `${renderMode === "whiteboard" ? "Whiteboard" : "Motion graphics"} mode needs a scene-based story — create the rows with format "story"` },
        { status: 400 }
      );

    const character = characterId
      ? await db.character.findUnique({ where: { id: characterId } })
      : null;
    if (characterId && !character)
      return NextResponse.json({ error: "Character not found" }, { status: 400 });

    // 1) Distinct angles — one shared LLM call for the whole series.
    const angles = await brainstormAngles({ topic, niche, count });

    // 2) Create the rows.
    const videos: (Video & {
      channel: { name: string } | null;
      character: { name: string; hasPortrait: boolean } | null;
    })[] = [];
    for (const angle of angles) {
      const video = await db.video.create({
        data: {
          organizationId: auth.ctx.organizationId,
          topic: angle.topic,
          niche,
          tone,
          length,
          voice,
          ttsSpeed,
          thumbStyle,
          channelId,
          characterId,
          format,
          renderMode,
          status: "draft",
        },
        include: {
          channel: { select: { name: true } },
          character: { select: { name: true, hasPortrait: true } },
        },
      });
      videos.push(video);
    }

    await db.activity.create({
      data: {
        organizationId: auth.ctx.organizationId,
        userId: auth.ctx.userId,
        videoId: videos[0].id,
        stage: "create",
        message: `Series batch queued — ${videos.length} videos from "${topic}" (${format === "story" ? "scene-based" : "narration"} format)`,
      },
    });

    // 3) Queue script generation per video — through THE ONE JOB BODY
    // (S155): runScriptJob carries the storm-round patience (~2.5 h of
    // riding out 429 storms with escalating cool-downs), the S135 ordered
    // failure writes, the engine-lane error attribution and the Stop
    // handling the batch's inline copy lacked — a 429 storm failed every
    // video in the series on round 1 while a single create survived. Each
    // row still runs as its own tracked "script" job, so Library polling,
    // job history and crash recovery work exactly like a single create.
    for (const video of videos) {
      await startJob(video.id, "script", () => runScriptJob(video.id));
    }

    return NextResponse.json(
      {
        queued: videos.length,
        angles: angles.map((a) => a.title),
        videos: await Promise.all(videos.map((v) => serializeVideo(v, v.channel?.name))),
      },
      { status: 202 }
    );
  } catch (err) {
    const block = creditBlockResponse(err);
    if (block) return block; // 402 insufficient_credits — before any video row exists
    const message = errorText(err, "Invalid request");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

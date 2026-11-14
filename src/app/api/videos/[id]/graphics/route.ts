import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { db } from "@/lib/tubeforge/tenant-db";
import { requireUser } from "@/lib/tubeforge/tenant";
import { videoDir } from "@/lib/tubeforge/ai";
import { sceneWavFile } from "@/lib/tubeforge/story";
import { wavDurationSec } from "@/lib/tubeforge/wav";
import {
  GRAPHICS_BUDGETS,
  GRAPHICS_FRAME_BUDGET,
  GRAPHICS_MOTION_KINDS,
  MOTION_KINDS_BY_ELEMENT,
  GRAPHICS_ELEMENT_KINDS,
  parseGraphicsProject,
  serializeGraphicsProject,
  validateGraphicsDoc,
} from "@/lib/tubeforge/graphics/types";
import { GRAPHICS_ICON_LIBRARY } from "@/lib/tubeforge/graphics/planner";
import { invalidateRenderedArtifacts } from "@/lib/tubeforge/render";

type Ctx = { params: Promise<{ id: string }> };

/**
 * S123 — the Graphics Engine's document routes (the whiteboard route
 * family, mirrored; the validator is pure, so no library merge rides).
 *
 * GET  — the doc (validated server-side before return), the advisory
 *        grammar surfaces (element kinds, motion kinds, the compatibility
 *        table, the icon-library ids) and the resource budgets for
 *        client-side enforcement. The MEASURED narration durations
 *        (`voMs`, WAV header math on the standing scene-NN.wav files — the
 *        same files the render's vo mapping picks up) ride so the studio's
 *        playback timing agrees with the render instead of riding the
 *        narration estimate whenever a real VO exists.
 * PUT  — save the whole doc. Validation is the engine validator (pure —
 *        no library); its error strings are returned verbatim (no second
 *        error vocabulary). 409 on a rev mismatch with the current doc in
 *        the response. A save invalidates the stale renders exactly the
 *        way slide edits and whiteboard saves do.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  auth.enter(); // tenant scope

  const { id } = await ctx.params;
  const video = await db.video.findUnique({ where: { id } });
  if (!video)
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  if (video.format !== "story")
    return NextResponse.json({ error: "Not a scene-based video" }, { status: 400 });

  // The engine validator is PURE (no asset library — the graphics grammar
  // is self-contained), so the stored doc re-validates alone: a doc that no
  // longer validates reads as "no project" rather than poisoning the
  // studio with an unrenderable one.
  const env = parseGraphicsProject(video.graphicsProject);
  const doc = env?.doc ?? null;

  // S123 — advisory grammar surfaces for the studio (closed sets, the ONE
  // compatibility table — the client never re-derives them).
  const grammar = {
    version: 1 as const,
    elementKinds: GRAPHICS_ELEMENT_KINDS,
    motionKinds: GRAPHICS_MOTION_KINDS,
    motionKindsByElement: MOTION_KINDS_BY_ELEMENT,
    iconIds: Object.keys(GRAPHICS_ICON_LIBRARY),
  };

  // The measured narration per scene (WAV header math; the render's
  // ffprobe reports the same duration for the PCM WAVs the TTS lane
  // writes). Only `scene-<n>` ids map to the WAV layout — hand-authored
  // scene ids ride the narration estimate, exactly like the render (one
  // mapping law).
  const voMs: Record<string, number> = {};
  if (doc) {
    const dir = videoDir(id);
    for (const scene of doc.scenes) {
      const m = /^scene-(\d+)$/.exec(scene.id);
      if (!m) continue;
      const index = Number(m[1]);
      if (!Number.isInteger(index) || index < 1 || index > 999) continue;
      const wav = path.join(dir, sceneWavFile(index));
      if (!fs.existsSync(wav)) continue;
      try {
        const sec = wavDurationSec(fs.readFileSync(wav));
        if (sec > 0) voMs[scene.id] = Math.round(sec * 1000);
      } catch {
        /* unreadable/odd header → the scene rides the estimate */
      }
    }
  }

  return NextResponse.json({
    doc,
    rev: env?.rev ?? 0,
    voMs,
    grammar,
    budgets: {
      ...GRAPHICS_BUDGETS,
      renderFrames: GRAPHICS_FRAME_BUDGET,
    },
  });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  auth.enter();

  const { id } = await ctx.params;
  const video = await db.video.findUnique({ where: { id } });
  if (!video)
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  if (video.format !== "story")
    return NextResponse.json({ error: "Not a scene-based video" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const rawDoc = (body as Record<string, unknown> | null)?.doc;
  if (!rawDoc)
    return NextResponse.json({ error: "A graphics doc is required" }, { status: 400 });

  // The engine validator — pure; its error strings go back verbatim (the
  // whiteboard family's one-vocabulary law).
  const { doc, errors } = validateGraphicsDoc(rawDoc);
  if (!doc)
    return NextResponse.json({ errors }, { status: 400 });

  // Advisory concurrency: the studio echoes the rev it read; a mismatch
  // returns 409 WITH the server's current doc so the studio can offer a
  // diff. LWW stays the final law — rev is UX, not a guarantee (the
  // whiteboard envelope's own law).
  const current = parseGraphicsProject(video.graphicsProject);
  const bodyRev = (body as Record<string, unknown> | null)?.rev;
  if (
    current &&
    typeof bodyRev === "number" &&
    Number.isInteger(bodyRev) &&
    bodyRev !== current.rev
  ) {
    return NextResponse.json(
      {
        error: `This graphics doc changed under you — server rev ${current.rev}, you saved against ${bodyRev}`,
        current: { rev: current.rev, doc: current.doc },
      },
      { status: 409 }
    );
  }

  const rev = (current?.rev ?? 0) + 1;
  await db.video.update({
    where: { id },
    data: { graphicsProject: serializeGraphicsProject({ rev, doc }) },
  });

  // A doc edit stales the rendered artifacts (the whiteboard's §2.3
  // discipline — the same invalidation seam, graphics artifacts included).
  await invalidateRenderedArtifacts(id);
  await db.video.update({
    where: { id },
    data: { hasVideo: false, videoDuration: null },
  });

  return NextResponse.json({ rev, doc });
}

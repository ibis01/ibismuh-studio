import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { db } from "@/lib/tubeforge/tenant-db";
import { requireUser } from "@/lib/tubeforge/tenant";
import { videoDir } from "@/lib/tubeforge/ai";
import { sceneWavFile } from "@/lib/tubeforge/story";
import { wavDurationSec } from "@/lib/tubeforge/wav";
import { invalidateRenderedArtifacts } from "@/lib/tubeforge/render";
import {
  GRAPHICS_BUDGETS,
  GRAPHICS_FRAME_BUDGET,
  GRAPHICS_SURFACES,
  parseGraphicsDoc,
  validateGraphicsDoc,
  writeGraphicsDoc,
} from "@/lib/tubeforge/graphics/types";
import { graphicsBudgetReport } from "@/lib/tubeforge/graphics/preflight";
import { graphicsQcMatrix } from "@/lib/tubeforge/graphics/qc";
import { GRAPHICS_DRAFT_SCALES } from "@/lib/tubeforge/graphics/draft";

type Ctx = { params: Promise<{ id: string }> };

/**
 * S123 (G1) P4 — the Motion Graphics Engine's document routes (the
 * whiteboard route family, mirrored onto the graphics contract).
 *
 * GET  — the doc (validated server-side before return), the MEASURED
 *        narration durations (`voMs`, WAV header math on the standing
 *        scene-NN.wav files — S152: this IS clock truth now, the render
 *        extends an unplanned scene to its narration + tail, and the
 *        studio surfaces the extended windows through the same numbers),
 *        the budgets for client-side
 *        enforcement, the draft scales, and the preflight + QC evidence
 *        (the R-1 budget report + the G1 subcheck matrix — the same rows
 *        the render admission will judge).
 * PUT  — save the whole doc. Validation is the ENGINE validator
 *        (parseGraphicsDoc's tolerant read → the doc or its verbatim
 *        errors); the stored bytes are writeGraphicsDoc's strict,
 *        byte-stable write. No rev envelope: LWW is the house rule (the
 *        doc's own `version` field is the grammar contract — the studio
 *        is a single-editor surface like every other doc column). A save
 *        invalidates the stale renders exactly the way slide edits do.
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

  const doc = parseGraphicsDoc(video.graphicsDoc);

  // S123 — measured narration per scene (WAV header math; the render's
  // voFilesFor picks up the same files). Only `scene-<n>` ids map to the
  // WAV layout — hand-authored scene ids ride the narration estimate,
  // exactly like the render (one mapping law).
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

  // The preflight + QC evidence — the SAME reports the admission gate and
  // the render will judge (the studio shows what the click will do).
  // S152 — the measured narration map feeds both, so the evidence and the
  // studio's clock are the EXTENDED clock the render will deliver.
  let preflight: ReturnType<typeof graphicsBudgetReport> | null = null;
  let qc: ReturnType<typeof graphicsQcMatrix> | null = null;
  if (doc) {
    const voMsMap = new Map(Object.entries(voMs));
    try {
      preflight = graphicsBudgetReport(doc, voMsMap);
    } catch {
      preflight = null; // a doc with no scenes — the validator refuses it anyway
    }
    qc = graphicsQcMatrix(doc, Object.keys(voMs).length, voMsMap);
  }

  return NextResponse.json({
    doc,
    voMs,
    preflight,
    qc,
    budgets: {
      ...GRAPHICS_BUDGETS,
      renderFrames: GRAPHICS_FRAME_BUDGET,
      surfaces: GRAPHICS_SURFACES,
      draftScales: GRAPHICS_DRAFT_SCALES,
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

  const body = (await req.json().catch(() => null)) as { doc?: unknown } | null;
  if (!body || body.doc === undefined || body.doc === null)
    return NextResponse.json({ error: "A graphics doc is required" }, { status: 400 });

  // The engine validator — the tolerant read; its error strings go back
  // verbatim (design §4: no second error vocabulary). Warnings ride the
  // response so the studio can surface what was dropped/clamped.
  const result = validateGraphicsDoc(body.doc);
  if (result.doc === null)
    return NextResponse.json({ errors: result.errors }, { status: 400 });

  await db.video.update({
    where: { id },
    data: { graphicsDoc: writeGraphicsDoc(result.doc) },
  });

  // A doc edit stales the rendered artifacts (design §2.3) — same
  // invalidation discipline as every other visual mutation (the sweep
  // covers graphics/scene-N.mp4 + the labelled drafts since P3).
  await invalidateRenderedArtifacts(id);
  await db.video.update({
    where: { id },
    data: { hasVideo: false, videoDuration: null },
  });

  return NextResponse.json({
    doc: result.doc,
    warnings: result.warnings,
  });
}

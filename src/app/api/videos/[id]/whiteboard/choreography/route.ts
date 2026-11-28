import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { db } from "@/lib/ibismuh/tenant-db";
import { requireUser } from "@/lib/ibismuh/tenant";
import { videoDir } from "@/lib/ibismuh/ai";
import { sceneWavFile } from "@/lib/ibismuh/story";
import { wavDurationSec } from "@/lib/ibismuh/wav";
import { eventPlacementKey, validateWhiteboardProject } from "@/lib/ibismuh/whiteboard/storyboard";
import {
  parseWhiteboardDoc,
  serializeWhiteboardDoc,
} from "@/lib/ibismuh/whiteboard/whiteboard-planner";
import { invalidateRenderedArtifacts } from "@/lib/ibismuh/render";
import { loadVideoLibrary } from "@/lib/ibismuh/whiteboard/asset-store";
import { buildGeometry, scheduleScene, sceneDurationMs } from "@/lib/ibismuh/whiteboard/timing";
import { compileCompoundChoreography, resolveCompoundChoreography, buildChoreographyGroupReceipt, normalizeChoreographyGroupReceipt } from "@/lib/ibismuh/whiteboard/choreography";
import { groupMembers, isGroupLocked } from "@/lib/ibismuh/whiteboard/groups";

type Ctx = { params: Promise<{ id: string }> };

/**
 * The compound CHOREOGRAPHY route (the re-audit's step 3): apply a named
 * assembly preset to one compound group, compiling it into the scene's
 * explicit placement events — the compile seam runs server-side because
 * the geometry (per-path stroke lengths) and the measured narration clock
 * live with the library. The preset's retimed events are written as
 * EXPLICIT draw events (senior — the fill law leaves the group alone on
 * every later render) and the scene stamps `choreography` with the preset
 * id — the doc carries its own assembly receipt.
 *
 * POST { sceneId, groupId, preset, rev? }
 *   → { rev, project } (the same save contract as the PUT route) or the
 *     engine validator's verbatim errors / a named refusal.
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

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const sceneId = typeof body?.sceneId === "string" ? body.sceneId : null;
  const groupId = typeof body?.groupId === "string" ? body.groupId : null;
  const preset = typeof body?.preset === "string" ? body.preset : null;
  if (!sceneId || !groupId || !preset)
    return NextResponse.json(
      { error: "sceneId, groupId and preset are required" },
      { status: 400 }
    );

  // Fail-closed preset: only the closed vocabulary compiles.
  const resolvedPreset = resolveCompoundChoreography(preset);
  if (resolvedPreset === null)
    return NextResponse.json(
      { error: `Unknown choreography preset "${preset}"` },
      { status: 400 }
    );

  const doc = parseWhiteboardDoc(video.whiteboardProject);
  if (!doc?.project)
    return NextResponse.json({ error: "No whiteboard to choreograph" }, { status: 400 });
  const scene = doc.project.scenes.find((s) => s.id === sceneId);
  if (!scene)
    return NextResponse.json({ error: `No scene "${sceneId}" in this whiteboard` }, { status: 404 });

  // The group must exist here and be unlocked (the editor's own gates,
  // restated server-side — the route never trusts the client's check).
  const members = groupMembers(scene, groupId);
  if (members.length === 0)
    return NextResponse.json(
      { error: `No compound group "${groupId}" in scene "${sceneId}"` },
      { status: 404 }
    );
  if (isGroupLocked(scene, groupId))
    return NextResponse.json(
      { error: `Group "${groupId}" is locked — unlock it before applying choreography` },
      { status: 409 }
    );

  // The clock: the SAME mapping law the GET route rides — measured WAV
  // durations for `scene-<n>` ids, the narration estimate otherwise. The
  // schedule the compile retimes is the render's own schedule.
  const { lib } = await loadVideoLibrary(id);
  const dir = videoDir(id);
  const m = /^scene-(\d+)$/.exec(scene.id);
  let voMs: number | null = null;
  if (m) {
    const index = Number(m[1]);
    if (Number.isInteger(index) && index >= 1 && index <= 999) {
      const wav = path.join(dir, sceneWavFile(index));
      if (fs.existsSync(wav)) {
        try {
          const sec = wavDurationSec(fs.readFileSync(wav));
          if (sec > 0) voMs = Math.round(sec * 1000);
        } catch {
          /* unreadable/odd header → the scene rides the estimate */
        }
      }
    }
  }
  const durationMs = sceneDurationMs(scene, voMs);
  const geometry = buildGeometry(
    [...lib.extracted.entries()].map(([entryId, ex]) => ({ id: entryId, paths: ex.paths }))
  );
  const schedule = scheduleScene(scene, durationMs, geometry);

  // The compile: the group's pen events retimed into the preset's order,
  // written back as EXPLICIT events (senior — the fill law never re-times
  // them). Non-member events keep their places. THE EVENT-SET LAW (Phase
  // 5) rides inside the compiler and fails VISIBLE here: an empty member
  // event set, or two member strokes claiming one clock window, is a 400
  // naming the violation (the offending pair, verbatim) — never a silent
  // reshape.
  const memberKeys = new Set(members.map((pl) => pl.placementId ?? pl.assetId));
  let compiled: ReturnType<typeof compileCompoundChoreography>;
  try {
    compiled = compileCompoundChoreography({
      preset: resolvedPreset,
      members: members.map((pl) => ({
        key: pl.placementId ?? pl.assetId,
        x: pl.placement.x,
        y: pl.placement.y,
      })),
      events: schedule,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Choreography compile failed" },
      { status: 400 }
    );
  }
  // Phase 5 — the receipt is RICH and continues its own counter: the
  // tolerant read accepts the legacy bare-string shape (old docs) or the
  // rich record, and this compile stamps previous version + 1 (the first
  // receipt of a group is version 1).
  const previousReceipt = normalizeChoreographyGroupReceipt({
    raw: scene.choreographyGroups?.[groupId],
    memberKeys: [...memberKeys],
    events: schedule,
  });
  const receipt = buildChoreographyGroupReceipt({
    presetId: resolvedPreset,
    memberKeys: [...memberKeys],
    events: schedule,
    previousVersion: previousReceipt?.version,
  });
  const animations = [
    ...scene.animations.filter(
      (e) =>
        !(
          (e.type === "draw_path" || e.type === "write_text") &&
          memberKeys.has(eventPlacementKey(e))
        )
    ),
    ...compiled,
  ];
  // Phase 4: the receipt is GROUP-KEYED — this group's key lands in
  // `choreographyGroups` (a two-group scene keeps both assemblies), and
  // the legacy whole-scene scalar mirrors the most recent compile for
  // readers that predate the map (the validator accepts both shapes).
  const staged = {
    ...scene,
    animations,
    choreography: resolvedPreset,
    choreographyGroups: { ...scene.choreographyGroups, [groupId]: receipt },
  };

  // The engine validator against the merged library — the same gate the
  // PUT route rides; its error strings go back verbatim.
  const validated = validateWhiteboardProject(
    { ...doc.project, scenes: doc.project.scenes.map((s) => (s.id === sceneId ? staged : s)) },
    lib.libraryIndex
  );
  if (!validated.project)
    return NextResponse.json({ errors: validated.errors }, { status: 400 });

  // Advisory concurrency (the PUT route's law).
  const bodyRev = body?.rev;
  if (typeof bodyRev === "number" && Number.isInteger(bodyRev) && bodyRev !== doc.rev) {
    return NextResponse.json(
      {
        error: `This whiteboard changed under you — server rev ${doc.rev}, you saved against ${bodyRev}`,
        current: { rev: doc.rev, project: doc.project },
      },
      { status: 409 }
    );
  }

  const rev = doc.rev + 1;
  await db.video.update({
    where: { id },
    data: { whiteboardProject: serializeWhiteboardDoc({ rev, project: validated.project }) },
  });
  await invalidateRenderedArtifacts(id);
  await db.video.update({
    where: { id },
    data: { hasVideo: false, videoDuration: null },
  });

  return NextResponse.json({ rev, project: validated.project });
}

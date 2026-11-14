import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/tubeforge/tenant-db";
import { requireUser } from "@/lib/tubeforge/tenant";
import { parseScenes } from "@/lib/tubeforge/story";
import { scaffoldGraphicsDoc } from "@/lib/tubeforge/graphics/planner";
import {
  parseGraphicsProject,
  serializeGraphicsProject,
  validateGraphicsDoc,
  GRAPHICS_BUDGETS,
} from "@/lib/tubeforge/graphics/types";
import {
  scaffoldGraphicsDocLlm,
  type GraphicsLlmPlannerReport,
} from "@/lib/tubeforge/graphics/llm-planner";
import { invalidateRenderedArtifacts } from "@/lib/tubeforge/render";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST — the scaffold planner (the whiteboard scaffold route, mirrored for
 * the graphics grammar):
 *   planner "native" (default) — the ZERO-AI rule-table planner (G1.4):
 *     builds a starter graphics doc from the video's story scenes —
 *     narration copied per scene, keyword→archetype rule table (charts,
 *     counters, lists), icon-library accents, native motion defaults. $0,
 *     deterministic.
 *   planner "llm" — the LLM reads the same scenes and proposes elements
 *     per scene (metered through the single budget choke point;
 *     per-element degradation). A gateway failure degrades to the native
 *     scaffold — honestly labeled in `plannerReport`, never a 500, never
 *     an invented doc.
 * 409 when a doc already exists (`force: true` regenerates — the existing
 * doc is discarded).
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
    return NextResponse.json(
      { error: "Not a scene-based video — graphics applies to scene-format videos" },
      { status: 400 }
    );

  const scenes = parseScenes(video.scenes);
  if (scenes.length === 0)
    return NextResponse.json(
      { error: "Video has no scenes — generate the scene script first" },
      { status: 400 }
    );
  if (scenes.length > GRAPHICS_BUDGETS.scenesPerProject)
    return NextResponse.json(
      { error: `${scenes.length} scenes exceed the ${GRAPHICS_BUDGETS.scenesPerProject}-scene graphics project budget — trim the story first` },
      { status: 400 }
    );

  const body = await req.json().catch(() => ({}));
  const b = (body ?? {}) as Record<string, unknown>;
  const force = b.force === true;
  const planner = b.planner === "llm" ? "llm" : "native";
  const existing = parseGraphicsProject(video.graphicsProject);
  if (existing && !force)
    return NextResponse.json(
      { error: "This video already has a graphics doc — pass force: true to regenerate from the story" },
      { status: 409 }
    );

  const sceneInputs = scenes.map((s) => ({
    index: s.index,
    title: s.title,
    narration: s.narration,
  }));

  let doc: ReturnType<typeof scaffoldGraphicsDoc>;
  let plannerReport: GraphicsLlmPlannerReport | undefined = undefined;
  if (planner === "llm") {
    const llm = await scaffoldGraphicsDocLlm({
      scenes: sceneInputs,
      topic: video.topic,
      width: typeof b.width === "number" ? b.width : undefined,
      height: typeof b.height === "number" ? b.height : undefined,
      fps: typeof b.fps === "number" ? b.fps : undefined,
    });
    doc = llm.doc;
    plannerReport = llm.report;
  } else {
    doc = scaffoldGraphicsDoc({
      scenes: sceneInputs,
      topic: video.topic,
      width: typeof b.width === "number" ? b.width : undefined,
      height: typeof b.height === "number" ? b.height : undefined,
      fps: typeof b.fps === "number" ? b.fps : undefined,
    });
  }

  // Defense in depth: the planner's output passes the same validator any
  // client PUT would — one gate for every doc that lands in the column.
  const validated = validateGraphicsDoc(doc);
  if (!validated.doc)
    return NextResponse.json(
      { error: "The scaffold produced an invalid doc (engine bug — report it)", errors: validated.errors },
      { status: 500 }
    );
  doc = validated.doc;

  await db.video.update({
    where: { id },
    data: {
      graphicsProject: serializeGraphicsProject({ rev: 1, doc }),
      // S119/S123 — scaffolding IS graphics intent: pin the lane so the
      // main render button (and every bare caller — replays, auto-pilot)
      // routes to the engine. The row, the doc and the Studio the scaffold
      // came from now agree; a later explicit story mode in the render
      // body flips it back (render-lane.ts, the mode-drift law's twin).
      renderMode: "graphics",
    },
  });
  // A fresh doc stales whatever the previous doc rendered.
  await invalidateRenderedArtifacts(id);
  await db.video.update({
    where: { id },
    data: { hasVideo: false, videoDuration: null },
  });

  return NextResponse.json({
    rev: 1,
    doc,
    planner: plannerReport ? plannerReport.planner : "native",
    ...(plannerReport ? { plannerReport } : {}),
  });
}

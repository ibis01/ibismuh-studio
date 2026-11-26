import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/ibismuh/tenant-db";
import { requireUser } from "@/lib/ibismuh/tenant";
import { parseScenes } from "@/lib/ibismuh/story";
import { invalidateRenderedArtifacts } from "@/lib/ibismuh/render";
import {
  GRAPHICS_BUDGETS,
  parseGraphicsDoc,
  validateGraphicsDoc,
  writeGraphicsDoc,
} from "@/lib/ibismuh/graphics/types";
import { scaffoldGraphicsDoc } from "@/lib/ibismuh/graphics/planner";
import { resolveRecipe } from "@/lib/ibismuh/graphics/recipes";
import {
  scaffoldGraphicsDocLlm,
  type GraphicsLlmPlannerReport,
} from "@/lib/ibismuh/graphics/llm-planner";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST — the graphics scaffold planner (the whiteboard scaffold, mirrored
 * onto the graphics contract):
 *   planner "native" (default) — the ZERO-AI rule-table planner: keyword →
 *     archetype rule table (opener/closer cards, chart archetypes, icon
 *     accents), surface-snapped geometry, native motion defaults, closed
 *     grammar only. $0, deterministic.
 *   planner "llm" — the LLM proposes per-scene elements (metered through
 *     budget.ts's choke point; the deterministic base ALWAYS stands and
 *     the per-element degradation police every proposal against the closed
 *     grammar). A gateway failure degrades to the native scaffold —
 *     honestly labeled in `plannerReport`, never a 500, never an invented
 *     board.
 * 409 when a doc already exists (`force: true` regenerates — the existing
 * doc is discarded). Scaffolding pins the row to the graphics lane
 * (scaffolding IS graphics intent — the S119 admission twin).
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
      { error: "Not a scene-based video — motion graphics applies to scene-format videos" },
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

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const force = body.force === true;
  const planner = body.planner === "llm" ? "llm" : "native";
  // THE RECIPE FIELD (the re-audit's step 4): an optional doc-wide recipe
  // the scaffold compiles and CITES. An unknown id fails the scaffold with
  // a named error (the planner seam's own law) — 400 with the message.
  const recipeId = typeof body.recipeId === "string" ? body.recipeId : undefined;
  if (recipeId !== undefined && resolveRecipe(recipeId) === null)
    return NextResponse.json(
      { error: `Unknown recipe id "${recipeId}" — a scaffold may only name the registry's recipes` },
      { status: 400 }
    );
  if (parseGraphicsDoc(video.graphicsDoc) && !force)
    return NextResponse.json(
      { error: "This video already has a graphics doc — pass force: true to regenerate from the story" },
      { status: 409 }
    );

  const sceneInputs = scenes.map((s) => ({
    index: s.index,
    title: s.title,
    narration: s.narration,
  }));

  let doc;
  let plannerReport: GraphicsLlmPlannerReport | undefined = undefined;
  if (planner === "llm") {
    const llm = await scaffoldGraphicsDocLlm({
      scenes: sceneInputs,
      topic: video.topic,
      width: typeof body.width === "number" ? body.width : undefined,
      height: typeof body.height === "number" ? body.height : undefined,
      fps: typeof body.fps === "number" ? body.fps : undefined,
      ...(recipeId !== undefined ? { recipeId } : {}),
    });
    doc = llm.doc;
    plannerReport = llm.report;
  } else {
    doc = scaffoldGraphicsDoc({
      scenes: sceneInputs,
      topic: video.topic,
      width: typeof body.width === "number" ? body.width : undefined,
      height: typeof body.height === "number" ? body.height : undefined,
      fps: typeof body.fps === "number" ? body.fps : undefined,
      ...(recipeId !== undefined ? { recipeId } : {}),
    });
  }

  // Defense in depth: the planner's output passes the same validator any
  // client PUT would — one gate for every doc that lands in the column.
  const validated = validateGraphicsDoc(doc);
  if (validated.doc === null)
    return NextResponse.json(
      { error: "The scaffold produced an invalid doc (engine bug — report it)", errors: validated.errors },
      { status: 500 }
    );
  doc = validated.doc;

  await db.video.update({
    where: { id },
    data: {
      graphicsDoc: writeGraphicsDoc(doc),
      // S123 — scaffolding IS graphics intent: pin the lane so the main
      // render button (and every bare caller — replays, auto-pilot) routes
      // to the engine. A later explicit story mode in the render body
      // flips it back (render-lane.ts, the mode-drift law's admission twin).
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
    doc,
    planner: plannerReport ? plannerReport.planner : "native",
    ...(plannerReport ? { plannerReport } : {}),
  });
}

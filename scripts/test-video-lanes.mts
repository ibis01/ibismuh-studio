// P1 — THE CANONICAL LANE REGISTRY: executable laws.
//
// The plan's first priority: one registry (src/lib/ibismuh/video-lanes.ts)
// that the create wizard, the queue's heavy-kind cap and the render geometry
// law all read, so lane knowledge can never scatter again. Pinned here:
//
//   1. SHAPE       — six lanes, each carrying the full contract: type,
//                    format, renderMode, planVersion, inputSchema, planner,
//                    renderer, fallbackPolicy, qcProfile, supportedAspects.
//   2. PRESET PAIRS — the six presets pin exactly the pairs the product
//                    ships: classic=script/kenburns, story=story/kenburns,
//                    whiteboard=story/whiteboard, graphics2d=story/graphics,
//                    character=story/kenburns (the S125 rig channel rides
//                    INSIDE the compositor lane — declared, not duplicated),
//                    slides=story/slides.
//   3. LOCKSTEP    — every preset's format seats in FORMATS and its
//                    renderMode seats in RENDER_MODES (validateLaneRegistry
//                    returns no issues); the engine render modes declared by
//                    the registry match render-lane.ts's EngineLaneId set.
//   4. GEOMETRY    — slides pins 9:16 for ANY request; other lanes honor
//                    legal requests and fall back to 16:9 (the T-6.8 law,
//                    now declared once).
//   5. HEAVY KINDS — the queue's per-org cap list contains every engine
//                    lane (graphics no longer bypasses it) and only real
//                    render-class kinds.
//   6. DERIVATION  — the create wizard's cards derive from the registry:
//                    the module import graph IS the derivation (pinned by
//                    importing the same LANE_ORDER/registry the UI maps).
//
// Run: npm run test:video-lanes   (pure — no DB; part of check)

import {
  LANE_ORDER,
  LANE_REGISTRY,
  LANE_UI_META,
  HEAVY_JOB_KINDS,
  ENGINE_LANE_RENDER_MODES,
  resolveRenderAspect,
  validateLaneRegistry,
  LANE_CAPABILITY_IDS,
  LANE_REPAIR_OPERATIONS,
  isVideoType,
  resolveLane,
  resolveLaneOrNull,
  resolveLaneFromRow,
} from "../src/lib/ibismuh/video-lanes";
import { FORMATS, RENDER_MODES } from "../src/lib/ibismuh/types";
import { isEngineLaneId } from "../src/lib/ibismuh/render-lane";

let passed = 0;
let failed = 0;
const failures: string[] = [];
let suite = "";

function suiteStart(name: string) {
  suite = name;
  console.log(`\n◆ ${name}`);
}

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    failures.push(`[${suite}] ${name} — ${msg}`);
    console.error(`  ✗ ${name} — ${msg}`);
  }
}

function ok(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function eq<T>(actual: T, expected: T, label = "value") {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label}: expected ${b}, got ${a}`);
}

// --- 1. SHAPE ----------------------------------------------------------------

suiteStart("contract shape");

await test("six lanes in the canonical order", () => {
  eq(LANE_ORDER, ["classic", "story", "whiteboard", "graphics2d", "character", "slides"]);
});

await test("every lane carries the full contract with meaningful declarations", () => {
  for (const id of LANE_ORDER) {
    const c = LANE_REGISTRY[id];
    eq(c.type, id, "registry key matches contract.type");
    for (const field of [
      "inputSchema",
      "planner",
      "renderer",
      "fallbackPolicy",
      "qcProfile",
    ] as const) {
      ok(typeof c[field] === "string" && c[field].trim().length > 0, `${id}.${field} declared`);
    }
    ok(Number.isInteger(c.planVersion) && c.planVersion >= 1, `${id}.planVersion >= 1`);
    ok(c.supportedAspects.length > 0, `${id}.supportedAspects non-empty`);
  }
});

await test("every lane carries UI metadata (the wizard renders from it)", () => {
  for (const id of LANE_ORDER) {
    const ui = LANE_UI_META[id];
    ok(ui.title.trim().length > 0 && ui.desc.trim().length > 0, `${id} ui copy declared`);
    ok(ui.icon.length > 0 && ui.preview.startsWith("/formats/"), `${id} ui icon/preview declared`);
  }
});

// --- 2. PRESET PAIRS ----------------------------------------------------------

suiteStart("preset pairs");

await test("the six presets pin the shipped format/renderMode pairs", () => {
  eq(LANE_REGISTRY.classic.format, "script");
  eq(LANE_REGISTRY.classic.renderMode, "kenburns");
  eq(LANE_REGISTRY.story.format, "story");
  eq(LANE_REGISTRY.story.renderMode, "kenburns");
  eq(LANE_REGISTRY.whiteboard.format, "story");
  eq(LANE_REGISTRY.whiteboard.renderMode, "whiteboard");
  eq(LANE_REGISTRY.graphics2d.format, "story");
  eq(LANE_REGISTRY.graphics2d.renderMode, "graphics");
  eq(LANE_REGISTRY.character.format, "story");
  // The character preset shares the compositor lane (the rig channel rides
  // inside it) — the sharing is DECLARED in the registry, never duplicated.
  eq(LANE_REGISTRY.character.renderMode, "kenburns");
  eq(LANE_REGISTRY.character.planner.includes("native-rig"), true);
  eq(LANE_REGISTRY.character.renderer.includes("native-rig"), true);
  eq(LANE_REGISTRY.slides.format, "story");
  eq(LANE_REGISTRY.slides.renderMode, "slides");
});

// --- 3. LOCKSTEP ---------------------------------------------------------------

suiteStart("catalog lockstep");

await test("validateLaneRegistry() finds no issues", () => {
  eq(validateLaneRegistry(), []);
});

await test("every preset format seats in FORMATS and renderMode seats in RENDER_MODES", () => {
  const formatIds = FORMATS.map((f) => f.id);
  const modeIds = RENDER_MODES.map((m) => m.id);
  for (const id of LANE_ORDER) {
    const c = LANE_REGISTRY[id];
    ok(formatIds.includes(c.format), `${id}.format "${c.format}" in FORMATS`);
    ok(modeIds.includes(c.renderMode), `${id}.renderMode "${c.renderMode}" in RENDER_MODES`);
  }
});

await test("the registry's engine render modes match render-lane.ts's EngineLaneId set", () => {
  eq(ENGINE_LANE_RENDER_MODES, ["whiteboard", "graphics"]);
  for (const mode of ENGINE_LANE_RENDER_MODES) {
    ok(isEngineLaneId(mode), `${mode} is an engine lane in render-lane.ts`);
  }
});

// --- 4. GEOMETRY ----------------------------------------------------------------

suiteStart("render geometry law");

await test("slides pins 9:16 for any request (keynote deck geometry)", () => {
  eq(resolveRenderAspect("slides", "16:9"), "9:16");
  eq(resolveRenderAspect("slides", "1:1"), "9:16");
  eq(resolveRenderAspect("slides", null), "9:16");
  eq(resolveRenderAspect("slides", "junk"), "9:16");
});

await test("other lanes honor legal requests and fall back to 16:9", () => {
  eq(resolveRenderAspect("kenburns", "1:1"), "1:1");
  eq(resolveRenderAspect("whiteboard", "9:16"), "9:16");
  eq(resolveRenderAspect("kenburns", null), "16:9");
  eq(resolveRenderAspect("kenburns", "junk"), "16:9");
});

await test("slides declares only 9:16; every other lane declares all three", () => {
  eq(LANE_REGISTRY.slides.supportedAspects, ["9:16"]);
  for (const id of ["classic", "story", "whiteboard", "graphics2d", "character"] as const) {
    eq(LANE_REGISTRY[id].supportedAspects, ["16:9", "9:16", "1:1"]);
  }
});

// --- 5. HEAVY KINDS -------------------------------------------------------------

suiteStart("heavy job kinds");

await test("the queue cap list covers every engine lane plus the render class", () => {
  eq(HEAVY_JOB_KINDS, ["render", "short", "convert", "whiteboard", "graphics"]);
  ok(HEAVY_JOB_KINDS.includes("graphics"), "graphics joins the per-org cap");
});

await test("heavy kinds stay within the renderer/queue vocabulary", () => {
  const known = new Set([
    "render",
    "short",
    "convert",
    "whiteboard",
    "graphics",
  ]);
  for (const kind of HEAVY_JOB_KINDS) {
    ok(known.has(kind), `${kind} is a known render-class kind`);
  }
});

// --- 7. EXTENDED CONTRACT (master plan §4.1) -------------------------------------

suiteStart("extended contract declarations");

await test("every lane declares a preview renderer, queue kind, analytics id, capabilities, repairs, and fps", () => {
  for (const id of LANE_ORDER) {
    const c = LANE_REGISTRY[id];
    ok(c.previewRenderer.trim().length > 0, `${id}.previewRenderer must be declared`);
    ok(HEAVY_JOB_KINDS.includes(c.queueJobKind), `${id}.queueJobKind ${c.queueJobKind} must seat in HEAVY_JOB_KINDS`);
    ok(c.analyticsId === `lane.${id}`, `${id}.analyticsId must be lane.${id}`);
    ok(c.capabilities.length > 0, `${id}.capabilities must be declared`);
    for (const cap of c.capabilities) {
      ok((LANE_CAPABILITY_IDS as readonly string[]).includes(cap), `${id} capability ${cap} must seat in the closed vocabulary`);
    }
    ok(c.repairOperations.length > 0, `${id}.repairOperations must be declared`);
    for (const op of c.repairOperations) {
      ok((LANE_REPAIR_OPERATIONS as readonly string[]).includes(op), `${id} repair ${op} must seat in the closed vocabulary`);
    }
    ok(c.supportedFps.length > 0 && c.supportedFps.every((f) => Number.isInteger(f) && f > 0), `${id}.supportedFps must be positive integers`);
  }
});

await test("the engine lanes pin their real queue kinds (whiteboard/graphics are their own kind)", () => {
  eq(LANE_REGISTRY.whiteboard.queueJobKind, "whiteboard");
  eq(LANE_REGISTRY.graphics2d.queueJobKind, "graphics");
  eq(LANE_REGISTRY.classic.queueJobKind, "render");
  eq(LANE_REGISTRY.story.queueJobKind, "render");
  eq(LANE_REGISTRY.character.queueJobKind, "render");
  eq(LANE_REGISTRY.slides.queueJobKind, "render");
});

await test("character is the only lane with declared modes, and they are honest", () => {
  for (const id of LANE_ORDER) {
    if (id === "character") continue;
    eq(LANE_REGISTRY[id].modes, undefined, `${id} must not declare modes (single default)`);
  }
  const modes = LANE_REGISTRY.character.modes;
  ok(modes, "character must declare its modes");
  eq(modes.map((m) => m.id), ["native-rig", "storyboard-fallback"]);
  eq(modes?.find((m) => m.id === "native-rig")?.label, "Rig attached");
  eq(modes?.find((m) => m.id === "storyboard-fallback")?.label, "Storyboard fallback");
  for (const m of modes) {
    ok(m.when.includes("never silent") || m.when.includes("pose-by-pose"), `${m.id}.when must state its condition honestly`);
  }
});

await test("fps truth: whiteboard declares 24 and 30 (preview quantizes 24); everything else 30", () => {
  eq(LANE_REGISTRY.whiteboard.supportedFps, [24, 30]);
  for (const id of LANE_ORDER) {
    if (id === "whiteboard") continue;
    eq(LANE_REGISTRY[id].supportedFps, [30]);
  }
});

// --- 8. TYPED LOOKUP — FAIL CLOSED ----------------------------------------------

suiteStart("typed lane lookup");

await test("isVideoType guards the closed set", () => {
  ok(isVideoType("whiteboard"));
  ok(!isVideoType("kenburns"));
  ok(!isVideoType(""));
  ok(!isVideoType("CLASSIC"), "lane ids are case-sensitive");
});

await test("resolveLane returns the contract for every lane id", () => {
  for (const id of LANE_ORDER) {
    eq(resolveLane(id).type, id);
    ok(resolveLaneOrNull(id) !== null);
  }
});

await test("resolveLane throws on unknown values with the valid ids in the error", () => {
  let threw: unknown = null;
  try {
    resolveLane("holagram");
  } catch (err) {
    threw = err;
  }
  ok(threw instanceof Error && /holagram/.test(threw.message) && /classic/.test(threw.message), `got: ${String(threw)}`);
});

await test("resolveLaneOrNull returns null on unknown values", () => {
  eq(resolveLaneOrNull("nope"), null);
});

// --- 9. PERSISTENCE ADAPTER — NO SILENT KEN BURNS --------------------------------

suiteStart("persistence adapter");

await test("unambiguous pairs resolve to their lane", () => {
  eq(resolveLaneFromRow("script", "kenburns").status, "resolved");
  if (resolveLaneFromRow("script", "kenburns").status === "resolved") {
    eq(resolveLaneFromRow("script", "kenburns").lane.type, "classic");
  }
  for (const [format, mode, expected] of [
    ["story", "whiteboard", "whiteboard"],
    ["story", "graphics", "graphics2d"],
    ["story", "slides", "slides"],
  ] as const) {
    const r = resolveLaneFromRow(format, mode);
    eq(r.status, "resolved", `${format}/${mode} must resolve`);
    if (r.status === "resolved") eq(r.lane.type, expected);
  }
});

await test("the shared story/kenburns pair is AMBIGUOUS, never a silent default", () => {
  const r = resolveLaneFromRow("story", "kenburns");
  eq(r.status, "ambiguous");
  if (r.status === "ambiguous") {
    eq(r.candidates, ["story", "character"]);
    ok(/no silent Ken Burns default/.test(r.message));
  }
});

await test("unknown pairs fail closed", () => {
  const r = resolveLaneFromRow("story", "hologram");
  eq(r.status, "unknown");
  if (r.status === "unknown") ok(/fail closed/.test(r.message));
});

await test("the registry still validates clean after the extension", () => {
  eq(validateLaneRegistry(), [], "the extended contract must stay coherent");
});

// --- teardown -------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed${failures.length ? ":" : ""}`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exit(failed > 0 ? 1 : 0);

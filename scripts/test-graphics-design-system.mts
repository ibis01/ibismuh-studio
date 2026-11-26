#!/usr/bin/env node
// graphics design-system suite — Phase C slice 1 (semantic components +
// animation recipes).
//
// The audit's Phase C names three deliverables for the motion-graphics
// lane; this battery pins the first two:
//
//   1. RECIPES   — the animation choreography registry: the baseline IS
//                  the native table (byte-identity, exhaustive), every
//                  override rides the compatibility rows, unknown ids
//                  throw, every span fits the estimator floor and the
//                  exit clock, determinism.
//   2. COMPONENTS— the semantic component registry: the self-check
//                  refuses every defect by name, the expansion is the ONE
//                  seam constructor (deterministic, named parts, native
//                  motions, required content), validator-clean at doc
//                  level, placements on every house surface.
//   3. NATIVE    — the quote archetype adoption: a REAL quoted span
//                  scaffolds the big-quote component; quote-free
//                  narrations scaffold byte-identically (no derived ids
//                  anywhere); determinism.
//   4. LLM LANE  — the component channel: a component proposal expands
//                  through the EXISTING police (parts die individually,
//                  drops are named), unknown/junk/ambiguous proposals die,
//                  component-less proposals ride untouched; the prompt
//                  teaches the vocabulary (source pin).
//   5. WIRING    — the check chain and CI carry the battery (source pins).
//
// Run: npm run test:graphics-design   (pure — no DB, no DOM; CI step)

import fs from "node:fs";

import {
  assertComponentRegistry,
  componentNames,
  expandComponent,
  GRAPHICS_COMPONENT_IDS,
  GRAPHICS_COMPONENTS,
  resolveComponent,
  type ComponentSpec,
} from "../src/lib/ibismuh/graphics/components";
import {
  assertRecipeRegistry,
  GRAPHICS_RECIPE_IDS,
  GRAPHICS_RECIPES,
  recipeEnterFor,
  recipeExitFor,
  recipeNames,
  resolveRecipe,
  type GraphicsRecipe,
} from "../src/lib/ibismuh/graphics/recipes";
import {
  DEFAULT_SIZE_PX,
  nativeEnterFor,
  nativeExitFor,
} from "../src/lib/ibismuh/graphics/native-defaults";
import { scaffoldGraphicsDoc } from "../src/lib/ibismuh/graphics/planner";
import {
  GRAPHICS_ELEMENT_KINDS,
  legalMotions,
  validateGraphicsDoc,
  validGraphicsId,
} from "../src/lib/ibismuh/graphics/types";
import {
  composeGraphicsDoc,
  normalizeGraphicsProposals,
} from "../src/lib/ibismuh/graphics/llm-planner";

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
    failures.push(`${suite} — ${name}: ${err instanceof Error ? err.message : String(err)}`);
    console.log(`  ✗ ${name}`);
  }
}

function ok(cond: unknown, msg?: string) {
  if (cond) return;
  throw new Error(msg ?? `assertion failed in "${suite}"`);
}

function eq(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) return;
  throw new Error(msg ?? `expected ${b}, got ${a} (in "${suite}")`);
}

function throws(fn: () => void, match: RegExp, msg?: string): void {
  let err: unknown = null;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  ok(err instanceof Error && match.test(err.message), msg ?? `expected a throw matching ${match}, got: ${String(err)}`);
}

// --- fixtures -----------------------------------------------------------------

const KINDS = GRAPHICS_ELEMENT_KINDS.filter((k) => k !== "sprite") as Exclude<
  (typeof GRAPHICS_ELEMENT_KINDS)[number],
  "sprite"
>[];
const ESTIMATOR_FLOOR_MS = 4000;

/** Every component expansion, at the default content the registry's
 *  intent describes. */
const FULL_CONTENT = {
  "stat-card": { counter: { from: 0, to: 87, unit: "%" }, sub: "conversion lift", iconId: "arrow-up" },
  "kicker-card": { text: "Section two", sub: "the market forces" },
  "big-quote": { text: "The board saved us hours every week", sub: "a operations lead" },
  "cta-banner": { text: "Start your first workflow", sub: "free while in beta" },
  "icon-caption": { sub: "the setup takes minutes", iconId: "bolt" },
  comparison: { text: "Solar versus diesel", items: ["solar pays back in four years", "diesel burns fuel every day"] },
  "before-after": { text: "The workshop changed", items: ["paper ledgers everywhere", "one shared dashboard"] },
  "process-steps": { text: "The compost cycle", items: ["collect the greens", "layer with the browns", "turn the pile weekly"] },
  "timeline-card": { text: "The railway era", items: ["1890 the first line opens", "1922 the junction lands", "1965 the rails electrify"] },
  checklist: { text: "Launch readiness", items: ["the narration measured", "the assets placed", "the QC matrix green"] },
  ranking: { text: "The busiest lines", items: ["the red line", "the loop", "the coastal express"] },
  "title-opener": { text: "How compound interest works", sub: "the eighth wonder, explained" },
  "closing-summary": { text: "Start with one system", sub: "the rest compounds" },
} as const;

// --- 1. RECIPES ---------------------------------------------------------------

suiteStart("recipes — the choreography registry");

await test("the shipped registry validates clean (self-check at load + explicit)", () => {
  assertRecipeRegistry(); // throws on any defect
  ok(GRAPHICS_RECIPE_IDS.length >= 5, `the registry is seeded (${GRAPHICS_RECIPE_IDS.length} recipes)`);
  eq(recipeNames(), GRAPHICS_RECIPE_IDS, "recipeNames IS the closed vocabulary, in order");
  for (const id of GRAPHICS_RECIPE_IDS) {
    ok(resolveRecipe(id) !== null, `${id} resolves`);
    ok(GRAPHICS_RECIPES[id].label.length > 0 && GRAPHICS_RECIPES[id].intent.length > 0, `${id} carries its label + intent`);
  }
  eq(resolveRecipe("no-such-recipe"), null, "an unknown id resolves to null (the tolerant READ)");
});

await test("the identity law: the baseline IS the native table — exhaustively", () => {
  const sceneMss = [4000, 4375, 6500, 12_000];
  for (const kind of KINDS) {
    for (let order = 0; order <= 8; order++) {
      eq(
        recipeEnterFor(kind, order, "house-baseline"),
        nativeEnterFor(kind, order),
        `enter ${kind}#${order}: baseline === native`,
      );
      for (const sceneMs of sceneMss) {
        for (let count = 1; count <= 4; count++) {
          eq(
            recipeExitFor(kind, order, sceneMs, count, "house-baseline"),
            nativeExitFor(kind, order, sceneMs, count),
            `exit ${kind}#${order}@${sceneMs}/${count}: baseline === native`,
          );
        }
      }
    }
  }
});

await test("unknown recipe ids throw a NAMED error at the compile seam (fail-closed)", () => {
  throws(() => recipeEnterFor("bullet", 0, "no-such-recipe" as never), /unknown recipe id/);
  throws(() => recipeExitFor("bullet", 0, 4000, 1, "no-such-recipe" as never), /unknown recipe id/);
});

await test("every override rides its compatibility row, the closed ease table, and legal spans", () => {
  for (const id of GRAPHICS_RECIPE_IDS) {
    const recipe = GRAPHICS_RECIPES[id];
    for (const slot of ["enter", "exit"] as const) {
      const map = recipe[slot] as Record<string, { kind: string; durationMs: number; delayMs: number; delayStepMs?: number; ease: string }>;
      for (const kind of Object.keys(map)) {
        const spec = map[kind];
        if (spec === undefined) continue;
        ok(
          legalMotions(kind as never).includes(spec.kind as never),
          `${id}/${slot}/${kind}: "${spec.kind}" rides the compatibility row`,
        );
        ok(spec.durationMs > 0 && spec.delayMs >= 0, `${id}/${slot}/${kind}: positive duration, non-negative delay`);
        ok(spec.delayStepMs === undefined || spec.delayStepMs >= 0, `${id}/${slot}/${kind}: non-negative stagger step`);
      }
    }
  }
});

await test("every recipe's enter fits the estimator floor at the planner's per-kind orders", () => {
  for (const id of GRAPHICS_RECIPE_IDS) {
    for (const kind of KINDS) {
      for (let order = 0; order <= 5; order++) {
        const motion = recipeEnterFor(kind, order, id);
        ok(
          motion.delayMs + motion.durationMs <= ESTIMATOR_FLOOR_MS,
          `${id}/${kind}#${order}: ${motion.delayMs}+${motion.durationMs} fits the ${ESTIMATOR_FLOOR_MS}ms floor`,
        );
        ok(Number.isFinite(motion.delayMs) && Number.isFinite(motion.durationMs), `${id}/${kind}#${order}: finite spans`);
      }
    }
  }
});

await test("every recipe's exit completes before the scene tail for any clock ≥ the floor", () => {
  for (const id of GRAPHICS_RECIPE_IDS) {
    for (const kind of KINDS) {
      for (let order = 0; order <= 5; order++) {
        for (const sceneMs of [4000, 6500, 12_000]) {
          const motion = recipeExitFor(kind, order, sceneMs, 3, id);
          ok(
            motion.delayMs + motion.durationMs <= sceneMs,
            `${id}/${kind}#${order}@${sceneMs}: the exit fits the clock`,
          );
        }
      }
    }
  }
});

await test("the variants DANCE — the named recipes actually differ from the baseline where they say they do", () => {
  eq(recipeEnterFor("subhead", 0, "count-up-spotlight").delayMs, 900, "the spotlight's context waits for the count");
  eq(recipeEnterFor("bullet", 2, "cascade-list").kind, "rise", "the cascade's bullets rise");
  eq(recipeEnterFor("bullet", 2, "cascade-list").delayMs, 400 + 150 * 2, "the cascade rides the kinetic stagger");
  eq(recipeEnterFor("barChart", 1, "chart-grow").delayMs, 300 + 220, "the chart's bars grow in sequence");
  eq(recipeEnterFor("headline", 0, "quiet-card").kind, "fade", "the quiet deck fades");
  eq(recipeExitFor("subhead", 0, 4000, 1, "count-up-spotlight").delayMs, 4000 - 760 - 320, "the exit override is TAIL-ANCHORED (end-before)");
  eq(recipeEnterFor("counter", 0, "count-up-spotlight"), nativeEnterFor("counter", 0), "the counter keeps the native count/expo-out (the delta is a delta)");
});

await test("recipes compile deterministically", () => {
  for (const id of GRAPHICS_RECIPE_IDS) {
    for (const kind of KINDS) {
      eq(
        JSON.stringify(recipeEnterFor(kind, 3, id)),
        JSON.stringify(recipeEnterFor(kind, 3, id)),
        `${id}/${kind}: same compile twice`,
      );
    }
  }
});

await test("the self-check refuses injected defects by name", () => {
  const baselineWithOverride: GraphicsRecipe[] = [
    { id: "house-baseline", label: "x", intent: "x", enter: { headline: { kind: "fade", durationMs: 400, delayMs: 0, ease: "linear" } }, exit: {} },
  ];
  throws(() => assertRecipeRegistry(baselineWithOverride), /ZERO overrides/);
  const illegalMotion: GraphicsRecipe[] = [
    { id: "count-up-spotlight", label: "x", intent: "x", enter: { headline: { kind: "draw", durationMs: 400, delayMs: 0, ease: "linear" } }, exit: {} },
  ];
  throws(() => assertRecipeRegistry(illegalMotion), /outside the compatibility row/);
  const badEase: GraphicsRecipe[] = [
    { id: "count-up-spotlight", label: "x", intent: "x", enter: { headline: { kind: "fade", durationMs: 400, delayMs: 0, ease: "not-a-curve" } }, exit: {} },
  ];
  throws(() => assertRecipeRegistry(badEase), /outside the closed table/);
  const outside: GraphicsRecipe[] = [
    { id: "made-up-recipe" as never, label: "x", intent: "x", enter: {}, exit: {} },
  ];
  throws(() => assertRecipeRegistry(outside), /outside the closed vocabulary/);
  const negativeDelay: GraphicsRecipe[] = [
    { id: "quiet-card", label: "x", intent: "x", enter: { headline: { kind: "fade", durationMs: 400, delayMs: -5, ease: "linear" } }, exit: {} },
  ];
  throws(() => assertRecipeRegistry(negativeDelay), /negative delay/);
});

// --- 2. COMPONENTS ------------------------------------------------------------

suiteStart("components — the semantic component registry");

await test("the shipped registry validates clean (self-check at load + explicit)", () => {
  assertComponentRegistry(); // throws on any defect
  ok(GRAPHICS_COMPONENT_IDS.length >= 5, `the registry is seeded (${GRAPHICS_COMPONENT_IDS.length} components)`);
  eq(componentNames(), GRAPHICS_COMPONENT_IDS, "componentNames IS the closed vocabulary, in order");
  for (const id of GRAPHICS_COMPONENT_IDS) {
    ok(resolveComponent(id) !== null, `${id} resolves`);
    const spec = GRAPHICS_COMPONENTS[id];
    ok(spec.parts.length >= 2, `${id} composes at least two primitives`);
    for (const part of spec.parts) {
      ok(validGraphicsId(`${id}-${part.id}`), `${id}: the derived id "${id}-${part.id}" passes the charset law`);
    }
  }
  eq(resolveComponent("no-such-card"), null, "an unknown id resolves to null (the tolerant READ)");
});

await test("the self-check refuses injected defects by name", () => {
  const dupePart: ComponentSpec[] = [
    { id: "stat-card", label: "x", intent: "x", planKind: "statistic", anchor: { x: 960, y: 470 }, parts: [
      { id: "value", kind: "counter", dx: 0, dy: 0, slot: "counter" },
      { id: "value", kind: "counter", dx: 0, dy: 10, slot: "counter" },
    ] },
  ];
  throws(() => assertComponentRegistry(dupePart), /twice/);
  const badKind: ComponentSpec[] = [
    { id: "stat-card", label: "x", intent: "x", planKind: "statistic", anchor: { x: 960, y: 470 }, parts: [
      { id: "value", kind: "banana" as never, dx: 0, dy: 0, slot: "counter" },
    ] },
  ];
  throws(() => assertComponentRegistry(badKind), /unknown element kind/);
  const offFrame: ComponentSpec[] = [
    { id: "stat-card", label: "x", intent: "x", planKind: "statistic", anchor: { x: 3000, y: 470 }, parts: [
      { id: "value", kind: "counter", dx: 0, dy: 0, slot: "counter" },
    ] },
  ];
  throws(() => assertComponentRegistry(offFrame), /off the 16:9 reference frame/);
  const nonFinite: ComponentSpec[] = [
    { id: "stat-card", label: "x", intent: "x", planKind: "statistic", anchor: { x: 960, y: 470 }, parts: [
      { id: "value", kind: "counter", dx: Number.NaN, dy: 0, slot: "counter" },
    ] },
  ];
  throws(() => assertComponentRegistry(nonFinite), /non-finite offset/);
  const charset: ComponentSpec[] = [
    { id: "stat-card", label: "x", intent: "x", planKind: "statistic", anchor: { x: 960, y: 470 }, parts: [
      { id: "va--lue", kind: "counter", dx: 0, dy: 0, slot: "counter" },
    ] },
  ];
  throws(() => assertComponentRegistry(charset), /charset-illegal element id/);
  const empty: ComponentSpec[] = [
    { id: "stat-card", label: "x", intent: "x", planKind: "statistic", anchor: { x: 960, y: 470 }, parts: [] },
  ];
  throws(() => assertComponentRegistry(empty), /declares no parts/);
  const outside: ComponentSpec[] = [
    { id: "made-up-card" as never, label: "x", intent: "x", planKind: "statistic", anchor: { x: 960, y: 470 }, parts: [
      { id: "value", kind: "counter", dx: 0, dy: 0, slot: "counter" },
    ] },
  ];
  throws(() => assertComponentRegistry(outside), /outside the closed vocabulary/);
});

await test("the expansion is the ONE seam constructor: deterministic, named, native motions", () => {
  const a = expandComponent("stat-card", FULL_CONTENT["stat-card"], { width: 1920, height: 1080 });
  const b = expandComponent("stat-card", FULL_CONTENT["stat-card"], { width: 1920, height: 1080 });
  eq(JSON.stringify(a), JSON.stringify(b), "same content + surface → byte-identical parts");
  eq(a.map((el) => el.id), ["stat-card-accent", "stat-card-value", "stat-card-label"], "every part named <componentId>-<partId>, spec order");
  for (const el of a) {
    eq(el.enter, nativeEnterFor(el.kind, 0), `${el.id}: the enter rides the native table (legality by construction)`);
    eq(el.exit, undefined, `${el.id}: the expansion sets NO exit (the staged pass owns exits — one writer)`);
  }
  eq(a[1].counter, { from: 0, to: 87, unit: "%" }, "the counter rides the caller's number verbatim");
  eq(a[2].text?.sizePx, DEFAULT_SIZE_PX.subhead, "the label rides the default size table");
});

await test("optional slots omit their part; present ids stay stable", () => {
  const bare = expandComponent("stat-card", { counter: { from: 0, to: 12 } }, {});
  eq(bare.map((el) => el.id), ["stat-card-value"], "no icon, no sub → only the value part");
  const quoted = expandComponent("big-quote", { text: "It just works" }, {});
  eq(quoted.map((el) => el.id), ["big-quote-quote"], "no attribution → the quote alone (no invented source)");
  const withAttr = expandComponent("big-quote", { text: "It just works", sub: "the operations lead" }, {});
  eq(withAttr.map((el) => el.id), ["big-quote-quote", "big-quote-attribution"], "the attribution part rides its stable id");
});

await test("the content law: required slots refuse BY NAME; unknown ids throw", () => {
  throws(() => expandComponent("no-such-card", {}), /unknown component id/);
  throws(() => expandComponent("stat-card", {}), /stat-card requires a positive counter/);
  throws(() => expandComponent("stat-card", { counter: { from: 0, to: -4 } }), /positive counter/);
  throws(() => expandComponent("big-quote", {}), /big-quote requires text content/);
  throws(() => expandComponent("cta-banner", { sub: "only a support line" }), /cta-banner requires text content/);
  throws(() => expandComponent("kicker-card", { sub: "only a kicker" }), /kicker-card requires text content/);
  throws(() => expandComponent("icon-caption", { sub: "a caption with no mark" }), /icon-caption requires a registered icon id/);
  throws(() => expandComponent("icon-caption", { sub: "a caption", iconId: "not-in-the-library" }), /is not in the graphics icon library/);
});

await test("the expansion remaps onto EVERY house surface (the S68 law) and stays in-board", () => {
  for (const id of GRAPHICS_COMPONENT_IDS) {
    for (const [w, h] of [[1920, 1080], [1080, 1920], [1080, 1080]] as const) {
      const parts = expandComponent(id, FULL_CONTENT[id], { width: w, height: h });
      ok(parts.length >= 1, `${id}@${w}x${h}: served`);
      for (const el of parts) {
        ok(Number.isFinite(el.at.x) && Number.isFinite(el.at.y) && Number.isFinite(el.at.scale), `${id}@${w}x${h}/${el.id}: finite placement`);
        ok(el.at.x >= 0 && el.at.x <= w && el.at.y >= 0 && el.at.y <= h, `${id}@${w}x${h}/${el.id}: in-board (${el.at.x}, ${el.at.y})`);
        ok(el.at.scale > 0, `${id}@${w}x${h}/${el.id}: positive scale`);
      }
    }
  }
  // The remap law holds: the 9:16 surface scales x by 1080/1920 and the
  // ink (scale) by the WIDTH ratio.
  const tall = expandComponent("stat-card", FULL_CONTENT["stat-card"], { width: 1080, height: 1920 });
  eq(tall[1].at.x, Math.round((960 + 0) * (1080 / 1920)), "the 9:16 x rides the axis ratio");
  eq(tall[1].at.scale, 2.5 * (1080 / 1920), "the ink follows the WIDTH ratio (exact IEEE multiply, the S68 law)");
});

await test("every component expansion validates at DOC level (the one validator gate)", () => {
  for (const id of GRAPHICS_COMPONENT_IDS) {
    const parts = expandComponent(id, FULL_CONTENT[id], { width: 1920, height: 1080 });
    const doc = {
      version: 1,
      title: `design system — ${id}`,
      width: 1920,
      height: 1080,
      fps: 24,
      scenes: [{ id: "scene-1", narration: "the design system scene", background: "#ffffff", elements: parts }],
    };
    const r = validateGraphicsDoc(doc);
    ok(r.doc !== null && r.errors.length === 0, `${id}: the doc-level gate passes clean — ${r.errors.join(" | ")}`);
  }
});

await test("the planKind vocabulary maps onto the lane-plan families", () => {
  eq(GRAPHICS_COMPONENTS["stat-card"].planKind, "statistic");
  eq(GRAPHICS_COMPONENTS["kicker-card"].planKind, "headline");
  eq(GRAPHICS_COMPONENTS["big-quote"].planKind, "quote");
  eq(GRAPHICS_COMPONENTS["cta-banner"].planKind, "cta");
  eq(GRAPHICS_COMPONENTS["icon-caption"].planKind, "icon-group");
  eq(GRAPHICS_COMPONENTS["comparison"].planKind, "comparison");
  eq(GRAPHICS_COMPONENTS["before-after"].planKind, "comparison");
  eq(GRAPHICS_COMPONENTS["process-steps"].planKind, "timeline");
  eq(GRAPHICS_COMPONENTS["timeline-card"].planKind, "timeline");
  eq(GRAPHICS_COMPONENTS["ranking"].planKind, "timeline");
  eq(GRAPHICS_COMPONENTS["checklist"].planKind, "icon-group");
  eq(GRAPHICS_COMPONENTS["title-opener"].planKind, "headline");
  eq(GRAPHICS_COMPONENTS["closing-summary"].planKind, "headline");
});

// --- WS8 growth pins ----------------------------------------------------------

suiteStart("ws8 growth — the item slot, the band, the planKinds");

await test("the registries ride the plan's band (13 components, 11 recipes)", () => {
  ok(GRAPHICS_COMPONENT_IDS.length >= 13, `the component registry grew to the plan's menu band (${GRAPHICS_COMPONENT_IDS.length})`);
  ok(GRAPHICS_RECIPE_IDS.length >= 11, `the recipe registry grew to the plan's menu band (${GRAPHICS_RECIPE_IDS.length})`);
  for (const id of ["comparison", "before-after", "process-steps", "timeline-card", "checklist", "ranking", "title-opener", "closing-summary"]) {
    ok(resolveComponent(id) !== null, `${id} resolves`);
  }
  for (const id of ["comparison-bars", "timeline-steps", "process-steps", "icon-group-entrance", "final-summary", "problem-solution"]) {
    ok(resolveRecipe(id) !== null, `${id} resolves`);
  }
});

await test("an items part omits when its index is absent (the stable-id law)", () => {
  const partial = expandComponent("comparison", { text: "Solar versus diesel", items: ["solar wins"] }, { width: 1920, height: 1080 });
  eq(partial.map((el) => el.id), ["comparison-topic", "comparison-left"], "the right side omits; the left keeps its id");
  const none = expandComponent("comparison", { text: "Solar versus diesel" }, { width: 1920, height: 1080 });
  eq(none.map((el) => el.id), ["comparison-topic"], "no items → headline only");
});

await test("a present-but-junk item refuses BY NAME (never a placeholder)", () => {
  throws(() => expandComponent("checklist", { text: "Launch readiness", items: ["measured", "   "] }), /non-readable item at index 1/);
});

await test("list items ride the capLine law (60 chars)", () => {
  const parts = expandComponent("ranking", {
    text: "The busiest lines",
    items: ["x".repeat(80), "the loop", "the coastal express"],
  }, { width: 1920, height: 1080 });
  const first = parts.find((el) => el.id === "ranking-first");
  ok(first !== undefined && first.text !== undefined);
  ok(first.text.text.length <= 61, `the long item was capped with the ellipsis law (${first.text.text.length} = capLine(60) + …)`);
});

await test("the new list cards validate at DOC level with their full content", () => {
  for (const id of ["comparison", "before-after", "process-steps", "timeline-card", "checklist", "ranking", "title-opener", "closing-summary"]) {
    const parts = expandComponent(id, FULL_CONTENT[id], { width: 1920, height: 1080 });
    const doc = {
      version: 1,
      title: `ws8 — ${id}`,
      width: 1920,
      height: 1080,
      fps: 24,
      scenes: [{ id: "scene-1", narration: "the ws8 growth scene", background: "#ffffff", elements: parts }],
    };
    const r = validateGraphicsDoc(doc);
    ok(r.doc !== null && r.errors.length === 0, `${id}: the doc-level gate passes clean — ${r.errors.join(" | ")}`);
  }
});

await test("the new recipes compile legally across kinds and orders (the gate rides at EVERY use)", () => {
  const sceneMss = [4000, 6500, 12_000];
  for (const id of ["comparison-bars", "timeline-steps", "process-steps", "icon-group-entrance", "final-summary", "problem-solution"]) {
    for (const kind of KINDS) {
      for (let order = 0; order <= 4; order++) {
        const enter = recipeEnterFor(kind, order, id);
        ok(Number.isFinite(enter.delayMs) && enter.durationMs > 0, `${id}/${kind}#${order}: the enter compiles finite`);
      }
      for (const sceneMs of sceneMss) {
        const exit = recipeExitFor(kind, 0, sceneMs, 2, id);
        ok(Number.isFinite(exit.delayMs) && exit.durationMs > 0, `${id}/${kind}@${sceneMs}: the exit compiles finite`);
      }
    }
  }
});

// --- 3. NATIVE LANE -----------------------------------------------------------

suiteStart("native lane — the quote archetype adopts the design system");

const QUOTE_STORY = [
  { index: 1, title: "The opener", narration: "Growth follows the trend." },
  { index: 2, title: "The testimony", narration: 'Our ops lead told the team: "the board saved us hours every single week" and the metrics agreed.' },
  { index: 3, title: "The data", narration: "Compared with last year, 42 percent versus 87 percent share." },
  { index: 4, title: "The close", narration: "See the difference yourself." },
];

await test("a REAL quoted span scaffolds the big-quote component (named parts, no invention)", () => {
  const doc = scaffoldGraphicsDoc({ scenes: QUOTE_STORY, topic: "Design system" });
  const scene = doc.scenes[1];
  ok(scene !== undefined, "the quote scene served");
  eq(
    scene.elements.map((el) => el.id),
    ["big-quote-quote", "big-quote-attribution"],
    "the scene carries the component's named parts",
  );
  const quote = scene.elements[0];
  ok(quote?.text?.text.includes("the board saved us hours"), `the quote text is the story's own span: "${quote?.text?.text}"`);
  ok(quote?.text?.text.length <= 120 + 1, "the quote rides the cap");
  const attribution = scene.elements[1];
  ok(
    attribution?.text?.text.includes("the board saved us hours") === false,
    "the attribution is NOT the quote itself",
  );
  ok(
    attribution?.text?.text.includes("and the metrics agreed") === true,
    `the attribution is the story's tail: "${attribution?.text?.text}"`,
  );
  for (const el of scene.elements) {
    ok(el.exit !== undefined, `${el.id}: the staged pass owned the exit`);
  }
});

await test("the attribution omits itself when the quote ends the narration (no invented source)", () => {
  const doc = scaffoldGraphicsDoc({
    scenes: [
      { index: 1, title: "The opener", narration: "The trend." },
      { index: 2, title: "The testimony", narration: 'As the team put it: "it just works"' },
      { index: 3, title: "The close", narration: "Try it today." },
    ],
    topic: "Design system",
  });
  const scene = doc.scenes[1];
  eq(scene?.elements.map((el) => el.id), ["big-quote-quote"], "the quote alone; no attribution part");
});

await test("quote-free narrations scaffold WITHOUT any component-derived id (the additive-seam law)", () => {
  const PINNED_STORIES: { index: number; title: string; narration: string }[][] = [
    [
      { index: 1, title: "The Growth Engine", narration: "Every product grows through three forces: reach, retention, and revenue." },
      { index: 2, title: "The conversion lift", narration: "Teams see conversion climb to 87 percent within the first quarter." },
      { index: 3, title: "Why teams switch", narration: "First, the setup takes minutes. Next, the workflow runs itself. Finally, the results compound every week." },
      { index: 4, title: "The market data", narration: "Compared with last year, 42 percent versus 87 percent share." },
      { index: 5, title: "Start today", narration: "Check your first workflow now and see the difference yourself." },
    ],
    [
      { index: 1, title: "The opener", narration: "the setup takes minutes" },
      { index: 2, title: "Why teams switch", narration: "First, the setup takes minutes. Next, the workflow runs itself. Finally, the results compound." },
      { index: 3, title: "The chart", narration: "Compared with last year, 42 percent versus 87 percent share." },
      { index: 4, title: "Start today", narration: "see the difference yourself" },
    ],
  ];
  for (const scenes of PINNED_STORIES) {
    const doc = scaffoldGraphicsDoc({ scenes, topic: "pins" });
    for (const scene of doc.scenes) {
      for (const el of scene.elements) {
        for (const componentId of GRAPHICS_COMPONENT_IDS) {
          ok(!el.id.startsWith(`${componentId}-`), `${scene.id}/${el.id}: no component-derived id in a quote-free scaffold`);
        }
      }
    }
  }
});

await test("the archetype order IS the policy: data scenes stay data scenes even with a quote", () => {
  const doc = scaffoldGraphicsDoc({
    scenes: [
      { index: 1, title: "The opener", narration: "The trend." },
      { index: 2, title: "The data", narration: 'The chart compared the "runners" — 42 percent versus 87 percent share.' },
      { index: 3, title: "The close", narration: "Try it today." },
    ],
    topic: "order",
  });
  const scene = doc.scenes[1];
  ok(scene?.elements.some((el) => el.kind === "barChart"), "the chart archetype won (data cues outrank quotes)");
  for (const el of scene?.elements ?? []) {
    ok(!el.id.startsWith("big-quote-"), "no quote parts on a chart scene");
  }
});

await test("the quote scaffold validates at doc level and is deterministic", () => {
  const a = scaffoldGraphicsDoc({ scenes: QUOTE_STORY, topic: "Design system" });
  const r = validateGraphicsDoc(JSON.parse(JSON.stringify(a)));
  ok(r.doc !== null && r.errors.length === 0, `the quote scaffold validates clean — ${r.errors.join(" | ")}`);
  const b = scaffoldGraphicsDoc({ scenes: QUOTE_STORY, topic: "Design system" });
  eq(JSON.stringify(b), JSON.stringify(a), "the determinism law");
});

// --- 4. LLM LANE --------------------------------------------------------------

suiteStart("llm lane — the component channel rides the existing police");

const STORY = [
  { index: 1, title: "The opener", narration: "Growth follows the trend." },
  { index: 2, title: "The number", narration: "Teams see conversion climb to 87 percent within the first quarter." },
  { index: 3, title: "The close", narration: "See the difference yourself." },
];
const CTX = { scenes: STORY, width: 1920, height: 1080 };

await test("a component proposal expands through the police into named, legal elements", () => {
  const raw = [
    { scene: 2, elements: [
      { component: "stat-card", text: "", sub: "conversion lift", from: 0, to: 87, unit: "%", iconId: "arrow-up" },
    ] },
  ];
  const { served, fallback, dropped } = normalizeGraphicsProposals(raw, CTX);
  eq(fallback, [1, 3], "the unserved scenes fall back");
  ok(dropped.length === 0, `no drops — ${JSON.stringify(dropped)}`);
  const els = served.get(2)?.elements ?? [];
  eq(els.map((el) => el.id), ["stat-card-accent", "stat-card-value", "stat-card-label"], "the parts rode the police into elements");
  eq(els[1]?.counter, { from: 0, to: 87, unit: "%" }, "the counter payload survived");
  // The police's motion default: the native kind/duration/delay with the
  // house ease floor ("measured-out") — the existing behavior for EVERY
  // proposal, component parts included (the police is ONE gate).
  const base = nativeEnterFor("counter", 0);
  eq(els[1]?.enter, { kind: base.kind, durationMs: base.durationMs, delayMs: base.delayMs, ease: "measured-out" }, "the enter rides the native table through the police");
  const doc = composeGraphicsDoc(scaffoldGraphicsDoc({ scenes: STORY, topic: "llm lane" }), STORY, served);
  const r = validateGraphicsDoc(JSON.parse(JSON.stringify(doc)));
  ok(r.doc !== null && r.errors.length === 0, `the composed doc validates clean — ${r.errors.join(" | ")}`);
});

await test("the channel is fail-closed: unknown, ambiguous, and content-missing proposals die NAMED", () => {
  const raw = [
    { scene: 2, elements: [
      { component: "no-such-card", text: "x" },
      { component: "stat-card", kind: "counter", from: 0, to: 5 },
      { component: "big-quote" },
    ] },
  ];
  const { served, dropped } = normalizeGraphicsProposals(raw, CTX);
  eq(served.size, 0, "every proposal died — the scene falls back");
  eq(dropped.length, 3, `three named drops — ${JSON.stringify(dropped)}`);
  ok(dropped.some((d) => /unknown component/.test(d.reason)), "the unknown id is named");
  ok(dropped.some((d) => /not both/.test(d.reason)), "the ambiguity is named");
  ok(dropped.some((d) => /big-quote requires text/.test(d.reason)), "the content miss is named");
});

await test("per-element degradation holds in the component's own scene; invalid content kills the whole expansion (named)", () => {
  // An illegal SIBLING dies alone; the component's parts live.
  const raw = [
    { scene: 2, elements: [
      { component: "stat-card", from: 0, to: 87, unit: "%", sub: "context" },
      { kind: "banana" },
    ] },
  ];
  const { served, dropped } = normalizeGraphicsProposals(raw, CTX);
  const els = served.get(2)?.elements ?? [];
  eq(els.map((el) => el.id), ["stat-card-value", "stat-card-label"], "the optional accent omitted itself, the parts lived; the junk sibling died");
  eq(dropped.length, 1, "one named drop");
  ok(dropped[0]?.reason.includes("closed"), `the junk sibling's drop is named: ${dropped[0]?.reason}`);

  // An INVALID iconId (given but unregistered) kills the whole expansion
  // — the caller asked for something that does not exist, and the refusal
  // is named (the drop surfaces in the report, never silent).
  const bad = [
    { scene: 2, elements: [
      { component: "stat-card", from: 0, to: 87, iconId: "ghost-icon" },
    ] },
  ];
  const badResult = normalizeGraphicsProposals(bad, CTX);
  eq(badResult.served.size, 0, "the expansion died");
  ok(badResult.dropped[0]?.reason.includes("ghost-icon") && badResult.dropped[0]?.reason.includes("not in the graphics icon library"), `the invalid icon is named: ${badResult.dropped[0]?.reason}`);
});

await test("component-less proposals normalize exactly as before (the additive-seam law)", () => {
  const raw = [
    { scene: 2, elements: [
      { kind: "counter", from: 0, to: 87, unit: "%" },
      { kind: "icon", iconId: "bolt" },
    ] },
  ];
  const a = normalizeGraphicsProposals(structuredClone(raw), CTX);
  const b = normalizeGraphicsProposals(structuredClone(raw), CTX);
  eq(JSON.stringify([...a.served.entries()]), JSON.stringify([...b.served.entries()]), "deterministic without the field");
  eq(a.dropped, [], "no drops");
  const els = a.served.get(2)?.elements ?? [];
  eq(els[0]?.id, "counter-1", "the id law runs as before");
});

// --- 5. WIRING ----------------------------------------------------------------

suiteStart("wiring — the battery rides the check chain and CI (source pins)");

await test("the prompt teaches the component vocabulary (source pin, the S157 pattern)", () => {
  const src = fs.readFileSync("src/lib/ibismuh/graphics/llm-planner.ts", "utf8");
  ok(src.includes("SEMANTIC COMPONENTS (preferred for whole-card moments)"), "the prompt names the component lane");
  ok(src.includes("componentNames().join"), "the vocabulary rides the ONE registry (no second list in the prompt)");
  ok(src.includes("import {\n  componentNames,"), "the channel imports the registry");
});

// --- 6. VOCABULARY (Phase C slice 2) -------------------------------------------

suiteStart("vocabulary — the icon wave rides the one-source law");

await test("the library holds the audit band and every icon passes the path laws", async () => {
  const { GRAPHICS_ICON_LIBRARY } = await import("../src/lib/ibismuh/graphics/planner");
  const { countPathCommands } = await import("../src/lib/ibismuh/whiteboard/svg");
  const ids = Object.keys(GRAPHICS_ICON_LIBRARY);
  ok(ids.length >= 180 && ids.length <= 210, `the library holds the production band (${ids.length} icons)`);
  for (const [id, icon] of Object.entries(GRAPHICS_ICON_LIBRARY)) {
    ok(icon.paths.length >= 1 && icon.paths.length <= 16, `${id}: ${icon.paths.length} paths`);
    ok(icon.tags.length >= 1, `${id}: tagged`);
    for (const d of icon.paths) {
      const mCount = (d.match(/M/g) ?? []).length;
      ok(mCount === 1 && d.trimStart().startsWith("M"), `${id}: every path is ONE stroke (one M)`);
      const cmds = countPathCommands(d);
      ok(cmds >= 2, `${id}: a path parses to ${cmds} commands`);
      ok(cmds <= 64, `${id}: path within the readable-command band (${cmds})`);
      for (const n of d.match(/-?\d+(\.\d+)?/g) ?? []) {
        const v = parseFloat(n);
        ok(v >= -2 && v <= 26, `${id}: coordinate ${v} on the 24 grid`);
      }
    }
  }
});

await test("the mention rules stay first-hit-wins: no later rule claims an earlier rule's word", async () => {
  const { ICON_KEYWORD_PICKS } = await import("../src/lib/ibismuh/graphics/planner");
  ok(ICON_KEYWORD_PICKS.length >= 180, `the rule table grew with the library (${ICON_KEYWORD_PICKS.length} rules)`);
  const head = ICON_KEYWORD_PICKS.slice(0, 136);
  const tail = ICON_KEYWORD_PICKS.slice(136);
  ok(tail.length >= 45, `the wave appended its rules after the established table (${tail.length} tail rules)`);
  for (let ti = 0; ti < tail.length; ti++) {
    const rule = tail[ti];
    const source = rule.re.source;
    const words = source.replace(/\\b/g, "").split("|").map((w) => w.replace(/[()]/g, "").trim()).filter((w) => w.length >= 2);
    for (const w of words) {
      for (let hi = 0; hi < head.length + ti; hi++) {
        const other = ICON_KEYWORD_PICKS[hi];
        if (other === undefined) continue;
        let hit = false;
        try {
          hit = other.re.test(w);
        } catch {
          hit = false;
        }
        ok(!hit, `tail rule ${ti + 1} (${rule.iconId}) word "${w}" already claimed by ${other.iconId} — the pick would never fire`);
      }
    }
  }
});

await test("the wave's icons resolve and the dead-end law holds for every rule", async () => {
  const { GRAPHICS_ICON_LIBRARY, ICON_KEYWORD_PICKS, FALLBACK_ICON_CYCLE } = await import("../src/lib/ibismuh/graphics/planner");
  const NEW_IDS = ["snowflake", "fog", "storm-cloud", "moon", "rainbow", "umbrella", "bread", "apple", "cheese", "cup", "bowl", "bottle", "plate", "cutlery", "cat", "dog", "bird", "fish", "butterfly", "soccer-ball", "basketball", "medal", "trophy", "music-note", "drum", "guitar", "credit-card", "money-bag", "coins-stack", "saw", "shovel", "wheelbarrow", "ladder", "stopwatch", "alarm-clock", "flower", "mushroom", "cactus", "paper-plane", "life-ring", "helmet", "chair", "bed", "door", "stairs", "keyboard", "satellite", "antenna", "first-aid-kit", "windmill"];
  for (const id of NEW_IDS) {
    ok(GRAPHICS_ICON_LIBRARY[id] !== undefined, `the wave's icon "${id}" registered`);
  }
  const libIds = new Set(Object.keys(GRAPHICS_ICON_LIBRARY));
  for (const rule of ICON_KEYWORD_PICKS) {
    ok(libIds.has(rule.iconId), `rule → ${rule.iconId}: the dead-end law`);
  }
  for (const id of FALLBACK_ICON_CYCLE) {
    ok(libIds.has(id), `fallback → ${id}: the dead-end law`);
  }
});

await test("the icon picks stay honest: first-hit-wins keeps the established narrations' picks identical", async () => {
  const { iconForScene } = await import("../src/lib/ibismuh/graphics/planner");
  eq(iconForScene("Every product grows through three forces: reach, retention, and revenue.", 0), "chart-up", "the growth narration still rides its established pick (revenue → chart-up)");
  eq(iconForScene("The smart farm works as one system.", 1), "farmer", "the farm narration still rides the farmer");
  eq(iconForScene("Check your first workflow now and see the difference yourself.", 4), "check", "the check narration still rides the check");
});

await test("the catalog rides the wave: graphics rows match the library, the band holds", async () => {
  const { GRAPHICS_ICON_LIBRARY } = await import("../src/lib/ibismuh/graphics/planner");
  const { builtinCatalogManifest } = await import("../src/lib/ibismuh/catalog/manifest");
  const manifest = builtinCatalogManifest();
  const gRows = manifest.assets.filter((a) => a.lane === "graphics");
  eq(gRows.length, Object.keys(GRAPHICS_ICON_LIBRARY).length, "every icon has a row, no extras");
  const total = manifest.assets.length;
  ok(total >= 250 && total <= 400, `the total rides the production band (${total})`);
});

await test("the check chain and CI carry the battery", () => {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
  ok(typeof pkg.scripts["test:graphics-design"] === "string", "package.json carries test:graphics-design");
  ok(pkg.scripts.check?.includes("test:graphics-design"), "the check chain carries the battery");
  const ci = fs.readFileSync(".github/workflows/ci.yml", "utf8");
  ok(ci.includes("npm run test:graphics-design"), "CI carries the battery step");
});

// --- summary ------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

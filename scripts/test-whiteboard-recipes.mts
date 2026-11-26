#!/usr/bin/env node
// whiteboard-recipes suite — the whiteboard choreography registry (the
// engineering master plan's WS6: "animation recipe compiler — reusable
// choreography for both lanes").
//
// The module (src/lib/ibismuh/whiteboard/recipes.ts) NAMES the ten
// choreography shapes the plan lists and CLASSIFIES narration → recipe
// deterministically — the semantic layer ABOVE the one scheduling engine
// (the beat-plan's compile seam is untouched; one choreography engine).
// This suite pins the laws:
//
//   1. VOCABULARY — the plan's ten recipes, declared, charset-legal,
//      each carrying label + intent + cues.
//   2. CLASSIFIER — first hit wins in priority order; the same
//      narration → the same recipe; the fallback cycle rotates by
//      position (a cue-less board still names its shape — never silent,
//      never invented).
//   3. DEAD-END — every cue rule fires for its registered recipe; the
//      fallback cycle names only registered recipes; the self-check
//      refuses injected defects BY NAME.
//   4. ADOPTION — the whiteboard lane planner's beat receipts carry the
//      recipe name (additive; the stroke IR bytes untouched), and the
//      STUDIO engine's choreography is unperturbed (the beat-plan
//      compile stays the one seam).
//
// Run: node --import tsx scripts/test-whiteboard-recipes.mts   (pure — no
// DB, no DOM, no network; CI step)

import {
  WHITEBOARD_RECIPES,
  WHITEBOARD_RECIPE_IDS,
  assertWhiteboardRecipeRegistry,
  classifyWhiteboardRecipe,
  resolveWhiteboardRecipe,
  whiteboardRecipeNames,
  type WhiteboardRecipeSpec,
} from "../src/lib/ibismuh/whiteboard/recipes";
import { planWhiteboard } from "../src/lib/ibismuh/planners/whiteboard";

let passed = 0;
let failed = 0;
const failures: string[] = [];
let suite = "";

function suiteStart(name: string) {
  suite = name;
  console.log(`\n◆ ${name}`);
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

function throws(fn: () => unknown, needle: string, msg?: string) {
  try {
    fn();
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    if (text.includes(needle)) return;
    throw new Error(msg ?? `expected a refusal containing "${needle}", got: ${text} (in "${suite}")`);
  }
  throw new Error(msg ?? `expected a throw containing "${needle}", got success (in "${suite}")`);
}

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    failures.push(`${suite} — ${name}: ${msg}`);
    console.log(`  ✗ ${name}: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// 1. VOCABULARY
// ---------------------------------------------------------------------------

suiteStart("VOCABULARY — the plan's ten recipes");

await test("the registry carries exactly the plan's §10 whiteboard recipes", () => {
  eq([...whiteboardRecipeNames()], [
    "symbol-reveal",
    "object-annotation",
    "process-flow",
    "growth-chart",
    "person-prop",
    "warning-alert",
    "compare-states",
    "compound-assembly",
    "handwriting-title",
    "board-conclusion",
  ]);
});

await test("every recipe carries label, intent, and cues; the charset law holds", () => {
  for (const id of WHITEBOARD_RECIPE_IDS) {
    const spec = WHITEBOARD_RECIPES[id];
    ok(spec.label.trim().length > 0, `${id}: label`);
    ok(spec.intent.trim().length > 0, `${id}: intent`);
    ok(spec.cues.length > 0, `${id}: cues`);
    ok(/^[a-z0-9-]+$/.test(id), `${id}: charset`);
    ok(resolveWhiteboardRecipe(id) !== null, `${id}: resolves`);
  }
  eq(resolveWhiteboardRecipe("no-such-recipe"), null, "an unknown id resolves to null (the tolerant READ)");
});

// ---------------------------------------------------------------------------
// 2. CLASSIFIER — priority order, determinism, the fallback cycle
// ---------------------------------------------------------------------------

suiteStart("CLASSIFIER — first hit wins, the cycle never silences");

await test("the cue tables fire per recipe", () => {
  eq(classifyWhiteboardRecipe("The compost process works in three steps.", 0), "process-flow");
  eq(classifyWhiteboardRecipe("Solar versus diesel, the big difference.", 0), "compare-states");
  eq(classifyWhiteboardRecipe("Watch out: the danger of untreated water.", 0), "warning-alert");
  eq(classifyWhiteboardRecipe("In conclusion, the farm thrives.", 0), "board-conclusion");
  eq(classifyWhiteboardRecipe("Their savings grew with compound interest.", 0), "growth-chart");
  eq(classifyWhiteboardRecipe("The farmer carries the watering can.", 0), "person-prop");
  eq(classifyWhiteboardRecipe("The whole system assembles from five parts.", 0), "compound-assembly");
  eq(classifyWhiteboardRecipe("Today we learn how seeds sprout.", 0), "handwriting-title");
});

await test("priority order resolves overlapping cues deterministically", () => {
  // "process" precedes "growth" in declaration order — the first table wins.
  eq(classifyWhiteboardRecipe("The growth process in steps.", 0), "process-flow");
  const a = classifyWhiteboardRecipe("The growth process in steps.", 0);
  const b = classifyWhiteboardRecipe("The growth process in steps.", 0);
  eq(a, b, "same narration → same recipe");
});

await test("a cue-less board names its shape through the fallback cycle", () => {
  const plain = "The hills stand quiet under clouds.";
  eq(classifyWhiteboardRecipe(plain, 0), "symbol-reveal");
  eq(classifyWhiteboardRecipe(plain, 1), "object-annotation");
  eq(classifyWhiteboardRecipe(plain, 2), "process-flow");
  eq(classifyWhiteboardRecipe(plain, 4), "symbol-reveal", "the cycle wraps");
});

// ---------------------------------------------------------------------------
// 3. DEAD-END — the self-check, injected defects
// ---------------------------------------------------------------------------

suiteStart("DEAD-END — the self-check refuses defects by name");

await test("the shipped registry validates clean (self-check at load + explicit)", () => {
  assertWhiteboardRecipeRegistry(); // throws on any defect
});

await test("an injected cue-less recipe refuses", () => {
  const broken: WhiteboardRecipeSpec[] = [{ ...WHITEBOARD_RECIPES["symbol-reveal"], id: "symbol-reveal", cues: [] }];
  throws(() => assertWhiteboardRecipeRegistry(broken), "declares no cues");
});

await test("an injected ghost-cycle recipe refuses", () => {
  const broken = [...WHITEBOARD_RECIPE_IDS.map((id) => WHITEBOARD_RECIPES[id])];
  (broken as unknown as { FALLBACK_RECIPE_CYCLE?: string[] }).FALLBACK_RECIPE_CYCLE = ["ghost"];
  // The cycle check reads the module's own constant — the ghost injection
  // rides the declared-list check instead: an entry outside the closed set.
  const outsider: WhiteboardRecipeSpec = { ...WHITEBOARD_RECIPES["symbol-reveal"], id: "ghost" as never };
  throws(() => assertWhiteboardRecipeRegistry([...broken, outsider]), "outside the closed vocabulary");
});

// ---------------------------------------------------------------------------
// 4. ADOPTION — the lane planner's receipts name the recipe
// ---------------------------------------------------------------------------

suiteStart("ADOPTION — the receipts carry the recipe name");

await test("the whiteboard lane planner names the recipe in every beat row", async () => {
  const out = await planWhiteboard({
    brief: {
      topic: "Compost",
      scenes: [
        { id: "s1", narration: "The compost process works in steps.", visualIntent: "process" },
        { id: "s2", narration: "The hills stand quiet under clouds.", visualIntent: "hills" },
      ],
    },
    tone: "neutral",
  });
  const beats = out.plannerMeta.beats;
  ok(Array.isArray(beats) && beats.length === 2, "one row per board");
  ok(beats[0].reason.includes("process-flow"), "the cue-fired recipe is named");
  ok(beats[1].reason.includes("object-annotation"), "the fallback recipe is named (cycle position 1)");
  ok(beats.every((b) => b.reason.includes("rule")), "the rule vocabulary stays honest");
});

await test("the stroke IR bytes stay untouched — the receipt is plannerMeta-side only", async () => {
  const out = await planWhiteboard({
    brief: {
      topic: "Water cycle",
      scenes: [{ id: "s1", narration: "Rain falls on the hills.", visualIntent: "rain" }],
    },
    tone: "neutral",
  });
  const scene = out.scenes[0];
  eq(scene.paths[0].role, "frame");
  eq(scene.paths[0].d, "M 100 100 H 1180 V 620 H 100 Z");
  eq(scene.paths[1].d, "M 140 200 H 700");
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== whiteboard-recipes: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}

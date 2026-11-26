#!/usr/bin/env node
// whiteboard multi-pick suite — Phase B slice 2 (the count lane).
//
// Slice 1 made repeated placement SAFE in the engine (placement identity).
// Slice 2 makes the PLANNER LANES emit it: the narration can NUMBER a
// concept ("two coins", "revenue doubled") and the scaffold boards the SAME
// asset twice. This suite pins the planner laws that make that honest:
//
//   1. COUNT LANE — the native rich scaffold: cue + rule hit in ONE sentence
//                     → a named twin pair (coin/coin-2) riding the parity
//                     support slot, the support pick stepped aside. No cue →
//                     no placementId field anywhere (byte-identity). Fallback
//                     picks never repeat; openers/closers never repeat; the
//                     cue is sentence-scoped to the rule hit; determinism.
//   2. WIRE        — the planner's twin scene validates against the real
//                     library, round-trips the doc, and the ENGINE's fill
//                     law schedules BOTH instances (the second carries
//                     placementId on the wire; the first stays field-free).
//   3. LLM LANE    — the model may repeat an asset (counted narration):
//                     the pair is named via the editor's own derivation, a
//                     third instance dies with the cap named, a
//                     single-instance pick carries no id (wire unchanged),
//                     compose writes ids only when present, beats rank the
//                     pair as one concept, and the prompt pins the law.
//   4. REPAIR      — the engine-lane repair treats a twin pair as ONE
//                     concept (both swap to the same asset, the placement
//                     ids survive untouched — they are addresses).
//   5. ACCOUNTING  — every raw pick gets exactly one verdict: the repeat
//                     names its cap, the over-cap extra names the positional
//                     cap, and a bad pick AFTER a repeat still gets its
//                     specific reason (no silent tail).
//
// Run: npm run test:whiteboard-multipick   (pure — no DB, no DOM; CI step)

import { buildGeneratedCards, KEYWORD_PICKS, multiPickCue, repairWhiteboardSceneDoc, scaffoldWhiteboardProject, serializeWhiteboardDoc, parseWhiteboardDoc } from "../src/lib/ibismuh/whiteboard/whiteboard-planner";
import type { WhiteboardDoc } from "../src/lib/ibismuh/whiteboard/whiteboard-planner";
import { validateWhiteboardProject } from "../src/lib/ibismuh/whiteboard/storyboard";
import { loadLibrary } from "../src/lib/ibismuh/whiteboard/assets";
import {
  composeLlmScaffold,
  normalizeLlmScenePlans,
  PLANNER_SYSTEM_PROMPT,
  WB_PLANNER_CONCEPTS_PER_SCENE,
  WB_PLANNER_MAX_REPEATS_PER_ASSET,
} from "../src/lib/ibismuh/whiteboard/llm-planner";
import { buildGeometry, scheduleScene } from "../src/lib/ibismuh/whiteboard/timing";
import type { AssetGeometry } from "../src/lib/ibismuh/whiteboard/timing";

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

// --- fixtures -----------------------------------------------------------------

const VIDEO = "cmwi2xgbm0007qaga69fp6zzh"; // a cuid-shaped id (the charset law's real shape)
const cards = buildGeneratedCards({ videoId: VIDEO, topic: "Money", lastNarration: "Start with one check." });
const LIB = loadLibrary(cards);

/** A 4-scene story whose SECOND scene carries the counted narration. The
 * opener picks growth (NOT coin — the anti-repeat carry would otherwise
 * exclude coin from scene 2), so the money rule is free to fire the twin. */
const STORY = [
  "Growth follows the trend.",
  "The cost of two tickets at the stall.",
  "And growth compounds when the data backs the decision.",
  "The close stands.",
];

const rich = (narrations: string[] = STORY) =>
  scaffoldWhiteboardProject({
    scenes: narrations.map((n, i) => ({ index: i + 1, title: `Beat ${i + 1}`, narration: n })),
    topic: "Money",
    generatedAssets: cards,
  });

const moneyPick = KEYWORD_PICKS.find((k) => k.assetId === "coin");
if (!moneyPick) throw new Error("the money rule exists in the keyword table");
const moneyRule = moneyPick.re;

/** Synthetic coin geometry: one stroke, one instance per placement key. */
function coinGeo(): Map<string, AssetGeometry> {
  return buildGeometry([{ id: "coin", paths: [{ id: "p1", d: "M 0 0 L 100 0" }] }]);
}

const v = (p: unknown) => validateWhiteboardProject(p, LIB.libraryIndex);

// --- 1. COUNT LANE ------------------------------------------------------------

suiteStart("count lane — the rich scaffold boards the count");

await test("a counted narration boards the SAME asset twice under explicit placement ids", () => {
  const p = rich();
  const mid = p.scenes[1];
  eq(mid.placements.length, 2, "the twin scene carries exactly the pair (the support steps aside)");
  eq(mid.placements[0].assetId, "coin", "the counted concept is the money rule's coin");
  eq(mid.placements[1].assetId, "coin", "the twin is the SAME asset (repeated placement)");
  eq(mid.placements[0].placementId, "coin", "the first instance is NAMED");
  eq(mid.placements[1].placementId, "coin-2", "the second instance derives via the editor's own law");
  eq(mid.placements[0].order, 0, "draw order: the pair first");
  eq(mid.placements[1].order, 1, "the twin follows");
  ok(mid.placements[0].placement.x !== mid.placements[1].placement.x, "the pair sits on distinct slots");
  const r = v(p);
  ok(r.project !== null, `the twin scaffold validates clean: ${r.errors.join(" · ")}`);
});

await test("a cue-less rich scene emits NO placementId fields (the byte-identity law)", () => {
  const p = rich([
    "Growth follows the trend.",
    "Growth follows the trend again, with data.",
    "The cost lands on the stall.",
    "The close stands.",
  ]);
  for (const s of p.scenes) {
    for (const pl of s.placements) {
      eq(pl.placementId, undefined, `scene ${s.id} placement ${pl.assetId}: no placementId field on the wire`);
    }
  }
  eq(p.scenes[1].placements.length, 2, "the cue-less middle keeps primary + support");
});

await test("a fallback-cycle pick never repeats (no rule, no narration evidence)", () => {
  const p = rich([
    "Growth follows the trend.",
    "An ordinary sentence about the two of them, naming no concept at all.",
    "Growth follows the trend again, with data.",
    "The close stands.",
  ]);
  const mid = p.scenes[1];
  const ids = mid.placements.map((pl) => pl.assetId);
  eq(new Set(ids).size, ids.length, "every placement is a DISTINCT asset (fallback boards never twin)");
  for (const pl of mid.placements) eq(pl.placementId, undefined, "and no instance is named");
});

await test("the cue is sentence-scoped to the rule hit (a stray count never duplicates a board)", () => {
  // The rule fires in sentence 1; the count lives in sentence 2 — no twin.
  eq(multiPickCue("The cost rose. Two years later the market calmed.", moneyRule), false, "cue outside the rule's sentence refused");
  eq(multiPickCue("The cost of two tickets.", moneyRule), true, "cue inside the rule's sentence accepted");
  eq(multiPickCue("Profit doubled last quarter.", moneyRule), true, "a following count verb rides the same sentence");
  // And the scaffold agrees with the law.
  const p = rich([
    "Growth follows the trend.",
    "The cost rose. Two years later the market calmed.",
    "Growth follows the trend again, with data.",
    "The close stands.",
  ]);
  for (const pl of p.scenes[1].placements) eq(pl.placementId, undefined, "the cross-sentence count never twins the board");
});

await test("opener and closer scenes never repeat — the cards own those boards", () => {
  const p = rich([
    "The cost of two tickets at the fair.",
    "Growth follows the trend.",
    "The cost of two tickets at the stall.",
    "The cost of two tickets in the end.",
  ]);
  for (const pl of p.scenes[0].placements) eq(pl.placementId, undefined, "the opener stays twin-free");
  for (const pl of p.scenes[3].placements) eq(pl.placementId, undefined, "the closer stays twin-free");
  const ids1 = p.scenes[0].placements.map((pl) => pl.assetId);
  eq(new Set(ids1).size, ids1.length, "opener: distinct assets only");
  const ids3 = p.scenes[3].placements.map((pl) => pl.assetId);
  eq(new Set(ids3).size, ids3.length, "closer: distinct assets only");
});

await test("the count lane is deterministic and the anti-repeat carry survives a twin scene", () => {
  const a = rich();
  const b = rich();
  eq(JSON.stringify(a), JSON.stringify(b), "same scenes → byte-identical scaffold (twin lane included)");
  // The anti-repeat law excludes the PREVIOUS scene's PRIMARY — the twin
  // pair is still that concept, so the next scene's primary moves off it.
  const nextPrimary = a.scenes[2].placements.find((pl) => pl.assetId !== cards[0].id && pl.assetId !== cards[1].id)?.assetId ?? "";
  ok(nextPrimary !== "coin", `the scene after a twin picks a different primary: ${nextPrimary}`);
});

// --- 2. WIRE ------------------------------------------------------------------

suiteStart("wire — the planner's twin scene through the engine's gates");

await test("the twin scene validates against the REAL library and round-trips the doc", () => {
  const p = rich();
  ok(LIB.warnings.length === 0, `the library loads clean: ${LIB.warnings.map((w) => w.reasons.join(",")).join(" · ")}`);
  const r = v(p);
  ok(r.project !== null, `validates clean: ${r.errors.join(" · ")}`);
  const doc: WhiteboardDoc = { rev: 9, project: r.project };
  const back = parseWhiteboardDoc(serializeWhiteboardDoc(doc));
  ok(back !== null, "the doc parses back");
  const mid = back?.project.scenes[1].placements ?? [];
  eq(mid.map((pl) => pl.placementId), ["coin", "coin-2"], "both placement ids survive the round-trip");
  eq(back?.rev, 9, "the rev survives");
});

await test("the ENGINE's fill law schedules BOTH instances off the planner's twin scene", () => {
  const p = rich();
  const events = scheduleScene(p.scenes[1], 6000, coinGeo());
  const draws = events.filter((e) => e.type === "draw_path");
  eq(draws.length, 2, "two instances → two draw events (one per instance, the per-instance claimed-key law)");
  const withId = draws.filter((e) => e.type === "draw_path" && "placementId" in e && (e as { placementId?: string }).placementId !== undefined);
  eq(withId.length, 1, "exactly ONE event carries the placement address");
  eq((withId[0] as unknown as { placementId?: string }).placementId, "coin-2", "and it is the SECOND instance");
  // The first instance's key IS the assetId — the wire stays byte-shaped
  // (the slice-1 law, now proven through PLANNER output, not a fixture).
  const bare = draws.filter((e) => e.type === "draw_path" && !("placementId" in e));
  eq(bare.length, 1, "the first instance's events carry no placementId field");
});

// --- 3. LLM LANE --------------------------------------------------------------

suiteStart("llm lane — the model may repeat, the engine names");

await test("a repeated pick survives as a named pair; a single pick stays field-free", () => {
  const out = normalizeLlmScenePlans(
    [
      {
        scene: 1,
        assets: [
          { assetId: "coin", x: 600, y: 400, scale: 1.5, rotateDeg: 0 },
          { assetId: "lightbulb", x: 1200, y: 400, scale: 1.5, rotateDeg: 0 },
          { assetId: "coin", x: 900, y: 700, scale: 1.5, rotateDeg: 0 },
        ],
      },
    ],
    { scenes: [{ index: 1, title: "t", narration: "Two dollars." }], catalogIds: new Set(["coin", "lightbulb"]), width: 1920, height: 1080 }
  );
  eq(out.fallback, [], "the scene is served");
  eq(out.dropped.length, 0, "nothing dropped");
  const picks = out.served.get(1)?.picks ?? [];
  eq(picks.length, 3, "the repeat survives (cap 2 instances, plus the distinct asset)");
  eq(picks.map((p) => p.placementId), ["coin", undefined, "coin-2"], "the pair is named; the single pick stays field-free");
  eq(WB_PLANNER_MAX_REPEATS_PER_ASSET, 2, "the repeat cap is two");
});

await test("a third instance dies with the repeat cap named — and the prompt pins the law", () => {
  const out = normalizeLlmScenePlans(
    [
      {
        scene: 1,
        assets: [
          { assetId: "coin", x: 600, y: 400, scale: 1.5, rotateDeg: 0 },
          { assetId: "coin", x: 900, y: 700, scale: 1.5, rotateDeg: 0 },
          { assetId: "coin", x: 1100, y: 500, scale: 1.5, rotateDeg: 0 },
        ],
      },
    ],
    { scenes: [{ index: 1, title: "t", narration: "Three coins." }], catalogIds: new Set(["coin"]), width: 1920, height: 1080 }
  );
  eq(out.served.get(1)?.picks.length, 2, "the pair stands");
  ok(out.dropped.some((d) => /caps counted repeats at 2/.test(d.reason)), `the third instance names the repeat cap: ${out.dropped.map((d) => d.reason).join(" | ")}`);
  ok(
    PLANNER_SYSTEM_PROMPT.includes("Repeat an asset within one scene ONLY when the narration explicitly counts it"),
    "the prompt's counted-repeat law is pinned"
  );
  ok(PLANNER_SYSTEM_PROMPT.includes("at most two instances of any one asset"), "the prompt carries the two-instance ceiling");
});

await test("compose writes the ids on the wire only when present; beats rank the pair as one concept", () => {
  const native = scaffoldWhiteboardProject({ scenes: [{ index: 1, title: "t", narration: "Two dollars." }], topic: "t" });
  const served = new Map(
    normalizeLlmScenePlans(
      [
        {
          scene: 1,
          assets: [
            { assetId: "lightbulb", x: 1300, y: 400, scale: 1.5, rotateDeg: 0 },
            { assetId: "coin", x: 600, y: 400, scale: 1.5, rotateDeg: 0 },
            { assetId: "coin", x: 900, y: 700, scale: 1.5, rotateDeg: 0 },
          ],
          beats: [{ sentence: 1, assetIds: ["coin"] }],
        },
      ],
      { scenes: [{ index: 1, title: "t", narration: "Two dollars." }], catalogIds: new Set(["coin", "lightbulb"]), width: 1920, height: 1080 }
    ).served
  );
  const composed = composeLlmScaffold(native, [{ index: 1, title: "t", narration: "Two dollars." }], served);
  const placements = composed.scenes[0].placements;
  eq(placements[0].assetId, "title-hero", "the structural card survives");
  // The beat mentions coin first → the named PAIR rides before the
  // unmentioned pick (the pair ranks as ONE concept).
  eq(
    placements.slice(1).map((pl) => [pl.assetId, (pl as { placementId?: string }).placementId ?? null]),
    [
      ["coin", "coin"],
      ["coin", "coin-2"],
      ["lightbulb", null],
    ],
    "beat-ranked pair first, both named, the single pick field-free"
  );
  const r = v(composed);
  ok(r.project !== null, `the composed twin scaffold validates clean: ${r.errors.join(" · ")}`);
  ok(!JSON.stringify(native).includes("placementId"), "the cue-less native base carries no placementId field");
});

// --- 4. REPAIR ----------------------------------------------------------------

suiteStart("repair — the twin pair repairs as ONE concept");

await test("a repair swaps the pair to the SAME asset and keeps the placement ids", () => {
  const p = rich();
  const doc: WhiteboardDoc = { rev: 4, project: p };
  const repaired = repairWhiteboardSceneDoc({ doc, sceneIndex: 2, instruction: "turn it into a cog" });
  const mid = repaired.project.scenes[1].placements;
  eq(mid.length, 2, "the pair survives the repair");
  eq(mid[0].assetId, mid[1].assetId, "both instances swap to the SAME asset (the count is preserved)");
  eq(mid[0].assetId, "gear-cog", "the instruction's keyword rules the pair");
  eq(mid.map((pl) => pl.placementId), ["coin", "coin-2"], "the placement ids are addresses, not labels — untouched");
  ok(repaired.rev === doc.rev + 1, "the rev bumps");
  const r = v(repaired.project);
  ok(r.project !== null, `the repaired twin scene validates clean: ${r.errors.join(" · ")}`);
});

await test("a repair on a cue-less scene still changes what is drawn (the legacy law holds)", () => {
  const p = rich([
    "Growth follows the trend.",
    "Growth follows the trend again, with data.",
    "The cost lands on the stall.",
    "The close stands.",
  ]);
  const doc: WhiteboardDoc = { rev: 1, project: p };
  const before = JSON.stringify(p.scenes[1].placements);
  const repaired = repairWhiteboardSceneDoc({ doc, sceneIndex: 2, instruction: "make it machinery" });
  const after = JSON.stringify(repaired.project.scenes[1].placements);
  ok(before !== after, "the repair visibly changed the board");
  ok(!after.includes("placementId"), "a cue-less scene's repair emits no placementId fields");
});

// --- 5. ACCOUNTING ------------------------------------------------------------

suiteStart("accounting — every raw pick gets exactly one verdict");

await test("an over-cap repeat names the REPEAT cap, not the positional one", () => {
  const out = normalizeLlmScenePlans(
    [
      {
        scene: 1,
        assets: [
          { assetId: "coin", x: 600, y: 400, scale: 1.5, rotateDeg: 0 },
          { assetId: "coin", x: 900, y: 700, scale: 1.5, rotateDeg: 0 },
          { assetId: "coin", x: 1100, y: 500, scale: 1.5, rotateDeg: 0 },
          { assetId: "coin", x: 1300, y: 300, scale: 1.5, rotateDeg: 0 },
        ],
      },
    ],
    { scenes: [{ index: 1, title: "t", narration: "Many coins." }], catalogIds: new Set(["coin"]), width: 1920, height: 1080 }
  );
  eq(out.served.get(1)?.picks.length, 2, "the pair stands");
  eq(out.dropped.length, 2, "both excess instances are accounted");
  for (const d of out.dropped) {
    ok(/caps counted repeats at 2/.test(d.reason), `each excess names the repeat cap: ${d.reason}`);
    ok(!/concepts-per-scene/.test(d.reason), "the positional cap is NOT the reason for a repeat");
  }
});

await test("a bad pick AFTER a repeat still gets its specific reason (no silent tail)", () => {
  const out = normalizeLlmScenePlans(
    [
      {
        scene: 1,
        assets: [
          { assetId: "coin", x: 600, y: 400, scale: 1.5, rotateDeg: 0 },
          { assetId: "coin", x: 900, y: 700, scale: 1.5, rotateDeg: 0 },
          { assetId: "ghost", x: 100, y: 100, scale: 1 },
          { assetId: "title-hero", x: 100, y: 100, scale: 1 },
        ],
      },
    ],
    { scenes: [{ index: 1, title: "t", narration: "Two dollars." }], catalogIds: new Set(["coin"]), width: 1920, height: 1080 }
  );
  const reasons = out.dropped.map((d) => d.reason).join(" | ");
  ok(/not in the concept catalog/.test(reasons), `the ghost names its own reason: ${reasons}`);
  ok(/reserved for the scaffold grammar/.test(reasons), "the reserved card names its own reason");
});

await test("distinct extras beyond the concept cap name the positional cap (the old law, intact)", () => {
  const catalogIds = new Set(["coin", "bar-chart", "lightbulb", "up-mine", "heart-main"]);
  const out = normalizeLlmScenePlans(
    [
      {
        scene: 1,
        assets: ["coin", "bar-chart", "lightbulb", "up-mine", "heart-main"].map((id) => ({ assetId: id, x: 500, y: 500, scale: 1 })),
      },
    ],
    { scenes: [{ index: 1, title: "t", narration: "A busy board." }], catalogIds, width: 1920, height: 1080 }
  );
  eq(out.served.get(1)?.picks.length, WB_PLANNER_CONCEPTS_PER_SCENE, `capped at ${WB_PLANNER_CONCEPTS_PER_SCENE} concepts`);
  const capDrops = out.dropped.filter((d) => /concepts-per-scene cap/.test(d.reason));
  eq(capDrops.length, 2, "both extras accounted with the positional cap");
  for (const pl of out.served.get(1)?.picks ?? []) eq(pl.placementId, undefined, "distinct singles stay field-free");
});

// --- summary ------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

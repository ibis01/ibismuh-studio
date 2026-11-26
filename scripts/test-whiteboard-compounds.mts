#!/usr/bin/env node
// whiteboard compound suite — Phase B slice 3 (the composition graph).
//
// A compound is a NAMED COMPOSITION of registered primitives
// ("smart-farm-system" = barn + sun + tractor + corn + sprout). The laws
// that make composition honest:
//
//   1. REGISTRY   — the self-check refuses every defect by name: a ghost
//                   part (the dead-end law), duplicate compound ids,
//                   duplicate parts, charset violations (the id AND the
//                   derived part ids), non-finite offsets, non-positive
//                   scales, empty compositions.
//   2. EXPANSION  — the one planner-seam constructor: deterministic, offsets
//                   scale with the compound's size, every part NAMED
//                   (<compoundId>-<partAssetId>), orders in draw sequence.
//   3. NATIVE     — the rich scaffold's composition lane: a compound phrase
//                   boards the parts (the doc carries primitives only — no
//                   compound id on the wire); plain primitive narrations are
//                   byte-identical ("farm" still picks the barn); openers
//                   and closers never expand; the anti-repeat carry
//                   excludes a compound AND its parts; determinism.
//   4. CATALOG    — the compound rows ride the manifest (category
//                   "composition", the graph hashed as the content),
//                   tamper-evident, searchable, and the contracts parser
//                   refuses a malformed composition.
//   5. LLM LANE   — the compounds ride the planner catalog; a composition
//                   pick survives ONCE per scene (its parts are the
//                   repetition); compose expands the pick at its own origin;
//                   the parts ride the pick's beat rank as one concept.
//   6. ENGINE     — the fill law schedules the expanded parts (each part a
//                   claimed instance; the wire carries placementId only
//                   where the key differs from the assetId).
//
// Run: npm run test:whiteboard-compounds   (pure — no DB, no DOM; CI step)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ASSETS } from "../src/lib/ibismuh/whiteboard/assets";
import {
  assertCompoundRegistry,
  expandCompound,
  WB_COMPOUNDS,
  WB_COMPOUND_INDEX,
  type WhiteboardCompoundSpec,
} from "../src/lib/ibismuh/whiteboard/compounds";
import {
  buildGeneratedCards,
  pickCompoundForScene,
  scaffoldWhiteboardProject,
} from "../src/lib/ibismuh/whiteboard/whiteboard-planner";
import { validateWhiteboardProject, validWhiteboardId } from "../src/lib/ibismuh/whiteboard/storyboard";
import { loadLibrary } from "../src/lib/ibismuh/whiteboard/assets";
import { buildGeometry, scheduleScene } from "../src/lib/ibismuh/whiteboard/timing";
import type { AssetGeometry } from "../src/lib/ibismuh/whiteboard/timing";
import {
  builtinCatalogManifest,
  compoundCatalogRows,
} from "../src/lib/ibismuh/catalog/manifest";
import {
  parseCatalogManifest,
  serializeCatalogManifest,
  searchCatalog,
} from "../src/lib/ibismuh/catalog/contracts";
import {
  buildPlannerCatalog,
  composeLlmScaffold,
  normalizeLlmScenePlans,
  PLANNER_SYSTEM_PROMPT,
} from "../src/lib/ibismuh/whiteboard/llm-planner";

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

const VIDEO = "cmwi2xgbm0007qaga69fp6zzh"; // a cuid-shaped id (the charset law's real shape)
const cards = buildGeneratedCards({ videoId: VIDEO, topic: "Farms", lastNarration: "Start with one check." });
const LIB = loadLibrary(cards);
const v = (p: unknown) => validateWhiteboardProject(p, LIB.libraryIndex);

/** A 4-scene story whose SECOND scene names the smart farm. The opener
 *  picks growth (NOT a farm part), so the compound lane is free to fire. */
const STORY = [
  "Growth follows the trend.",
  "The smart farm works as one system.",
  "Growth follows the trend again, with data.",
  "The close stands.",
];

const rich = (narrations: string[] = STORY) =>
  scaffoldWhiteboardProject({
    scenes: narrations.map((n, i) => ({ index: i + 1, title: `Beat ${i + 1}`, narration: n })),
    topic: "Farms",
    generatedAssets: cards,
  });

const FARM = WB_COMPOUND_INDEX.get("smart-farm-system");
if (!FARM) throw new Error("the smart-farm-system spec exists");

const ASSET_IDS = new Set(ASSETS.map((a) => a.id));

/** Synthetic geometry for every part of every compound (one stroke each). */
function compoundGeo(): Map<string, AssetGeometry> {
  return buildGeometry(
    WB_COMPOUNDS.flatMap((spec) =>
      spec.parts.map((p) => ({ id: p.assetId, paths: [{ id: "p1", d: "M 0 0 L 100 0" }] }))
    )
  );
}

// --- 1. REGISTRY --------------------------------------------------------------

suiteStart("registry — the graph refuses every defect by name");

await test("the shipped registry validates clean against the real library", () => {
  assertCompoundRegistry(WB_COMPOUNDS, ASSET_IDS); // throws on any defect
  ok(WB_COMPOUNDS.length >= 3, `the registry is seeded (${WB_COMPOUNDS.length} compositions)`);
  for (const spec of WB_COMPOUNDS) {
    ok(validWhiteboardId(spec.id), `${spec.id}: the compound id passes the charset law`);
    for (const part of spec.parts) {
      ok(validWhiteboardId(`${spec.id}-${part.assetId}`), `${spec.id}: the derived part id "${spec.id}-${part.assetId}" passes the charset law`);
    }
  }
});

await test("the dead-end law: a ghost part is refused", () => {
  const ghost: WhiteboardCompoundSpec[] = [
    { id: "ghost-compound", parts: [{ assetId: "no-such-asset", dx: 0, dy: 0 }], tags: ["x"], aliases: [], a11y: "x", footprint: { w: 100, h: 100 } },
  ];
  throws(() => assertCompoundRegistry(ghost, ASSET_IDS), /not a registered library asset \(the dead-end law\)/);
});

await test("duplicate compound ids, duplicate parts, and charset violations are refused", () => {
  const dupe: WhiteboardCompoundSpec[] = [
    { id: "same", parts: [{ assetId: "coin", dx: 0, dy: 0 }], tags: [], aliases: [], a11y: "", footprint: { w: 1, h: 1 } },
    { id: "same", parts: [{ assetId: "clock", dx: 0, dy: 0 }], tags: [], aliases: [], a11y: "", footprint: { w: 1, h: 1 } },
  ];
  throws(() => assertCompoundRegistry(dupe, ASSET_IDS), /duplicate compound id/);
  const twinParts: WhiteboardCompoundSpec[] = [
    { id: "twin", parts: [{ assetId: "coin", dx: 0, dy: 0 }, { assetId: "coin", dx: 10, dy: 0 }], tags: [], aliases: [], a11y: "", footprint: { w: 1, h: 1 } },
  ];
  throws(() => assertCompoundRegistry(twinParts, ASSET_IDS), /places "coin" twice/);
  const badCharset: WhiteboardCompoundSpec[] = [
    { id: "bad--id", parts: [{ assetId: "coin", dx: 0, dy: 0 }], tags: [], aliases: [], a11y: "", footprint: { w: 1, h: 1 } },
  ];
  throws(() => assertCompoundRegistry(badCharset, ASSET_IDS), /violates the id charset/);
  const empty: WhiteboardCompoundSpec[] = [
    { id: "empty", parts: [], tags: [], aliases: [], a11y: "", footprint: { w: 1, h: 1 } },
  ];
  throws(() => assertCompoundRegistry(empty, ASSET_IDS), /composes nothing/);
  const nonFinite: WhiteboardCompoundSpec[] = [
    { id: "nan", parts: [{ assetId: "coin", dx: Number.NaN, dy: 0 }], tags: [], aliases: [], a11y: "", footprint: { w: 1, h: 1 } },
  ];
  throws(() => assertCompoundRegistry(nonFinite, ASSET_IDS), /non-finite offset/);
  const zeroScale: WhiteboardCompoundSpec[] = [
    { id: "zero", parts: [{ assetId: "coin", dx: 0, dy: 0, scale: 0 }], tags: [], aliases: [], a11y: "", footprint: { w: 1, h: 1 } },
  ];
  throws(() => assertCompoundRegistry(zeroScale, ASSET_IDS), /non-positive scale/);
});

// --- 2. EXPANSION -------------------------------------------------------------

suiteStart("expansion — the one planner-seam constructor");

await test("expansion is deterministic, offsets ride the scale, parts are named and ordered", () => {
  const a = expandCompound(FARM, { x: 960, y: 500, scale: 1, rotateDeg: 0 }, 0);
  const b = expandCompound(FARM, { x: 960, y: 500, scale: 1, rotateDeg: 0 }, 0);
  eq(JSON.stringify(a), JSON.stringify(b), "same spec + origin → byte-identical parts");
  eq(a.length, FARM.parts.length, "one placement per part");
  a.forEach((part, i) => {
    const spec = FARM.parts[i];
    eq(part.assetId, spec.assetId, `part ${i}: the spec's asset`);
    eq(part.placementId, `${FARM.id}-${spec.assetId}`, `part ${i}: named <compoundId>-<partAssetId>`);
    eq(part.placement.x, 960 + Math.round(spec.dx * 1), `part ${i}: x = origin + offset × scale`);
    eq(part.placement.y, 500 + Math.round(spec.dy * 1), `part ${i}: y = origin + offset × scale`);
    eq(part.placement.scale, spec.scale ?? 1, `part ${i}: scale = compound × part factor`);
    eq(part.order, i, `part ${i}: draw order follows the spec`);
  });
  const scaled = expandCompound(FARM, { x: 100, y: 100, scale: 2, rotateDeg: 5 }, 3);
  eq(scaled[0].placement.x, 100 + Math.round(FARM.parts[0].dx * 2), "the footprint grows with the compound's scale");
  eq(scaled[0].order, 3, "the base order offsets the sequence");
  eq(scaled[0].placement.rotateDeg, 5, "the compound's rotation rides every part");
});

// --- 3. NATIVE LANE -----------------------------------------------------------

suiteStart("native lane — the composition boards the count");

await test("a compound phrase expands the scene's board into named parts (no compound id on the wire)", () => {
  const p = rich();
  const mid = p.scenes[1];
  eq(mid.placements.length, FARM.parts.length, "the composition IS the scene's content (the support steps aside)");
  eq(mid.placements.map((pl) => pl.assetId), FARM.parts.map((p) => p.assetId), "the parts ride in the spec's draw order");
  eq(mid.placements.map((pl) => pl.placementId), FARM.parts.map((p) => `${FARM.id}-${p.assetId}`), "every part is named");
  ok(!mid.placements.some((pl) => pl.assetId === FARM.id), "the doc carries primitives ONLY — the compound id never rides the wire (the one-syntax law)");
  const r = v(p);
  ok(r.project !== null, `the compound scaffold validates clean: ${r.errors.join(" · ")}`);
});

await test("plain primitive narrations are untouched (byte-identity: 'farm' still picks the barn)", () => {
  eq(pickCompoundForScene("Beat 2: the farm grows.", ""), null, "plain 'farm' is NOT a compound phrase");
  eq(pickCompoundForScene("Beat 2: the smart farm works.", "")?.id, FARM.id, "the phrase claims the composition");
  const plain = rich([
    "Growth follows the trend.",
    "The farm grows its crop.",
    "Growth follows the trend again, with data.",
    "The close stands.",
  ]);
  for (const s of plain.scenes) {
    for (const pl of s.placements) {
      eq(pl.placementId, undefined, `scene ${s.id}: a compound-less story emits no placementId fields`);
    }
  }
  const farmScene = plain.scenes[1];
  ok(farmScene.placements.some((pl) => pl.assetId === "barn"), "plain 'farm' still picks the barn (the primitive table's pin)");
  eq(farmScene.placements.length, 2, "the primitive scene keeps primary + support");
});

await test("openers and closers never expand — the cards own those boards", () => {
  const p = rich([
    "The smart farm works as one system.",
    "Growth follows the trend.",
    "The smart farm works as one system.",
    "The smart farm closes the story.",
  ]);
  for (const pl of p.scenes[0].placements) eq(pl.placementId, undefined, "the opener stays primitive");
  for (const pl of p.scenes[3].placements) eq(pl.placementId, undefined, "the closer stays primitive");
  const mid = p.scenes[2].placements.map((pl) => pl.assetId);
  eq(mid, FARM.parts.map((x) => x.assetId), "the middle scene rides the composition");
});

await test("the anti-repeat carry excludes a compound AND its parts; determinism holds", () => {
  const a = rich();
  const b = rich();
  eq(JSON.stringify(a), JSON.stringify(b), "same scenes → byte-identical scaffold (composition lane included)");
  const next = a.scenes[2];
  const partIds = FARM.parts.map((p) => p.assetId);
  for (const pl of next.placements) {
    ok(!partIds.includes(pl.assetId), `the scene after the composition excludes the parts: ${pl.assetId}`);
  }
  ok(next.placements.length >= 2, "the next scene picks a fresh cast");
});

// --- 4. CATALOG ---------------------------------------------------------------

suiteStart("catalog — the graph is registered, hashed, searchable, tamper-evident");

await test("the compound rows ride the builtin manifest with their graph as content", () => {
  const manifest = builtinCatalogManifest();
  const rows = manifest.assets.filter((a) => a.lane === "whiteboard" && a.category === "composition");
  eq(rows.length, WB_COMPOUNDS.length, "one composition row per registry spec");
  for (const row of rows) {
    const spec = WB_COMPOUND_INDEX.get(row.id);
    ok(spec !== undefined, `${row.id}: the row names a registry spec`);
    eq(row.composition?.parts.length, spec?.parts.length, `${row.id}: the row carries the graph`);
    ok(row.a11y.length > 10, `${row.id}: the accessibility line is declared`);
  }
  const farm = rows.find((r) => r.id === FARM.id);
  eq(farm?.composition?.parts.map((p) => p.assetId), FARM.parts.map((p) => p.assetId), "the graph survives onto the row");
});

await test("compound rows are deterministic and tamper-evident over the graph", () => {
  const a = compoundCatalogRows(WB_COMPOUNDS);
  const b = compoundCatalogRows(WB_COMPOUNDS);
  eq(JSON.stringify(a), JSON.stringify(b), "same specs → byte-identical rows");
  const manifest = builtinCatalogManifest();
  const text = serializeCatalogManifest(manifest);
  const parsed = JSON.parse(text) as { assets: { id: string; composition?: { parts: { dx: number }[] } }[] };
  const farmRow = parsed.assets.find((r) => r.id === FARM.id);
  ok(farmRow?.composition !== undefined, "the farm row carries a composition");
  if (!farmRow?.composition) throw new Error("the farm row lost its composition");
  farmRow.composition.parts[0].dx += 1; // tamper with the graph
  throws(() => parseCatalogManifest(JSON.stringify(parsed)), /fingerprint mismatch/, "a mutated graph refuses the manifest");
});

await test("the search engine finds the composition; the parser refuses a malformed graph", () => {
  const manifest = builtinCatalogManifest();
  const hits = searchCatalog(manifest, { text: "farm system", lane: "whiteboard" });
  ok(hits.some((h) => h.row.id === FARM.id), `search "farm system" finds the composition: ${hits.map((h) => h.row.id).join(", ")}`);
  // A malformed composition fails the contracts parse (fail-closed).
  const bad = JSON.parse(serializeCatalogManifest(manifest)) as { assets: unknown[] };
  const ghostRow = bad.assets.find((r) => (r as { id: string }).id === FARM.id) as { composition?: { parts: unknown[] } };
  ghostRow.composition = { parts: [{ dx: 1, dy: 2 }] }; // a part with no assetId
  throws(() => parseCatalogManifest(JSON.stringify(bad)), /assetId must be a non-empty string/, "a partless-assetId graph is refused");
});

// --- 5. LLM LANE --------------------------------------------------------------

suiteStart("llm lane — the model picks the composition, the seam expands it");

await test("the compounds ride the planner catalog; a composition pick survives ONCE", () => {
  const catalog = buildPlannerCatalog(ASSETS, WB_COMPOUNDS);
  const farmEntry = catalog.find((c) => c.id === FARM.id);
  ok(farmEntry !== undefined, "the compound rides the catalog");
  eq(farmEntry?.w, FARM.footprint.w, "the declared footprint rides the entry");
  const compoundIds = new Set(WB_COMPOUNDS.map((c) => c.id));
  const out = normalizeLlmScenePlans(
    [
      {
        scene: 1,
        assets: [
          { assetId: FARM.id, x: 900, y: 500, scale: 1, rotateDeg: 0 },
          { assetId: FARM.id, x: 600, y: 400, scale: 1, rotateDeg: 0 },
        ],
      },
    ],
    {
      scenes: [{ index: 1, title: "t", narration: "The smart farm." }],
      catalogIds: new Set([...ASSET_IDS, ...compoundIds]),
      width: 1920,
      height: 1080,
      compoundIds,
    }
  );
  eq(out.served.get(1)?.picks.length, 1, "the composition survives once");
  ok(out.dropped.some((d) => /places its parts itself — one composition per scene/.test(d.reason)), `the second composition names the law: ${out.dropped.map((d) => d.reason).join(" | ")}`);
});

await test("compose expands a composition pick at its own origin; the parts ride its beat rank", () => {
  const scenes = [{ index: 1, title: "t", narration: "The smart farm." }];
  const native = scaffoldWhiteboardProject({ scenes, topic: "t" });
  const compoundIds = new Set(WB_COMPOUNDS.map((c) => c.id));
  const served = new Map(
    normalizeLlmScenePlans(
      [
        {
          scene: 1,
          assets: [
            { assetId: "clock", x: 1600, y: 900, scale: 1, rotateDeg: 0 },
            { assetId: FARM.id, x: 900, y: 500, scale: 1, rotateDeg: 0 },
          ],
          beats: [{ sentence: 1, assetIds: [FARM.id] }],
        },
      ],
      {
        scenes,
        catalogIds: new Set([...ASSET_IDS, ...compoundIds]),
        width: 1920,
        height: 1080,
        compoundIds,
      }
    ).served
  );
  const composed = composeLlmScaffold(native, scenes, served, WB_COMPOUNDS);
  const placements = composed.scenes[0].placements;
  // title-hero, then the beat-ranked composition's parts, then the unmentioned clock.
  eq(placements[0].assetId, "title-hero", "the structural card survives");
  eq(placements.slice(1, 1 + FARM.parts.length).map((pl) => pl.placementId), FARM.parts.map((p) => `${FARM.id}-${p.assetId}`), "the expanded parts follow the card");
  eq(placements[placements.length - 1].assetId, "clock", "the unmentioned pick rides last");
  eq(placements[1].placement.x, 900 + Math.round(FARM.parts[0].dx * 1), "the pick's coordinates ARE the compound's origin");
  const r = v(composed);
  ok(r.project !== null, `the composed composition validates clean: ${r.errors.join(" · ")}`);
  ok(PLANNER_SYSTEM_PROMPT.includes('Catalog entries whose tags include "composition" are whole-scene compositions'), "the prompt pins the composition note");
});

// --- 6. ENGINE ----------------------------------------------------------------

suiteStart("engine — the fill law schedules the expanded parts");

await test("every expanded part claims its own stroke; the wire stays byte-shaped", () => {
  const p = rich();
  const events = scheduleScene(p.scenes[1], 8000, compoundGeo());
  const draws = events.filter((e) => e.type === "draw_path");
  eq(draws.length, FARM.parts.length, "one draw event per part");
  const named = draws.filter((e) => e.type === "draw_path" && (e as { placementId?: string }).placementId !== undefined);
  eq(named.length, FARM.parts.length, "every part's key differs from its assetId → every event carries the address");
  eq(
    named.map((e) => (e as unknown as { placementId: string }).placementId),
    FARM.parts.map((p) => `${FARM.id}-${p.assetId}`),
    "the addresses are the derived part identities"
  );
});

// --- 7. BUNDLE SAFETY ---------------------------------------------------------

suiteStart("bundle safety — the browser-facing modules stay client-clean");

await test("compounds.ts and catalog/search.ts carry no node-only imports (the palette imports them)", () => {
  // The studio (a client component) imports compounds.ts (placement) and
  // catalog/search.ts (the browser's engine). Either module gaining a
  // node:crypto / node:fs import — or compounds.ts a VALUE import of the
  // asset library (the engine chain) — breaks the browser bundle. The scan
  // is the guard: the client-safety law stays pinned, not remembered.
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const read = (p: string): string => fs.readFileSync(path.resolve(HERE, p), "utf8");
  const compoundsSrc = read("../src/lib/ibismuh/whiteboard/compounds.ts");
  ok(!/from "node:/.test(compoundsSrc), "compounds.ts: no node: imports");
  ok(!/import \{\s*ASSETS/.test(compoundsSrc) && !/import \{ ASSETS/.test(compoundsSrc), "compounds.ts: no value import of the asset library (type-only at most)");
  const searchSrc = read("../src/lib/ibismuh/catalog/search.ts");
  ok(!/from "node:/.test(searchSrc), "catalog/search.ts: no node: imports (the browser has no node:crypto)");
  ok(/export function searchRows/.test(searchSrc) && /export function searchCatalog/.test(searchSrc), "search.ts: both entry points exported");
});

// --- summary ------------------------------------------------------------------


console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

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
  deriveCompoundInstanceId,
  expandCompound,
  resolveCompoundGroupId,
  resolveInCompoundIndex,
  WB_COMPOUNDS,
  WB_COMPOUND_INDEX,
  type WhiteboardCompoundSpec,
} from "../src/lib/ibismuh/whiteboard/compounds";
import {
  buildChoreographyGroupReceipt,
  choreographyEventSetFingerprint,
  compileCompoundChoreography,
  COMPOUND_CHOREOGRAPHY_IDS,
  normalizeChoreographyGroupReceipt,
  resolveCompoundChoreography,
  type CompoundChoreographyId,
} from "../src/lib/ibismuh/whiteboard/choreography";
import {
  deleteCompoundGroup,
  duplicateCompoundGroup,
  groupMembers,
  isGroupLocked,
  nudgeCompoundGroup,
  recomposeCompoundGroup,
  setGroupLock,
  transformCompoundGroup,
  ungroupCompoundGroup,
} from "../src/lib/ibismuh/whiteboard/groups";
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

// --- 8. INSTANCE NAMESPACE (the re-audit's P0) ---------------------------------

suiteStart("instance namespace — repeated placement derives distinct, honest identities");

await test("an instanced expansion names its parts off the instance and stamps the group", () => {
  const instanced = expandCompound(FARM, { x: 500, y: 400, scale: 1, rotateDeg: 0 }, 0, "smart-farm-system-2");
  instanced.forEach((part, i) => {
    eq(part.placementId, `smart-farm-system-2-${FARM.parts[i].assetId}`, `part ${i}: named off the INSTANCE`);
    eq(part.groupId, "smart-farm-system-2", `part ${i}: carries its group mark`);
  });
  const legacy = expandCompound(FARM, { x: 500, y: 400, scale: 1, rotateDeg: 0 }, 0);
  legacy.forEach((part) => {
    eq(part.groupId, undefined, "the legacy (absent-instance) shape carries NO group mark — byte-identical");
    ok(part.placementId.startsWith(`${FARM.id}-`), "the legacy shape keeps the pre-instance part names");
  });
});

await test("the derive law: bare id first, then -2, -3…, collision-free, deterministic", () => {
  const empty = { placements: [] };
  eq(deriveCompoundInstanceId(empty, FARM), FARM.id, "an empty scene mints the bare compound id");
  const firstCopy = expandCompound(FARM, { x: 0, y: 0, scale: 1, rotateDeg: 0 }, 0, FARM.id).map((p) => ({
    assetId: p.assetId,
    placementId: p.placementId,
    groupId: p.groupId,
  }));
  eq(deriveCompoundInstanceId({ placements: firstCopy }, FARM), `${FARM.id}-2`, "a scene holding the first instance mints -2");
  const blocked = {
    placements: [
      ...firstCopy,
      { assetId: "clock", placementId: `${FARM.id}-2-${FARM.parts[0].assetId}` }, // the -2 copy's part key is taken
    ],
  };
  eq(deriveCompoundInstanceId(blocked, FARM), `${FARM.id}-3`, "a blocked -2 skips to -3 (part keys count)");
  eq(deriveCompoundInstanceId({ placements: firstCopy }, FARM), `${FARM.id}-2`, "deterministic: same scene → same mint");
});

await test("the registry refuses an id inside another compound's instance namespace", () => {
  const mk = (id: string): WhiteboardCompoundSpec => ({
    id,
    parts: [{ assetId: "coin", dx: 0, dy: 0 }],
    tags: [],
    aliases: [],
    a11y: "x",
    footprint: { w: 1, h: 1 },
  });
  throws(
    () => assertCompoundRegistry([mk("cycle"), mk("cycle-2")], ASSET_IDS),
    /collides with the instance namespace/,
    "an id that is another id + '-2' is refused (instance 2 of the first must never parse as the second)"
  );
  assertCompoundRegistry([mk("cycle"), mk("cycle-pro")], ASSET_IDS); // a non-ordinal suffix is fine
});

await test("the group resolver: exact match first, ordinals strip, ghosts refuse", () => {
  eq(resolveCompoundGroupId(FARM.id)?.id, FARM.id, "the bare compound id resolves exactly");
  eq(resolveCompoundGroupId(`${FARM.id}-7`)?.id, FARM.id, "an instanced id strips to its compound");
  eq(resolveCompoundGroupId("no-such-compound"), null, "a ghost refuses");
  eq(resolveCompoundGroupId("barn"), null, "a plain asset id is not a group");
  const synthetic = new Map([["mini", { id: "mini", parts: [{ assetId: "coin" }] }]]);
  eq(resolveInCompoundIndex("mini-3", synthetic)?.id, "mini", "the injected-index resolver rides the same law");
  eq(resolveInCompoundIndex("ghost", synthetic), null, "unknown in any index refuses");
});

// --- 9. GROUP LAWS (the validator) ---------------------------------------------

suiteStart("group laws — the validator judges every compound group, fail-closed");

const o1 = { x: 700, y: 420, scale: 1, rotateDeg: 0 };
const o2 = { x: 1300, y: 560, scale: 1, rotateDeg: 0 };
const copy1 = expandCompound(FARM, o1, 0, FARM.id);
const copy2 = expandCompound(FARM, o2, FARM.parts.length, `${FARM.id}-2`);

const twinScene = {
  id: "scene-1",
  narration: "Two smart farms work as one system.",
  background: "#ffffff" as const,
  placements: [...copy1, ...copy2].map((p) => ({
    assetId: p.assetId,
    placementId: p.placementId,
    groupId: p.groupId,
    placement: p.placement,
    order: p.order,
  })),
  animations: [],
  camera: [],
};
const mkProject = (scenes: unknown[]) => ({
  title: "twin compounds",
  width: 1920,
  height: 1080,
  fps: 24,
  hand: { style: "marker" },
  scenes,
});

await test("two copies of one compound coexist — the repeated-placement acceptance", () => {
  const r = v(mkProject([twinScene]));
  ok(r.project !== null, `two instances validate clean: ${r.errors.join(" · ")}`);
  const scene = r.project?.scenes[0];
  const groups = new Map<string, string[]>();
  for (const pl of scene?.placements ?? []) {
    if (pl.groupId === undefined) continue;
    const arr = groups.get(pl.groupId) ?? [];
    arr.push(pl.assetId);
    groups.set(pl.groupId, arr);
  }
  eq(groups.size, 2, "two distinct groups on one board");
  eq(groups.get(FARM.id), FARM.parts.map((p) => p.assetId), "group 1's member list IS the spec");
  eq(groups.get(`${FARM.id}-2`), FARM.parts.map((p) => p.assetId), "group 2's member list IS the spec");
});

await test("events address each copy's parts; an unnamed event is ambiguous and refused", () => {
  const p1 = LIB.extracted.get(copy1[0].assetId)?.paths[0]?.id;
  ok(typeof p1 === "string", "the first part's real geometry exists");
  const named = {
    ...mkProject([
      {
        ...twinScene,
        animations: [
          { type: "draw_path", assetId: copy1[0].assetId, placementId: copy1[0].placementId, pathId: p1, startMs: 0, durationMs: 800 },
          { type: "draw_path", assetId: copy2[0].assetId, placementId: copy2[0].placementId, pathId: p1, startMs: 900, durationMs: 800 },
        ],
      },
    ]),
  };
  ok(v(named).project !== null, "explicitly addressed events validate with two copies");
  const ambiguous = {
    ...mkProject([
      {
        ...twinScene,
        animations: [
          { type: "draw_path", assetId: copy1[0].assetId, pathId: p1, startMs: 0, durationMs: 800 },
        ],
      },
    ]),
  };
  const r = v(ambiguous);
  ok(r.project === null && r.errors.some((e) => /name the placementId/.test(e)), `the ambiguity law covers compound copies: ${r.errors.join(" · ")}`);
});

await test("the group law refuses a ghost, a missing member, an extra member, and a reorder", () => {
  const ghost = {
    ...mkProject([
      {
        ...twinScene,
        placements: twinScene.placements.map((pl) =>
          pl.placementId === copy1[0].placementId ? { ...pl, groupId: "ghost-compound" } : pl
        ),
      },
    ]),
  };
  const rGhost = v(ghost);
  ok(
    rGhost.project === null && rGhost.errors.some((e) => /does not name a registered compound instance/.test(e)),
    `a ghost group refuses: ${rGhost.errors.join(" · ")}`
  );
  const missing = {
    ...mkProject([
      { ...twinScene, placements: twinScene.placements.filter((pl) => pl.groupId !== FARM.id || pl.assetId !== FARM.parts[0].assetId) },
    ]),
  };
  const rMissing = v(missing);
  ok(
    rMissing.project === null && rMissing.errors.some((e) => /do not match the compound/.test(e)),
    `a partial group refuses: ${rMissing.errors.join(" · ")}`
  );
  const extra = {
    ...mkProject([
      {
        ...twinScene,
        placements: [
          ...twinScene.placements,
          { assetId: "clock", placementId: "clock-9", groupId: `${FARM.id}-2`, placement: { x: 100, y: 100, scale: 1, rotateDeg: 0 }, order: 99 },
        ],
      },
    ]),
  };
  const rExtra = v(extra);
  ok(
    rExtra.project === null && rExtra.errors.some((e) => /do not match the compound/.test(e)),
    `an extra member refuses: ${rExtra.errors.join(" · ")}`
  );
  const reordered = {
    ...mkProject([
      {
        ...twinScene,
        placements: twinScene.placements.map((pl) =>
          pl.groupId === FARM.id && pl.assetId === FARM.parts[0].assetId
            ? { ...pl, assetId: FARM.parts[1].assetId, placementId: `${FARM.id}-${FARM.parts[1].assetId}` }
            : pl
        ),
      },
    ]),
  };
  const rReordered = v(reordered);
  ok(
    rReordered.project === null && rReordered.errors.some((e) => /do not match the compound/.test(e)),
    `a member sequence that breaks the spec's draw order refuses: ${rReordered.errors.join(" · ")}`
  );
});

await test("a group without the registry is unjudgeable (fail-closed)", () => {
  const stripped = { ...LIB.libraryIndex, compoundIndex: undefined };
  const r = validateWhiteboardProject(mkProject([twinScene]), stripped as unknown as typeof LIB.libraryIndex);
  ok(
    r.project === null && r.errors.some((e) => /carries no compound registry/.test(e)),
    `the registry-less library refuses groups: ${r.errors.join(" · ")}`
  );
});

await test("groupLocks and choreography are judged; a save/reload round-trip is stable", () => {
  const locked = { ...mkProject([{ ...twinScene, groupLocks: [FARM.id] }]) };
  ok(v(locked).project !== null, "a lock on a real group validates");
  const ghostLock = { ...mkProject([{ ...twinScene, groupLocks: ["ghost-group"] }]) };
  const rGhostLock = v(ghostLock);
  ok(
    rGhostLock.project === null && rGhostLock.errors.some((e) => /a lock rides a real group/.test(e)),
    `a lock on a ghost refuses: ${rGhostLock.errors.join(" · ")}`
  );
  const junkChoreo = { ...mkProject([{ ...twinScene, choreography: "not-a-preset" }]) };
  const rJunk = v(junkChoreo);
  ok(
    rJunk.project === null && rJunk.errors.some((e) => /not one of the compound presets/.test(e)),
    `junk choreography refuses: ${rJunk.errors.join(" · ")}`
  );
  const choreoNoGroup = {
    ...mkProject([{ ...twinScene, placements: twinScene.placements.map(({ groupId: _g, ...rest }) => rest), choreography: COMPOUND_CHOREOGRAPHY_IDS[0] }]),
  };
  const rNoGroup = v(choreoNoGroup);
  ok(
    rNoGroup.project === null && rNoGroup.errors.some((e) => /receipt without its group/.test(e)),
    `choreography without a group refuses: ${rNoGroup.errors.join(" · ")}`
  );
  const staged = { ...mkProject([{ ...twinScene, choreography: COMPOUND_CHOREOGRAPHY_IDS[0] }]) };
  const parsed = JSON.parse(JSON.stringify(v(staged).project)) as unknown;
  const revalidated = v(parsed);
  ok(revalidated.project !== null, `the save/reload round-trip revalidates clean: ${revalidated.errors.join(" · ")}`);
  eq(
    JSON.stringify((revalidated.project as { scenes: unknown[] }).scenes[0]),
    JSON.stringify(v(staged).project?.scenes[0]),
    "round-trip bytes are stable"
  );
});

// --- 10. GROUP OPERATIONS -------------------------------------------------------

suiteStart("group operations — duplicate, delete, ungroup, recompose, nudge, lock");

await test("duplicate mints a fresh instance after the last member; the validator accepts it", () => {
  const project = mkProject([twinScene]);
  const scene = (v(project).project as { scenes: never[] }).scenes[0] as never as typeof twinScene;
  const res = duplicateCompoundGroup(
    scene as unknown as Parameters<typeof duplicateCompoundGroup>[0],
    `${FARM.id}-2`,
    { x: 1000, y: 300, scale: 1, rotateDeg: 0 }
  );
  ok(res !== null, "the duplicate succeeds");
  if (!res) return;
  eq(res.instanceId, `${FARM.id}-3`, "the derive law mints the next free instance");
  eq(groupMembers(res.scene, `${FARM.id}-3`).length, FARM.parts.length, "the copy carries the full member set");
  ok(groupMembers(res.scene, FARM.id).length === FARM.parts.length, "the original is untouched");
  ok(groupMembers(res.scene, `${FARM.id}-2`).length === FARM.parts.length, "the second copy is untouched");
  eq(
    duplicateCompoundGroup(scene as unknown as Parameters<typeof duplicateCompoundGroup>[0], `${FARM.id}-2`, { x: 1000, y: 300, scale: 1, rotateDeg: 0 }),
    res,
    "deterministic: same scene + origin → the same result"
  );
  const r = v(mkProject([res.scene]));
  ok(r.project !== null, `the tripled board validates clean: ${r.errors.join(" · ")}`);
});

await test("delete removes the members AND their events, atomically; a sibling survives", () => {
  const scene = {
    ...twinScene,
    animations: [
      { type: "draw_path", assetId: copy1[0].assetId, placementId: copy1[0].placementId, pathId: "p1", startMs: 0, durationMs: 500 },
      { type: "move_object", assetId: "clock", startMs: 0, durationMs: 500, to: { x: 1, y: 1, scale: 1, rotateDeg: 0 } },
    ] as never,
  };
  const next = deleteCompoundGroup(scene as never, FARM.id);
  ok(next !== null, "the delete succeeds");
  if (!next) return;
  eq(next.placements.length, FARM.parts.length, "only group 1's members left (copy 2 survives)");
  eq(next.animations.length, 1, "the group's event left with it; the sibling event stays");
  ok(next.animations[0] && (next.animations[0] as { assetId?: string }).assetId === "clock", "the surviving event is the sibling's");
  eq(deleteCompoundGroup({ ...scene, groupLocks: [FARM.id] } as never, FARM.id), null, "a locked group refuses the delete");
});

await test("ungroup keeps the identities; recompose re-applies the registry at the centroid; nudge moves the body", () => {
  const scene = twinScene as never as Parameters<typeof ungroupCompoundGroup>[0];
  const ungrouped = ungroupCompoundGroup(scene, FARM.id);
  ok(ungrouped !== null, "the ungroup succeeds");
  if (!ungrouped) return;
  ok(groupMembers(ungrouped, FARM.id).length === 0, "the mark is gone");
  const firstPart = ungrouped.placements.find((pl) => pl.placementId === copy1[0].placementId);
  ok(firstPart !== undefined && firstPart.groupId === undefined, "the part's identity (placementId) SURVIVES the ungroup");
  const recomposed = recomposeCompoundGroup(scene, FARM.id);
  ok(recomposed !== null, "the recompose succeeds");
  if (!recomposed) return;
  const centroid = {
    x: Math.round(groupMembers(scene, FARM.id).reduce((a, m) => a + m.placement.x, 0) / FARM.parts.length),
    y: Math.round(groupMembers(scene, FARM.id).reduce((a, m) => a + m.placement.y, 0) / FARM.parts.length),
  };
  const declared = expandCompound(FARM, { x: centroid.x, y: centroid.y, scale: 1, rotateDeg: 0 }, 0, FARM.id);
  for (let i = 0; i < FARM.parts.length; i++) {
    const member = groupMembers(recomposed, FARM.id)[i];
    ok(member !== undefined, `member ${i} exists`);
    eq(member?.placement.x, declared[i]?.placement.x, `member ${i}: recomposed to the declared offset`);
    eq(member?.placement.y, declared[i]?.placement.y, `member ${i}: recomposed to the declared offset`);
    eq(member?.placementId, declared[i]?.placementId, `member ${i}: the identity is stable (events keep addressing it)`);
  }
  const nudged = nudgeCompoundGroup(scene, FARM.id, 40, -30);
  ok(nudged !== null, "the nudge succeeds");
  if (!nudged) return;
  const base = groupMembers(scene, FARM.id);
  for (const [i, member] of groupMembers(nudged, FARM.id).entries()) {
    const from = base[i]?.placement;
    ok(from !== undefined, `member ${i} has a base placement`);
    eq(member.placement.x, (from?.x ?? 0) + 40, `member ${i}: +40 x`);
    eq(member.placement.y, (from?.y ?? 0) - 30, `member ${i}: −30 y`);
  }
  ok(nudgeCompoundGroup(scene, "no-such-group", 1, 1) === null, "an unknown group refuses the nudge");
});

await test("the lock roster: lock, verify, unlock — and locked members are inert", () => {
  const scene = twinScene as never as Parameters<typeof setGroupLock>[0];
  const locked = setGroupLock(scene, FARM.id, true);
  ok(isGroupLocked(locked, FARM.id), "the lock takes");
  eq(locked.groupLocks, [FARM.id], "the roster names the group");
  const unlocked = setGroupLock(locked, FARM.id, false);
  ok(!isGroupLocked(unlocked, FARM.id), "the unlock takes");
  eq(unlocked.groupLocks, undefined, "an empty roster drops the field (byte-honest)");
});

// --- 11. ATOMIC CARRY -----------------------------------------------------------

suiteStart("atomic carry — a compound crosses a board whole or not at all");

const carriedProject = (carryPlacements?: string[]) => ({
  title: "carry",
  width: 1920,
  height: 1080,
  fps: 24,
  hand: { style: "marker" },
  scenes: [
    twinScene,
    {
      id: "scene-2",
      narration: "The farm carries on.",
      background: "#f8f5ee" as const,
      placements: [],
      animations: [],
      camera: [],
      board: { mode: "continuous" as const, ...(carryPlacements ? { carryPlacements } : {}) },
    },
  ],
});

await test("naming the GROUP carries all its members; the default carries everything", () => {
  const whole = v(carriedProject([FARM.id]));
  ok(whole.project !== null, `a group-name carry validates: ${whole.errors.join(" · ")}`);
  const all = v(carriedProject());
  ok(all.project !== null, `the unnamed carry (everything) validates: ${all.errors.join(" · ")}`);
  const mixed = v(carriedProject([FARM.id, `${FARM.id}-2`]));
  ok(mixed.project !== null, `both groups named together validates: ${mixed.errors.join(" · ")}`);
});

await test("a partial group carry is refused — the compound cannot split across a board", () => {
  const split = v(carriedProject([copy1[0].placementId]));
  ok(
    split.project === null && split.errors.some((e) => /splits the compound group/.test(e)),
    `one member alone refuses: ${split.errors.join(" · ")}`
  );
  const partial = v(carriedProject([copy1[0].placementId, copy1[1].placementId]));
  ok(
    partial.project === null && partial.errors.some((e) => /splits the compound group/.test(e)),
    `two of five members refuse: ${partial.errors.join(" · ")}`
  );
});

// --- 12. CHOREOGRAPHY -----------------------------------------------------------

suiteStart("choreography — the named presets compile onto the placement events");

await test("the vocabulary is closed and resolved honestly", () => {
  ok(COMPOUND_CHOREOGRAPHY_IDS.length >= 3, "the preset set is seeded");
  eq(resolveCompoundChoreography("assembly-cascade"), "assembly-cascade", "a real preset resolves");
  eq(resolveCompoundChoreography("nope"), null, "junk refuses");
});

await test("cascade retimes the members sequentially in draw order, durations preserved", () => {
  const p = rich();
  const scene = p.scenes[1];
  const schedule = scheduleScene(scene, 8000, compoundGeo());
  const members = scene.placements.map((pl) => ({
    key: pl.placementId ?? pl.assetId,
    x: pl.placement.x,
    y: pl.placement.y,
  }));
  const compiled = compileCompoundChoreography({ preset: "assembly-cascade", members, events: schedule });
  eq(compiled.length, FARM.parts.length, "one event per member (each part carries one stroke)");
  let t = compiled[0]?.startMs ?? 0;
  compiled.forEach((ev, i) => {
    eq(ev.startMs, t, `event ${i}: packed back-to-back`);
    const src = schedule.find((s) => s.type === "draw_path" && (s as { placementId?: string }).placementId === (ev as { placementId?: string }).placementId);
    eq(ev.durationMs, src?.durationMs, `event ${i}: the fill law's duration is preserved`);
    eq((ev as { placementId?: string }).placementId, `${FARM.id}-${FARM.parts[i].assetId}`, `event ${i}: the member's identity rides the event`);
    t += ev.durationMs + 130;
  });
  eq(
    JSON.stringify(compileCompoundChoreography({ preset: "assembly-cascade", members, events: schedule })),
    JSON.stringify(compiled),
    "deterministic: same inputs → the same retiming"
  );
});

await test("center-out and edge-in order the parts by distance; edge-in mirrors center-out", () => {
  const p = rich();
  const scene = p.scenes[1];
  const schedule = scheduleScene(scene, 8000, compoundGeo());
  const members = scene.placements.map((pl) => ({
    key: pl.placementId ?? pl.assetId,
    x: pl.placement.x,
    y: pl.placement.y,
  }));
  const cascade = compileCompoundChoreography({ preset: "assembly-cascade", members, events: schedule });
  const centerOut = compileCompoundChoreography({ preset: "assembly-center-out", members, events: schedule });
  const edgeIn = compileCompoundChoreography({ preset: "assembly-edge-in", members, events: schedule });
  const keys = (events: typeof cascade) => events.map((e) => (e as { placementId?: string }).placementId);
  eq(keys(edgeIn), [...keys(centerOut)].reverse(), "edge-in is center-out mirrored (no distance ties on this layout)");
  ok(
    JSON.stringify(keys(centerOut)) !== JSON.stringify(keys(cascade)),
    "this layout's center-out differs from the declared draw order (the preset is a real reorder)"
  );
  // Sequential packing holds in every preset (the pen follows ONE stroke).
  for (const events of [cascade, centerOut, edgeIn]) {
    for (let i = 1; i < events.length; i++) {
      const prev = events[i - 1];
      const cur = events[i];
      ok(cur.startMs >= prev.startMs + prev.durationMs, `events ${i - 1}→${i} never overlap (the pen law)`);
    }
  }
});

/** The REAL library geometry (the same mapping the render seam rides) —
 *  the choreography's staged doc must validate against the real paths. */
function realGeo(): Map<string, AssetGeometry> {
  return buildGeometry(
    [...LIB.extracted.entries()].map(([id, ex]) => ({ id, paths: ex.paths }))
  );
}

await test("the compiled events persist as explicit (senior) and the receipt rides the scene", () => {
  const p = rich();
  const scene = p.scenes[1];
  const schedule = scheduleScene(scene, 8000, realGeo());
  const members = scene.placements.map((pl) => ({
    key: pl.placementId ?? pl.assetId,
    x: pl.placement.x,
    y: pl.placement.y,
  }));
  const compiled = compileCompoundChoreography({ preset: "assembly-cascade", members, events: schedule });
  const staged = {
    ...mkProject([{ ...scene, animations: compiled, choreography: "assembly-cascade" }]),
  };
  const r = v(staged);
  ok(r.project !== null, `the choreographed scene validates clean: ${r.errors.join(" · ")}`);
  if (!r.project) return;
  const reSchedule = scheduleScene(r.project.scenes[0] as never, 8000, realGeo());
  for (const ev of compiled) {
    const src = ev as { placementId?: string; pathId?: string; startMs: number };
    const kept = reSchedule.find(
      (e) =>
        e.type === "draw_path" &&
        (e as { placementId?: string }).placementId === src.placementId &&
        (e as { pathId?: string }).pathId === src.pathId
    );
    ok(kept !== undefined, `member stroke ${src.placementId} survived the re-schedule`);
    eq(kept?.startMs, src.startMs, `member stroke ${src.placementId}: the compiled timing is senior (the fill law left it alone)`);
  }
});

// --- 13. BUNDLE SAFETY ---------------------------------------------------------

suiteStart("bundle safety — the browser-facing modules stay client-clean");

await test("compounds.ts, groups.ts and catalog/search.ts carry no node-only imports (the palette imports them)", () => {
  // The studio (a client component) imports compounds.ts (placement),
  // groups.ts (the group operations) and catalog/search.ts (the browser's
  // engine). Any of them gaining a node:crypto / node:fs import — or
  // compounds.ts a VALUE import of the asset library (the engine chain) —
  // breaks the browser bundle. The scan is the guard: the client-safety
  // law stays pinned, not remembered.
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const read = (p: string): string => fs.readFileSync(path.resolve(HERE, p), "utf8");
  const compoundsSrc = read("../src/lib/ibismuh/whiteboard/compounds.ts");
  ok(!/from "node:/.test(compoundsSrc), "compounds.ts: no node: imports");
  ok(!/import \{\s*ASSETS/.test(compoundsSrc) && !/import \{ ASSETS/.test(compoundsSrc), "compounds.ts: no value import of the asset library (type-only at most)");
  const groupsSrc = read("../src/lib/ibismuh/whiteboard/groups.ts");
  ok(!/from "node:/.test(groupsSrc), "groups.ts: no node: imports (the editor's group ops are client-side)");
  const searchSrc = read("../src/lib/ibismuh/catalog/search.ts");
  ok(!/from "node:/.test(searchSrc), "catalog/search.ts: no node: imports (the browser has no node:crypto)");
  ok(/export function searchRows/.test(searchSrc) && /export function searchCatalog/.test(searchSrc), "search.ts: both entry points exported");
});

// --- 7. PHASE 4 — THE CANONICAL GROUP TRANSFORM, THE OVERRIDE-PRESERVING
//        RECOMPOSE, THE GROUP-KEYED RECEIPTS, THE NINE PRESETS ---------------

suiteStart("phase 4 — the canonical group transform and the override law");

// The instanced-group harness: a REAL derived instance id (the derive
// law — the scaffold may already board the farm), the parts expanded at
// a fixed origin, and a harness scene carrying ONLY the group's parts
// (compoundGeo() covers exactly those — the schedule needs no other
// geometry).
function instancedScene() {
  const base = rich();
  const scene0 = base.scenes[1];
  const instanceId = deriveCompoundInstanceId(scene0, FARM);
  const parts = expandCompound(FARM, { x: 400, y: 300, scale: 1, rotateDeg: 0 }, 0, instanceId);
  const scene = {
    id: "scene-901",
    narration: "The group transform harness draws the whole farm.",
    background: "#ffffff" as const,
    placements: parts,
    animations: [],
    camera: [],
  };
  const stagedBase = { ...base, scenes: [...base.scenes, scene] };
  return { base: stagedBase, parts, scene, groupId: instanceId };
}

const membersOf = (sc: { placements: Array<{ groupId?: string; placementId?: string; assetId: string; placement: { x: number; y: number; scale: number; rotateDeg: number } }> }, groupId: string) =>
  sc.placements.filter((p) => p.groupId === groupId).map((p) => ({ key: p.placementId ?? p.assetId, x: p.placement.x, y: p.placement.y }));

await test("the canonical transform composes exactly: no-op sequences reproduce the one-shot state", () => {
  const { scene: s0, groupId } = instancedScene();
  const oneShot = transformCompoundGroup(s0, groupId, { dx: 40, dy: -30, scale: 1.5, rotateDeg: 90 });
  const stepped = transformCompoundGroup(
    transformCompoundGroup(
      transformCompoundGroup(s0, groupId, { dx: 40, dy: -30, scale: 1.5, rotateDeg: 90 }),
      groupId,
      { dx: 0, dy: 0, scale: 1, rotateDeg: 0 }
    ),
    groupId,
    { dx: 0, dy: 0, scale: 1, rotateDeg: 0 }
  );
  if (oneShot === null || stepped === null) {
    ok(false, "both transform applications succeed");
    return;
  }
  const a = oneShot.placements.filter((p) => p.groupId === groupId).map((p) => p.placement);
  const b = stepped.placements.filter((p) => p.groupId === groupId).map((p) => p.placement);
  eq(a.length, b.length, "same member count");
  let maxDelta = 0;
  for (let i = 0; i < a.length; i++) {
    maxDelta = Math.max(maxDelta, Math.abs(a[i].x - b[i].x), Math.abs(a[i].y - b[i].y));
    eq(a[i].scale, b[i].scale, `member ${i} scale identical`);
    eq(a[i].rotateDeg, b[i].rotateDeg, `member ${i} rotation identical`);
  }
  ok(maxDelta === 0, `the composition is exact, not approximate (max delta ${maxDelta})`);
});

await test("the transform record rides the scene and the members move as one body", () => {
  const { scene: s0, groupId } = instancedScene();
  const before = s0.placements.filter((p) => p.groupId === groupId).map((p) => p.placement);
  const next = transformCompoundGroup(s0, groupId, { dx: 100, dy: 50, scale: 1.2, rotateDeg: 45 });
  if (next === null) {
    ok(false, "the transform applies");
    return;
  }
  const rec = next.groupTransforms?.[groupId];
  ok(!!rec, "the record is written");
  if (rec) {
    ok(Math.abs(rec.scale - 1.2) < 1e-9, "record scale is the applied scale");
    ok(Math.abs(rec.rotateDeg - 45) < 1e-9, "record rotation is the applied rotation");
  }
  const after = next.placements.filter((p) => p.groupId === groupId).map((p) => p.placement);
  eq(next.placements.filter((p) => p.groupId === undefined).length, s0.placements.filter((p) => p.groupId === undefined).length, "non-members untouched");
  for (let i = 0; i < before.length; i++) {
    ok(Math.abs(after[i].scale - before[i].scale * 1.2) < 1e-9, `member ${i} scale accumulated`);
    ok(Math.abs(after[i].rotateDeg - (before[i].rotateDeg + 45)) < 1e-9, `member ${i} rotation accumulated`);
  }
});

await test("nudge delegates to the transform — a nudge composes into the record too", () => {
  const { scene: s0, groupId } = instancedScene();
  const next = nudgeCompoundGroup(s0, groupId, -33, 12);
  if (next === null) {
    ok(false, "the nudge applies");
    return;
  }
  const rec = next.groupTransforms?.[groupId];
  ok(!!rec && rec.dx === -33 && rec.dy === 12 && rec.scale === 1 && rec.rotateDeg === 0, "the record carries the translation with identity scale/rotation");
});

await test("RECOMPOSE PRESERVES THE OVERRIDE: scale, rotation and move survive the declared re-expansion", () => {
  const { scene: s0, groupId } = instancedScene();
  const moved = transformCompoundGroup(s0, groupId, { dx: 120, dy: 80, scale: 1.5, rotateDeg: 30 });
  if (moved === null) {
    ok(false, "the transform applies");
    return;
  }
  const membersBefore = moved.placements.filter((p) => p.groupId === groupId).map((p) => p.placement);
  const recomposed = recomposeCompoundGroup(moved, groupId);
  if (recomposed === null) {
    ok(false, "the recompose applies");
    return;
  }
  const membersAfter = recomposed.placements.filter((p) => p.groupId === groupId).map((p) => p.placement);
  let maxDelta = 0;
  for (let i = 0; i < membersBefore.length; i++) {
    maxDelta = Math.max(maxDelta, Math.abs(membersBefore[i].x - membersAfter[i].x), Math.abs(membersBefore[i].y - membersAfter[i].y));
    ok(Math.abs(membersAfter[i].scale - membersBefore[i].scale) < 1e-9, `member ${i} scale survived`);
    ok(Math.abs(membersAfter[i].rotateDeg - membersBefore[i].rotateDeg) < 1e-9, `member ${i} rotation survived`);
  }
  ok(maxDelta <= 2, `recompose lands within rounding of the transformed state (max delta ${maxDelta})`);
});

await test("recompose WITHOUT a record stays the original law: declared layout at the live centroid", () => {
  const { scene: s0, parts, groupId } = instancedScene();
  const recomposed = recomposeCompoundGroup(s0, groupId);
  if (recomposed === null) {
    ok(false, "the recompose applies");
    return;
  }
  ok(recomposed.groupTransforms === undefined, "no record was invented");
  const members = recomposed.placements.filter((p) => p.groupId === groupId);
  const declared = parts.map((p) => p.placement);
  let same = true;
  for (let i = 0; i < members.length; i++) {
    if (Math.abs(members[i].placement.scale - declared[i].scale) > 0 || Math.abs(members[i].placement.rotateDeg - declared[i].rotateDeg) > 0) same = false;
  }
  ok(same, "member scale/rotation are the declared ones (scale 1, rotation 0)");
});

await test("the transform is fail-closed: locked groups, unknown groups, junk numbers refused", () => {
  const { scene, groupId } = instancedScene();
  ok(transformCompoundGroup(scene, "ghost", { dx: 1, dy: 1, scale: 1.1, rotateDeg: 0 }) === null, "unknown group refused");
  ok(transformCompoundGroup(scene, groupId, { dx: 1, dy: 1, scale: 0, rotateDeg: 0 }) === null, "zero scale refused");
  ok(transformCompoundGroup(scene, groupId, { dx: 1, dy: 1, scale: -2, rotateDeg: 0 }) === null, "negative scale refused");
  ok(transformCompoundGroup(scene, groupId, { dx: Number.NaN, dy: 1, scale: 1.1, rotateDeg: 0 }) === null, "NaN refused");
  ok(transformCompoundGroup(scene, groupId, { dx: 1, dy: Number.POSITIVE_INFINITY, scale: 1.1, rotateDeg: 0 }) === null, "Infinity refused");
  const locked = setGroupLock(scene, groupId, true);
  ok(transformCompoundGroup(locked, groupId, { dx: 1, dy: 1, scale: 1.1, rotateDeg: 0 }) === null, "locked group refused");
  ok(nudgeCompoundGroup(locked, groupId, 1, 1) === null, "nudge inherits the lock law");
});

await test("delete and ungroup lose only THEIR entries — the other group keeps its record and receipt", () => {
  const { scene, groupId } = instancedScene();
  const spec2 = WB_COMPOUND_INDEX.get("money-growth-cycle");
  if (!spec2) {
    ok(false, "a second compound spec exists");
    return;
  }
  const parts2 = expandCompound(spec2, { x: 800, y: 300, scale: 1, rotateDeg: 0 }, 0, "money-growth-cycle");
  const two = { ...scene, placements: [...scene.placements, ...parts2] };
  const t1 = transformCompoundGroup(two, groupId, { dx: 10, dy: 10, scale: 1.3, rotateDeg: 20 });
  const t2 = t1 && transformCompoundGroup(t1, "money-growth-cycle", { dx: -10, dy: -10, scale: 0.9, rotateDeg: -20 });
  if (!t2) {
    ok(false, "both groups transformed");
    return;
  }
  const staged = { ...t2, choreographyGroups: { [groupId]: "assembly-cascade", "money-growth-cycle": "assembly-edge-in" } };
  const afterDelete = deleteCompoundGroup(staged, groupId);
  if (afterDelete === null) {
    ok(false, "the delete applies");
    return;
  }
  ok(afterDelete.choreography === undefined, "the whole-scene scalar dies with any group");
  ok(afterDelete.choreographyGroups?.["money-growth-cycle"] === "assembly-edge-in", "the second group's receipt survives");
  ok(afterDelete.choreographyGroups !== undefined && !(groupId in afterDelete.choreographyGroups), "the deleted group's receipt leaves");
  ok(afterDelete.groupTransforms?.["money-growth-cycle"] !== undefined, "the second group's transform record survives");
  ok(afterDelete.groupTransforms !== undefined && !(groupId in afterDelete.groupTransforms), "the deleted group's record leaves");
  const afterUngroup = ungroupCompoundGroup(afterDelete, "money-growth-cycle");
  if (afterUngroup === null) {
    ok(false, "the ungroup applies");
    return;
  }
  ok(afterUngroup.choreographyGroups === undefined, "the last receipt entry leaves the scene (no dead data)");
  ok(afterUngroup.groupTransforms === undefined, "the last record entry leaves the scene");
});

await test("the validator accepts the keyed receipts and the transform records, and refuses ghosts and junk", () => {
  const { base, scene, groupId } = instancedScene();
  const staged = {
    ...scene,
    choreographyGroups: { [groupId]: "assembly-spiral" },
    groupTransforms: { [groupId]: { anchorX: 400, anchorY: 300, dx: 10, dy: -5, scale: 1.4, rotateDeg: 25 } },
  };
  const swap = (x: { id: string }) => (x.id === scene.id ? staged : x);
  ok(v({ ...base, scenes: base.scenes.map(swap) }).project !== null, "keyed receipts + records validate");
  const refuse = (mutate: (t: typeof staged) => unknown, why: string) => {
    const bad = mutate(staged) as typeof staged;
    ok(v({ ...base, scenes: base.scenes.map((x) => (x.id === scene.id ? bad : x)) }).project === null, why);
  };
  refuse((t) => ({ ...t, choreographyGroups: { ghost: "assembly-cascade" } }), "a ghost receipt key is refused");
  refuse((t) => ({ ...t, choreographyGroups: { [groupId]: "assembly-spin" } }), "an off-vocabulary preset is refused");
  refuse((t) => ({ ...t, groupTransforms: { [groupId]: { anchorX: 400, anchorY: 300, dx: 10, dy: -5, scale: 0, rotateDeg: 25 } } }), "a zero-scale record is refused");
  refuse((t) => ({ ...t, groupTransforms: { [groupId]: { anchorX: 400, anchorY: 300, dx: Number.NaN, dy: -5, scale: 1.4, rotateDeg: 25 } } }), "a NaN record is refused");
  refuse((t) => ({ ...t, groupTransforms: { ghost: { anchorX: 1, anchorY: 1, dx: 0, dy: 0, scale: 1.1, rotateDeg: 0 } } }), "a ghost record key is refused");
});

suiteStart("phase 4 — the nine presets: every one a deterministic ORDER, pen-safe");

const PRESET_ORDER_CASES: Array<[CompoundChoreographyId, string]> = [
  ["assembly-cascade", "draw order preserved"],
  ["assembly-center-out", "nearest the centroid first"],
  ["assembly-edge-in", "outermost first"],
  ["assembly-clockwise", "3 o'clock sweep, screen clockwise"],
  ["assembly-counterclockwise", "the reverse sweep"],
  ["assembly-top-down", "top to bottom"],
  ["assembly-left-right", "left to right"],
  ["assembly-alternate", "the ends weave inward"],
  ["assembly-spiral", "clockwise wedges, core first"],
];

await test("every vocabulary id is covered by the battery's case table", () => {
  eq(PRESET_ORDER_CASES.length, COMPOUND_CHOREOGRAPHY_IDS.length, "one case per preset — no silent vocabulary growth");
  for (const id of COMPOUND_CHOREOGRAPHY_IDS) ok(PRESET_ORDER_CASES.some(([p]) => p === id), `${id} has a case`);
});

await test("all nine presets compile off the real schedule and each keeps the pen law", () => {
  const { scene, groupId } = instancedScene();
  const geometry = compoundGeo();
  const schedule = scheduleScene(scene, 8000, geometry);
  for (const [preset, why] of PRESET_ORDER_CASES) {
    const compiled = compileCompoundChoreography({ preset, members: membersOf(scene, groupId), events: schedule });
    ok(compiled.length > 0, `${preset} compiles (${why})`);
    const ordered = [...compiled].sort((a, b) => a.startMs - b.startMs);
    let penSafe = true;
    for (let i = 1; i < ordered.length; i++) {
      if (ordered[i].startMs < ordered[i - 1].startMs + ordered[i - 1].durationMs) penSafe = false;
    }
    ok(penSafe, `${preset} is pen-safe (no stroke overlap)`);
    const again = compileCompoundChoreography({ preset, members: membersOf(scene, groupId), events: schedule });
    ok(JSON.stringify(again) === JSON.stringify(compiled), `${preset} is deterministic`);
  }
});

await test("the directional presets order as declared (spot checks on a real instanced group)", () => {
  const { scene, groupId } = instancedScene();
  const members = membersOf(scene, groupId);
  const schedule = scheduleScene(scene, 8000, compoundGeo());
  const firstKey = (preset: CompoundChoreographyId) => {
    const compiled = compileCompoundChoreography({ preset, members, events: schedule });
    if (compiled.length === 0) return null;
    const min = Math.min(...compiled.map((e) => e.startMs));
    const head = compiled.find((e) => e.startMs === min);
    return head ? head.placementId ?? head.assetId : null;
  };
  const sortedByY = [...members].sort((a, b) => a.y - b.y || members.indexOf(a) - members.indexOf(b));
  ok(firstKey("assembly-top-down") === sortedByY[0].key, "top-down draws the highest member first");
  const sortedByX = [...members].sort((a, b) => a.x - b.x || members.indexOf(a) - members.indexOf(b));
  ok(firstKey("assembly-left-right") === sortedByX[0].key, "left-right draws the leftmost member first");
  const cx = members.reduce((a, m) => a + m.x, 0) / members.length;
  const cy = members.reduce((a, m) => a + m.y, 0) / members.length;
  const sortedByDist = [...members]
    .map((m, i) => ({ m, i, d: Math.hypot(m.x - cx, m.y - cy) }))
    .sort((a, b) => a.d - b.d || a.i - b.i);
  ok(firstKey("assembly-center-out") === sortedByDist[0].m.key, "center-out draws the nearest member first");
  ok(firstKey("assembly-edge-in") === sortedByDist[sortedByDist.length - 1].m.key, "edge-in draws the outermost member first");
  const byDraw = members.map((m) => m.key);
  ok(firstKey("assembly-cascade") === byDraw[0], "cascade starts at the declared head");
  ok(firstKey("assembly-alternate") === byDraw[0], "alternate starts at the declared head too (the weave begins there)");
});

await test("the compile seam stays leaf-pure: no node imports in groups.ts or choreography.ts", () => {
  const here4 = path.dirname(fileURLToPath(import.meta.url));
  const read = (p: string): string => fs.readFileSync(path.resolve(here4, p), "utf8");
  ok(!/from "node:/.test(read("../src/lib/ibismuh/whiteboard/choreography.ts")), "choreography.ts: no node: imports");
  ok(!/from "node:/.test(read("../src/lib/ibismuh/whiteboard/groups.ts")), "groups.ts: no node: imports (the editor's group ops are client-side)");
});

// --- 14. PHASE 5 — THE RICH CHOREOGRAPHY RECEIPTS AND THE EVENT-SET LAW --------
//
// The plan's group receipts carry "timing source, event fingerprint,
// affected members, and version" — and the choreography law pins "one
// scene clock; reject overlap or missing event sets". The receipt is
// GROUP-KEYED and continues its own counter; the Phase 4 bare preset
// string is the legacy shape and upgrades on parse.

suiteStart("phase 5 — the rich choreography receipts and the event-set law");

await test("the receipt builder stamps the full record: clock, fingerprint, members, version", () => {
  const { scene, groupId } = instancedScene();
  const members = membersOf(scene, groupId).map((m) => m.key);
  const schedule = scheduleScene(scene, 8000, compoundGeo());
  const receipt = buildChoreographyGroupReceipt({ presetId: "assembly-spiral", memberKeys: members, events: schedule });
  eq(receipt.presetId, "assembly-spiral", "the preset rides");
  eq(receipt.timingSource, "scene-clock", "the ONE scene clock is named, not a second scheduler");
  ok(/^[0-9a-f]{8}$/.test(receipt.eventFingerprint), `the fingerprint is the 8-hex digest shape: ${receipt.eventFingerprint}`);
  eq(receipt.affectedMembers, [...members].sort(), "the roster IS the group's member keys, sorted");
  eq(receipt.version, 1, "the first compile stamps version 1");
  const again = buildChoreographyGroupReceipt({ presetId: "assembly-spiral", memberKeys: members, events: schedule });
  eq(again.eventFingerprint, receipt.eventFingerprint, "deterministic: same event set → same fingerprint");
  const next = buildChoreographyGroupReceipt({ presetId: "assembly-cascade", memberKeys: [...members].reverse(), events: schedule, previousVersion: 4 });
  eq(next.version, 5, "the counter is monotonic: previous 4 → this 5");
  eq(next.affectedMembers, receipt.affectedMembers, "member-key order does not move the roster (a set, sorted)");
});

await test("the fingerprint rides the SORTED event set: order never moves it, content always does", () => {
  const keys = ["b:x#p1#0#500", "a:y#p1#300#500", "c:z#t1#900#400"];
  eq(choreographyEventSetFingerprint(keys), choreographyEventSetFingerprint([...keys].reverse()), "the set sorts before hashing");
  ok(choreographyEventSetFingerprint(["a#1#0#100"]) !== choreographyEventSetFingerprint(["a#1#0#200"]), "a moved window moves the fingerprint");
  ok(choreographyEventSetFingerprint(["a", "b"]) !== choreographyEventSetFingerprint(["a"]), "a changed membership moves the fingerprint");
  const { scene, groupId } = instancedScene();
  const members = membersOf(scene, groupId).map((m) => m.key);
  const schedule = scheduleScene(scene, 8000, compoundGeo());
  const receipt = buildChoreographyGroupReceipt({ presetId: "assembly-cascade", memberKeys: members, events: schedule });
  const moved = schedule.map((e, i) => (i === 0 ? { ...e, startMs: e.startMs + 250 } : e));
  const receiptMoved = buildChoreographyGroupReceipt({ presetId: "assembly-cascade", memberKeys: members, events: moved });
  ok(receiptMoved.eventFingerprint !== receipt.eventFingerprint, "a re-timed member event moves the receipt's fingerprint");
});

await test("the event-set law: an empty/missing member event set refuses, fail-visible", () => {
  const { scene, groupId } = instancedScene();
  throws(
    () => compileCompoundChoreography({ preset: "assembly-cascade", members: membersOf(scene, groupId), events: [] }),
    /empty event set/,
    "a group with no drawable strokes cannot ride the one scene clock"
  );
});

await test("the event-set law: overlapping member windows refuse, the offending pair named", () => {
  const { scene, parts, groupId } = instancedScene();
  const overlapping = [
    { type: "draw_path", assetId: parts[0].assetId, placementId: parts[0].placementId, pathId: "p1", startMs: 0, durationMs: 500 },
    { type: "draw_path", assetId: parts[1].assetId, placementId: parts[1].placementId, pathId: "p1", startMs: 300, durationMs: 500 },
  ] as never;
  throws(
    () => compileCompoundChoreography({ preset: "assembly-cascade", members: membersOf(scene, groupId), events: overlapping }),
    new RegExp(`overlap[\\s\\S]*${parts[0].placementId}[\\s\\S]*${parts[1].placementId}`),
    "the refusal names BOTH members of the offending pair"
  );
});

await test("the event-set law: touching windows ride the ONE shared clock window — the fill law's cadence", () => {
  const { scene, parts, groupId } = instancedScene();
  const touching = [
    { type: "draw_path", assetId: parts[0].assetId, placementId: parts[0].placementId, pathId: "p1", startMs: 400, durationMs: 500 },
    { type: "draw_path", assetId: parts[1].assetId, placementId: parts[1].placementId, pathId: "p1", startMs: 900, durationMs: 500 },
  ] as never;
  const compiled = compileCompoundChoreography({ preset: "assembly-cascade", members: membersOf(scene, groupId), events: touching });
  eq(compiled.length, 2, "back-to-back strokes compile (touching is not overlap)");
  const earliest = Math.min(...(touching as Array<{ startMs: number }>).map((e) => e.startMs));
  eq(Math.min(...compiled.map((e) => e.startMs)), earliest, "the compiled band opens at the group's earliest stroke — ONE shared scene-clock window");
});

await test("legacy receipts normalize: the Phase 4 bare string upgrades to the rich shape on parse", () => {
  const { base, scene, groupId } = instancedScene();
  const staged = { ...scene, choreographyGroups: { [groupId]: "assembly-cascade" } };
  const swap = (x: { id: string }) => (x.id === scene.id ? staged : x);
  const r = v({ ...base, scenes: base.scenes.map(swap) });
  ok(r.project !== null, `the legacy receipt validates: ${r.errors.join(" · ")}`);
  if (!r.project) return;
  const parsedScene = r.project.scenes[r.project.scenes.length - 1];
  const receipt = parsedScene.choreographyGroups?.[groupId];
  ok(receipt !== undefined && typeof receipt !== "string", "the bare string is upgraded to the record shape");
  if (!receipt || typeof receipt === "string") return;
  eq(receipt.presetId, "assembly-cascade", "the preset survives the upgrade");
  eq(receipt.timingSource, "scene-clock", "the clock is named");
  ok(/^[0-9a-f]{8}$/.test(receipt.eventFingerprint), "the fingerprint derives from what the receipt rides HERE");
  eq(receipt.affectedMembers, membersOf(scene, groupId).map((m) => m.key).sort(), "the roster derives from the placed members");
  eq(receipt.version, 1, "the legacy shape carries no counter — the upgrade is the first receipt shape");
  const reparsed = JSON.parse(JSON.stringify(r.project)) as never;
  const r2 = v(reparsed);
  ok(r2.project !== null, `the upgraded doc revalidates clean: ${r2.errors.join(" · ")}`);
  const scene2 = (r2.project as { scenes: Array<{ choreographyGroups?: Record<string, unknown> }> }).scenes.at(-1);
  eq(
    JSON.stringify(scene2?.choreographyGroups),
    JSON.stringify(r.project.scenes.at(-1)?.choreographyGroups),
    "the normalized shape is stable across the save/reload round-trip"
  );
});

await test("junk rich receipts refuse: off-vocabulary, wrong clock, junk digest, strangers, dead counters", () => {
  const { base, scene, groupId } = instancedScene();
  const members = membersOf(scene, groupId).map((m) => m.key).sort();
  const good = {
    presetId: "assembly-cascade",
    timingSource: "scene-clock" as const,
    eventFingerprint: "0f1e2d3c",
    affectedMembers: members,
    version: 1,
  };
  const staged = { ...scene, choreographyGroups: { [groupId]: good } };
  const refuse = (mutate: (t: typeof staged) => unknown, why: string) => {
    const bad = mutate(staged) as typeof staged;
    const r = v({ ...base, scenes: base.scenes.map((x) => (x.id === scene.id ? bad : x)) });
    ok(r.project === null, why);
  };
  refuse((t) => ({ ...t, choreographyGroups: { [groupId]: { ...good, presetId: "assembly-spin" } } }), "an off-vocabulary preset refuses");
  refuse((t) => ({ ...t, choreographyGroups: { [groupId]: { ...good, timingSource: "hand-clock" } } }), "a second clock refuses (the one scene clock)");
  refuse((t) => ({ ...t, choreographyGroups: { [groupId]: { ...good, eventFingerprint: "not-hex" } } }), "a junk fingerprint refuses");
  refuse((t) => ({ ...t, choreographyGroups: { [groupId]: { ...good, affectedMembers: [] } } }), "an empty roster refuses");
  refuse(
    (t) => ({ ...t, choreographyGroups: { [groupId]: { ...good, affectedMembers: ["ghost-member", ...members.slice(1)] } } }),
    "a roster naming strangers refuses"
  );
  refuse((t) => ({ ...t, choreographyGroups: { [groupId]: { ...good, version: 0 } } }), "version 0 refuses (the counter starts at 1)");
  refuse((t) => ({ ...t, choreographyGroups: { [groupId]: { ...good, version: 1.5 } } }), "a fractional version refuses");
  refuse((t) => ({ ...t, choreographyGroups: { [groupId]: { ...good, version: "2" } } }), "a string version refuses");
  refuse((t) => ({ ...t, choreographyGroups: { [groupId]: 42 } }), "a non-string non-record value refuses");
});

await test("the counter continues across the legacy seam; the tolerant read refuses junk", () => {
  const { scene, groupId } = instancedScene();
  const members = membersOf(scene, groupId).map((m) => m.key);
  const schedule = scheduleScene(scene, 8000, compoundGeo());
  const legacy = normalizeChoreographyGroupReceipt({ raw: "assembly-cascade", memberKeys: members, events: schedule });
  ok(legacy !== null, "the bare string reads");
  eq(legacy?.version, 1, "legacy normalizes to the first receipt shape");
  const next = buildChoreographyGroupReceipt({ presetId: "assembly-spiral", memberKeys: members, events: schedule, previousVersion: legacy?.version });
  eq(next.version, 2, "the next compile continues the counter: 1 → 2");
  eq(normalizeChoreographyGroupReceipt({ raw: undefined, memberKeys: members, events: schedule }), null, "an absent receipt reads as none");
  eq(normalizeChoreographyGroupReceipt({ raw: 42, memberKeys: members, events: schedule }), null, "junk refuses");
  eq(normalizeChoreographyGroupReceipt({ raw: "assembly-spin", memberKeys: members, events: schedule }), null, "an off-vocabulary string refuses");
  eq(
    normalizeChoreographyGroupReceipt({ raw: legacy, memberKeys: [...members.slice(1), "ghost-member"], events: schedule }),
    null,
    "a rich receipt whose roster is not the group's placed members refuses (a receipt naming strangers is a lie)"
  );
});

await test("the route-shaped seam: compile → receipt rides the validator and the round-trip is stable", () => {
  const { base, scene, groupId } = instancedScene();
  const schedule = scheduleScene(scene, 8000, realGeo());
  const members = membersOf(scene, groupId).map((m) => m.key);
  const compiled = compileCompoundChoreography({ preset: "assembly-edge-in", members: membersOf(scene, groupId), events: schedule });
  const receipt = buildChoreographyGroupReceipt({ presetId: "assembly-edge-in", memberKeys: members, events: schedule });
  const staged = {
    ...scene,
    animations: compiled,
    choreography: "assembly-edge-in",
    choreographyGroups: { [groupId]: receipt },
  };
  const r = v({ ...base, scenes: base.scenes.map((x) => (x.id === scene.id ? staged : x)) });
  ok(r.project !== null, `the rich receipt rides the engine validator: ${r.errors.join(" · ")}`);
  const parsed = r.project?.scenes.at(-1)?.choreographyGroups?.[groupId];
  eq(parsed, receipt, "the rich receipt survives validation byte-for-byte (recorded, never recomputed)");
});

// --- summary ------------------------------------------------------------------



console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

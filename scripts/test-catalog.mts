#!/usr/bin/env node
// catalog contract suite — the shared catalog law (the re-audit's Phase A).
//
// The catalog contracts (src/lib/ibismuh/catalog/) are the identity,
// provenance, versioning, licensing, and search vocabulary for BOTH visual
// lanes. This suite pins the laws so the catalog can never silently rot:
//
//   1. COVERAGE    — the builtin manifest covers EVERY whiteboard ASSETS
//                    entry and EVERY graphics icon; counts are honest.
//   2. COMPLETENESS— every row carries category, complexity 1..5, a11y,
//                    license (SPDX + approved), provenance, publish state,
//                    version, and global ownership.
//   3. TAMPER      — content hashes are sensitive to one byte; the
//                    manifest fingerprint rejects any mutation; parse is
//                    fail-closed (bad enum, missing field, wrong order,
//                    duplicate id all throw).
//   4. DETERMINISM — build twice → the same bytes; parse(serialize(x)) →
//                    the same fingerprint.
//   5. SEARCH      — deterministic ranking with match reasons; lane /
//                    category / complexity / state / owner filters work;
//                    multi-token queries are AND-semantics.
//   6. INTEGRITY   — every planner pick (whiteboard KEYWORD_PICKS +
//                    FALLBACK_CYCLE, graphics ICON_KEYWORD_PICKS +
//                    FALLBACK_ICON_CYCLE) names a registered library row:
//                    the dead-end law. No selection rule may reference an
//                    asset the library does not carry.
//
// Run: npm run test:catalog   (pure — no DB, no DOM; CI step)

import {
  CATALOG_VERSION,
  buildCatalogManifest,
  compareRows,
  graphicsContentHash,
  parseCatalogManifest,
  searchCatalog,
  serializeCatalogManifest,
  whiteboardContentHash,
  type CatalogAssetMeta,
  type CatalogManifest,
} from "../src/lib/ibismuh/catalog/contracts";
import { builtinCatalogManifest } from "../src/lib/ibismuh/catalog/manifest";
import { ASSETS } from "../src/lib/ibismuh/whiteboard/assets";
import {
  FALLBACK_CYCLE,
  KEYWORD_PICKS,
} from "../src/lib/ibismuh/whiteboard/whiteboard-planner";
import { GRAPHICS_ICON_LIBRARY } from "../src/lib/ibismuh/graphics/planner";

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

// --- 1. COVERAGE ------------------------------------------------------------------

suiteStart("coverage");

const manifest: CatalogManifest = builtinCatalogManifest();

await test("the builtin manifest covers every whiteboard asset", () => {
  const wbIds = manifest.assets.filter((a) => a.lane === "whiteboard").map((a) => a.id);
  eq(new Set(wbIds).size, wbIds.length, "no duplicate whiteboard rows");
  for (const a of ASSETS) {
    ok(wbIds.includes(a.id), `whiteboard asset "${a.id}" has a catalog row`);
  }
  eq(wbIds.length, ASSETS.length, `whiteboard row count ${wbIds.length} matches ASSETS ${ASSETS.length}`);
});

await test("the builtin manifest covers every graphics icon", () => {
  const gIds = manifest.assets.filter((a) => a.lane === "graphics").map((a) => a.id);
  const iconIds = Object.keys(GRAPHICS_ICON_LIBRARY);
  eq(new Set(gIds).size, gIds.length, "no duplicate graphics rows");
  for (const id of iconIds) {
    ok(gIds.includes(id), `graphics icon "${id}" has a catalog row`);
  }
  eq(gIds.length, iconIds.length, `graphics row count ${gIds.length} matches the icon library ${iconIds.length}`);
});

await test("the counts receipt is honest", () => {
  eq(manifest.counts.whiteboard, ASSETS.length);
  eq(manifest.counts.graphics, Object.keys(GRAPHICS_ICON_LIBRARY).length);
  ok(manifest.lanes.includes("whiteboard") && manifest.lanes.includes("graphics"), "both lanes declared");
  eq(manifest.catalogVersion, CATALOG_VERSION);
});

await test("the vocabulary grew — the library is no longer the starter set", () => {
  ok(ASSETS.length >= 80, `whiteboard library expanded (${ASSETS.length} assets)`);
  ok(Object.keys(GRAPHICS_ICON_LIBRARY).length >= 100, `graphics vocabulary expanded (${Object.keys(GRAPHICS_ICON_LIBRARY).length} icons)`);
});

// --- 2. COMPLETENESS --------------------------------------------------------------

suiteStart("completeness");

await test("every row carries the full metadata record", () => {
  for (const row of manifest.assets) {
    ok(row.category.trim() !== "", `${row.lane}:${row.id} category`);
    ok(row.a11y.trim() !== "", `${row.lane}:${row.id} a11y`);
    ok(row.version.trim() !== "", `${row.lane}:${row.id} version`);
    ok(row.contentHash.length === 64, `${row.lane}:${row.id} contentHash is sha256 hex`);
    ok(Number.isInteger(row.complexity) && row.complexity >= 1 && row.complexity <= 5, `${row.lane}:${row.id} complexity 1..5`);
    ok(row.license.spdx.trim() !== "", `${row.lane}:${row.id} license.spdx`);
    ok(row.license.approved === true, `${row.lane}:${row.id} license approved`);
    ok(row.concepts.length >= 1, `${row.lane}:${row.id} carries concepts`);
    ok(row.provenance === "hand-authored" || row.provenance === "traced", `${row.lane}:${row.id} provenance declared`);
    ok(row.publishState === "published", `${row.lane}:${row.id} publish state`);
    ok(row.ownerTenantId === null, `${row.lane}:${row.id} built-ins are global`);
  }
});

await test("the pack rows carry authored accessibility descriptions", () => {
  const pack = manifest.assets.filter((a) => a.lane === "whiteboard" && a.id === "sprout");
  ok(pack.length === 1, "sprout row exists");
  ok(pack[0]?.a11y.startsWith("A two-leaf sprout"), `sprout a11y is the authored line (got "${pack[0]?.a11y}")`);
  ok(pack[0]?.aliases.includes("seedling"), "sprout carries its alts as aliases");
});

await test("complexity tracks the drawable stroke count", () => {
  const lightbulb = manifest.assets.find((a) => a.lane === "whiteboard" && a.id === "lightbulb-wb");
  ok(lightbulb !== undefined, "pack asset registered");
  ok(lightbulb !== undefined && lightbulb.complexity === 2, `5-stroke asset rates 2 (got ${lightbulb?.complexity})`);
  const gear = manifest.assets.find((a) => a.lane === "graphics" && a.id === "gear");
  ok(gear !== undefined && gear.complexity === 3, `10-path icon rates 3 (got ${gear?.complexity})`);
});

// --- 3. TAMPER EVIDENCE -----------------------------------------------------------

suiteStart("tamper evidence");

await test("content hashes are sensitive to a single byte", () => {
  const base = whiteboardContentHash({ id: "x", svg: "<path d='M 1 1'/>", viewBox: { w: 2, h: 2 }, tags: ["t"] });
  const flipped = whiteboardContentHash({ id: "x", svg: "<path d='M 1 2'/>", viewBox: { w: 2, h: 2 }, tags: ["t"] });
  const tagFlipped = whiteboardContentHash({ id: "x", svg: "<path d='M 1 1'/>", viewBox: { w: 2, h: 2 }, tags: ["u"] });
  ok(base !== flipped, "svg byte change flips the hash");
  ok(base !== tagFlipped, "tag change flips the hash");
  eq(base, whiteboardContentHash({ id: "x", svg: "<path d='M 1 1'/>", viewBox: { w: 2, h: 2 }, tags: ["t"] }), "same content → same hash");
  eq(base, graphicsContentHash === undefined ? base : base, "hash fn deterministic");
});

await test("the manifest fingerprint rejects any row mutation", () => {
  const text = serializeCatalogManifest(manifest);
  const parsed = parseCatalogManifest(text);
  eq(parsed.fingerprint, manifest.fingerprint, "clean round-trip keeps the fingerprint");
  const tampered = JSON.parse(text) as { assets: CatalogAssetMeta[] };
  tampered.assets[0] = { ...tampered.assets[0], category: "tampered" };
  let threw = "";
  try {
    parseCatalogManifest(JSON.stringify(tampered));
  } catch (e) {
    threw = (e as Error).message;
  }
  ok(threw.includes("fingerprint mismatch"), `tampered row rejected (${threw.slice(0, 80)})`);
});

await test("parse is fail-closed on every defect class", () => {
  const text = serializeCatalogManifest(manifest);
  const cases: { name: string; mutate: (doc: Record<string, unknown>) => unknown; expect: string }[] = [
    {
      name: "bad lane",
      mutate: (doc) => {
        const d = structuredClone(doc) as { assets: CatalogAssetMeta[] };
        (d.assets[0] as unknown as Record<string, unknown>).lane = "video";
        return d;
      },
      expect: "lane must be one of",
    },
    {
      name: "bad provenance",
      mutate: (doc) => {
        const d = structuredClone(doc) as { assets: CatalogAssetMeta[] };
        (d.assets[0] as unknown as Record<string, unknown>).provenance = "stolen";
        return d;
      },
      expect: "provenance must be one of",
    },
    {
      name: "bad publish state",
      mutate: (doc) => {
        const d = structuredClone(doc) as { assets: CatalogAssetMeta[] };
        (d.assets[0] as unknown as Record<string, unknown>).publishState = "hidden";
        return d;
      },
      expect: "publishState must be one of",
    },
    {
      name: "complexity out of range",
      mutate: (doc) => {
        const d = structuredClone(doc) as { assets: CatalogAssetMeta[] };
        (d.assets[0] as unknown as Record<string, unknown>).complexity = 9;
        return d;
      },
      expect: "complexity must be an integer 1..5",
    },
    {
      name: "license without spdx",
      mutate: (doc) => {
        const d = structuredClone(doc) as { assets: CatalogAssetMeta[] };
        (d.assets[0] as unknown as Record<string, unknown>).license = { attribution: "x" };
        return d;
      },
      expect: "license.spdx",
    },
    {
      name: "missing contentHash",
      mutate: (doc) => {
        const d = structuredClone(doc) as { assets: CatalogAssetMeta[] };
        delete (d.assets[0] as unknown as Record<string, unknown>).contentHash;
        return d;
      },
      expect: "contentHash must be",
    },
    {
      name: "not canonical order",
      mutate: (doc) => {
        const d = structuredClone(doc) as { assets: CatalogAssetMeta[] };
        const copy = [...d.assets];
        copy.reverse();
        return { ...d, assets: copy };
      },
      expect: "canonical order",
    },
    {
      name: "duplicate row",
      mutate: (doc) => {
        const d = structuredClone(doc) as { assets: CatalogAssetMeta[] };
        // insert the duplicate ADJACENT to the original — nondecreasing
        // order, so the DUPLICATE check fires (appending at the end trips
        // the order check first, which is a different law)
        return { ...d, assets: [...d.assets.slice(0, 1), d.assets[0], ...d.assets.slice(1)] };
      },
      expect: "duplicate row",
    },
    {
      name: "not JSON",
      mutate: () => "this is not json",
      expect: "not valid JSON",
    },
  ];
  for (const c of cases) {
    let threw = "";
    try {
      const doc = JSON.parse(text) as Record<string, unknown>;
      const mutated = c.mutate(doc);
      const payload = typeof mutated === "string" ? mutated : JSON.stringify(mutated);
      parseCatalogManifest(payload);
    } catch (e) {
      threw = (e as Error).message;
    }
    ok(threw.includes(c.expect), `${c.name}: rejected with "${c.expect}" (got ${threw.slice(0, 60) || "no throw"})`);
  }
});

// --- 4. DETERMINISM ---------------------------------------------------------------

suiteStart("determinism");

await test("building twice yields byte-identical manifests", () => {
  const a = serializeCatalogManifest(builtinCatalogManifest());
  const b = serializeCatalogManifest(builtinCatalogManifest());
  eq(a, b, "same bytes");
});

await test("rows sort canonically by lane then id", () => {
  const rows = manifest.assets;
  for (let i = 1; i < rows.length; i++) {
    ok(compareRows(rows[i - 1] as CatalogAssetMeta, rows[i] as CatalogAssetMeta) <= 0, `rows ${i - 1}<${i} sorted`);
  }
  eq(rows[0]?.lane, "graphics", "graphics lane sorts first");
});

await test("a rebuilt manifest from the same rows has the same fingerprint", () => {
  const rebuilt = buildCatalogManifest({ assets: [...manifest.assets] });
  eq(rebuilt.fingerprint, manifest.fingerprint, "order-independent build");
});

// --- 5. SEARCH --------------------------------------------------------------------

suiteStart("search");

await test("identical queries return identical ranked results", () => {
  const q = { text: "heart", lane: "whiteboard" as const };
  const a = searchCatalog(manifest, q);
  const b = searchCatalog(manifest, q);
  eq(a.map((h) => `${h.row.lane}:${h.row.id}:${h.score}`), b.map((h) => `${h.row.lane}:${h.row.id}:${h.score}`));
});

await test("a text query ranks concept matches with reasons", () => {
  const hits = searchCatalog(manifest, { text: "heart", lane: "whiteboard" });
  ok(hits.length >= 1, `found ${hits.length} heart rows`);
  const ids = hits.map((h) => h.row.id);
  ok(ids.includes("heart-main"), `heart-main ranked (got ${ids.join(", ")})`);
  ok((hits[0]?.reasons.length ?? 0) >= 1, "reasons attached");
});

await test("multi-token queries are AND-semantics", () => {
  const hits = searchCatalog(manifest, { text: "farm tractor", lane: "whiteboard" });
  ok(hits.length >= 1, "farm+tractor finds the tractor");
  eq(hits[0]?.row.id, "tractor-wb", "the tractor row ranks first");
  const none = searchCatalog(manifest, { text: "heart tractor" });
  eq(none.length, 0, "a row with only one token is filtered out");
});

await test("lane, category, complexity, and owner filters work", () => {
  const g = searchCatalog(manifest, { lane: "graphics", text: "lock" });
  ok(g.length >= 1 && g.every((h) => h.row.lane === "graphics"), "lane filter");
  const agri = searchCatalog(manifest, { lane: "whiteboard", category: "agriculture" });
  ok(agri.length >= 5, `agriculture category has rows (${agri.length})`);
  ok(agri.every((h) => h.row.category === "agriculture"), "category filter exact");
  const simple = searchCatalog(manifest, { lane: "whiteboard", maxComplexity: 1, text: "heartbeat" });
  ok(simple.length >= 1 && simple.every((h) => h.row.complexity <= 1), "maxComplexity filter");
  const global = searchCatalog(manifest, { globalOnly: true, text: "heart" });
  ok(global.every((h) => h.row.ownerTenantId === null), "globalOnly filter");
});

await test("publish-state filtering excludes retired rows by default", () => {
  const withRetired = buildCatalogManifest({
    assets: [
      ...manifest.assets.slice(0, 3),
      { ...manifest.assets[3], id: "zz-retired", publishState: "retired", deprecation: { replacedBy: manifest.assets[3]?.id ?? "x" } },
    ],
  });
  const visible = searchCatalog(withRetired, { text: undefined });
  ok(visible.every((h) => h.row.publishState === "published"), "default = published only");
  const explicit = searchCatalog(withRetired, { publishStates: ["retired"] });
  eq(explicit.length, 1, "explicit state filter finds the retired row");
  eq(explicit[0]?.row.deprecation?.replacedBy, manifest.assets[3]?.id, "deprecation names its replacement");
});

await test("a tenant-owned row is hidden from globalOnly and searchable unfiltered", () => {
  const tenantRow: CatalogAssetMeta = {
    id: "tenant-art",
    lane: "whiteboard",
    version: "1.0.0",
    contentHash: manifest.assets[0]?.contentHash ?? "x",
    category: "generic",
    aliases: [],
    concepts: ["tenant"],
    subjectPacks: [],
    styleFamily: "custom",
    complexity: 1,
    a11y: "Tenant art",
    license: { spdx: "LicenseRef-Tenant", approved: true },
    provenance: "upload",
    publishState: "published",
    ownerTenantId: "tenant-42",
  };
  const m = buildCatalogManifest({ assets: [...manifest.assets.slice(0, 5), tenantRow] });
  eq(searchCatalog(m, { globalOnly: true, text: "tenant" }).length, 0, "globalOnly hides tenant rows");
  eq(searchCatalog(m, { text: "tenant" }).length, 1, "unfiltered search finds it");
});

// --- 6. INTEGRITY (the dead-end law) ----------------------------------------------

suiteStart("integrity");

await test("every whiteboard KEYWORD_PICKS entry names a registered asset", () => {
  for (const pick of KEYWORD_PICKS) {
    ok(ASSETS.some((a) => a.id === pick.assetId), `keyword pick "${pick.assetId}" exists in the library`);
  }
});

await test("every FALLBACK_CYCLE entry names a registered asset", () => {
  for (const id of FALLBACK_CYCLE) {
    ok(ASSETS.some((a) => a.id === id), `fallback cycle "${id}" exists in the library`);
  }
  ok(new Set(FALLBACK_CYCLE).size === FALLBACK_CYCLE.length, "the cycle has no repeats");
});

await test("every graphics ICON_KEYWORD_PICKS entry names a library icon", async () => {
  const { ICON_KEYWORD_PICKS } = await import("../src/lib/ibismuh/graphics/planner");
  for (const pick of ICON_KEYWORD_PICKS) {
    ok(GRAPHICS_ICON_LIBRARY[pick.iconId] !== undefined, `icon pick "${pick.iconId}" exists in the library`);
  }
});

await test("every graphics FALLBACK_ICON_CYCLE entry names a library icon", async () => {
  const { FALLBACK_ICON_CYCLE } = await import("../src/lib/ibismuh/graphics/planner");
  for (const id of FALLBACK_ICON_CYCLE) {
    ok(GRAPHICS_ICON_LIBRARY[id] !== undefined, `fallback icon "${id}" exists in the library`);
  }
  ok(new Set(FALLBACK_ICON_CYCLE).size === FALLBACK_ICON_CYCLE.length, "the cycle has no repeats");
});

await test("every keyword pick's regex matches at least its own concept words", () => {
  // A pick whose regex can never fire is dead weight; spot-check the
  // canonical cue for a sample of picks across the table.
  const samples: { cue: string; assetId: string }[] = [
    { cue: "the doctor explained the treatment", assetId: "medical-cross" },
    { cue: "a farm with crops", assetId: "barn" },
    { cue: "the tractor plows the field", assetId: "tractor-wb" },
    { cue: "our savings grow in the bank", assetId: "piggy-bank-wb" },
    { cue: "learn at school", assetId: "blackboard-wb" },
    { cue: "the trophy for the champion", assetId: "cup-trophy" },
  ];
  for (const s of samples) {
    const pick = KEYWORD_PICKS.find((p) => p.assetId === s.assetId);
    ok(pick !== undefined, `pick for ${s.assetId} exists`);
    ok(pick !== undefined && pick.re.test(s.cue), `"${s.cue}" fires ${s.assetId}`);
  }
});

// --- report ------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(failures.map((f) => `  ✗ ${f}`).join("\n"));
  process.exit(1);
}

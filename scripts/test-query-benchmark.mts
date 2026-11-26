#!/usr/bin/env node
// query-benchmark suite — the WS10 fixed semantic query suite (the
// engineering master plan's §15.2: "For each query, record: expected
// concepts; acceptable asset IDs; unacceptable asset IDs; ranking order;
// no-result behavior; retrieval latency; deterministic fingerprint").
//
// The 15 fixed queries ride the REAL retrieval surfaces, each where the
// architecture places them:
//   · THE RESOLVER (planners/visual-beats deriveVisualBeats) — the plan's
//     own pipeline (concept extraction → candidate retrieval →
//     deterministic ranking) over the catalog rows as candidates: phrase
//     queries select acceptable candidates without demanding every token
//     land on one row.
//   · THE CATALOG SEARCH (catalog/search searchCatalog) — the palette's
//     strict AND engine: the plan's fixed suite pins the HEAD TERM probe
//     (the palette must resolve the query's most distinctive word).
//
// Per query the benchmark RECORDS: the acceptable set, the unacceptable
// set, the ranking order (fingerprinted), the latency, and the no-result
// behavior (a declared fallback id — never silent). The laws:
//   · RELEVANCE — every query's resolver selection intersects its
//     acceptable set; no unacceptable id rides any beat's selection.
//   · HONESTY — every query declares a fallback (the resolver's own
//     no-result law exercised at the benchmark level too).
//   · LATENCY — every retrieval sits far under the 50ms budget (the
//     sub-millisecond engine, measured).
//   · DETERMINISM — two runs → the same fingerprint per query (and the
//     same ranking order, recorded on the receipt).
//
// Run: node --import tsx scripts/test-query-benchmark.mts   (pure — no
// DB, no DOM, no network; CI step)

import { builtinCatalogManifest } from "../src/lib/ibismuh/catalog/manifest";
import { searchCatalog, type CatalogAssetMeta } from "../src/lib/ibismuh/catalog/contracts";
import { deriveVisualBeats, type VisualBeatCandidate } from "../src/lib/ibismuh/planners/visual-beats";

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
    const msg = err instanceof Error ? err.message : String(err);
    failures.push(`${suite} — ${name}: ${msg}`);
    console.log(`  ✗ ${name}: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// The fixed suite (the plan's §15.2 queries, with their recorded relevance)
// ---------------------------------------------------------------------------

interface FixedQuery {
  query: string;
  /** The concepts the query names (the receipt's vocabulary). */
  expectedConcepts: string[];
  /** Catalog rows that MAY answer the query (both lanes). */
  acceptable: readonly string[];
  /** Catalog rows that must NEVER ride the selection (relevance guards —
   *  the false-friend law). */
  unacceptable: readonly string[];
  /** The palette's strict AND search must resolve this HEAD TERM. */
  headTerm: string;
  /** The declared no-result fallback (the honesty receipt). */
  fallbackId: string;
}

const FIXED_QUERIES: readonly FixedQuery[] = [
  {
    query: "cattle entering farmland",
    expectedConcepts: ["cattle", "farmland"],
    acceptable: ["cow", "tractor", "farm-house", "smart-farm-system", "wheat", "corn-cob"],
    unacceptable: ["heart-main", "balance-scale-wb", "solar-panel"],
    headTerm: "cattle",
    fallbackId: "farm-cast",
  },
  {
    query: "AI sensor",
    expectedConcepts: ["ai", "sensor"],
    acceptable: ["chip", "robot", "robot-head", "antenna", "signal-tower", "robot-arm"],
    unacceptable: ["heart-main", "tractor"],
    headTerm: "sensor",
    fallbackId: "tech-cast",
  },
  {
    query: "warning alert",
    expectedConcepts: ["warning", "alert"],
    acceptable: ["warning-triangle", "bell", "bell-ring", "alarm-clock"],
    unacceptable: ["solar-panel", "tractor"],
    headTerm: "alert",
    fallbackId: "status-cast",
  },
  {
    query: "business growth",
    expectedConcepts: ["business", "growth"],
    acceptable: ["arrow-growth", "chart-line-up", "chart-up", "dollar", "piggy-bank-wb", "briefcase"],
    unacceptable: ["heart-main", "stethoscope-wb"],
    headTerm: "growth",
    fallbackId: "business-cast",
  },
  {
    query: "student learning",
    expectedConcepts: ["student", "learning"],
    acceptable: ["backpack", "graduation-cap", "backpack-wb", "online-classroom", "school-building", "blackboard-wb", "blackboard"],
    unacceptable: ["tractor", "solar-panel"],
    headTerm: "student",
    fallbackId: "education-cast",
  },
  {
    query: "hospital emergency",
    expectedConcepts: ["hospital", "emergency"],
    acceptable: ["hospital-cross", "medical-cross", "stethoscope", "stethoscope-wb", "heart-pulse", "pill"],
    unacceptable: ["solar-panel", "tractor"],
    headTerm: "emergency",
    fallbackId: "health-cast",
  },
  {
    query: "cybersecurity lock",
    expectedConcepts: ["cybersecurity", "lock"],
    acceptable: ["lock", "key", "shield", "shield-check", "eye-scan", "fingerprint"],
    unacceptable: ["solar-panel", "tractor"],
    headTerm: "cybersecurity",
    fallbackId: "security-cast",
  },
  {
    query: "solar energy",
    expectedConcepts: ["solar", "energy"],
    acceptable: ["solar-panel", "sun", "sun-nature", "wind-turbine"],
    unacceptable: ["heart-main", "tractor"],
    headTerm: "solar",
    fallbackId: "energy-cast",
  },
  {
    query: "process steps",
    expectedConcepts: ["process", "steps"],
    acceptable: ["flow-steps", "pipeline", "gear", "arrow-growth"],
    unacceptable: ["heart-main", "stethoscope"],
    headTerm: "steps",
    fallbackId: "process-cast",
  },
  {
    query: "compare two values",
    expectedConcepts: ["compare", "values"],
    acceptable: ["balance-scale", "balance-scale-wb", "chart-up", "chart-line-up"],
    unacceptable: ["tractor", "cow"],
    headTerm: "compare",
    fallbackId: "compare-cast",
  },
  {
    query: "phone notification",
    expectedConcepts: ["phone", "notification"],
    acceptable: ["smartphone", "smartphone-wb", "phone-call", "bell", "bell-ring"],
    unacceptable: ["tractor", "stethoscope"],
    headTerm: "notification",
    fallbackId: "device-cast",
  },
  {
    query: "supply chain",
    expectedConcepts: ["supply", "chain"],
    acceptable: ["pipeline", "link", "factory", "truck", "server", "warehouse"],
    unacceptable: ["heart-main", "balance-scale"],
    headTerm: "supply",
    fallbackId: "logistics-cast",
  },
  {
    query: "classroom",
    expectedConcepts: ["classroom"],
    acceptable: ["online-classroom", "blackboard-wb", "blackboard", "school-building", "backpack", "graduation-cap"],
    unacceptable: ["tractor", "solar-panel"],
    headTerm: "classroom",
    fallbackId: "education-cast",
  },
  {
    query: "heart and lungs",
    expectedConcepts: ["heart", "lungs"],
    acceptable: ["heart-pulse", "heart-main", "heart-labels", "lungs", "stethoscope"],
    unacceptable: ["tractor", "solar-panel"],
    headTerm: "lungs",
    fallbackId: "health-cast",
  },
  {
    query: "engineering control system",
    expectedConcepts: ["engineering", "control", "system"],
    acceptable: ["blueprint", "gear", "robot-arm", "bridge", "crane", "factory", "pipeline", "robot"],
    unacceptable: ["heart-main", "bell"],
    headTerm: "engineering",
    fallbackId: "engineering-cast",
  },
];

// ---------------------------------------------------------------------------
// The candidates — EVERY catalog row, both lanes (the resolver's table)
// ---------------------------------------------------------------------------

function candidatesFromRows(rows: readonly CatalogAssetMeta[]): VisualBeatCandidate[] {
  return rows.map((r) => ({
    id: `${r.lane}:${r.id}`,
    concepts: r.concepts,
    aliases: r.aliases,
    tags: [r.category, ...(r.subcategory !== undefined ? [r.subcategory] : [])],
  }));
}

function bareId(wireId: string): string {
  return wireId.includes(":") ? wireId.slice(wireId.indexOf(":") + 1) : wireId;
}

// ---------------------------------------------------------------------------
// 1. RELEVANCE — the resolver answers every fixed query inside its band
// ---------------------------------------------------------------------------

const manifest = builtinCatalogManifest();
const CANDIDATES = candidatesFromRows(manifest.assets);

suiteStart("RELEVANCE — every fixed query resolves inside its band");

await test("the manifest carries both lanes' vocabulary (the candidates exist)", () => {
  ok(manifest.counts["whiteboard"] >= 130, `whiteboard rows: ${manifest.counts["whiteboard"]}`);
  ok(manifest.counts["graphics"] >= 180, `graphics rows: ${manifest.counts["graphics"]}`);
  for (const fq of FIXED_QUERIES) {
    for (const id of fq.acceptable) {
      ok(
        manifest.assets.some((r) => r.id === id),
        `${fq.query}: the acceptable id "${id}" must exist in the catalog — a benchmark may not name ghosts`,
      );
    }
  }
});

const latencyBudgetMs = 50;
const receipts: { query: string; selected: string[]; latencyMs: number; fingerprint: string; topRanked: string }[] = [];

await test("every query's selection intersects its acceptable set — with no false friends", () => {
  for (const fq of FIXED_QUERIES) {
    const started = performance.now();
    const receipt = deriveVisualBeats({
      sceneId: "bench",
      narration: fq.query,
      candidates: CANDIDATES,
      sceneDurationMs: 6000,
      fallbackId: fq.fallbackId,
    });
    const latencyMs = performance.now() - started;
    const wireSelected = receipt.beats.flatMap((b) => b.selectedIds);
    const selected = wireSelected.map(bareId);
    ok(selected.length > 0, `${fq.query}: the resolver selected nothing (fallback "${receipt.beats[0]?.fallback ?? "none"}")`);
    const intersect = selected.filter((id) => fq.acceptable.includes(id));
    ok(
      intersect.length > 0,
      `${fq.query}: no acceptable candidate in the selection [${selected.join(", ")}] — the band needs revision, not the engine`,
    );
    const falseFriends = selected.filter((id) => fq.unacceptable.includes(id));
    eq(falseFriends, [], `${fq.query}: unacceptable ids rode the selection`);
    ok(latencyMs < latencyBudgetMs, `${fq.query}: latency ${latencyMs.toFixed(2)}ms past the ${latencyBudgetMs}ms budget`);
    receipts.push({
      query: fq.query,
      selected: intersect.slice(0, 3),
      latencyMs,
      fingerprint: receipt.fingerprint,
      topRanked: receipt.beats[0].candidateIds[0] ?? "",
    });
  }
});

// ---------------------------------------------------------------------------
// 2. HONESTY — the no-result behavior is declared, per query
// ---------------------------------------------------------------------------

suiteStart("HONESTY — the declared fallbacks");

await test("a fabricated query with no vocabulary hits its declared fallback", () => {
  const receipt = deriveVisualBeats({
    sceneId: "bench",
    narration: "Zqxj wvvrkp blnth smd",
    candidates: CANDIDATES,
    sceneDurationMs: 4000,
    fallbackId: "declared-fallback",
  });
  eq(receipt.beats[0].fallback, "declared-fallback");
  eq(receipt.beats[0].selectedIds, []);
  ok(receipt.discarded.some((d) => d.reason.includes("declared fallback")), "the discard explains the fallback");
});

await test("every fixed query's fallback id is declared on the receipt record", () => {
  for (const fq of FIXED_QUERIES) {
    ok(fq.fallbackId.length > 0, `${fq.query}: the fallback id is recorded (the plan's no-result receipt)`);
    ok(fq.expectedConcepts.length > 0, `${fq.query}: the expected concepts are recorded`);
  }
});

// ---------------------------------------------------------------------------
// 3. DETERMINISM — same query, same fingerprint, same ranking
// ---------------------------------------------------------------------------

suiteStart("DETERMINISM — the fingerprints hold");

await test("two runs produce identical fingerprints and rankings for every query", () => {
  for (const fq of FIXED_QUERIES) {
    const a = deriveVisualBeats({ sceneId: "bench", narration: fq.query, candidates: CANDIDATES, sceneDurationMs: 6000, fallbackId: fq.fallbackId });
    const b = deriveVisualBeats({ sceneId: "bench", narration: fq.query, candidates: CANDIDATES, sceneDurationMs: 6000, fallbackId: fq.fallbackId });
    eq(a.fingerprint, b.fingerprint, `${fq.query}: the fingerprint drifted`);
    eq(
      a.beats.map((x) => x.selectedIds),
      b.beats.map((x) => x.selectedIds),
      `${fq.query}: the ranking drifted`,
    );
  }
});

await test("the candidate ORDER is irrelevant — shuffled candidates, same selections", () => {
  const shuffled = [...CANDIDATES].reverse();
  for (const fq of FIXED_QUERIES.slice(0, 5)) {
    const a = deriveVisualBeats({ sceneId: "bench", narration: fq.query, candidates: CANDIDATES, sceneDurationMs: 6000 });
    const b = deriveVisualBeats({ sceneId: "bench", narration: fq.query, candidates: shuffled, sceneDurationMs: 6000 });
    eq(
      a.beats.map((x) => x.selectedIds),
      b.beats.map((x) => x.selectedIds),
      `${fq.query}: the selection is order-dependent — the rank law broke`,
    );
  }
});

// ---------------------------------------------------------------------------
// 4. THE PALETTE'S SURFACE — the strict search resolves the head terms
// ---------------------------------------------------------------------------

suiteStart("HEAD TERMS — the palette's strict AND search");

await test("every query's head term resolves through the catalog engine", () => {
  for (const fq of FIXED_QUERIES) {
    const hits = searchCatalog(manifest, { text: fq.headTerm });
    ok(hits.length > 0, `${fq.query}: the head term "${fq.headTerm}" returned nothing — the palette would dead-end`);
    const top = bareId(hits[0].row.id);
    ok(
      fq.acceptable.includes(top) || hits.slice(0, 3).some((h) => fq.acceptable.includes(bareId(h.row.id))),
      `${fq.query}: the head term "${fq.headTerm}" ranks [${hits.slice(0, 3).map((h) => bareId(h.row.id)).join(", ")}] — outside the acceptable band`,
    );
  }
});

await test("the engine's determinism: same head-term query, same ranked ids", () => {
  for (const fq of FIXED_QUERIES.slice(0, 5)) {
    const a = searchCatalog(manifest, { text: fq.headTerm }).map((h) => h.row.id);
    const b = searchCatalog(manifest, { text: fq.headTerm }).map((h) => h.row.id);
    eq(a, b, `${fq.query}: the head-term ranking drifted`);
  }
});

// ---------------------------------------------------------------------------
// The receipt — the benchmark's own evidence table (the plan's §15.4)
// ---------------------------------------------------------------------------

console.log("\n  the fixed-suite receipt:");
for (const r of receipts) {
  console.log(
    `   · ${r.query.padEnd(32)} → ${r.selected.join(", ").padEnd(34)} ${r.latencyMs.toFixed(2)}ms  ${r.fingerprint}`,
  );
}

console.log(`\n=== query-benchmark: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}

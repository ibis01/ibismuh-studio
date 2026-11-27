#!/usr/bin/env node
// lane-registry drift law — the two canonical registries may not diverge.
//
// The lane contract lives TWICE, deliberately: src/lib/ibismuh/video-lanes.ts
// (the /videos surface — imports ./types) and src/lib/ibismuh/studio-lanes.ts
// (the /studio pipeline — imports ./studio-catalogs). Both declare the six
// create presets and both self-describe as canonical; 12 + 23 consumers read
// them. A preset change that lands in one registry only would make the two
// surfaces disagree SILENTLY — the exact drift the registries were built to
// kill. This battery is the law that keeps them in lockstep:
//
//   1. SELF-CLEAN   — each registry's own validateLaneRegistry() passes.
//   2. ORDER        — LANE_ORDER is identical (same six ids, same sequence).
//   3. CONTRACT     — every VideoLaneContract field agrees per lane
//                     (capabilities/repairOperations compared as sets, order
//                     free); declared lane modes (character rig/fallback)
//                     agree verbatim.
//   4. VOCABULARIES — LANE_CAPABILITY_IDS, LANE_REPAIR_OPERATIONS,
//                     HEAVY_JOB_KINDS, ENGINE_LANE_RENDER_MODES agree.
//   5. DECLARED UI  — the ONE allowed divergence is UI metadata shape
//                     (video `accent` vs studio `accentHex`); the key sets
//                     are pinned so no third field can appear silently.
//   6. DOCUMENTED   — both files must cross-reference their sibling and
//                     this battery, so the next editor meets the law first.
//
// Run: npm run test:lane-drift   (pure — no DB, no DOM; CI step)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { LANE_CAPABILITY_IDS as V_CAPS, LANE_ORDER as V_ORDER, LANE_REGISTRY as V_REG, LANE_REPAIR_OPERATIONS as V_REPAIRS, HEAVY_JOB_KINDS as V_HEAVY, ENGINE_LANE_RENDER_MODES as V_ENGINE, validateLaneRegistry as vValidate } from "../src/lib/ibismuh/video-lanes";
import { LANE_CAPABILITY_IDS as S_CAPS, LANE_ORDER as S_ORDER, LANE_REGISTRY as S_REG, LANE_REPAIR_OPERATIONS as S_REPAIRS, HEAVY_JOB_KINDS as S_HEAVY, ENGINE_LANE_RENDER_MODES as S_ENGINE, validateLaneRegistry as sValidate } from "../src/lib/ibismuh/studio-lanes";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(cond: unknown, msg?: string) {
  if (cond) return;
  throw new Error(msg ?? "assertion failed");
}

function eq(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) return;
  throw new Error(msg ?? `expected ${b}, got ${a}`);
}

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    const msg = e instanceof Error ? e.message : String(e);
    failures.push(msg);
    console.log(`  ✗ ${msg}`);
  }
}

const CONTRACT_FIELDS = [
  "format", "renderMode", "planVersion", "inputSchema", "planner", "renderer",
  "previewRenderer", "fallbackPolicy", "queueJobKind", "analyticsId",
  "qcProfile", "supportedAspects", "supportedFps",
] as const;

const asSet = (xs: readonly string[]) => JSON.stringify([...xs].sort());

await test("each registry self-validates clean", () => {
  eq(vValidate(), [], "video-lanes.ts must validate clean");
  eq(sValidate(), [], "studio-lanes.ts must validate clean");
});

await test("the lane order is identical", () => {
  eq(V_ORDER, S_ORDER, "LANE_ORDER must be the same six ids in the same sequence");
  eq(Object.keys(V_REG).sort(), Object.keys(S_REG).sort(), "both registries must seat the same lane ids");
});

await test("every lane's contract agrees across both registries", () => {
  for (const id of V_ORDER) {
    const v = V_REG[id];
    const s = S_REG[id];
    ok(v && s, `lane ${id} must exist in both registries`);
    for (const f of CONTRACT_FIELDS) {
      eq(v[f], s[f], `lane ${id} field ${f} must agree`);
    }
    eq(asSet(v.capabilities), asSet(s.capabilities), `lane ${id} capabilities must agree as a set`);
    eq(asSet(v.repairOperations), asSet(s.repairOperations), `lane ${id} repairOperations must agree as a set`);
    eq(v.modes ?? null, s.modes ?? null, `lane ${id} declared modes must agree verbatim`);
  }
});

await test("the shared vocabularies agree", () => {
  eq([...V_CAPS].sort(), [...S_CAPS].sort(), "LANE_CAPABILITY_IDS must agree");
  eq([...V_REPAIRS].sort(), [...S_REPAIRS].sort(), "LANE_REPAIR_OPERATIONS must agree");
  eq([...V_HEAVY].sort(), [...S_HEAVY].sort(), "HEAVY_JOB_KINDS must agree");
  eq([...V_ENGINE].sort(), [...S_ENGINE].sort(), "ENGINE_LANE_RENDER_MODES must agree");
});

const here = path.dirname(fileURLToPath(import.meta.url));
const registrySource = (file: string) =>
  fs.readFileSync(path.resolve(here, "..", "src/lib/ibismuh", file), "utf8");

await test("the UI-metadata divergence stays declared-only", () => {
  // The one sanctioned divergence: LaneUiMeta accent shape (video `accent`,
  // studio `accentHex`). Pin the field sets so a third divergence cannot
  // appear silently — a new field must be added to BOTH shapes and listed
  // here, or the contract fields (law 3) must carry it instead.
  const videoKeys = [...registrySource("video-lanes.ts").matchAll(
    /^  (\w+): (?:string);$/gm,
  )].map((m) => m[1]);
  const studioKeys = [...registrySource("studio-lanes.ts").matchAll(
    /^  (\w+): (?:string);$/gm,
  )].map((m) => m[1]);
  eq(
    videoKeys.filter((k) => ["title", "desc", "icon", "accent"].includes(k)).sort(),
    ["accent", "desc", "icon", "title"],
    "video LaneUiMeta must be exactly { title, desc, icon, accent }",
  );
  eq(
    studioKeys.filter((k) => ["title", "desc", "icon", "accentHex"].includes(k)).sort(),
    ["accentHex", "desc", "icon", "title"],
    "studio LaneUiMeta must be exactly { title, desc, icon, accentHex }",
  );
});

await test("the split stays documented in both registries", () => {
  const v = registrySource("video-lanes.ts");
  const s = registrySource("studio-lanes.ts");
  ok(v.includes("studio-lanes.ts"), "video-lanes.ts must cross-reference its sibling registry");
  ok(s.includes("video-lanes.ts"), "studio-lanes.ts must cross-reference its sibling registry");
  for (const [file, text] of [["video-lanes.ts", v], ["studio-lanes.ts", s]] as const) {
    ok(
      text.includes("test-lane-registry-drift"),
      `${file} must name the drift battery so the law is discoverable from the source`,
    );
  }
});

// --- teardown -------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed${failures.length ? ":" : ""}`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exit(failed > 0 ? 1 : 0);

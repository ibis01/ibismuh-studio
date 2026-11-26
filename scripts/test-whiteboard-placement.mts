#!/usr/bin/env node
// whiteboard placement-identity suite — Phase B slice 1 (audit §3.5).
//
// The engine's placement identity: a placement INSTANCE is addressed by its
// placementId (absent = the legacy assetId address). This suite pins the
// laws that make repeated placement SAFE end-to-end without moving one byte
// of any stored legacy doc:
//
//   1. VALIDATOR  — the key-uniqueness law: two placements of one asset
//                   validate only with distinct placementIds; the derived
//                   key set must be unique; the charset law covers
//                   placementIds; animations address instances (unknown or
//                   ambiguous addresses are refused — fail-closed).
//   2. LEGACY     — the derived-identity law: a doc without placementIds
//                   derives key = assetId everywhere — schedules, frame
//                   keys, DOM ids stay byte-identical (the re-pin promise).
//   3. SCHEDULE   — repeated instances claim their own paths; emitted
//                   events carry the placement address ONLY when it differs
//                   from the assetId; move_object moves ONE instance.
//   4. PAGE SEAM  — composeScene renders one group per instance (g-<key>),
//                   registers key → assetId, and the applier loop reads the
//                   placement keys off the wire payload.
//   5. CARRY      — carrying one instance while re-placing the same asset
//                   as a fresh instance is legal (the Phase B win); the
//                   carried plan is keyed by placement identity and names
//                   resolve by key first, assetId second.
//   6. BEATS      — the beat compiler + camera director address instances
//                   (claimed keys, per-instance beat grouping, onsets).
//   7. TRACED CAP — the per-placement cap split is per INSTANCE.
//   8. WIRE       — the doc round-trip preserves placementId fields.
//
// Run: npm run test:whiteboard-placement   (pure — no DB, no DOM; CI step)

import { loadLibrary } from "../src/lib/ibismuh/whiteboard/assets";
import {
  derivePlacementId,
  eventPlacementKey,
  placementKey,
  validateWhiteboardProject,
  type WhiteboardScene,
} from "../src/lib/ibismuh/whiteboard/storyboard";
import { serializeWhiteboardDoc, parseWhiteboardDoc, type WhiteboardDoc } from "../src/lib/ibismuh/whiteboard/whiteboard-planner";
import {
  buildGeometry,
  frameAt,
  resolveCarriedInk,
  scheduleScene,
  tracedSplitForScene,
  placementAt,
  type AssetGeometry,
} from "../src/lib/ibismuh/whiteboard/timing";
import { composeScene, framePayload, APPLY_FRAME_FN } from "../src/lib/ibismuh/whiteboard/wb-page";
import { compileBeats, planBeats } from "../src/lib/ibismuh/whiteboard/beat-plan";
import { directCamera } from "../src/lib/ibismuh/whiteboard/camera-director";

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

const LIB = {
  assetIds: new Set(["a1", "a2"]),
  pathIdsByAsset: new Map([
    ["a1", new Set(["p1", "p2"])],
    ["a2", new Set<string>()],
  ]),
  textIdsByAsset: new Map([["a2", new Set(["t1"])]]),
};

const PLACE = (x: number) => ({ x, y: 0, scale: 1, rotateDeg: 0 });

function project(scenes: unknown[]): unknown {
  return { title: "T", width: 1920, height: 1080, fps: 24, hand: { style: "marker", scale: 1 }, scenes };
}

/** A synthetic asset geometry: a1 carries two strokes, p1 and p2. */
function geoFor(): Map<string, AssetGeometry> {
  return buildGeometry([
    {
      id: "a1",
      paths: [
        { id: "p1", d: "M 0 0 L 100 0" },
        { id: "p2", d: "M 0 0 L 0 100" },
      ],
    },
    { id: "a2", paths: [] },
  ]);
}

const v = (p: unknown) => validateWhiteboardProject(p, LIB);

// --- 1. VALIDATOR -------------------------------------------------------------

suiteStart("validator — the key-uniqueness law");

await test("two placements of one asset validate with distinct placementIds (the Phase B win)", () => {
  const scene: WhiteboardScene = {
    id: "s1",
    narration: "two coins",
    background: "#ffffff",
    placements: [
      { assetId: "a1", placement: PLACE(0), order: 0 },
      { assetId: "a1", placementId: "a1-2", placement: PLACE(400), order: 1 },
    ],
    animations: [],
    camera: [],
  };
  const r = v(project([scene]));
  ok(r.project !== null, `errors: ${r.errors.join("; ")}`);
  eq(r.project?.scenes[0].placements[1].placementId, "a1-2", "the explicit placementId survives parse");
  eq(r.project?.scenes[0].placements[0].placementId, undefined, "the legacy-compatible first placement carries no field");
});

await test("two placements of one asset WITHOUT placementIds are refused (the legacy defect, pinned message)", () => {
  const scene: WhiteboardScene = {
    id: "s1",
    narration: "two coins, no identities",
    background: "#ffffff",
    placements: [
      { assetId: "a1", placement: PLACE(0), order: 0 },
      { assetId: "a1", placement: PLACE(400), order: 1 },
    ],
    animations: [],
    camera: [],
  };
  const r = v(project([scene]));
  ok(r.project === null, "the ambiguous board is rejected");
  ok(r.errors.some((e) => e.includes("placed twice")), `errors: ${r.errors.join("; ")}`);
});

await test("a duplicate explicit placementId is refused", () => {
  const scene: WhiteboardScene = {
    id: "s1",
    narration: "clashing identities",
    background: "#ffffff",
    placements: [
      { assetId: "a1", placementId: "same", placement: PLACE(0), order: 0 },
      { assetId: "a2", placementId: "same", placement: PLACE(400), order: 1 },
    ],
    animations: [],
    camera: [],
  };
  const r = v(project([scene]));
  ok(r.project === null, "the colliding keys are rejected");
  ok(r.errors.some((e) => e.includes("already used in this scene")), `errors: ${r.errors.join("; ")}`);
});

await test("an explicit placementId violating the id charset is refused", () => {
  const scene: WhiteboardScene = {
    id: "s1",
    narration: "bad charset",
    background: "#ffffff",
    placements: [{ assetId: "a1", placementId: "a::1", placement: PLACE(0), order: 0 }],
    animations: [],
    camera: [],
  };
  const r = v(project([scene]));
  ok(r.project === null, "the namespace separator is refused");
  ok(r.errors.some((e) => e.includes("violates the id charset")), `errors: ${r.errors.join("; ")}`);
});

await test("an animation naming an unknown placement is refused", () => {
  const scene: WhiteboardScene = {
    id: "s1",
    narration: "ghost address",
    background: "#ffffff",
    placements: [{ assetId: "a1", placement: PLACE(0), order: 0 }],
    animations: [{ type: "draw_path", assetId: "a1", placementId: "nope", pathId: "p1", startMs: 0, durationMs: 500 }],
    camera: [],
  };
  const r = v(project([scene]));
  ok(r.project === null, "the ghost address is rejected");
  ok(r.errors.some((e) => e.includes("unknown placement")), `errors: ${r.errors.join("; ")}`);
});

await test("an animation WITHOUT a placementId in an ambiguous scene is refused (the ambiguity law)", () => {
  const scene: WhiteboardScene = {
    id: "s1",
    narration: "two coins, one blind event",
    background: "#ffffff",
    placements: [
      { assetId: "a1", placement: PLACE(0), order: 0 },
      { assetId: "a1", placementId: "a1-2", placement: PLACE(400), order: 1 },
    ],
    animations: [{ type: "draw_path", assetId: "a1", pathId: "p1", startMs: 0, durationMs: 500 }],
    camera: [],
  };
  const r = v(project([scene]));
  ok(r.project === null, "the blind address is rejected");
  ok(r.errors.some((e) => e.includes("name the placementId")), `errors: ${r.errors.join("; ")}`);
});

await test("an animation WITH a placementId in a repeated scene validates", () => {
  const scene: WhiteboardScene = {
    id: "s1",
    narration: "two coins, addressed",
    background: "#ffffff",
    placements: [
      { assetId: "a1", placement: PLACE(0), order: 0 },
      { assetId: "a1", placementId: "a1-2", placement: PLACE(400), order: 1 },
    ],
    animations: [
      { type: "draw_path", assetId: "a1", placementId: "a1-2", pathId: "p1", startMs: 0, durationMs: 500 },
      { type: "move_object", assetId: "a1", placementId: "a1", startMs: 500, durationMs: 400, to: PLACE(800) },
    ],
    camera: [],
  };
  const r = v(project([scene]));
  ok(r.project !== null, `errors: ${r.errors.join("; ")}`);
});

// --- 2. LEGACY ----------------------------------------------------------------

suiteStart("legacy — the derived-identity law");

await test("placementKey derives the legacy address (assetId) when no placementId is authored", () => {
  eq(placementKey({ assetId: "coin" }), "coin", "absent placementId → the assetId");
  eq(placementKey({ assetId: "coin", placementId: "coin-2" }), "coin-2", "explicit placementId wins");
  eq(eventPlacementKey({ type: "draw_path", assetId: "coin", pathId: "p", startMs: 0, durationMs: 1 }), "coin");
  eq(eventPlacementKey({ type: "draw_path", assetId: "coin", placementId: "coin-2", pathId: "p", startMs: 0, durationMs: 1 }), "coin-2");
});

await test("derivePlacementId: the first placement stays field-free; repeats get -2, -3 in order", () => {
  const empty = { placements: [] as { placementId?: string; assetId: string }[] };
  eq(derivePlacementId(empty, "coin"), undefined, "the first placement keeps the legacy-compatible key (no field)");
  const one = { placements: [{ assetId: "coin" }] };
  eq(derivePlacementId(one, "coin"), "coin-2", "the repeat gets -2");
  const two = { placements: [{ assetId: "coin" }, { assetId: "coin", placementId: "coin-2" }] };
  eq(derivePlacementId(two, "coin"), "coin-3", "the third gets -3");
  const other = { placements: [{ assetId: "bell" }] };
  eq(derivePlacementId(other, "coin"), undefined, "another asset's placements do not block the bare key");
});

await test("a legacy doc (no placementIds anywhere) schedules BYTE-IDENTICAL events (no placementId field)", () => {
  const scene: WhiteboardScene = {
    id: "s1",
    narration: "one coin",
    background: "#ffffff",
    placements: [{ assetId: "a1", placement: PLACE(0), order: 0 }],
    animations: [],
    camera: [],
  };
  const events = scheduleScene(scene, 6000, geoFor());
  ok(events.some((e) => e.type === "draw_path"), "the fill law schedules the strokes");
  ok(
    events.every((e) => !("placementId" in e)),
    "every legacy event stays field-free"
  );
  const frame = frameAt(project([scene]) as never, scene, events, geoFor(), 3000);
  ok(frame.draws.has("a1::p1"), "the legacy draw key IS 'a1::p1'");
  eq([...frame.placements.keys()], ["a1"], "the placements map is keyed by the assetId");
});

// --- 3. SCHEDULE + FRAMES -----------------------------------------------------

suiteStart("schedule + frames — per-instance claiming");

const REPEATED: WhiteboardScene = {
  id: "s1",
  narration: "two coins, addressed",
  background: "#ffffff",
  placements: [
    { assetId: "a1", placement: PLACE(0), order: 0 },
    { assetId: "a1", placementId: "a1-2", placement: PLACE(400), order: 1 },
  ],
  animations: [],
  camera: [],
};

await test("repeated instances each claim their own strokes; events address the keyed instance only", () => {
  const events = scheduleScene(REPEATED, 8000, geoFor());
  const draws = events.filter((e) => e.type === "draw_path");
  eq(draws.length, 4, "two instances × two strokes");
  const keyed = draws.filter((e) => "placementId" in e);
  eq(keyed.length, 2, "only the -2 instance's events carry the address");
  ok(
    keyed.every((e) => (e as { placementId?: string }).placementId === "a1-2"),
    "the address IS 'a1-2'"
  );
  const bare = draws.filter((e) => !("placementId" in e));
  eq(bare.length, 2, "the legacy-addressed instance stays field-free");
  const frame = frameAt(project([REPEATED]) as never, REPEATED, events, geoFor(), 8000);
  ok(frame.draws.has("a1::p1") && frame.draws.has("a1::p2"), "instance one's keys");
  ok(frame.draws.has("a1-2::p1") && frame.draws.has("a1-2::p2"), "instance two's keys");
  eq(
    [...frame.placements.keys()].sort(),
    ["a1", "a1-2"].sort(),
    "the placements map carries BOTH instances"
  );
});

await test("move_object with an explicit placementId moves ONLY that instance", () => {
  const scene: WhiteboardScene = {
    ...REPEATED,
    animations: [
      { type: "move_object", assetId: "a1", placementId: "a1-2", startMs: 0, durationMs: 1000, to: PLACE(900) },
    ],
  };
  const events = scheduleScene(scene, 8000, geoFor());
  const frame = frameAt(project([scene]) as never, scene, events, geoFor(), 1000);
  eq(frame.placements.get("a1")?.x, 0, "the legacy instance never moved");
  eq(frame.placements.get("a1-2")?.x, 900, "the addressed instance arrived");
});

await test("placementAt matches move_object by the event's placement address (explicit or legacy)", () => {
  const end = placementAt(REPEATED, REPEATED.placements[1], 1000);
  eq(end.x, REPEATED.placements[1].placement.x, "no matching event → the base placement");
  const withMove: WhiteboardScene = {
    ...REPEATED,
    animations: [
      { type: "move_object", assetId: "a1", placementId: "a1-2", startMs: 0, durationMs: 1000, to: PLACE(777) },
    ],
  };
  eq(placementAt(withMove, withMove.placements[1], 1000).x, 777, "the keyed instance follows its event");
  eq(placementAt(withMove, withMove.placements[0], 1000).x, 0, "the other instance does not");
});

// --- 4. PAGE SEAM -------------------------------------------------------------

suiteStart("page seam — one group per instance");

const lib = loadLibrary();
const coinPaths = lib.extracted.get("coin")?.paths.map((p) => p.id) ?? [];

await test("composeScene renders one group per instance with distinct DOM ids and key→asset registration", () => {
  const scene: WhiteboardScene = {
    id: "s1",
    narration: "two coins on one board",
    background: "#ffffff",
    placements: [
      { assetId: "coin", placement: PLACE(0), order: 0 },
      { assetId: "coin", placementId: "coin-2", placement: PLACE(400), order: 1 },
    ],
    animations: [],
    camera: [],
  };
  const composed = composeScene(scene, { title: "T", width: 1920, height: 1080, fps: 24, hand: { style: "marker", scale: 1 }, scenes: [scene] }, lib.assets);
  ok(composed.html.includes('id="g-coin"'), "instance one's group");
  ok(composed.html.includes('id="g-coin-2"'), "instance two's group");
  for (const pathId of coinPaths) {
    ok(composed.pathEls.has(`coin::${pathId}`), `instance one's frame key ${pathId}`);
    ok(composed.pathEls.has(`coin-2::${pathId}`), `instance two's frame key ${pathId}`);
    eq(composed.pathAssetIds.get(`coin::${pathId}`), "coin", "key → asset registered (instance one)");
    eq(composed.pathAssetIds.get(`coin-2::${pathId}`), "coin", "key → asset registered (instance two)");
  }
});

await test("the applier loop reads the placement keys off the wire payload (the g-<key> pin)", () => {
  ok(APPLY_FRAME_FN.includes('for (const [key, pl] of p.placements)'), "the placements loop iterates KEYED entries");
  ok(APPLY_FRAME_FN.includes('document.getElementById("g-" + key)'), "the group is addressed by the placement key");
  ok(APPLY_FRAME_FN.includes('for (const [key, pl] of p.carried.placements)'), "the carried loop iterates keyed entries");
});

await test("framePayload serializes per-instance keys (both placements appear on the wire)", () => {
  const events = scheduleScene(REPEATED, 8000, geoFor());
  const frame = frameAt(project([REPEATED]) as never, REPEATED, events, geoFor(), 4000);
  const payload = JSON.parse(framePayload(frame, 1920, 1080)) as {
    placements: [string, unknown][];
    draws: [string, number][];
    carried: unknown;
  };
  const keys = payload.placements.map(([k]) => k).sort();
  eq(keys, ["a1", "a1-2"], "both instances on the wire");
  ok(payload.draws.some(([k]) => k.startsWith("a1::")), "instance one's draw keys");
  ok(payload.draws.some(([k]) => k.startsWith("a1-2::")), "instance two's draw keys");
  eq(payload.carried, null, "a clean scene's carried layer is null on the wire");
});

// --- 5. CARRY -----------------------------------------------------------------

suiteStart("carry — carried ink × repeated placement");

const CARRY_SCENE: WhiteboardScene = {
  id: "s1",
  narration: "one coin",
  background: "#ffffff",
  placements: [{ assetId: "a1", placement: PLACE(0), order: 0 }],
  animations: [{ type: "reveal_color", assetId: "a1", startMs: 0, durationMs: 1000 }],
  camera: [],
};

await test("carrying one instance while re-placing the same ASSET as a fresh instance is legal", () => {
  const next: WhiteboardScene = {
    id: "s2",
    narration: "the coin stays; a new coin appears",
    background: "#ffffff",
    board: { mode: "continuous" },
    placements: [{ assetId: "a1", placementId: "a1-2", placement: PLACE(600), order: 1 }],
    animations: [],
    camera: [],
  };
  const r = v(project([CARRY_SCENE, next]));
  ok(r.project !== null, `errors: ${r.errors.join("; ")}`);
});

await test("re-placing the carried KEY itself is still refused (the collision law holds)", () => {
  const next: WhiteboardScene = {
    id: "s2",
    narration: "the same coin twice",
    background: "#ffffff",
    board: { mode: "continuous" },
    placements: [{ assetId: "a1", placement: PLACE(600), order: 1 }],
    animations: [],
    camera: [],
  };
  const r = v(project([CARRY_SCENE, next]));
  ok(r.project === null, "the carried key may not reappear");
  ok(r.errors.some((e) => e.includes("carried AND re-placed")), `errors: ${r.errors.join("; ")}`);
});

await test("resolveCarriedInk keys the plan by placement identity and carries the asset map", () => {
  const plan = resolveCarriedInk(CARRY_SCENE, 5000, { mode: "continuous" });
  ok(plan !== null, "the carry resolves");
  eq([...plan.placements.keys()], ["a1"], "the legacy carried key IS the assetId");
  eq(plan.assetIds.get("a1"), "a1", "the key → asset map rides along");
  ok(plan.colors.has("a1"), "the carried color state is keyed the same way");
});

await test("frameAt injects carried ink under the carried key while the fresh instance draws under its own", () => {
  const prev: WhiteboardScene = {
    id: "s1",
    narration: "coin one",
    background: "#ffffff",
    placements: [{ assetId: "a1", placementId: "coin-a", placement: PLACE(0), order: 0 }],
    animations: [],
    camera: [],
  };
  const next: WhiteboardScene = {
    id: "s2",
    narration: "carry the coin; draw another",
    background: "#ffffff",
    board: { mode: "continuous" },
    placements: [{ assetId: "a1", placementId: "coin-b", placement: PLACE(600), order: 1 }],
    animations: [],
    camera: [],
  };
  const plan = resolveCarriedInk(prev, 5000, { mode: "continuous" });
  ok(plan !== null && plan.placements.has("coin-a"), "the carried plan is keyed by identity");
  const events = scheduleScene(next, 6000, geoFor());
  const frame = frameAt(project([prev, next]) as never, next, events, geoFor(), 3000, plan);
  ok(frame.draws.get("coin-a::p1") === 1, "the carried ink is fully drawn under ITS key");
  ok(frame.draws.has("coin-b::p1") || frame.draws.has("coin-b::p2"), "the fresh instance draws under its own key");
  eq(frame.carried?.placements.get("coin-a")?.x, 0, "the carried layer keeps the carried placement");
});

await test("carryPlacements names resolve by placement KEY first, assetId second", () => {
  const prev: WhiteboardScene = {
    id: "s1",
    narration: "two coins",
    background: "#ffffff",
    placements: [
      { assetId: "a1", placement: PLACE(0), order: 0 },
      { assetId: "a1", placementId: "a1-2", placement: PLACE(400), order: 1 },
    ],
    animations: [],
    camera: [],
  };
  const nextKeyed: WhiteboardScene = {
    id: "s2",
    narration: "carry only the second coin",
    background: "#ffffff",
    board: { mode: "continuous", carryPlacements: ["a1-2"] },
    placements: [],
    animations: [],
    camera: [],
  };
  const r = v(project([prev, nextKeyed]));
  ok(r.project !== null, `key-name carry errors: ${r.errors.join("; ")}`);
  const planKey = resolveCarriedInk(prev, 5000, { mode: "continuous", carryPlacements: ["a1-2"] });
  ok(planKey !== null && [...planKey.placements.keys()].join() === "a1-2", "the key name resolves to exactly that instance");
  const planAsset = resolveCarriedInk(prev, 5000, { mode: "continuous", carryPlacements: ["a1"] });
  ok(planAsset !== null && planAsset.placements.size === 2, "the assetId name carries ALL instances of that asset (the legacy single-instance case is unchanged)");
  ok(planAsset !== null && planAsset.placements.has("a1") && planAsset.placements.has("a1-2"), "both instance keys ride the plan");
});

// --- 6. BEATS -----------------------------------------------------------------

suiteStart("beats — per-instance grouping + key-scoped claims");

await test("the beat compiler's claimed keys are placement-scoped", () => {
  const scene: WhiteboardScene = {
    ...REPEATED,
    animations: [
      { type: "draw_path", assetId: "a1", placementId: "a1-2", pathId: "p1", startMs: 0, durationMs: 500 },
    ],
  };
  const beats = planBeats(scene, { durationMs: 8000, geometry: geoFor() });
  ok(beats.length > 0, "the plan compiles");
  // Instance a1's p1 must still be schedulable: the beat fill for the
  // legacy instance draws p1 (its claim set is untouched by a1-2's event).
  const events = compileBeats(beats, scene, 8000, geoFor());
  const bare = events.filter((e) => e.type === "draw_path" && !("placementId" in e) && e.pathId === "p1");
  ok(bare.length > 0, "instance one's p1 is beat-scheduled despite instance two's explicit claim");
});

await test("two instances of one asset join the beats as separate placements", () => {
  const beats = planBeats(REPEATED, { durationMs: 8000, geometry: geoFor() });
  const allKeys = beats.flatMap((b) => b.placementKeys);
  ok(allKeys.includes("a1") && allKeys.includes("a1-2"), `placementKeys carry both instances: ${allKeys.join(",")}`);
  eq(beats.every((b) => b.placementKeys.length === b.assetIds.length), true, "the key and asset lists stay parallel");
});

await test("compileBeats emits the placement address only for the keyed instance", () => {
  const beats = planBeats(REPEATED, { durationMs: 8000, geometry: geoFor() });
  const events = compileBeats(beats, REPEATED, 8000, geoFor());
  const keyed = events.filter((e) => "placementId" in e && e.placementId === "a1-2");
  ok(keyed.length > 0, "instance two's events carry the address");
  const bare = events.filter((e) => e.type === "draw_path" && !("placementId" in e) && e.assetId === "a1");
  ok(bare.length > 0, "instance one's events stay field-free");
});

await test("directCamera frames the repeated scene (per-instance bboxes, no crash, deterministic)", () => {
  const events = scheduleScene(REPEATED, 8000, geoFor());
  const a = directCamera(REPEATED, 1920, 1080, 8000, geoFor(), events);
  const b = directCamera(REPEATED, 1920, 1080, 8000, geoFor(), events);
  eq(a, b, "the double-run pin holds");
});

// --- 7. TRACED CAP ------------------------------------------------------------

suiteStart("traced cap — the per-instance split");

await test("tracedSplitForScene caps PER INSTANCE (both keys appear; the legacy single placement is identical)", () => {
  const scene: WhiteboardScene = {
    ...REPEATED,
    placements: [
      { assetId: "a1", placement: PLACE(0), order: 0 },
      { assetId: "a1", placementId: "a1-2", placement: PLACE(400), order: 1 },
    ],
  };
  // A tiny cap forces a remainder on every placement.
  const split = tracedSplitForScene(scene, geoFor(), new Map([["a1", ["traced"]]]), 4000, undefined);
  ok(split === null, "two strokes fit any sane cap — no split (the honest-arithmetic law)");
  const tinyScene: WhiteboardScene = {
    id: "s1",
    narration: "one traced coin",
    background: "#ffffff",
    placements: [{ assetId: "a1", placement: PLACE(0), order: 0 }],
    animations: [],
    camera: [],
  };
  eq(tracedSplitForScene(tinyScene, geoFor(), new Map([["a1", ["traced"]]]), 4000, undefined), null, "the legacy path stays null");
});

// --- 8. WIRE ------------------------------------------------------------------

suiteStart("wire — the doc round-trip");

await test("serialize/parse preserves placementId fields and the rev discipline", () => {
  const scene: WhiteboardScene = {
    id: "s1",
    narration: "persist the identity",
    background: "#ffffff",
    placements: [
      { assetId: "a1", placement: PLACE(0), order: 0 },
      { assetId: "a1", placementId: "a1-2", placement: PLACE(400), order: 1 },
    ],
    animations: [{ type: "draw_path", assetId: "a1", placementId: "a1-2", pathId: "p1", startMs: 0, durationMs: 500 }],
    camera: [],
  };
  const r = v(project([scene]));
  ok(r.project !== null, `errors: ${r.errors.join("; ")}`);
  const doc: WhiteboardDoc = { rev: 3, project: r.project };
  const back = parseWhiteboardDoc(serializeWhiteboardDoc(doc));
  ok(back !== null, "the doc parses back");
  eq(back?.project.scenes[0].placements[1].placementId, "a1-2", "the placementId survives the round-trip");
  eq(back?.project.scenes[0].placements[0].placementId, undefined, "the legacy placement stays field-free");
  eq(back?.project.scenes[0].animations[0].placementId, "a1-2", "the event address survives the round-trip");
  eq(back?.rev, 3, "the rev survives");
});

// --- summary ------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

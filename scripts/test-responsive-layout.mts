#!/usr/bin/env node
// responsive-layout suite — the graphics responsive layout solver (the
// engineering master plan's WS8: "responsive layout solver").
//
// The module (src/lib/ibismuh/graphics/layout.ts) turns the remap law's
// geometric truth into DELIBERATE per-aspect policies with gates. This
// suite pins the laws:
//
//   1. VOCABULARY — the closed aspect set rides the house surfaces table;
//      a non-house surface refuses BY NAME (never a silent nearest-snap).
//   2. POLICIES — each aspect carries a NAMED variant with its own
//      safe-margin ratio, simultaneous cap, and readable type floor
//      (9:16 stacks with fewer elements and larger type; 1:1 centers;
//      16:9 opens the stage) — each aspect has a deliberate layout.
//   3. GATES — the safe-area gate fails an element parked outside the
//      safe rect; the min-size gate fails drawn text below the aspect
//      floor; both findings NAME the element and the constraint.
//   4. NOTES — the collision and density ESTIMATES ride as notes (never
//      fail a render); the collision band is loose enough for legal
//      stacking to stay silent.
//   5. MATRIX — the G1-LAY-1 row rides graphicsQcMatrix: an honest doc
//      passes on every aspect, a parked element fails the row with the
//      finding named, and the row is evidence (the matrix's own law).
//   6. PARITY + DETERMINISM — the solver is pure: same doc → the same
//      report twice (preview and final judge the same solve); the
//      scaffold's own docs pass the gates on ALL THREE surfaces (the
//      house placements are deliberate, not lucky).
//
// Run: node --import tsx scripts/test-responsive-layout.mts   (pure — no
// DB, no DOM, no network; CI step)

import {
  ASPECT_POLICIES,
  GRAPHICS_ASPECTS,
  aspectForSurface,
  solveGraphicsLayout,
} from "../src/lib/ibismuh/graphics/layout";
import { GRAPHICS_VERSION, validateGraphicsDoc, type GraphicsDoc } from "../src/lib/ibismuh/graphics/types";
import { graphicsQcMatrix } from "../src/lib/ibismuh/graphics/qc";
import { scaffoldGraphicsDoc } from "../src/lib/ibismuh/graphics/planner";
import { applyGraphicsRepairs, proposeGraphicsRepairs } from "../src/lib/ibismuh/graphics/repair";

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
// Fixtures — valid docs through the REAL validator (the matrix is evidence;
// the battery judges the same shapes the renderer admits)
// ---------------------------------------------------------------------------

interface ElOpts {
  at?: { x: number; y: number; scale?: number; rotateDeg?: number };
  sizePx?: number;
  text?: string;
}

function gEl(id: string, kind: string, opts: ElOpts = {}): Record<string, unknown> {
  const at = opts.at ?? { x: 960, y: 480, scale: 1, rotateDeg: 0 };
  const el: Record<string, unknown> = {
    id,
    kind,
    at: { scale: 1, rotateDeg: 0, ...at },
    enter: { kind: "fade", durationMs: 500, delayMs: 0, ease: "ease-out" },
  };
  if (opts.text !== undefined || ["headline", "subhead", "bullet", "callout"].includes(kind)) {
    el.text = { text: opts.text ?? "fixture line", ...(opts.sizePx !== undefined ? { sizePx: opts.sizePx } : {}) };
  }
  if (kind === "counter") {
    el.counter = { from: 0, to: 42 };
  }
  return el;
}

function gScene(id: string, elements: unknown[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, narration: "two short words", background: "#ffffff", elements, ...extra };
}

function gDoc(scenes: unknown[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { version: GRAPHICS_VERSION, title: "layout fixture", width: 1920, height: 1080, fps: 24, scenes, ...extra };
}

function mustValidate(raw: unknown, label: string): GraphicsDoc {
  const r = validateGraphicsDoc(raw);
  if (r.doc === null) throw new Error(`${label} — errors: ${r.errors.join(" | ")}`);
  return r.doc;
}

// ---------------------------------------------------------------------------
// 1. VOCABULARY
// ---------------------------------------------------------------------------

suiteStart("VOCABULARY — the closed aspect set");

await test("the aspect set is the house surfaces table, named", () => {
  eq([...GRAPHICS_ASPECTS], ["16:9", "9:16", "1:1"]);
  eq(aspectForSurface(1920, 1080), "16:9");
  eq(aspectForSurface(1080, 1920), "9:16");
  eq(aspectForSurface(1080, 1080), "1:1");
});

await test("a non-house surface refuses BY NAME — never a silent nearest-snap", () => {
  throws(() => aspectForSurface(1280, 720), "not a house surface");
  throws(() => aspectForSurface(Number.NaN, 1080), "not a house surface");
});

// ---------------------------------------------------------------------------
// 2. POLICIES — the deliberate layouts
// ---------------------------------------------------------------------------

suiteStart("POLICIES — each aspect has a deliberate layout");

await test("9:16 stacks with fewer elements, larger type, tighter margins", () => {
  const p = ASPECT_POLICIES["9:16"];
  eq(p.variant, "portrait-stack");
  ok(p.maxSimultaneous < ASPECT_POLICIES["16:9"].maxSimultaneous, "vertical carries fewer simultaneous elements");
  ok(p.typeFloorPx > ASPECT_POLICIES["16:9"].typeFloorPx, "portrait demands larger type");
  ok(p.safeMarginRatio > ASPECT_POLICIES["16:9"].safeMarginRatio, "portrait-safe focal bands are wider");
});

await test("1:1 centers the hierarchy; 16:9 opens the stage", () => {
  eq(ASPECT_POLICIES["1:1"].variant, "centered-square");
  eq(ASPECT_POLICIES["16:9"].variant, "wide-stage");
  ok(ASPECT_POLICIES["1:1"].maxSimultaneous <= ASPECT_POLICIES["16:9"].maxSimultaneous, "square simplifies");
});

// ---------------------------------------------------------------------------
// 3. GATES — safe area + min size, named findings
// ---------------------------------------------------------------------------

suiteStart("GATES — safe area + min size, named findings");

await test("an element parked outside the safe rect fails SAFE-AREA with the constraint named", () => {
  const doc = mustValidate(gDoc([gScene("s1", [gEl("h", "headline", { at: { x: 40, y: 480 }, text: "Parked" })])]), "parked");
  const solve = solveGraphicsLayout(doc);
  eq(solve.aspect, "16:9");
  ok(solve.violations.length === 1, `one gate violation (got ${JSON.stringify(solve.violations)})`);
  const v = solve.violations[0];
  eq(v.gate, "SAFE-AREA");
  eq(v.elementId, "h");
  eq(v.sceneId, "s1");
  ok(v.detail.includes("safe rect"), "the constraint is named");
});

await test("exactly-at-floor text passes; the belt holds where the validator cannot clamp", () => {
  const atFloor = mustValidate(gDoc([gScene("s1", [gEl("s", "subhead", { at: { x: 960, y: 620 }, sizePx: 12 })])]), "at-floor");
  eq(solveGraphicsLayout(atFloor).violations, [], "12px sits exactly on the 16:9 floor — passes");
});

await test("the 9:16 floor bites where the validator's 12px clamp stops", () => {
  // The validator clamps to 12..288 — so on 16:9 the gate is belt-and-
  // suspenders (nothing below 12 survives validation), but the 9:16/1:1
  // floors (15/14) sit ABOVE the clamp: a legal 12px text fails there.
  const doc916 = mustValidate(gDoc([gScene("s1", [gEl("s", "subhead", { at: { x: 540, y: 960 }, sizePx: 12 })])], { width: 1080, height: 1920 }), "12px-916");
  const v = solveGraphicsLayout(doc916).violations;
  ok(v.some((f) => f.gate === "MIN-SIZE" && f.elementId === "s"), "12 < 15 fails the 9:16 floor");
  ok(v[0].detail.includes("portrait-stack"), "the constraint names the variant");
  const doc169 = mustValidate(gDoc([gScene("s1", [gEl("s", "subhead", { sizePx: 12 })])]), "12px-169");
  eq(solveGraphicsLayout(doc169).violations, [], "the same 12px passes on 16:9 (floor 12)");
});

await test("the house default sizes pass their own floors on every aspect", () => {
  for (const surface of [[1920, 1080], [1080, 1920], [1080, 1080]] as const) {
    const doc = mustValidate(gDoc([gScene("s1", [
      gEl("h", "headline", { sizePx: 64 }),
      gEl("s", "subhead", { sizePx: 40, at: { x: 540, y: 620 } }),
    ])], { width: surface[0], height: surface[1] }), `defaults-${surface.join("x")}`);
    eq(solveGraphicsLayout(doc).violations, [], `defaults pass on ${surface.join("x")}`);
  }
});

// ---------------------------------------------------------------------------
// 4. NOTES — collision + density estimates never fail
// ---------------------------------------------------------------------------

suiteStart("NOTES — collision + density estimates never fail");

await test("two overlapping text boxes note COLLISION without violating a gate", () => {
  const doc = mustValidate(gDoc([gScene("s1", [
    gEl("a", "headline", { text: "A long overlapping headline line", sizePx: 64 }),
    gEl("b", "subhead", { text: "buried beneath it", sizePx: 40, at: { x: 960, y: 500 } }),
  ])]), "overlap");
  const solve = solveGraphicsLayout(doc);
  eq(solve.violations, [], "an overlap is never a gate");
  ok(solve.notes.some((n) => n.gate === "COLLISION"), "the collision note fires");
});

await test("dense scenes note DENSITY past the aspect cap", () => {
  const elements = [0, 1, 2, 3, 4, 5, 6].map((i) =>
    gEl(`b${i}`, "bullet", { text: `row ${i}`, sizePx: 36, at: { x: 540, y: 260 + i * 110 } }),
  );
  const doc = mustValidate(gDoc([gScene("s1", elements)]), "dense");
  const solve = solveGraphicsLayout(doc);
  const density = solve.notes.find((n) => n.gate === "DENSITY");
  ok(density !== undefined, "the 7-element scene notes past the 16:9 cap 6");
  ok(density.detail.includes("cap 6"), "the cap is named");
});

// ---------------------------------------------------------------------------
// 5. MATRIX — the G1-LAY-1 row rides graphicsQcMatrix
// ---------------------------------------------------------------------------

suiteStart("MATRIX — the G1-LAY-1 row rides the pre-render evidence");

await test("an honest doc passes G1-LAY-1 and the whole matrix stays green", () => {
  const doc = mustValidate(gDoc([gScene("s1", [gEl("h", "headline", { text: "Big title", sizePx: 64 })], { durationMs: 3000 })]), "honest");
  const report = graphicsQcMatrix(doc, 0);
  const layRow = report.rows.find((r) => r.id === "G1-LAY-1");
  ok(layRow !== undefined, "the lens exists");
  eq(layRow.status, "pass");
  ok(layRow.value.includes("wide-stage"), "the row names the variant");
  ok(report.passed, "the matrix stays green for an honest doc");
});

await test("a parked element fails G1-LAY-1 with the finding named", () => {
  const doc = mustValidate(gDoc([gScene("s1", [gEl("h", "headline", { at: { x: 40, y: 480 }, text: "Parked" })], { durationMs: 3000 })]), "parked");
  const report = graphicsQcMatrix(doc, 0);
  const layRow = report.rows.find((r) => r.id === "G1-LAY-1");
  eq(layRow?.status, "fail");
  ok(layRow?.detail?.includes("s1/h"), "the finding names the scene/element");
  ok(!report.passed, "the matrix stays red for the layout defect (never silently shipped)");
});

// ---------------------------------------------------------------------------
// 6. PARITY + DETERMINISM — pure solve; scaffold docs pass on all aspects
// ---------------------------------------------------------------------------

suiteStart("PARITY + DETERMINISM — the same doc, the same solve");

await test("the solver is pure — two runs produce the same report bytes", () => {
  const doc = mustValidate(gDoc([gScene("s1", [
    gEl("h", "headline", { text: "Determinism", sizePx: 64 }),
    gEl("s", "subhead", { sizePx: 40, at: { x: 540, y: 620 } }),
  ])]), "det");
  const a = JSON.stringify(solveGraphicsLayout(doc));
  const b = JSON.stringify(solveGraphicsLayout(doc));
  eq(a, b, "same doc → same bytes (preview and final select the same variant)");
});

await test("the graphics scaffold's own docs pass the gates on ALL THREE surfaces", () => {
  const scenes = [
    { narration: "City foxes own the night.", visualIntent: "The urban fox" },
    { narration: "Their population grew 42% versus 30.", visualIntent: "Growth" },
    { narration: "In conclusion, the night is theirs.", visualIntent: "Close" },
  ];
  for (const surface of [[1920, 1080], [1080, 1920], [1080, 1080]] as const) {
    const doc = scaffoldGraphicsDoc({ scenes, topic: "Urban foxes", width: surface[0], height: surface[1] });
    const solve = solveGraphicsLayout(doc);
    eq(solve.violations, [], `the scaffold is deliberate on ${surface.join("x")}`);
    eq(solve.variant, ASPECT_POLICIES[solve.aspect].variant, "the variant is the aspect's named policy");
  }
});

// ---------------------------------------------------------------------------
// 6. THE REPAIR SEAM (the re-audit's step 5)
// ---------------------------------------------------------------------------

suiteStart("REPAIR — proposeGraphicsRepairs: deterministic proposals, honest gates");

await test("SAFE-AREA proposes a recenter into the safe rect; MIN-SIZE proposes the floor scale", () => {
  const doc = mustValidate(gDoc([gScene("s1", [
    gEl("h", "headline", { at: { x: 40, y: 480 }, text: "Parked" }),
    // The validator clamps sizePx to the 12px floor — the layout gate
    // bites through SCALE (drawn = size × at.scale), the same seam the
    // 9:16 floor's own law rides.
    gEl("s", "subhead", { at: { x: 960, y: 700, scale: 0.5 }, sizePx: 12, text: "tiny" }),
  ])]), "repair fixture");
  const solve = solveGraphicsLayout(doc);
  eq(solve.violations.length, 2, "the fixture violates both gates");
  const repairs = proposeGraphicsRepairs(doc, solve);
  eq(repairs.length, 2, "one proposal per violation");
  const recenter = repairs.find((r) => r.kind === "recenter");
  ok(recenter !== undefined, "the parked headline re-centers");
  ok(
    recenter !== undefined && recenter.to !== undefined &&
      recenter.to.x >= doc.width * ASPECT_POLICIES["16:9"].safeMarginRatio,
    "the recentered center sits inside the safe rect"
  );
  const bump = repairs.find((r) => r.kind === "bump-size");
  ok(bump !== undefined && bump.scale !== undefined && bump.scale > 1, "the tiny subhead bumps up");
  const a = JSON.stringify(proposeGraphicsRepairs(doc, solve));
  const b = JSON.stringify(proposeGraphicsRepairs(doc, solve));
  eq(a, b, "deterministic: same doc + report → the same proposals");
});

await test("COLLISION proposes the least-penetration repair; long lines wrap first", () => {
  // Two stacked headline-sized texts overlapping: the later element
  // repositions (not text-friendly) — and a two-collision fixture where
  // the overlap is horizontal-dominant wraps.
  const wide = gDoc([gScene("s1", [
    gEl("a", "subhead", { at: { x: 960, y: 480 }, text: "the anchor line holds its ground", sizePx: 48 }),
    gEl("b", "subhead", { at: { x: 1000, y: 520 }, text: "the drifter collides horizontally across the whole stage with a very long single line of text", sizePx: 48 }),
  ])]);
  const doc = mustValidate(wide, "collision fixture");
  const solve = solveGraphicsLayout(doc);
  ok(solve.notes.some((n) => n.gate === "COLLISION"), "the fixture collides");
  const repairs = proposeGraphicsRepairs(doc, solve);
  ok(repairs.length >= 1, "at least one collision repair proposes");
  for (const r of repairs) {
    ok(r.kind === "reposition" || r.kind === "wrap-text", `the collision repair is mechanical (${r.kind})`);
  }
  const wrap = repairs.find((r) => r.kind === "wrap-text");
  if (wrap !== undefined && wrap.text !== undefined) {
    ok(!wrap.text.includes("\n\n"), "the wrap reflows on words");
    const longest = Math.max(...wrap.text.split("\n").map((l) => l.length));
    const originalEl = doc.scenes[0].elements[1];
    const original = Math.max(...String((originalEl.text as { text: string }).text).split("\n").map((l) => l.length));
    ok(longest < original, "the wrapped longest line is strictly shorter (the box narrows)");
  }
});

await test("DENSITY and LABEL-FIT are declared unrepairable — no fake fixes", () => {
  const dense = mustValidate(gDoc([gScene("s1", [
    ...Array.from({ length: 7 }, (_, i) => gEl(`b${i}`, "bullet", { at: { x: 960, y: 200 + 90 * i }, text: `line ${i}`, sizePx: 16 })),
  ])]), "dense");
  const denseSolve = solveGraphicsLayout(dense);
  ok(denseSolve.notes.some((n) => n.gate === "DENSITY"), "the dense fixture notes density");
  eq(denseSolve.notes.filter((n) => n.gate === "DENSITY").flatMap(() => proposeGraphicsRepairs(dense, denseSolve).filter((r) => r.gate === "DENSITY")), [], "density proposes nothing");
  const chartDoc = mustValidate(gDoc([gScene("s1", [
    gEl("chart", "barChart", { at: { x: 960, y: 540 } }),
  ])]), "chart");
  // Widen the labels past the slot: 6 bars × ~115px slots; a 40-char label.
  chartDoc.scenes[0].elements[0].bar = {
    data: Array.from({ length: 6 }, (_, i) => ({ label: `metric number ${i} with a very long name`, value: 10 + i })),
  };
  const chartSolve = solveGraphicsLayout(chartDoc);
  ok(chartSolve.notes.some((n) => n.gate === "LABEL-FIT"), "the long-label chart notes the fit");
  eq(chartSolve.notes.filter((n) => n.gate === "LABEL-FIT").flatMap(() => proposeGraphicsRepairs(chartDoc, chartSolve).filter((r) => r.gate === "LABEL-FIT")), [], "label-fit proposes nothing (the labels are the payload's data)");
});

await test("applyGraphicsRepairs: pure, ids stable, the re-solved report drops the fixed violations", () => {
  const doc = mustValidate(gDoc([gScene("s1", [
    gEl("h", "headline", { at: { x: 40, y: 480 }, text: "Parked" }),
    gEl("s", "subhead", { at: { x: 960, y: 700, scale: 0.5 }, sizePx: 12, text: "tiny" }),
  ])]), "apply fixture");
  const solve = solveGraphicsLayout(doc);
  const repairs = proposeGraphicsRepairs(doc, solve);
  const out = applyGraphicsRepairs(doc, repairs);
  eq(out.skipped, [], "every repair lands on its element");
  const els = Object.fromEntries(out.doc.scenes[0].elements.map((e) => [e.id, e]));
  eq(els.h?.id, "h", "ids are stable");
  const after = solveGraphicsLayout(out.doc);
  eq(after.violations, [], `the repaired doc passes both gates: ${JSON.stringify(after.violations)}`);
  ok(els.h?.at.x !== doc.scenes[0].elements[0].at.x, "the parked headline moved");
  ok((els.s?.at.scale ?? 0) > (doc.scenes[0].elements[1].at.scale), "the tiny subhead scaled up");
  const a = JSON.stringify(applyGraphicsRepairs(doc, repairs).doc);
  const b = JSON.stringify(applyGraphicsRepairs(doc, repairs).doc);
  eq(a, b, "deterministic: same doc + repairs → the same bytes");
  const ghost = applyGraphicsRepairs(doc, [{ kind: "recenter", sceneId: "ghost", elementId: "h", gate: "SAFE-AREA", detail: "x", to: { x: 960, y: 540 } }]);
  ok(ghost.skipped.length === 1, "a ghost scene skips by name");
  const r = validateGraphicsDoc(out.doc);
  ok(r.doc !== null, "the repaired doc revalidates clean");
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== responsive-layout: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}

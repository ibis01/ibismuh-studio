#!/usr/bin/env node
// drawable-ir — the Whiteboard Drawable IR laws (master plan workstream E).
//
// Pinned here (docs/whiteboard/drawable-ir-design.md is the contract):
//   1. MEASURED      — path nodes carry measured length/bbox/commands and
//                      start/end pen anchors computed from the real grammar.
//   2. PROVENANCE    — content hash = sha256 of the sanitized fragment;
//                      source kind is a closed enum.
//   3. ROLE LAW      — filled+unstroked = "fill"; anything stroked = "outline".
//   4. ORDER LAW     — explicit drawOrder pins 0..k-1; the unlisted
//                      remainder follows document order after the block.
//   5. DETERMINISM   — identical input compiles to byte-identical canonical
//                      form and an identical fingerprint.
//   6. TAMPER-EVIDENT— parse rejects unknown versions, missing fields, bad
//                      enums, and ANY fingerprint mismatch; serialization of
//                      non-finite geometry throws.
//   7. FAIL-CLOSED   — zero drawable paths and foreign validation receipts
//                      refuse to compile.
//
// Run: npm run test:drawable-ir   (pure — no DB, no DOM; CI step)

import { createHash } from "node:crypto";

import { compileDrawableIr, parseDrawableIr, serializeDrawableIr } from "../src/lib/ibismuh/whiteboard/drawable-ir";
import type { DrawableIr } from "../src/lib/ibismuh/whiteboard/drawable-ir";
import type { WhiteboardAsset } from "../src/lib/ibismuh/whiteboard/assets";
import { sanitizeSvg } from "../src/lib/ibismuh/whiteboard/svg";

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

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function asset(partial: Partial<WhiteboardAsset> & { id: string; svg: string }): WhiteboardAsset {
  return {
    id: partial.id,
    svg: sanitizeSvg(partial.svg),
    viewBox: partial.viewBox ?? { w: 100, h: 100 },
    tags: partial.tags ?? ["test"],
    role: partial.role,
    penGroups: partial.penGroups,
    drawOrder: partial.drawOrder,
  };
}

const BASE_SVG = `<g>
  <path id="p1" d="M10 10 L 90 10" stroke="#111827" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path id="p2" d="M10 20 h80 v30 h-80 Z" fill="#334155"/>
</g>`;

const compile = (partial: Partial<WhiteboardAsset> & { id: string; svg: string }) =>
  compileDrawableIr({ asset: asset(partial), sourceKind: "library", sourceRef: "library/test" });

// --- 1. MEASURED ----------------------------------------------------------------

suiteStart("measured geometry");

await test("path length, bbox, commands, and pen anchors come from the real grammar", () => {
  const ir = compile({ id: "geo", svg: BASE_SVG });
  const p1 = ir.paths.find((p) => p.id === "p1")!;
  eq(p1.length, 80, "the 10,10→90,10 line is exactly 80 long");
  eq(p1.bbox, { x: 10, y: 10, w: 80, h: 0 });
  ok(p1.commands >= 2, `expanded commands ${p1.commands} cover M + L`);
  eq(p1.start, { x: 10, y: 10 });
  eq(p1.end, { x: 90, y: 10 });
});

await test("closed paths measure their full perimeter", () => {
  const ir = compile({ id: "rect", svg: BASE_SVG });
  const p2 = ir.paths.find((p) => p.id === "p2")!;
  eq(p2.length, 80 + 30 + 80 + 30, "the 80x30 rectangle closes at 220");
  eq(p2.bbox, { x: 10, y: 20, w: 80, h: 30 });
});

// --- 2. PROVENANCE --------------------------------------------------------------

suiteStart("provenance");

await test("the content hash is sha256 over the sanitized fragment", () => {
  const a = asset({ id: "prov", svg: BASE_SVG });
  const ir = compileDrawableIr({ asset: a, sourceKind: "library", sourceRef: "library/test" });
  eq(ir.source.contentHash, sha256(a.svg));
  eq(ir.source.kind, "library");
  eq(ir.source.ref, "library/test");
});

await test("traced-upload source kind survives compilation", () => {
  const ir = compileDrawableIr({ asset: asset({ id: "traced", svg: BASE_SVG }), sourceKind: "traced-upload", sourceRef: "upload/abc" });
  eq(ir.source.kind, "traced-upload");
});

// --- 3. ROLE LAW ----------------------------------------------------------------

suiteStart("role law");

await test("filled-only paths are fill regions; stroked paths are outlines", () => {
  const ir = compile({ id: "roles", svg: BASE_SVG });
  eq(ir.paths.find((p) => p.id === "p1")!.role, "outline");
  eq(ir.paths.find((p) => p.id === "p2")!.role, "fill");
});

await test("stroked AND filled paths read as outline (the drawn line dominates)", () => {
  const ir = compile({
    id: "both",
    svg: `<g><path id="pb" d="M5 5 h10" stroke="#000" stroke-width="2" fill="#fff"/></g>`,
  });
  eq(ir.paths[0].role, "outline");
});

// --- 4. ORDER + GROUPS ----------------------------------------------------------

suiteStart("order and semantic groups");

await test("explicit drawOrder pins the sequence; the rest follows document order", () => {
  const ir = compile({ id: "ord", svg: BASE_SVG, drawOrder: ["p2", "p1"] });
  eq(ir.paths.find((p) => p.id === "p2")!.order, 0);
  eq(ir.paths.find((p) => p.id === "p1")!.order, 1);
});

await test("a partial drawOrder lets unlisted paths follow after the explicit block", () => {
  const ir = compile({ id: "ord2", svg: BASE_SVG, drawOrder: ["p1"] });
  eq(ir.paths.find((p) => p.id === "p1")!.order, 0);
  eq(ir.paths.find((p) => p.id === "p2")!.order, 1);
});

await test("pen-group membership names the semantic group; outsiders stay default", () => {
  const ir = compile({ id: "grp", svg: BASE_SVG, penGroups: { head: ["p1"] } });
  eq(ir.paths.find((p) => p.id === "p1")!.semanticGroup, "head");
  eq(ir.paths.find((p) => p.id === "p2")!.semanticGroup, "default");
});

// --- 5. DETERMINISM -------------------------------------------------------------

suiteStart("determinism");

await test("identical input compiles to byte-identical canonical form", () => {
  const a = compile({ id: "det", svg: BASE_SVG, penGroups: { g: ["p1"] }, drawOrder: ["p2", "p1"] });
  const b = compile({ id: "det", svg: BASE_SVG, penGroups: { g: ["p1"] }, drawOrder: ["p2", "p1"] });
  eq(serializeDrawableIr(a), serializeDrawableIr(b));
  eq(a.fingerprint, b.fingerprint);
});

await test("a one-character geometry change changes the fingerprint", () => {
  const a = compile({ id: "sens", svg: BASE_SVG });
  const b = compile({
    id: "sens",
    svg: BASE_SVG.replace("L 90 10", "L 90 11"),
  });
  ok(a.fingerprint !== b.fingerprint, "fingerprints must diverge");
});

// --- 6. FAIL-CLOSED COMPILATION -------------------------------------------------

suiteStart("fail-closed compilation");

await test("zero drawable paths refuse to compile", () => {
  let threw: unknown = null;
  try {
    compile({ id: "empty", svg: `<g><text id="t1" x="10" y="20" font-size="12">hi</text></g>` });
  } catch (err) {
    threw = err;
  }
  ok(threw instanceof Error && /zero drawable paths/.test(threw.message), `got: ${String(threw)}`);
});

await test("a validation report for a different asset refuses to attach", () => {
  let threw: unknown = null;
  try {
    compileDrawableIr({
      asset: asset({ id: "mine", svg: BASE_SVG }),
      sourceKind: "library",
      validation: { assetId: "someone-else", ok: true, findings: [] },
    });
  } catch (err) {
    threw = err;
  }
  ok(threw instanceof Error && /foreign receipts/.test(threw.message), `got: ${String(threw)}`);
});

// --- 7. VALIDATION RECEIPT ------------------------------------------------------

suiteStart("validation receipt");

await test("a riding report records the battery, the failures, and the finding count", () => {
  const ir = compileDrawableIr({
    asset: asset({ id: "receipt", svg: BASE_SVG }),
    sourceKind: "library",
    validation: {
      assetId: "receipt",
      ok: false,
      findings: [
        { check: "teleport", ok: false, reason: "gap", pathId: "p1" },
        { check: "teleport", ok: false, reason: "second gap", pathId: "p2" },
      ],
    },
  });
  ok(ir.validationReceipt.ran);
  eq(ir.validationReceipt.checksRun.length, 6);
  eq(ir.validationReceipt.failedChecks, ["teleport"]);
  eq(ir.validationReceipt.findingCount, 2);
});

await test("no report means ran=false with an empty battery", () => {
  const ir = compile({ id: "noreport", svg: BASE_SVG });
  eq(ir.validationReceipt.ran, false);
  eq(ir.validationReceipt.checksRun, []);
});

// --- 8. TAMPER-EVIDENT STORAGE --------------------------------------------------

suiteStart("tamper-evident storage");

await test("serialize → parse round-trips to the same fingerprint", () => {
  const ir = compile({ id: "round", svg: BASE_SVG, penGroups: { g: ["p1"] } });
  const text = serializeDrawableIr(ir);
  const back = parseDrawableIr(text);
  eq(back.fingerprint, ir.fingerprint);
  eq(back.paths.length, ir.paths.length);
});

await test("an edited byte anywhere breaks the parse", () => {
  const text = serializeDrawableIr(compile({ id: "tamper", svg: BASE_SVG }));
  const edited = text.replace("M10 10 L 90 10", "M10 10 L 91 10");
  ok(edited !== text, "the edit must actually land");
  let threw: unknown = null;
  try {
    parseDrawableIr(edited);
  } catch (err) {
    threw = err;
  }
  ok(threw instanceof Error && /fingerprint mismatch/.test(threw.message), `got: ${String(threw)}`);
});

await test("unknown versions are rejected before anything else", () => {
  const doc = JSON.parse(serializeDrawableIr(compile({ id: "ver", svg: BASE_SVG })));
  doc.version = 999;
  let threw: unknown = null;
  try {
    parseDrawableIr(JSON.stringify(doc));
  } catch (err) {
    threw = err;
  }
  ok(threw instanceof Error && /unsupported version/.test(threw.message), `got: ${String(threw)}`);
});

await test("missing required fields are rejected", () => {
  const doc = JSON.parse(serializeDrawableIr(compile({ id: "missing", svg: BASE_SVG })));
  delete doc.source;
  let threw: unknown = null;
  try {
    parseDrawableIr(JSON.stringify(doc));
  } catch (err) {
    threw = err;
  }
  ok(threw instanceof Error && /source/.test(threw.message), `got: ${String(threw)}`);
});

await test("bad role enums are rejected", () => {
  const doc = JSON.parse(serializeDrawableIr(compile({ id: "rolebad", svg: BASE_SVG })));
  doc.paths[0].role = "sparkle";
  let threw: unknown = null;
  try {
    parseDrawableIr(JSON.stringify(doc));
  } catch (err) {
    threw = err;
  }
  ok(threw instanceof Error && /role/.test(threw.message), `got: ${String(threw)}`);
});

await test("serializing non-finite geometry throws instead of emitting a poison document", () => {
  const ir = compile({ id: "finite", svg: BASE_SVG });
  const poison = { ...ir, paths: [{ ...ir.paths[0], length: Number.NaN }, ...ir.paths.slice(1)] } as DrawableIr;
  let threw: unknown = null;
  try {
    serializeDrawableIr(poison);
  } catch (err) {
    threw = err;
  }
  ok(threw instanceof Error && /non-finite/.test(threw.message), `got: ${String(threw)}`);
});

// --- teardown -------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed${failures.length ? ":" : ""}`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exit(failed > 0 ? 1 : 0);

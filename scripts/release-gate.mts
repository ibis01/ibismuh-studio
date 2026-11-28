#!/usr/bin/env node
// release-gate.mts — the RELEASE-GATE GOVERNANCE SCRIPT (master plan
// Phase 10: "blind human visual release gate + CI governance").
//
// The S120 acceptance law lives in prose (docs): codenamed artifacts,
// ≥ 3 human scorers, composite ≥ 4.0/5 per lane sheet. Nothing governed
// it — no script checked whether the records exist, whether the law's
// artifacts are in place, or whether the CI gates it relies on are still
// declared. This script is the governance surface:
//
//   1. BLIND RECORDS — every docs/audits/*blind* record exists and
//      carries an honest status line (EXECUTED / NOT EXECUTED — the
//      four-state law; a record that went silent FAILS the gate).
//   2. THE COMPOSITE LAW — the release composite record
//      (docs/audits/blind-release-composite.md) must name ≥ 3 scorers
//      and a ≥ 4.0/5 composite per lane to claim PASS. Absent → the
//      gate reports NOT VERIFIED (the human gate stays with humans —
//      the script never fabricates a pass).
//   3. THE CONTRACT STAMP — the lane-contract fingerprint is computed
//      and recorded (a release rides a stamp).
//   4. CI GOVERNANCE — the workflow gates the law depends on are still
//      declared in .github/workflows/ci.yml (the named job list). A
//      removed gate FAILS the script — the law cannot outlive its
//      enforcement silently.
//   5. THE RECEIPT — docs/baselines/release-gate-<short-sha>.json with
//      every finding (committed — governance evidence is not gitignored).
//
// Exit 0 with findings recorded (NOT VERIFIED is a legal state);
// exit 1 only on a REAL violation (a missing record, a missing CI gate,
// a composite claim that fails the law). --strict escalates NOT VERIFIED
// to exit 1 (the release-day posture).
//
// Run: node --import tsx scripts/release-gate.mts [--strict]
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { currentLaneContractStamp } from "../src/lib/ibismuh/lane-contracts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const STRICT = process.argv.includes("--strict");

let failed = 0;
let notVerified = 0;

function ok(cond: boolean, msg: string): void {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failed += 1;
    console.log(`  ✗ ${msg}`);
  }
}
function nv(msg: string): void {
  notVerified += 1;
  console.log(`  ○ NOT VERIFIED — ${msg}`);
}

console.log("release-gate — the Phase 10 governance surface\n");

// --- 1. THE BLIND RECORDS ----------------------------------------------------

const auditsDir = path.join(ROOT, "docs", "audits");
const blindRecords = fs.existsSync(auditsDir)
  ? fs.readdirSync(auditsDir).filter((f) => f.includes("blind") && f.endsWith(".md"))
  : [];
console.log("1. the blind records");
if (blindRecords.length === 0) {
  ok(false, "no blind scoring records exist under docs/audits — the law has no paper trail");
} else {
  ok(blindRecords.length >= 3, `the records exist (${blindRecords.length} files)`);
  for (const record of blindRecords) {
    const body = fs.readFileSync(path.join(auditsDir, record), "utf8");
    const silent = !/NOT EXECUTED|EXECUTED|PASSED|FAILED|PENDING|LANDED|GATE/.test(body.toUpperCase());
    ok(!silent, `${record} carries an explicit status (not silent)`);
  }
}

// --- 2. THE COMPOSITE LAW ------------------------------------------------------

console.log("\n2. the composite law (≥ 3 scorers, ≥ 4.0/5 per lane)");
const compositePath = path.join(auditsDir, "blind-release-composite.md");
if (!fs.existsSync(compositePath)) {
  nv("no release composite record yet — the human gate has not run for this release; the law stays with humans");
} else {
  const body = fs.readFileSync(compositePath, "utf8");
  const scorers = Number.parseInt((body.match(/scorers?\s*[:=]\s*(\d+)/i) ?? [])[1] ?? "0", 10);
  ok(scorers >= 3, `the composite names ≥ 3 scorers (${scorers})`);
  const composites = [...body.matchAll(/(\d(?:\.\d)?)\s*\/\s*5/g)].map((m) => Number.parseFloat(m[1]));
  if (composites.length === 0) {
    ok(false, "the composite record carries no per-lane x/5 scores");
  } else {
    ok(composites.every((c) => c >= 4.0), `every lane composite is ≥ 4.0/5 (${composites.join(", ")})`);
  }
}

// --- 3. THE CONTRACT STAMP -------------------------------------------------------

console.log("\n3. the lane contract stamp");
const stamp = currentLaneContractStamp();
ok(Boolean(stamp.fingerprint) && stamp.version >= 1, `the stamp computes (v${stamp.version}, ${stamp.fingerprint.slice(0, 16)}…)`);
const wbGolden = path.join(ROOT, "scripts", "golden", "s165", "whiteboard-golden.mp4");
ok(fs.existsSync(wbGolden), "the whiteboard golden MP4 is in place (the visual reference class)");
const laneManifest = path.join(ROOT, "docs", "baselines", "mp7-lane-manifest-2026-11-28.json");
ok(fs.existsSync(laneManifest), "the six-lane manifest receipt is committed (the phase-7 map)");

// --- 4. CI GOVERNANCE -------------------------------------------------------------

console.log("\n4. the CI gates the law depends on");
const ciPath = path.join(ROOT, ".github", "workflows", "ci.yml");
const ci = fs.readFileSync(ciPath, "utf8");
const REQUIRED_GATES = [
  { job: "check:", why: "the unit/battery chain (incl. the failpoints + provider-status batteries)" },
  { job: "build:", why: "the production build + the build-log guard" },
  { job: "coverage:", why: "the money-path coverage floor" },
  { job: "postgres:", why: "the migration + wedge-recovery integration" },
  { job: "clean-clone:", why: "the bootstrap reproducibility gate" },
  { job: "docker-smoke:", why: "the production topology smoke" },
  { job: "e2e:", why: "the browser suite + the log-contract receipt" },
  { job: "secrets:", why: "the secret scan" },
];
for (const gate of REQUIRED_GATES) {
  ok(ci.includes(`  ${gate.job}`), `the ${gate.job.replace(":", "")} job is declared — ${gate.why}`);
}
ok(ci.includes("release-gate"), "the governance job wires THIS script into CI");

// --- 5. THE RECEIPT -----------------------------------------------------------------

console.log("\n5. the receipt");
let shortSha = "unknown";
try {
  shortSha = execSync("git rev-parse --short HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
} catch {
  /* a non-git checkout keeps the placeholder */
}
const receipt = {
  schema: "release-gate/1",
  generatedAt: new Date().toISOString(),
  head: shortSha,
  laneContractStamp: stamp,
  blindRecords,
  composite: fs.existsSync(compositePath) ? "present" : "not-yet-run (human gate)",
  ciGatesRequired: REQUIRED_GATES.map((g) => g.job.replace(":", "")),
  strict: STRICT,
  verdict: failed === 0 ? (STRICT && notVerified > 0 ? "NOT VERIFIED (strict)" : "GOVERNED") : "VIOLATION",
};
const outFile = path.join(ROOT, "docs", "baselines", `release-gate-${shortSha}.json`);
fs.writeFileSync(outFile, JSON.stringify(receipt, null, 2) + "\n");
console.log(`  receipt: docs/baselines/release-gate-${shortSha}.json (verdict: ${receipt.verdict})`);

console.log(`\nrelease-gate: ${failed} violation(s), ${notVerified} not-verified`);
if (failed > 0 || (STRICT && notVerified > 0)) process.exit(1);

#!/usr/bin/env node
// phase7-lane-manifest.mts — the SIX-LANE BENCHMARK MANIFEST (master plan
// Phase 7: "six lane benchmark MP4 / contact-sheet / parity").
//
// Before this script the lane benchmark landscape was six disconnected
// one-off scripts with receipts scattered across gitignored validation/
// dirs and committed docs/baselines — no machine-readable summary existed
// that answered, in one place: for EACH lane, what is its contract stamp,
// which benchmark exercises it, does a golden MP4 exist, does a contact
// sheet exist, and what does the parity machinery measure right now.
//
// This script produces that manifest (docs/baselines/mp7-lane-manifest-<date>.json)
// and EXERCISES the two new Phase-7 artifacts for real:
//
//   1. CONTACT SHEET — builds one sheet from every golden MP4 present,
//      TWICE, and pins the two builds byte-identical (the determinism
//      law) — the sheet is the human-review artifact the blind scorers
//      lacked.
//   2. PARITY — the whiteboard parity metric (compareFrameRgb) runs over
//      REAL decoded golden frames: identity (same frame twice) must be
//      byte-identical, and a cross-frame comparison is recorded as the
//      measured structural-difference reference (numbers, not vibes).
//
// Run: node --import tsx scripts/phase7-lane-manifest.mts
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  LANE_CONTRACTS,
  LANE_ORDER,
  computeLaneContractFingerprint,
  currentLaneContractStamp,
} from "../src/lib/ibismuh/lane-contracts";
import { compareFrameRgb, parityVerdict } from "../src/lib/ibismuh/whiteboard/parity";
import { buildContactSheet, fileSha256 } from "./contact-sheet.mts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const GOLDEN_DIR = path.join(HERE, "golden", "s165");
const VALIDATION = path.join(ROOT, "validation", "mp7");
const BASELINES = path.join(ROOT, "docs", "baselines");

function die(msg: string): never {
  console.error(`phase7-lane-manifest: FAIL — ${msg}`);
  process.exit(1);
}

function ffprobeDims(file: string): { width: number; height: number; duration: number } {
  const res = spawnSync("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height:format=duration",
    "-of", "json",
    file,
  ], { encoding: "utf8" });
  if (res.status !== 0) die(`ffprobe cannot read ${file}`);
  const json = JSON.parse(res.stdout ?? "{}") as {
    streams?: Array<{ width?: number; height?: number }>;
    format?: { duration?: string };
  };
  const w = json.streams?.[0]?.width;
  const h = json.streams?.[0]?.height;
  const dur = Number.parseFloat(json.format?.duration ?? "nan");
  if (!w || !h || !Number.isFinite(dur)) die(`no measurable geometry in ${file}`);
  return { width: w, height: h, duration: dur };
}

function decodeStillRgb(file: string, w: number, h: number): Buffer {
  const res = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], {
    encoding: "buffer", maxBuffer: 64 * 1024 * 1024,
  });
  const buf = Buffer.from(res.stdout ?? []);
  if (res.status !== 0 || buf.length !== w * h * 3) {
    die(`rgb decode ${path.basename(file)}: exit ${res.status}, ${buf.length} bytes (expected ${w * h * 3})`);
  }
  return buf;
}

function extractFrame(file: string, atSec: number, out: string): void {
  const res = spawnSync("ffmpeg", ["-v", "error", "-ss", atSec.toFixed(3), "-i", file, "-frames:v", "1", "-y", out], {
    encoding: "utf8",
  });
  if (res.status !== 0 || !fs.existsSync(out)) die(`frame extraction failed for ${file} @ ${atSec}s`);
}

// --- 1. THE LANE TABLE ------------------------------------------------------

const GOLDEN_FILES = fs.existsSync(GOLDEN_DIR)
  ? fs.readdirSync(GOLDEN_DIR).filter((f) => f.endsWith(".mp4"))
  : [];

/** Which lane each golden exercises (honest mapping — scene3d is a render
 *  mode, not one of the six lanes; recorded as such). */
const GOLDEN_LANE: Record<string, string | null> = {
  "whiteboard-golden.mp4": "whiteboard",
  "graphics-golden.mp4": "graphics2d",
  "scene3d-golden.mp4": null,
};

const BENCHMARK_SCRIPTS: Record<string, string[]> = {
  classic: ["scripts/s87-acceptance-battery.mts (arm B: compositor + kenburns)"],
  story: ["scripts/s47-continuity-benchmark.mts", "scripts/s54-genre-benchmark.mts"],
  whiteboard: ["scripts/w1-whiteboard-benchmark.mts", "scripts/s75-e10-benchmark.mts", "scripts/wb-preview-parity.mts"],
  graphics2d: ["scripts/s123-graphics-proof.mts"],
  character: ["scripts/k1-rig-smoke.mts"],
  slides: [], // THE GAP, recorded: no MP4 benchmark exists for the slides lane yet
};

const stamp = currentLaneContractStamp();
const lanes = LANE_ORDER.map((type) => {
  const contract = LANE_CONTRACTS[type];
  const goldens = GOLDEN_FILES.filter((f) => GOLDEN_LANE[f] === type);
  return {
    type,
    renderMode: contract.renderMode,
    planner: contract.planner,
    renderer: contract.renderer,
    queueJobKind: contract.queueJobKind,
    qcProfile: contract.qcProfile,
    goldenMp4: goldens.length > 0 ? goldens.map((f) => `scripts/golden/s165/${f}`) : [],
    benchmarkScripts: BENCHMARK_SCRIPTS[type] ?? [],
  };
});

const manifest: Record<string, unknown> = {
  schema: "mp7-lane-manifest/1",
  generatedAt: new Date().toISOString(),
  laneContractStamp: stamp,
  lanes,
  goldensNotALane: GOLDEN_FILES.filter((f) => GOLDEN_LANE[f] === null).map((f) => `scripts/golden/s165/${f} (scene3d render-mode golden)`),
};

// --- 2. THE CONTACT SHEET (built twice, pinned byte-identical) --------------

fs.mkdirSync(VALIDATION, { recursive: true });
const sheetVideos = GOLDEN_FILES.map((f) => path.join(GOLDEN_DIR, f));
if (sheetVideos.length === 0) die("no golden MP4s to sheet");
const sheetA = buildContactSheet(sheetVideos, { out: path.join(VALIDATION, "sheet-a.png"), perVideo: 6 });
const sheetB = buildContactSheet(sheetVideos, { out: path.join(VALIDATION, "sheet-b.png"), perVideo: 6 });
const shaA = fileSha256(sheetA);
const shaB = fileSha256(sheetB);
if (shaA !== shaB) die(`the contact sheet is not deterministic (${shaA} vs ${shaB})`);
manifest.contactSheet = {
  path: "validation/mp7/sheet-a.png",
  sha256: shaA,
  inputs: sheetVideos.map((v) => path.relative(ROOT, v)),
  deterministic: true,
};

// --- 3. THE PARITY EXERCISE (real golden frames through the real metric) ----

const wbGolden = path.join(GOLDEN_DIR, "whiteboard-golden.mp4");
if (!fs.existsSync(wbGolden)) die("whiteboard golden missing — parity exercise needs it");
const dims = ffprobeDims(wbGolden);
const frameA = path.join(VALIDATION, "parity-a.png");
const frameB = path.join(VALIDATION, "parity-b.png");
extractFrame(wbGolden, dims.duration * 0.2, frameA);
extractFrame(wbGolden, dims.duration * 0.8, frameB);
const rgbA = decodeStillRgb(frameA, dims.width, dims.height);
const rgbB = decodeStillRgb(frameB, dims.width, dims.height);

const identity = compareFrameRgb(rgbA, rgbA, { width: dims.width, height: dims.height });
const cross = compareFrameRgb(rgbA, rgbB, { width: dims.width, height: dims.height });
manifest.parityExercise = {
  source: "scripts/golden/s165/whiteboard-golden.mp4",
  dims: { width: dims.width, height: dims.height },
  identity: { byteIdentical: identity.byteIdentical, meanAbsDelta: identity.meanAbsDelta, verdict: parityVerdict(identity) },
  crossFrame: {
    byteIdentical: cross.byteIdentical,
    meanAbsDelta: Number(cross.meanAbsDelta.toFixed(3)),
    fracOverTolerance: Number(cross.fracOverTolerance.toFixed(5)),
    worstChannelDelta: cross.worstChannelDelta,
    worstTile: cross.worstTile,
    verdict: parityVerdict(cross),
    note: "two DIFFERENT moments of one render — the measured structural-difference reference; the codec-band verdict applies to same-content comparisons only",
  },
};

// --- 4. WRITE ---------------------------------------------------------------

fs.mkdirSync(BASELINES, { recursive: true });
const outFile = path.join(BASELINES, "mp7-lane-manifest-2026-11-28.json");
fs.writeFileSync(outFile, JSON.stringify(manifest, null, 2) + "\n");

console.log(`phase7-lane-manifest: ${path.relative(ROOT, outFile)}`);
console.log(`  lanes: ${LANE_ORDER.join(", ")}`);
console.log(`  lane contract stamp: ${stamp.fingerprint.slice(0, 16)}… (v${stamp.version})`);
console.log(`  contact sheet: ${sheetA} ${shaA.slice(0, 16)}… (deterministic across two builds)`);
console.log(`  parity identity: byteIdentical=${identity.byteIdentical} verdict pass=${parityVerdict(identity).pass}`);
console.log(`  parity cross-frame: mean|Δ|=${cross.meanAbsDelta.toFixed(3)} overTol=${(cross.fracOverTolerance * 100).toFixed(2)}% verdict pass=${parityVerdict(cross).pass} (different-content reference, codec band not expected)`);
const gapLanes = lanes.filter((l) => l.benchmarkScripts.length === 0).map((l) => l.type);
if (gapLanes.length > 0) console.log(`  BENCHMARK GAPS (recorded, not hidden): ${gapLanes.join(", ")}`);
const noGolden = lanes.filter((l) => l.goldenMp4.length === 0).map((l) => l.type);
if (noGolden.length > 0) console.log(`  GOLDEN GAPS (recorded, not hidden): ${noGolden.join(", ")}`);

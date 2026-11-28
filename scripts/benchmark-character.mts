#!/usr/bin/env node
// benchmark-character.mts — THE CHARACTER LANE BENCHMARK (master plan Phase 8:
// "for classic/Ken Burns, story, character, and slides, add fixed benchmark
// projects and scripts").
//
// The mp7 lane manifest recorded character honestly: a benchmark existed
// (k1-rig-smoke: the rig render smoke) but NO golden MP4, NO contact-sheet
// panel, NO parity receipt, NO failure-injection receipt. This script
// extracts k1-rig-smoke's minimal render recipe (the REAL native-rig
// channel: scaffoldRigDoc → validateRigDoc → planRigTimeline → renderRigScene
// — chromium composes the rig page, the ONE applier applies poseAt per
// frame, ffmpeg encodes) into a fixed, deterministic fixture and produces
// the missing golden artifact.
//
// THE FIXTURE: the S125 smoke's validator-clean rig (the K1_SMOKE_FIXTURE —
// the standard slots, mouth variants and pose sheet), rendered SMALL: a
// 3000 ms scene at 24 fps on a 480x270 canvas (the contain-fit compose seam
// letterboxes the 1080 stage into the 16:9 canvas — the compose law). The
// narration rides the deterministic estimate clock (no ASR anchors — the
// declared fallback: "word-proportional estimate"). Zero AI spend — the
// native rig channel is image-free by design (the lane contract's
// capability truth), and the identity/VLM floor is a provider-gated SKIP in
// the smoke, recorded as such here too.
//
// THE LAWS THIS SCRIPT PINS:
//   · structural — the parts library + the rig doc pass the validator gates
//     BEFORE chromium (fail-closed evidence);
//   · the pure-frame-truth pin — the poseAt sweep double-runs
//     byte-identical (the D3 law, on the real rig);
//   · the codec tolerance law (see benchmark-lib) — two consecutive runs
//     produce FFprobe-identical metadata and cross-run PSNR clears 30 dB;
//   · the two-clock law — the probed duration equals the delivered seconds;
//   · the contract read-back — planFromTracks agrees with the engine plan;
//   · fail-visible QC — sampled frames decode non-black, and the rig
//     actually MOVES between them (the rendered movement evidence, the
//     smoke's S136 leg, mirrored here).
//
// Artifacts: scripts/golden/character/character-golden.mp4 (+ thumbs,
// metadata, receipts). Scratch renders land in validation/mp8/character/
// (gitignored).
//
// Run: node --import tsx scripts/benchmark-character.mts
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// The storage root AND the database URL are read at src-module load — pin
// both to scratch BEFORE any src import evaluates (a throwaway COPY of the
// dev database rides in /tmp; the original is never opened for write — the
// rig module chain imports the whiteboard launch-args module, which imports
// the ASR seam, which evaluates the tenant db client).
const MP8_SCRATCH = "/tmp/mp8-uploads";
const ROOT_TMP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRATCH_DB = path.join(MP8_SCRATCH, "benchmark-scratch.db");
process.env.IBISMUH_STUDIO_UPLOAD_ROOT ||= MP8_SCRATCH;
if (!fs.existsSync(SCRATCH_DB)) fs.copyFileSync(path.join(ROOT_TMP, "db", "custom.db"), SCRATCH_DB);
process.env.DATABASE_URL = `file:${SCRATCH_DB}`;
process.env.IBISMUH_STUDIO_AUTH_SECRET ||= "mp8-benchmark-secret-0123456789";
fs.mkdirSync(MP8_SCRATCH, { recursive: true });

import {
  Ledger,
  compareMeta,
  extractThumbs,
  ffprobeMeta,
  fileSha256,
  frameGray,
  frameMeanLuma,
  psnrAverageDb,
  tilesMaxMeanAbsDiff,
  writeJson,
} from "./benchmark-lib.mts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const GOLDEN_DIR = path.join(HERE, "golden", "character");
const VALIDATION = path.join(ROOT, "validation", "mp8", "character");

const SCENE_MS = 3000;
const FPS = 24;
const CANVAS = { width: 480, height: 270 };

interface Arm {
  file: string;
  frames: number;
  planTotalSec: number;
  wallMs: number;
}

async function renderArm(armDir: string): Promise<Arm> {
  // The fixture rides the S125 smoke's exported rig (the standard slots —
  // the validator-clean shape; the module's main() is gated on direct
  // invocation, so importing it costs nothing).
  const { K1_SMOKE_FIXTURE } = await import("./k1-rig-smoke.mts");
  const { renderRigScene } = await import("../src/lib/ibismuh/characters/rig-render");
  const {
    validateRigDoc,
    validateRigParts,
    scaffoldRigDoc,
    RIG_VERSION,
  } = await import("../src/lib/ibismuh/characters/rig2d");
  const { planRigTimeline } = await import("../src/lib/ibismuh/characters/rig-director");
  const { mouthSchedule } = await import("../src/lib/ibismuh/characters/rig-frame");
  const { planFromTracks } = await import("../src/lib/ibismuh/composition-plan");

  fs.rmSync(armDir, { recursive: true, force: true });
  fs.mkdirSync(armDir, { recursive: true });

  const artCheck = validateRigParts(K1_SMOKE_FIXTURE.art);
  if (artCheck.parts === null) {
    throw new Error(`the fixture parts fail the validator gate: ${JSON.stringify(artCheck)}`);
  }
  const scaffolded = scaffoldRigDoc({ parts: K1_SMOKE_FIXTURE.seeds, art: K1_SMOKE_FIXTURE.art });
  const docCheck = scaffolded.doc
    ? validateRigDoc({ ...scaffolded.doc, poses: K1_SMOKE_FIXTURE.poseSheet }, artCheck.parts)
    : { doc: null, errors: ["scaffold refused"], warnings: [] };
  if (!docCheck.doc) {
    throw new Error(`the fixture rig doc fails the validator gate: ${JSON.stringify(docCheck.errors)}`);
  }
  const rig = docCheck.doc;
  const narration = K1_SMOKE_FIXTURE.narration;

  const plan = planRigTimeline({ narration, rig, durationMs: SCENE_MS, anchors: null });
  const schedule = mouthSchedule({ narration, anchors: null, durationMs: SCENE_MS });
  void schedule; // the mouth schedule feeds the rig sweep below; kept for parity with k1-rig-smoke

  const result = await renderRigScene({
    rig,
    art: artCheck.parts,
    timeline: plan.timeline,
    speech: plan.speech,
    slot: { sceneIndex: 1, durationMs: SCENE_MS },
    opts: {
      outDir: armDir,
      canvas: CANVAS,
      fps: FPS,
      onProgress: (label) => process.stdout.write(`    ${label}\r`),
    },
  });
  process.stdout.write("\n");

  // The contract read-back — the two-clock law's contract half.
  const planRead = planFromTracks({ tracks: result.tracks }, 1);
  if (!planRead || Math.abs(planRead.totalSec - result.plan.totalSec) > 0.011) {
    throw new Error("the rig scene plan failed the timeline contract read-back — an engine bug, not a fixture problem");
  }
  void RIG_VERSION;
  return { file: result.file, frames: result.frames, planTotalSec: result.plan.totalSec, wallMs: 0 };
}

function _frameShaUnused(file: string, atSec: number, tmp: string): string {
  const png = path.join(tmp, `frame-${atSec.toFixed(2)}.png`);
  const res = spawnSync("ffmpeg", ["-y", "-v", "error", "-ss", String(atSec), "-i", file, "-frames:v", "1", png], { encoding: "utf8" });
  if (res.status !== 0 || !fs.existsSync(png)) throw new Error(`frame extraction failed at ${atSec}s`);
  return createHash("sha256").update(fs.readFileSync(png)).digest("hex");
}

async function main(): Promise<void> {
  fs.mkdirSync(VALIDATION, { recursive: true });
  fs.mkdirSync(GOLDEN_DIR, { recursive: true });
  console.log("benchmark-character — the character (native rig) lane benchmark");
  const ledger = new Ledger();

  // --- structural + pure-frame-truth pins (before chromium) -------------------
  const { K1_SMOKE_FIXTURE } = await import("./k1-rig-smoke.mts");
  const { poseAt, mouthSchedule } = await import("../src/lib/ibismuh/characters/rig-frame");
  const { scaffoldRigDoc, validateRigDoc, validateRigParts } = await import("../src/lib/ibismuh/characters/rig2d");
  const { planRigTimeline } = await import("../src/lib/ibismuh/characters/rig-director");

  const artCheck = validateRigParts(K1_SMOKE_FIXTURE.art);
  const scaffolded = scaffoldRigDoc({ parts: K1_SMOKE_FIXTURE.seeds, art: K1_SMOKE_FIXTURE.art });
  const docCheck = scaffolded.doc
    ? validateRigDoc({ ...scaffolded.doc, poses: K1_SMOKE_FIXTURE.poseSheet }, artCheck.parts ?? [])
    : { doc: null, errors: ["scaffold refused"], warnings: [] };
  // Fail-visible before any chromium work: a broken fixture rig must stop
  // the benchmark here, not downstream.
  if (artCheck.parts === null || docCheck.doc === null) {
    throw new Error(`the character fixture rig fails the validator gates: ${JSON.stringify({ errors: docCheck.errors, warnings: docCheck.warnings })}`);
  }
  ledger.check(
    "structural: the parts library + the rig doc pass the validator gates (fail-closed, before chromium)",
    artCheck.parts !== null && docCheck.doc !== null,
    `${K1_SMOKE_FIXTURE.art.length} parts, ${K1_SMOKE_FIXTURE.poseSheet.length} poses, ${docCheck.warnings.length} warnings`
  );
  const rig = docCheck.doc;
  const narration = K1_SMOKE_FIXTURE.narration;
  const plan = planRigTimeline({ narration, rig, durationMs: SCENE_MS, anchors: null });
  const schedule = mouthSchedule({ narration, anchors: null, durationMs: SCENE_MS });
  const sweepA = Array.from({ length: 24 }, (_, i) => JSON.stringify(poseAt(rig, plan.timeline, (i * SCENE_MS) / 24, schedule)));
  const sweepB = Array.from({ length: 24 }, (_, i) => JSON.stringify(poseAt(rig, plan.timeline, (i * SCENE_MS) / 24, schedule)));
  ledger.check(
    "determinism: the pose sweep double-runs byte-identical (the D3 pure-frame-truth law, on the real rig)",
    JSON.stringify(sweepA) === JSON.stringify(sweepB),
    `24 samples over ${SCENE_MS} ms, NaN-free: ${sweepA.every((s) => !s.includes("NaN"))}`
  );

  // --- arm A: the render that becomes the golden ------------------------------
  const t0 = Date.now();
  const armA = await renderArm(path.join(VALIDATION, "arm-a"));
  armA.wallMs = Date.now() - t0;
  const metaA = ffprobeMeta(armA.file);
  const delivered = armA.frames / FPS;

  ledger.check(
    "the delivered container carries the clip law (h264, yuv420p 480x270, the clip fps, the delivered frames)",
    metaA.codec === "h264" && metaA.width === CANVAS.width && metaA.height === CANVAS.height
      && Math.abs(metaA.fps - FPS) < 0.001 && metaA.frames === armA.frames,
    `${metaA.width}x${metaA.height} ${metaA.codec} ${metaA.frames}f @${metaA.fps}`
  );
  ledger.check(
    "the two-clock law: the probed duration equals the delivered seconds",
    Math.abs(metaA.durationSec - delivered) <= 0.1,
    `${metaA.durationSec.toFixed(2)}s vs delivered ${delivered.toFixed(2)}s (tol 0.1)`
  );
  ledger.check(
    "the clip is video-only (the rig-clip law: buildSegment owns the mix)",
    !metaA.hasAudio,
    metaA.hasAudio ? "UNEXPECTED audio stream" : "no audio stream"
  );

  // --- QC: non-black frames + the rig actually moves --------------------------
  const lumaEarly = frameMeanLuma(armA.file, 0.75);
  const lumaLate = frameMeanLuma(armA.file, 2.25);
  ledger.check(
    "sampled frames decode non-black (the fail-visible QC gate)",
    lumaEarly > 8 && lumaLate > 8,
    `0.75s→${lumaEarly.toFixed(1)}, 2.25s→${lumaLate.toFixed(1)}`
  );
  // The movement evidence uses the parity metric's TILE shape: the rig's
  // mouth is a handful of canvas pixels inside the contain-fitted letterbox,
  // and a whole-frame mean would dilute it away. A genuinely moved element
  // drives its own 16x16 tile far above the codec-noise band (~0 here — the
  // cross-run PSNR below is inf, so identical content decodes identical).
  const moveDiff = tilesMaxMeanAbsDiff(frameGray(armA.file, 0.75), frameGray(armA.file, 1.75), metaA.width, metaA.height);
  ledger.check(
    "the rig actually moves between frames (rendered movement, measured on pixels — the smoke's S136 leg)",
    moveDiff > 3,
    `worst 16x16 tile mean |Δ| 0.75s→1.75s = ${moveDiff.toFixed(2)} (a true hold sits near 0; a speaking rig drives its face tile far above)`
  );

  // --- arm B: the independence arm (the codec tolerance law) ------------------
  const armB = await renderArm(path.join(VALIDATION, "arm-b"));
  const metaB = ffprobeMeta(armB.file);
  const metaDiffs = compareMeta(metaA, metaB);
  ledger.check(
    "two consecutive runs produce FFprobe-identical metadata (the container plane)",
    metaDiffs.length === 0,
    metaDiffs.length === 0
      ? `${metaA.width}x${metaA.height} ${metaA.codec} ${metaA.frames}f ${metaA.durationSec.toFixed(3)}s @${metaA.fps}`
      : metaDiffs.map((d) => `${d.field}: ${String(d.a)} vs ${String(d.b)}`).join("; ")
  );
  const psnr = psnrAverageDb(armA.file, armB.file);
  const PSNR_FLOOR = 30;
  ledger.check(
    "cross-run PSNR clears the committed floor (the pixel plane, the S165 law)",
    psnr !== null && psnr >= PSNR_FLOOR,
    psnr === null ? "unmeasurable" : `${Number.isFinite(psnr) ? psnr.toFixed(2) + " dB" : "inf"} (floor ${PSNR_FLOOR})`
  );

  // --- commit the golden artifacts --------------------------------------------
  const goldenPath = path.join(GOLDEN_DIR, "character-golden.mp4");
  fs.copyFileSync(armA.file, goldenPath);
  const thumbs = extractThumbs(goldenPath, path.join(GOLDEN_DIR, "thumbs"), 4, "character");
  const goldenMeta = ffprobeMeta(goldenPath);

  const receipt = {
    benchmark: "scripts/benchmark-character.mts",
    lane: "character",
    renderer: "renderRigScene (the native-rig channel — chromium + poseAt + ffmpeg, the k1-rig-smoke production path)",
    fixture: {
      rig: "the S125 smoke rig (K1_SMOKE_FIXTURE): 12 parts, 9 poses, the standard slots + mouth variants",
      sceneMs: SCENE_MS,
      fps: FPS,
      canvas: CANVAS,
      narration: "the smoke's narration line, riding the word-proportional estimate clock (no ASR anchors — the declared fallback)",
      geometry: "480x270 (the 1080 stage contain-fits into the 16:9 canvas — the compose seam's canvas law)",
      aiSpend: 0,
    },
    codecToleranceLaw: {
      container: "two consecutive runs must produce ffprobe-identical metadata (codec, geometry, fps, frame count; duration within 0.06s)",
      pixels: "cross-run PSNR must clear 30 dB (the S165 floor)",
      bytes: "byte-identity is NEVER pinned (libx264 is not byte-stable across runs)",
    },
    measured: {
      armAWallMs: armA.wallMs,
      golden: {
        codec: goldenMeta.codec,
        width: goldenMeta.width,
        height: goldenMeta.height,
        fps: goldenMeta.fps,
        frames: goldenMeta.frames,
        durationSec: Number(goldenMeta.durationSec.toFixed(3)),
        sizeBytes: goldenMeta.sizeBytes,
        hasAudio: goldenMeta.hasAudio,
        sha256: fileSha256(goldenPath),
      },
      planTotalSec: armA.planTotalSec,
      frameLuma: [
        { atSec: 0.75, mean: Number(lumaEarly.toFixed(2)) },
        { atSec: 2.25, mean: Number(lumaLate.toFixed(2)) },
      ],
      movementWorstTileMeanAbsDiff: Number(moveDiff.toFixed(2)),
      crossRunPsnrDb: psnr === null ? null : Number.isFinite(psnr) ? Number(psnr.toFixed(2)) : "inf",
      crossRunMetaDiffs: metaDiffs,
    },
    aiHalf: {
      status: "NOT VERIFIED",
      detail: "the identity floor (VCE >= 80 on rig frames) needs a live VLM — the k1 smoke records SKIP for it and this benchmark inherits that honesty; the rig render itself is image-free by design",
    },
    artifacts: {
      golden: "scripts/golden/character/character-golden.mp4",
      thumbnails: thumbs.map((t) => path.relative(ROOT, t)),
      metadata: "scripts/golden/character/golden-metadata.json",
    },
    at: new Date().toISOString(),
  };
  writeJson(path.join(VALIDATION, "character-benchmark-receipt.json"), receipt);
  writeJson(path.join(GOLDEN_DIR, "golden-metadata.json"), {
    version: 1,
    slice: "MP8 — the six-lane evidence slice (the character lane golden)",
    lane: "character",
    baseline: "character-golden.mp4",
    law:
      "The codec tolerance law (see scripts/benchmark-lib.mts): a re-run of scripts/benchmark-character.mts must produce " +
      "ffprobe-IDENTICAL container metadata (codec h264, 480x270, 24 fps, frame count, duration within 0.06 s) and a " +
      "cross-run PSNR at or above 30 dB against this baseline. Byte-identity is never pinned — libx264 is not " +
      "byte-stable across runs/environments. A DELIBERATE visual change re-baselines on purpose by re-running the " +
      "benchmark and committing the new baseline — that commit IS the review moment.",
    fixture:
      "The S125 smoke rig (standard slots + mouth variants + pose sheet), one 3000 ms scene at 24 fps on a 480x270 " +
      "canvas, narration on the word-proportional estimate clock (no ASR anchors — the declared fallback), through " +
      "the REAL native-rig channel (renderRigScene). Zero AI spend; the VLM identity floor stays honestly SKIP.",
    tolerances: { containerDurationSec: 0.06, minCrossRunPsnrDb: 30, twoClockToleranceSec: 0.1 },
  });

  ledger.finish("benchmark-character");
}

main().catch((err) => {
  console.error("benchmark-character crashed:", err instanceof Error ? err.stack : String(err));
  process.exit(1);
});

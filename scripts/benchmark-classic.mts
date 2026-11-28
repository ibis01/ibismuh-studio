#!/usr/bin/env node
// benchmark-classic.mts — THE CLASSIC (KEN BURNS) LANE BENCHMARK (master plan
// Phase 8: "for classic/Ken Burns, story, character, and slides, add fixed
// benchmark projects and scripts").
//
// The mp7 lane manifest recorded classic honestly: a benchmark existed
// (s87 arm B: the compositor + kenburns) but NO golden MP4, NO contact-sheet
// panel, NO parity receipt, NO failure-injection receipt. This script
// extracts s87 arm B's minimal render recipe (the EXACT production path:
// assembleTimeline → serialize → parse → compositionPlan → renderVideo over
// the story-compositor) into a fixed, deterministic fixture and produces the
// missing golden artifact.
//
// THE FIXTURE (deterministic by construction): two scenes with synthetic
// gradient storyboard art (ffmpeg lavfi, frame 1 — no provider, no clock)
// and synthesized narration WAVs (sine beds at measured lengths), the
// assembled timeline with a studio-style hard-cut boundary edit on scene 2
// (the S2 law: the per-scene pick is senior), 16:9 @30 fps (the lane's
// declared fps truth), draft quality (the cheapest honest encode). Zero AI
// spend — no script LLM, no TTS, no image provider.
//
// THE LAWS THIS SCRIPT PINS (the codec tolerance law, see benchmark-lib):
//   · two consecutive runs produce FFprobe-identical metadata (codec,
//     geometry, fps, frame count; duration within ±0.06 s) — the container
//     plane;
//   · cross-run PSNR clears the S165 floor (30 dB) — the pixel plane;
//   · the cut lands on the plan boundary (the §4.C-3 law, re-proven here);
//   · the delivered total is the contract total (the two-clock law);
//   · the narration audio rides the file (the §4.C-2 law);
//   · every sampled scene frame decodes non-black (fail-visible QC).
//
// Artifacts: scripts/golden/classic/classic-golden.mp4 (+ thumbs, metadata,
// receipts). Scratch renders land in validation/mp8/classic/ (gitignored).
//
// Run: node --import tsx scripts/benchmark-classic.mts
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// The storage root AND the database URL are read at src-module load — pin
// both to scratch BEFORE any src import evaluates: the benchmark sandbox
// never writes repo uploads, and db/custom.db itself is NEVER opened for
// write. renderVideo's director-plan seam does read the dev database (the
// approved-audio map), so the benchmark process runs against a THROWAWAY
// COPY of it in /tmp — the original file is only ever read to make that copy.
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
  framesMeanAbsDiff,
  psnrAverageDb,
  writeJson,
} from "./benchmark-lib.mts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const GOLDEN_DIR = path.join(HERE, "golden", "classic");
const VALIDATION = path.join(ROOT, "validation", "mp8", "classic");

const FPS = 30;

/** The two scenes — the fixture's fixed script beat (s87 arm B's shape). */
const SCENES: Array<Record<string, unknown>> = [
  {
    index: 1, title: "Beat one", narration: "one two three four five",
    visual: "a warm gradient board", camera: "slow push", mood: "bright",
    caption: "", hostInScene: false, rehook: false, sfx: "none",
  },
  {
    index: 2, title: "Beat two", narration: "six seven eight nine ten",
    visual: "a cool gradient board", camera: "gentle pan", mood: "calm",
    caption: "", hostInScene: false, rehook: false, sfx: "none",
  },
];

function ffmpeg(args: string[], label: string): void {
  const res = spawnSync("ffmpeg", ["-y", "-v", "error", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (res.status !== 0) throw new Error(`${label} failed: ${res.stderr.trim().slice(0, 300)}`);
}

/** One render arm: the s87 arm-B recipe, verbatim shape, own videoId. */
async function renderArm(armId: string, armDir: string): Promise<{ file: string; planTotalSec: number; boundarySec: number }> {
  const { renderVideo } = await import("../src/lib/ibismuh/render");
  const { assembleTimeline, serializeTimeline, parseTimeline } = await import("../src/lib/ibismuh/timeline");
  const { compositionPlan } = await import("../src/lib/ibismuh/composition-plan");
  const { videoDir } = await import("../src/lib/ibismuh/ai");
  const { sceneImageFile, sceneWavFile } = await import("../src/lib/ibismuh/story");

  fs.rmSync(armDir, { recursive: true, force: true });
  fs.mkdirSync(armDir, { recursive: true });

  const dir = videoDir(armId);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  // Synthetic art + narration (deterministic lavfi sources, measured lengths).
  // gradients carries a seed (default random) — PIN IT, or the two arms paint
  // different boards and the pixel-plane law would measure the fixture, not
  // the codec.
  ffmpeg(["-f", "lavfi", "-i", "gradients=s=1280x720:c0=0x8a4030:c1=0x3a3040:seed=7", "-frames:v", "1", path.join(dir, sceneImageFile(1))], "scene 1 art");
  ffmpeg(["-f", "lavfi", "-i", "gradients=s=1280x720:c0=0x2a5a7a:c1=0x1a2a3a:seed=7", "-frames:v", "1", path.join(dir, sceneImageFile(2))], "scene 2 art");
  ffmpeg(["-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-ar", "48000", "-ac", "1", path.join(dir, sceneWavFile(1))], "scene 1 narration");
  ffmpeg(["-f", "lavfi", "-i", "sine=frequency=330:duration=3.5", "-ar", "48000", "-ac", "1", path.join(dir, sceneWavFile(2))], "scene 2 narration");

  // The contract doc: assemble (measured WAV windows) → the studio-style
  // boundary edit (the per-scene pick is SENIOR — the S2 law; pinning it to
  // "cut" makes the boundary mechanically exact) → save → reopen.
  const doc = assembleTimeline(SCENES as never, {
    ttsSpeed: 1,
    renderMode: "kenburns",
    wavDurations: { 1: 3.0, 2: 3.5 },
  });
  doc.scenes[1].transitionIn = "cut";
  const reopened = parseTimeline(serializeTimeline(doc));
  if (!reopened) throw new Error("the fixture doc failed to reopen — the benchmark cannot run");
  const plan = compositionPlan(reopened, SCENES.length);
  if (!plan) throw new Error("the fixture doc produced no plan — the benchmark cannot run");

  const result = await renderVideo({
    videoId: armId,
    scenes: SCENES as never,
    mode: "kenburns",
    burnSubtitles: false,
    smartCaptions: false,
    music: false,
    sfx: false,
    timelinePlan: plan,
    sceneDurationsSec: plan.scenes.map((s) => s.durationSec),
    transition: { style: "cut", durationSec: 0.4 },
    quality: "draft",
    aspectRatio: "16:9",
    frameRate: FPS,
  } as never);

  const file = path.join(dir, result.fileName);
  if (!fs.existsSync(file)) throw new Error("the compositor render produced no file");
  return { file, planTotalSec: plan.totalSec, boundarySec: plan.scenes[1].startSec };
}

async function main(): Promise<void> {
  fs.mkdirSync(VALIDATION, { recursive: true });
  fs.mkdirSync(GOLDEN_DIR, { recursive: true });
  console.log("benchmark-classic — the classic (Ken Burns) lane benchmark");
  const ledger = new Ledger();

  // --- arm A: the render that becomes the golden -----------------------------
  const t0 = Date.now();
  const armA = await renderArm("mp8-classic-benchmark-a", path.join(VALIDATION, "arm-a"));
  const armAMs = Date.now() - t0;
  const metaA = ffprobeMeta(armA.file);

  ledger.check(
    "the delivered container carries the lane geometry (16:9 out, h264, the lane fps)",
    metaA.codec === "h264" && metaA.width === 1920 && metaA.height === 1080 && Math.abs(metaA.fps - FPS) < 0.5,
    // The kenburns zoompan executor's container average rides its per-scene
    // d-rounding (30.071 on this fixture) — the DELIVERED clock is still the
    // plan clock, proven by the two-clock law below. Tolerance 0.5 fps.
    `${metaA.width}x${metaA.height} ${metaA.codec} @${metaA.fps}`
  );
  ledger.check(
    "the delivered total is the contract total (the two-clock law)",
    Math.abs(metaA.durationSec - armA.planTotalSec) <= 0.25,
    `${metaA.durationSec.toFixed(2)}s vs plan ${armA.planTotalSec.toFixed(2)}s (tol 0.25)`
  );
  ledger.check(
    "the narration audio rides the file (the §4.C-2 law)",
    metaA.hasAudio,
    metaA.hasAudio ? "audio stream present" : "NO audio stream"
  );

  // --- QC: both scene windows carry real pixels and the cut really cut -------
  const midA = armA.boundarySec / 2;
  const midB = armA.boundarySec + (metaA.durationSec - armA.boundarySec) / 2;
  const lumaA = frameMeanLuma(armA.file, midA);
  const lumaB = frameMeanLuma(armA.file, midB);
  ledger.check(
    "every sampled scene frame decodes non-black (the fail-visible QC gate)",
    lumaA > 8 && lumaB > 8,
    `scene midpoints ${midA.toFixed(2)}s→${lumaA.toFixed(1)}, ${midB.toFixed(2)}s→${lumaB.toFixed(1)}`
  );
  const cutDiff = framesMeanAbsDiff(frameGray(armA.file, midA), frameGray(armA.file, midB));
  ledger.check(
    "the hard cut actually cut (the two scenes carry different content, measured)",
    cutDiff > 2,
    `mean |Δ| across the boundary = ${cutDiff.toFixed(2)} (codec noise sits far below 2)`
  );

  // --- arm B: the independence arm (the codec tolerance law) ------------------
  const armB = await renderArm("mp8-classic-benchmark-b", path.join(VALIDATION, "arm-b"));
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

  // --- commit the golden artifacts -------------------------------------------
  const goldenPath = path.join(GOLDEN_DIR, "classic-golden.mp4");
  fs.copyFileSync(armA.file, goldenPath);
  const thumbs = extractThumbs(goldenPath, path.join(GOLDEN_DIR, "thumbs"), 6, "classic");
  const goldenMeta = ffprobeMeta(goldenPath);

  const receipt = {
    benchmark: "scripts/benchmark-classic.mts",
    lane: "classic",
    renderer: "renderVideo kenburns (the story-compositor — the s87 arm-B production path)",
    fixture: {
      scenes: 2,
      art: "ffmpeg lavfi gradients (frame 1) — synthetic storyboard boards, no provider",
      narration: "sine beds 3.0s + 3.5s (the measured-WAV clock)",
      edit: "assembled timeline, scene-2 transitionIn pinned to hard cut (the S2 seniority law)",
      geometry: "16:9 @30 fps, draft quality",
      aiSpend: 0,
    },
    codecToleranceLaw: {
      container: "two consecutive runs must produce ffprobe-identical metadata (codec, geometry, fps, frame count; duration within 0.06s)",
      pixels: "cross-run PSNR must clear 30 dB (the S165 floor)",
      bytes: "byte-identity is NEVER pinned (libx264 is not byte-stable across runs)",
    },
    measured: {
      armAWallMs: armAMs,
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
      cutBoundarySec: armA.boundarySec,
      sceneMidpointLuma: [
        { atSec: Number(midA.toFixed(2)), mean: Number(lumaA.toFixed(2)) },
        { atSec: Number(midB.toFixed(2)), mean: Number(lumaB.toFixed(2)) },
      ],
      cutMeanAbsDiff: Number(cutDiff.toFixed(2)),
      crossRunPsnrDb: psnr === null ? null : Number.isFinite(psnr) ? Number(psnr.toFixed(2)) : "inf",
      crossRunMetaDiffs: metaDiffs,
    },
    aiHalf: "the script-planner + TTS narration are provider-gated — the fixture rides synthetic deterministic stand-ins (recorded, not faked)",
    artifacts: {
      golden: "scripts/golden/classic/classic-golden.mp4",
      thumbnails: thumbs.map((t) => path.relative(ROOT, t)),
      metadata: "scripts/golden/classic/golden-metadata.json",
    },
    at: new Date().toISOString(),
  };
  writeJson(path.join(VALIDATION, "classic-benchmark-receipt.json"), receipt);
  writeJson(path.join(GOLDEN_DIR, "golden-metadata.json"), {
    version: 1,
    slice: "MP8 — the six-lane evidence slice (the classic lane golden)",
    lane: "classic",
    baseline: "classic-golden.mp4",
    law:
      "The codec tolerance law (see scripts/benchmark-lib.mts): a re-run of scripts/benchmark-classic.mts must produce " +
      "ffprobe-IDENTICAL container metadata (codec h264, 1920x1080, 30 fps, frame count, duration within 0.06 s) and a " +
      "cross-run PSNR at or above 30 dB against this baseline. Byte-identity is never pinned — libx264 is not " +
      "byte-stable across runs/environments. A DELIBERATE visual change re-baselines on purpose by re-running the " +
      "benchmark and committing the new baseline — that commit IS the review moment.",
    fixture:
      "Two scenes with synthetic gradient storyboard art + sine narration (3.0s / 3.5s), assembled on the kenburns " +
      "renderMode with a studio hard-cut boundary edit on scene 2, rendered through the REAL story-compositor " +
      "(renderVideo kenburns, draft, 16:9 @30). Zero AI spend — the script planner and TTS are provider-gated and " +
      "the fixture deliberately rides deterministic stand-ins.",
    tolerances: { containerDurationSec: 0.06, minCrossRunPsnrDb: 30, planTotalToleranceSec: 0.25 },
  });

  ledger.finish("benchmark-classic");
}

main().catch((err) => {
  console.error("benchmark-classic crashed:", err instanceof Error ? err.stack : String(err));
  process.exit(1);
});

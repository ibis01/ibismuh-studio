#!/usr/bin/env node
// benchmark-story.mts — THE STORY LANE BENCHMARK, DETERMINISTIC HALF (master
// plan Phase 8: "for classic/Ken Burns, story, character, and slides, add
// fixed benchmark projects and scripts").
//
// The mp7 lane manifest recorded story honestly: benchmarks existed (s47's
// continuity audition, s54's genre matrix) but they are the lane's AI HALF
// (portrait → director pass → CogView scene paints → VLM continuity) — NO
// golden MP4, NO contact-sheet panel, NO parity receipt, NO failure-injection
// receipt. This script renders the lane's DETERMINISTIC HALF — the
// story-compositor over a FIXED storyboard — and produces the golden
// artifact. The AI half needs image/chat/ASR providers; in this sandbox it
// is recorded honestly as NOT VERIFIED (never turned into a PASS — the
// plan's rule), in this file's receipt, in the manifest, and in the
// benchmark receipt JSON.
//
// WHAT IS ACTUALLY STORY HERE: the lane contract declares the story lane's
// renderer as "story-compositor" — the SAME renderer classic shares (the
// registry makes that sharing explicit instead of two duplicated literals).
// The fixture therefore differs in its INPUT CLASS, not its renderer: three
// storyboard scenes (the scene-story shape — caption + visual + camera +
// mood per scene), synthetic gradient storyboard boards (the AI paint's
// deterministic stand-in), synthesized narration WAVs at measured lengths,
// and the ASSEMBLED DEFAULT transition (blend — the story lane's delivered
// look; s87 pinned the hard cut only to make its boundary mechanically
// exact, and this benchmark deliberately does NOT pin it, so the lane's
// real default rides).
//
// THE LAWS THIS SCRIPT PINS (the codec tolerance law, see benchmark-lib):
//   · two consecutive runs produce FFprobe-identical metadata (container
//     plane) and cross-run PSNR clears 30 dB (pixel plane);
//   · the delivered total is the contract total (the two-clock law);
//   · the narration audio rides the file (the §4.C-2 law);
//   · every sampled scene frame decodes non-black, and consecutive scenes
//     carry different content (fail-visible QC, measured).
//
// Artifacts: scripts/golden/story/story-golden.mp4 (+ thumbs, metadata,
// receipts). Scratch renders land in validation/mp8/story/ (gitignored).
//
// Run: node --import tsx scripts/benchmark-story.mts
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// The storage root AND the database URL are read at src-module load — pin
// both to scratch BEFORE any src import evaluates (a throwaway COPY of the
// dev database rides in /tmp; the original is never opened for write).
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
const GOLDEN_DIR = path.join(HERE, "golden", "story");
const VALIDATION = path.join(ROOT, "validation", "mp8", "story");

const FPS = 30;

/** The three storyboard scenes — the fixture's fixed scene-story script. */
const SCENES: Array<Record<string, unknown>> = [
  {
    index: 1, title: "The forecast desk", narration: "one two three four five",
    visual: "a warm gradient board with a skyline silhouette", camera: "slow push", mood: "bright",
    caption: "the desk", hostInScene: false, rehook: false, sfx: "none",
  },
  {
    index: 2, title: "The storm cell", narration: "six seven eight nine ten",
    visual: "a cool gradient board under rain", camera: "pan right", mood: "cool blues",
    caption: "the cell", hostInScene: false, rehook: true, sfx: "whoosh",
  },
  {
    index: 3, title: "The calm after", narration: "eleven twelve thirteen fourteen fifteen",
    visual: "a green gradient board at golden hour", camera: "pull out", mood: "warm haze",
    caption: "the calm", hostInScene: false, rehook: false, sfx: "none",
  },
];

const WAV_DURATIONS: Record<number, number> = { 1: 4.0, 2: 4.2, 3: 4.0 };
const WAV_FREQ: Record<number, number> = { 1: 392, 2: 330, 3: 262 };

function ffmpeg(args: string[], label: string): void {
  const res = spawnSync("ffmpeg", ["-y", "-v", "error", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (res.status !== 0) throw new Error(`${label} failed: ${res.stderr.trim().slice(0, 300)}`);
}

/** One render arm: the story lane's compositor over the fixed storyboard. */
async function renderArm(armId: string, armDir: string): Promise<{ file: string; resultDurationSec: number; planTotalSec: number; planTransition: string; sceneMidSecs: number[] }> {
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

  // The storyboard boards — deterministic stand-ins for the AI scene paints
  // (gradients carries a seed; default random would paint two different
  // storyboards across arms and the pixel-plane law would measure the
  // fixture, not the codec).
  const boards = [
    "gradients=s=1280x720:c0=0xa06030:c1=0x303048:seed=11",
    "gradients=s=1280x720:c0=0x2a4a6a:c1=0x10202a:seed=11",
    "gradients=s=1280x720:c0=0x6a8a40:c1=0x2a3a1a:seed=11",
  ];
  for (let i = 0; i < SCENES.length; i++) {
    ffmpeg(["-f", "lavfi", "-i", boards[i], "-frames:v", "1", path.join(dir, sceneImageFile(i + 1))], `scene ${i + 1} board`);
    ffmpeg([
      "-f", "lavfi", "-i", `sine=frequency=${WAV_FREQ[i + 1]}:duration=${WAV_DURATIONS[i + 1]}`,
      "-ar", "48000", "-ac", "1", path.join(dir, sceneWavFile(i + 1)),
    ], `scene ${i + 1} narration`);
  }

  // The assembled storyboard doc — the DEFAULT blend transitions ride (the
  // story lane's delivered look; deliberately not pinned to hard cuts).
  const doc = assembleTimeline(SCENES as never, {
    ttsSpeed: 1,
    renderMode: "kenburns",
    wavDurations: WAV_DURATIONS,
  });
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
    quality: "draft",
    aspectRatio: "16:9",
    frameRate: FPS,
  } as never);

  const file = path.join(dir, result.fileName);
  if (!fs.existsSync(file)) throw new Error("the compositor render produced no file");
  // The scene midpoints off the PLAN's windows (the same windows the render
  // was fed — the contract clock, not the container's).
  const sceneMidSecs = plan.scenes.map((s) => s.startSec + s.durationSec / 2);
  const planTransition = String(plan.scenes[0].transitionIn ?? "unknown");
  return { file, resultDurationSec: result.durationSec, planTotalSec: plan.totalSec, planTransition, sceneMidSecs };
}

async function main(): Promise<void> {
  fs.mkdirSync(VALIDATION, { recursive: true });
  fs.mkdirSync(GOLDEN_DIR, { recursive: true });
  console.log("benchmark-story — the story lane benchmark (deterministic half)");
  const ledger = new Ledger();

  // --- arm A: the render that becomes the golden -----------------------------
  const t0 = Date.now();
  const armA = await renderArm("mp8-story-benchmark-a", path.join(VALIDATION, "arm-a"));
  const armAMs = Date.now() - t0;
  const metaA = ffprobeMeta(armA.file);

  ledger.check(
    "the delivered container carries the lane geometry (16:9 out, h264, the lane fps)",
    metaA.codec === "h264" && metaA.width === 1920 && metaA.height === 1080 && Math.abs(metaA.fps - FPS) < 0.5,
    // The kenburns zoompan executor's container average rides its per-scene
    // d-rounding — the DELIVERED clock is still the plan clock, proven by the
    // two-clock law below. Tolerance 0.5 fps.
    `${metaA.width}x${metaA.height} ${metaA.codec} @${metaA.fps}`
  );
  ledger.check(
    "the delivered total is the contract total (the two-clock law: the render result's own clock vs the file — the s87 §4.C-4 shape)",
    Math.abs(metaA.durationSec - armA.resultDurationSec) <= 0.3,
    `${metaA.durationSec.toFixed(3)}s vs the render's own ${armA.resultDurationSec.toFixed(3)}s (tol 0.3)`
  );
  // The blend-overlap LEDGER (recorded, not judged): the plan's contiguous
  // windows state the scene clocks; the blend transition OVERLAPS
  // consecutive scenes while it plays, so the delivered clock lands BELOW
  // plan.totalSec by the overlap. The cut-mode equivalent is exact (see
  // benchmark-classic, where plan total and delivered total agree to 0.04s).
  // This benchmark records the numbers — it does not soften the law, and it
  // does not hide the delta.
  const blendDelta = armA.planTotalSec - metaA.durationSec;
  console.log(
    `  LEDGER  the blend overlap — plan total ${armA.planTotalSec.toFixed(2)}s (contiguous windows, ${armA.planTransition} transitions) vs delivered ${metaA.durationSec.toFixed(2)}s: delta ${blendDelta.toFixed(2)}s (measured, not judged; the s87 unit suite owns the blend windows' parity pins)`
  );
  ledger.check(
    "the narration audio rides the file (the §4.C-2 law)",
    metaA.hasAudio,
    metaA.hasAudio ? "audio stream present" : "NO audio stream"
  );

  // --- QC: every scene window carries real pixels; scenes differ -------------
  const lumas = armA.sceneMidSecs.map((s) => ({ at: s, mean: frameMeanLuma(armA.file, s) }));
  ledger.check(
    "every scene midpoint decodes non-black (the fail-visible QC gate)",
    lumas.every((l) => l.mean > 8),
    lumas.map((l) => `${l.at.toFixed(2)}s→${l.mean.toFixed(1)}`).join(", ")
  );
  const diffs: number[] = [];
  for (let i = 0; i + 1 < armA.sceneMidSecs.length; i++) {
    diffs.push(framesMeanAbsDiff(frameGray(armA.file, armA.sceneMidSecs[i]), frameGray(armA.file, armA.sceneMidSecs[i + 1])));
  }
  ledger.check(
    "consecutive scenes carry different content (the storyboard actually changed, measured)",
    diffs.every((d) => d > 2),
    `mean |Δ| between scene midpoints = ${diffs.map((d) => d.toFixed(2)).join(", ")}`
  );

  // --- arm B: the independence arm (the codec tolerance law) ------------------
  const armB = await renderArm("mp8-story-benchmark-b", path.join(VALIDATION, "arm-b"));
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
  const goldenPath = path.join(GOLDEN_DIR, "story-golden.mp4");
  fs.copyFileSync(armA.file, goldenPath);
  const thumbs = extractThumbs(goldenPath, path.join(GOLDEN_DIR, "thumbs"), 6, "story");
  const goldenMeta = ffprobeMeta(goldenPath);

  const receipt = {
    benchmark: "scripts/benchmark-story.mts",
    lane: "story",
    renderer: "renderVideo kenburns (the story-compositor — the lane contract's declared renderer)",
    scope: "DETERMINISTIC HALF ONLY — the AI half (storyboard-job scene paints, director pass, ASR anchors) is provider-gated and recorded NOT VERIFIED here, never a PASS",
    fixture: {
      scenes: 3,
      art: "ffmpeg lavfi gradients (seeded, frame 1) — deterministic stand-ins for the AI scene paints",
      narration: "sine beds 4.0s / 4.2s / 4.0s (the measured-WAV clock, at the estimator's 4s scene floor)",
      transitions: "the assembled DEFAULT blend — the story lane's delivered look, deliberately not pinned to hard cuts",
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
      planTransition: armA.planTransition,
      blendOverlapDeltaSec: Number(blendDelta.toFixed(3)),
      resultClockSec: Number(armA.resultDurationSec.toFixed(3)),
      sceneMidpointLuma: lumas.map((l) => ({ atSec: Number(l.at.toFixed(2)), mean: Number(l.mean.toFixed(2)) })),
      sceneMeanAbsDiff: diffs.map((d) => Number(d.toFixed(2))),
      crossRunPsnrDb: psnr === null ? null : Number.isFinite(psnr) ? Number(psnr.toFixed(2)) : "inf",
      crossRunMetaDiffs: metaDiffs,
    },
    aiHalf: {
      status: "NOT VERIFIED",
      detail: "the storyboard paint half (CogView image generation), the director pass, and the VLM continuity scan need live providers; the s47/s54 benchmarks own that half and this sandbox records it open",
    },
    artifacts: {
      golden: "scripts/golden/story/story-golden.mp4",
      thumbnails: thumbs.map((t) => path.relative(ROOT, t)),
      metadata: "scripts/golden/story/golden-metadata.json",
    },
    at: new Date().toISOString(),
  };
  writeJson(path.join(VALIDATION, "story-benchmark-receipt.json"), receipt);
  writeJson(path.join(GOLDEN_DIR, "golden-metadata.json"), {
    version: 1,
    slice: "MP8 — the six-lane evidence slice (the story lane golden, deterministic half)",
    lane: "story",
    baseline: "story-golden.mp4",
    law:
      "The codec tolerance law (see scripts/benchmark-lib.mts): a re-run of scripts/benchmark-story.mts must produce " +
      "ffprobe-IDENTICAL container metadata (codec h264, 1920x1080, 30 fps, frame count, duration within 0.06 s) and a " +
      "cross-run PSNR at or above 30 dB against this baseline. Byte-identity is never pinned — libx264 is not " +
      "byte-stable across runs/environments. A DELIBERATE visual change re-baselines on purpose by re-running the " +
      "benchmark and committing the new baseline — that commit IS the review moment.",
    fixture:
      "A three-scene storyboard (the scene-story input class) with synthetic gradient boards + sine narration " +
      "(4.0s / 4.2s / 4.0s), assembled on the kenburns renderMode with the DEFAULT fade transitions, rendered " +
      "through the REAL story-compositor (renderVideo, draft, 16:9 @30). DETERMINISTIC HALF ONLY — the AI paint " +
      "half is provider-gated and recorded NOT VERIFIED, never a PASS. The plan's contiguous windows overstate " +
      "the delivered clock by the blend overlap — recorded in the receipt, not judged here.",
    tolerances: { containerDurationSec: 0.06, minCrossRunPsnrDb: 30, twoClockToleranceSec: 0.3 },
  });

  ledger.finish("benchmark-story");
}

main().catch((err) => {
  console.error("benchmark-story crashed:", err instanceof Error ? err.stack : String(err));
  process.exit(1);
});

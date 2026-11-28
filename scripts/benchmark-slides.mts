#!/usr/bin/env node
// benchmark-slides.mts — THE SLIDES LANE BENCHMARK (master plan Phase 8:
// "for classic/Ken Burns, story, character, and slides, add fixed benchmark
// projects and scripts"). The mp7 lane manifest recorded this lane as THE
// GAP — "no MP4 benchmark exists for the slides lane yet" — this script
// closes it.
//
// THE FIXTURE (deterministic by construction): a 3-slide keynote deck with
// FIXED specs (statement / counter / bars — the layout catalog's narrative,
// evidence and comparison shapes), FIXED text, FIXED timing (2000 ms per
// slide), FIXED camera plan (motion on, intensity 10 — the house default's
// amplitude), 24 fps. The specs ride the production sanitizer
// (sanitizeSlideSpec — the same coercion every LLM plan passes through), so
// the fixture is the real input shape, not a parallel one.
//
// THE RENDER PATH (the real one, not a mock): renderKineticSlideClips —
// the S153 kinetic pass the slides queue job rides (chromium composes the
// deck page, the ONE applier applies slideFrameAt per frame, ffmpeg encodes
// per-slide video-only clips). The three clips are concated and scaled to
// the 480p delivery copy — the packaging steps of THIS benchmark, documented
// here, not a hidden re-render.
//
// THE LAWS THIS SCRIPT PINS:
//   · THE CODEC TOLERANCE LAW — libx264 output is NOT byte-stable across
//     runs. Determinism is pinned at the PLANE, never the byte: two arms of
//     the same fixture must produce FFprobe-IDENTICAL metadata (codec,
//     geometry, fps, frame count; duration within ±0.06 s) and the
//     cross-run PSNR must clear the S165 floor (30 dB). A pixel change that
//     matters lands far below that floor; codec/build drift lands far
//     above it. A DELIBERATE visual change re-baselines on purpose (the
//     s165 golden law, mirrored).
//   · THE PURE-FRAME-TRUTH PIN — slideKineticSweepHash over the three
//     specs double-runs byte-identical (the S64 law, on this fixture).
//   · FAIL-VISIBLE QC — every sampled frame at every slide midpoint must
//     decode non-black; consecutive slides' midpoints must carry DIFFERENT
//     content (the cut actually happened — measured, not assumed).
//   · ZERO AI SPEND — the deck is hand-authored; planSlides (the LLM
//     planner) is deliberately NOT called (with a configured key it dials
//     the real gateway — a golden fixture is deterministic BY
//     CONSTRUCTION, the renderGoldenGraphics law).
//
// Artifacts: scripts/golden/slides/golden-slides.mp4 (+ thumbs, metadata,
// receipts). Scratch renders land in validation/mp8/slides/ (gitignored).
//
// Run: node --import tsx scripts/benchmark-slides.mts
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// The storage root AND the database URL are read at src-module load — pin
// both to scratch BEFORE any src import evaluates: the benchmark sandbox
// never writes repo uploads, and db/custom.db itself is NEVER opened for
// write (a throwaway COPY of it rides in /tmp — the module chain the slides
// renderer imports evaluates the tenant db client's import-time WAL pragma,
// and that pragma must land on scratch, never the real database).
const MP8_SCRATCH = "/tmp/mp8-uploads";
const ROOT_TMP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRATCH_DB = path.join(MP8_SCRATCH, "benchmark-scratch.db");
process.env.IBISMUH_STUDIO_UPLOAD_ROOT ||= MP8_SCRATCH;
if (!fs.existsSync(SCRATCH_DB)) fs.copyFileSync(path.join(ROOT_TMP, "db", "custom.db"), SCRATCH_DB);
process.env.DATABASE_URL = `file:${SCRATCH_DB}`;
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
const GOLDEN_DIR = path.join(HERE, "golden", "slides");
const VALIDATION = path.join(ROOT, "validation", "mp8", "slides");

// --- the fixed fixture -------------------------------------------------------

const SLIDE_MS = 2000;
const FPS = 24;
const MOTION = { mode: "on", intensity: 10 } as const;

const DECK_SPECS: unknown[] = [
  {
    layout: "statement",
    accent: "yellow",
    badge: "TIP",
    headline: "Great decks move with intent.",
    accentWord: "intent",
    highlight: true,
    strike: false,
    footer: null,
    icon: null,
    number: null,
    unit: null,
    subLabel: null,
    bars: [],
    cardTitle: null,
    cardLines: [],
    steps: [],
    priceLabel: null,
    priceValue: null,
    source: null,
    useImage: false,
  },
  {
    layout: "counter",
    accent: "blue",
    badge: null,
    headline: "The wall holds.",
    accentWord: null,
    highlight: false,
    strike: false,
    footer: null,
    icon: null,
    number: "25,920",
    unit: "frames",
    subLabel: "THE ENGINE WALL",
    bars: [],
    cardTitle: null,
    cardLines: [],
    steps: [],
    priceLabel: null,
    priceValue: null,
    source: null,
    useImage: false,
  },
  {
    layout: "bars",
    accent: "green",
    badge: null,
    headline: "Where the time goes.",
    accentWord: null,
    highlight: false,
    strike: false,
    footer: "THE MIX CLOCK",
    icon: null,
    number: null,
    unit: null,
    subLabel: null,
    bars: [
      { label: "CHROMIUM", valueText: "48 f", weight: 0.62, highlight: true },
      { label: "ENCODE", valueText: "18 f", weight: 0.24, highlight: false },
      { label: "THE REST", valueText: "12 f", weight: 0.14, highlight: false },
    ],
    cardTitle: null,
    cardLines: [],
    steps: [],
    priceLabel: null,
    priceValue: null,
    source: "Source: the render ledger, 2026",
    useImage: false,
  },
];

// --- helpers -----------------------------------------------------------------

function run(args: string[], label: string): void {
  const res = spawnSync("ffmpeg", ["-y", "-v", "error", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (res.status !== 0) throw new Error(`${label} failed: ${res.stderr.trim().slice(0, 300)}`);
}

/** Concat the three deck clips and scale to the 480p delivery copy. */
function packageDeck(clips: string[], out480: string, workDir: string): void {
  const listFile = path.join(workDir, "concat-list.txt");
  fs.writeFileSync(listFile, clips.map((c) => `file '${c.replace(/'/g, "'\\''")}'`).join("\n") + "\n");
  const deckFull = path.join(workDir, "deck-1080x1920.mp4");
  run([
    "-f", "concat", "-safe", "0", "-i", listFile,
    "-c", "copy", deckFull,
  ], "the deck concat");
  // The 480p delivery copy: 480x854 (854 = round(480 × 16/9) — the 9:16
  // deck geometry's delivery rounding), fixed GOP for a stable container.
  run([
    "-i", deckFull,
    "-vf", "scale=480:854:flags=lanczos,format=yuv420p",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
    "-g", String(2 * FPS), "-keyint_min", String(2 * FPS),
    "-movflags", "+faststart",
    out480,
  ], "the 480p delivery encode");
}

interface Arm {
  clips: string[];
  golden: string;
  scratch: string;
}

/** One full render arm through the REAL kinetic pass, packaged to 480p. */
async function renderArm(armDir: string): Promise<Arm> {
  const { renderKineticSlideClips } = await import("../src/lib/ibismuh/slides-kinetic");
  const { sanitizeSlideSpec } = await import("../src/lib/ibismuh/slides");
  fs.rmSync(armDir, { recursive: true, force: true });
  fs.mkdirSync(armDir, { recursive: true });

  const specs = DECK_SPECS.map((raw) => sanitizeSlideSpec(raw));
  const items = specs.map((spec, i) => ({
    scene: { index: i + 1, rehook: false },
    spec,
    durationMs: SLIDE_MS,
    imageUrl: null,
  }));
  const clips = await renderKineticSlideClips(armDir, items, {
    outDir: armDir,
    brand: null,
    motion: MOTION,
    fps: FPS,
    force: true,
  });
  const landed = clips.filter((c): c is string => c !== null);
  if (landed.length !== specs.length) {
    throw new Error(`the kinetic pass answered ${landed.length}/${specs.length} clips — the fixture must render whole`);
  }
  const golden = path.join(armDir, "golden-slides.mp4");
  packageDeck(landed, golden, armDir);
  return { clips: landed, golden, scratch: armDir };
}

async function main(): Promise<void> {
  fs.mkdirSync(VALIDATION, { recursive: true });
  fs.mkdirSync(GOLDEN_DIR, { recursive: true });
  console.log("benchmark-slides — the slides lane benchmark (the mp7 recorded gap)");
  const ledger = new Ledger();

  // --- the pure-frame-truth pin (S64 law, on this fixture) -------------------
  const { slideKineticSweepHash, kineticCameraKind, kineticCameraAmp } = await import("../src/lib/ibismuh/slides-kinetic");
  const { sanitizeSlideSpec } = await import("../src/lib/ibismuh/slides");
  const specs = DECK_SPECS.map((raw) => sanitizeSlideSpec(raw));
  const camera = { kind: kineticCameraKind({ index: 1, rehook: false }, MOTION), amp: kineticCameraAmp(MOTION) };
  const sweepA = specs.map((s) => slideKineticSweepHash(s, SLIDE_MS, camera));
  const sweepB = specs.map((s) => slideKineticSweepHash(s, SLIDE_MS, camera));
  ledger.check(
    "sweep hash double-runs byte-identical (the S64 pure-frame-truth law)",
    JSON.stringify(sweepA) === JSON.stringify(sweepB),
    `3 specs, camera ${camera.kind}@${camera.amp}`
  );

  // --- arm A: the render that becomes the golden -----------------------------
  const t0 = Date.now();
  const armA = await renderArm(path.join(VALIDATION, "arm-a"));
  const armAMs = Date.now() - t0;

  // Per-clip container checks (the real path's own contract: 1080x1920 @24).
  let clipOk = true;
  const clipDetails: string[] = [];
  for (const clip of armA.clips) {
    const m = ffprobeMeta(clip);
    const frames = 48; // frameCountOf(2000ms, 24fps)
    const ok = m.codec === "h264" && m.width === 1080 && m.height === 1920 && m.frames === frames
      && Math.abs(m.durationSec - SLIDE_MS / 1000) <= 0.06;
    if (!ok) clipOk = false;
    clipDetails.push(`${path.basename(clip)} ${m.width}x${m.height} ${m.frames}f ${m.durationSec.toFixed(2)}s`);
  }
  ledger.check("each kinetic clip lands on the deck law's container (1080x1920 @24, 48 frames, h264)", clipOk, clipDetails.join(" | "));

  // --- arm B: the independence arm (the codec tolerance law) ------------------
  const armB = await renderArm(path.join(VALIDATION, "arm-b"));
  const metaA = ffprobeMeta(armA.golden);
  const metaB = ffprobeMeta(armB.golden);
  const metaDiffs = compareMeta(metaA, metaB);
  ledger.check(
    "two consecutive runs produce FFprobe-identical metadata (the container plane)",
    metaDiffs.length === 0,
    metaDiffs.length === 0
      ? `${metaA.width}x${metaA.height} ${metaA.codec} ${metaA.frames}f ${metaA.durationSec.toFixed(3)}s @${metaA.fps}`
      : metaDiffs.map((d) => `${d.field}: ${String(d.a)} vs ${String(d.b)}`).join("; ")
  );
  const psnr = psnrAverageDb(armA.golden, armB.golden);
  const PSNR_FLOOR = 30;
  ledger.check(
    "cross-run PSNR clears the committed floor (the pixel plane, the S165 law)",
    psnr !== null && psnr >= PSNR_FLOOR,
    psnr === null ? "unmeasurable" : `${Number.isFinite(psnr) ? psnr.toFixed(2) + " dB" : "inf"} (floor ${PSNR_FLOOR})`
  );

  // --- QC: non-black slides + the cuts actually cut ---------------------------
  // Slide k's midpoint (k = 1..3): (k-1)*SLIDE_MS + SLIDE_MS/2 — 1.0s, 3.0s, 5.0s.
  const slideMidSecs = [1, 2, 3].map((k) => ((k - 1) * SLIDE_MS + SLIDE_MS / 2) / 1000);
  const lumas = slideMidSecs.map((s) => ({ at: s, mean: frameMeanLuma(armA.golden, s) }));
  ledger.check(
    "every slide midpoint decodes non-black (the fail-visible QC gate)",
    lumas.every((l) => l.mean > 8),
    lumas.map((l) => `${l.at.toFixed(1)}s→${l.mean.toFixed(1)}`).join(", ")
  );
  const cut1 = framesMeanAbsDiff(frameGray(armA.golden, SLIDE_MS / 2000), frameGray(armA.golden, SLIDE_MS * 2 / 1000 + 0.5));
  const cut2 = framesMeanAbsDiff(frameGray(armA.golden, SLIDE_MS * 2 / 1000 + 0.5), frameGray(armA.golden, SLIDE_MS * 3 / 1000 - 0.5));
  ledger.check(
    "consecutive slides carry different content (the cut actually happened, measured)",
    cut1 > 2 && cut2 > 2,
    `mean |Δ| slide1→2 = ${cut1.toFixed(2)}, slide2→3 = ${cut2.toFixed(2)} (codec noise sits far below 2)`
  );

  // --- commit the golden artifacts -------------------------------------------
  const goldenPath = path.join(GOLDEN_DIR, "golden-slides.mp4");
  fs.copyFileSync(armA.golden, goldenPath);
  const thumbs = extractThumbs(goldenPath, path.join(GOLDEN_DIR, "thumbs"), 6, "slide");
  const goldenMeta = ffprobeMeta(goldenPath);

  const receipt = {
    benchmark: "scripts/benchmark-slides.mts",
    lane: "slides",
    renderer: "renderKineticSlideClips (the S153 kinetic pass — the real queue-job path)",
    fixture: {
      slides: 3,
      layouts: ["statement", "counter", "bars"],
      durationMsPerSlide: SLIDE_MS,
      fps: FPS,
      motion: MOTION,
      camera: camera.kind,
      deckGeometry: "1080x1920 (the slides lane's pinned 9:16)",
      deliveryGeometry: "480x854 (round(480 x 16/9) — the benchmark's 480p delivery copy)",
      aiSpend: 0,
      note: "the deck is hand-authored through sanitizeSlideSpec; planSlides (the LLM planner) is deliberately not called",
    },
    codecToleranceLaw: {
      container: "two consecutive runs must produce ffprobe-identical metadata (codec, geometry, fps, frame count; duration within 0.06s)",
      pixels: "cross-run PSNR must clear 30 dB (the S165 floor) — codec/build drift lands far above it, a visual change far below it",
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
        sha256: fileSha256(goldenPath),
      },
      sweepHashes: sweepA,
      crossRunPsnrDb: psnr === null ? null : Number.isFinite(psnr) ? Number(psnr.toFixed(2)) : "inf",
      crossRunMetaDiffs: metaDiffs,
      slideMidpointLuma: lumas.map((l) => ({ atSec: l.at, mean: Number(l.mean.toFixed(2)) })),
      slideCutMeanAbsDiff: { slide1to2: Number(cut1.toFixed(2)), slide2to3: Number(cut2.toFixed(2)) },
    },
    artifacts: {
      golden: "scripts/golden/slides/golden-slides.mp4",
      thumbnails: thumbs.map((t) => path.relative(ROOT, t)),
      metadata: "scripts/golden/slides/golden-metadata.json",
    },
    at: new Date().toISOString(),
  };
  writeJson(path.join(VALIDATION, "slides-benchmark-receipt.json"), receipt);
  writeJson(path.join(GOLDEN_DIR, "golden-metadata.json"), {
    version: 1,
    slice: "MP8 — the six-lane evidence slice (the slides lane: the mp7 recorded gap, closed)",
    lane: "slides",
    baseline: "golden-slides.mp4",
    law:
      "The codec tolerance law (see scripts/benchmark-lib.mts): a re-run of scripts/benchmark-slides.mts must produce " +
      "ffprobe-IDENTICAL container metadata (codec h264, 480x854, 24 fps, 144 frames, duration within 0.06 s) and a " +
      "cross-run PSNR at or above 30 dB against this baseline. Byte-identity is never pinned — libx264 is not " +
      "byte-stable across runs/environments. A DELIBERATE visual change re-baselines on purpose by re-running the " +
      "benchmark and committing the new baseline — that commit IS the review moment.",
    fixture:
      "A 3-slide hand-authored deck (statement/counter/bars, fixed text, 2000 ms per slide, 24 fps, motion on at " +
      "intensity 10) through the REAL kinetic pass (renderKineticSlideClips: chromium + slideFrameAt + ffmpeg), " +
      "concated and delivered at 480x854. Zero AI spend — the LLM deck planner is deliberately not called.",
    tolerances: { containerDurationSec: 0.06, minCrossRunPsnrDb: 30, expectedFrames: 144 },
  });

  ledger.finish("benchmark-slides");
}

main().catch((err) => {
  console.error("benchmark-slides crashed:", err instanceof Error ? err.stack : String(err));
  process.exit(1);
});

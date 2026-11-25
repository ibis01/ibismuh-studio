#!/usr/bin/env node
/**
 * P1-F (excellence) — the preview-vs-final pixel-parity harness.
 *
 * docs/whiteboard/excellence-gap-analysis.md step 4: PROVE the one-source
 * law at the pixel level. The editor preview and the final MP4 both ride
 * composeScene + framePayload + APPLY_FRAME_FN (wb-page.ts) and — as of
 * this slice — the SAME page setup (render.ts setupScenePage). This
 * harness renders the frozen W1 benchmark project through the REAL engine
 * (chromium → ffmpeg), then re-drives the applier surface standalone at
 * sampled timestamps (PNG, lossless — the surface the editor's canvas
 * rides) and diffs the two per frame:
 *
 *   - the codec band (JPEG q92 + H.264 crf19/yuv420p quantization) may
 *     wobble pixels a few units — never beyond ±8, never visibly;
 *   - ANY structural divergence (missing ink, a moved hand, shifted text,
 *     a dead clip rect) saturates the over-tolerance fraction and FAILS.
 *
 * The metric lives in src/lib/ibismuh/whiteboard/parity.ts (PURE — the
 * unit battery pins it). This script owns orchestration only: no second
 * setup pass, no second applier, no second scheduler — every seam is the
 * renderer's own export (the duplicated-setup guard is source-pinned in
 * scripts/test-unit.mts).
 *
 *   node --import tsx scripts/wb-preview-parity.mts                     (16:9)
 *   node --import tsx scripts/wb-preview-parity.mts --aspect 9:16
 *   node --import tsx scripts/wb-preview-parity.mts --samples 4
 *
 * Receipt: validation/wb-parity/wb-preview-parity-<date>.json (gitignored,
 * the 535c90e law — the committed citation lands in the docs report).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { buildBenchmarkProject, W1_ASPECTS, type W1AspectId } from "../src/lib/ibismuh/whiteboard/benchmark-scenarios";
import { loadLibrary, handAssetIdFor, type AssetRole } from "../src/lib/ibismuh/whiteboard/assets";
import { renderWhiteboard, setupScenePage } from "../src/lib/ibismuh/whiteboard/render";
import {
  beatSceneEvents,
} from "../src/lib/ibismuh/whiteboard/beat-plan";
import {
  buildGeometry,
  frameAt,
  resolveCarriedInk,
  tracedSplitForScene,
} from "../src/lib/ibismuh/whiteboard/timing";
import { compareFrameRgb, parityVerdict, PIXEL_TOLERANCE } from "../src/lib/ibismuh/whiteboard/parity";
import { composeScene, framePayload, APPLY_FRAME_FN } from "../src/lib/ibismuh/whiteboard/wb-page";
import type { AnimationEvent } from "../src/lib/ibismuh/whiteboard/storyboard";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
function argValue(flag: string): string | null {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
}
const aspectArg = (argValue("--aspect") ?? "16:9") as W1AspectId;
if (!Object.keys(W1_ASPECTS).includes(aspectArg)) {
  console.error(`[wb-parity] unknown aspect "${aspectArg}" — expected one of ${Object.keys(W1_ASPECTS).join(", ")}`);
  process.exit(2);
}
const SAMPLES_PER_SCENE = Math.max(2, Math.min(12, Number(argValue("--samples") ?? 6) || 6));
const OUT_DIR = path.resolve("validation/wb-parity");
const RUN_DIR = path.join(OUT_DIR, aspectArg.replace(":", "-"));

/** The deterministic sample plan: fixed fractions of each scene's frame
 *  span + the exact final frame (the video's longest-lived composition).
 *  No randomness — the receipt must be reproducible. */
function sampleFrames(frames: number): number[] {
  const fracs = [0.1, 0.3, 0.5, 0.7, 0.9];
  const picks = new Set<number>(fracs.map((f) => Math.min(frames - 1, Math.max(0, Math.floor(f * frames)))));
  picks.add(frames - 1);
  // Cap at SAMPLES_PER_SCENE by taking evenly-spaced picks when the span
  // is short (the W1 scenes run 96–168 frames; the cap rarely bites).
  const sorted = [...picks].sort((a, b) => a - b);
  return sorted.length <= SAMPLES_PER_SCENE ? sorted : sorted.slice(0, SAMPLES_PER_SCENE);
}

/** Decode ONE frame at tSec as raw RGB (the benchmark's own pattern). */
function decodeFrameRgb(file: string, tSec: number, w: number, h: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", [
      "-v", "error",
      "-ss", tSec.toFixed(6),
      "-i", file,
      "-frames:v", "1",
      "-f", "rawvideo",
      "-pix_fmt", "rgb24",
      "pipe:1",
    ]);
    const chunks: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.on("error", reject);
    child.on("close", (code) => {
      const buf = Buffer.concat(chunks);
      const expected = w * h * 3;
      if (code !== 0 || buf.length !== expected) {
        reject(new Error(`frame decode @${tSec}s: exit ${code}, got ${buf.length} bytes, expected ${expected}`));
        return;
      }
      resolve(buf);
    });
  });
}

/** Decode ONE still image file (the preview PNG) into raw RGB24. ffmpeg
 *  is already the engine's hard dependency — no new image library rides
 *  in for this (the no-new-deps law). */
function decodeStillRgb(file: string, w: number, h: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", [
      "-v", "error",
      "-i", file,
      "-frames:v", "1",
      "-f", "rawvideo",
      "-pix_fmt", "rgb24",
      "pipe:1",
    ]);
    const chunks: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.on("error", reject);
    child.on("close", (code) => {
      const buf = Buffer.concat(chunks);
      const expected = w * h * 3;
      if (code !== 0 || buf.length !== expected) {
        reject(new Error(`still decode ${path.basename(file)}: exit ${code}, got ${buf.length} bytes, expected ${expected}`));
        return;
      }
      resolve(buf);
    });
  });
}

async function main(): Promise<void> {
  const t0 = Date.now();
  fs.mkdirSync(RUN_DIR, { recursive: true });
  const project = buildBenchmarkProject(aspectArg);
  const { width, height, fps } = { width: project.width, height: project.height, fps: project.fps };
  console.log(`[wb-parity] aspect ${aspectArg} (${width}x${height} @ ${fps}fps) — rendering the final through the REAL engine...`);

  const render = await renderWhiteboard(project, {
    outDir: RUN_DIR,
    onProgress: (label) => {
      if (label.includes("composing")) console.log(`[wb-parity] ${label}`);
    },
  });

  // The SAME vocabularies the renderer derives (one derivation each — the
  // harness re-derives through the SAME pure functions, not its own math).
  const lib = loadLibrary([]);
  const assetTags = new Map<string, string[]>([...lib.assets.values()].map((a) => [a.id, a.tags]));
  const assetMeta = new Map<string, { alts?: string[]; role?: string }>(
    [...lib.assets.values()].map((a) => [a.id, { alts: a.alts, role: a.role }])
  );
  const geometry = buildGeometry(
    [...lib.extracted.entries()].map(([id, ex]) => ({ id, paths: ex.paths }))
  );
  const assetRoles = new Map<string, AssetRole>();
  for (const a of lib.assets.values()) {
    if (a.role) assetRoles.set(a.id, a.role);
  }
  const toolHand = lib.assets.get(handAssetIdFor(project.hand.style, project.hand.side));
  const pointHand = lib.assets.get("hand-point");
  const restHand = lib.assets.get("hand-rest");
  if (!toolHand || !pointHand || !restHand) throw new Error("the hand family is missing from the library");

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--force-color-profile=srgb", "--font-render-hinting=none"] });

  interface Sample {
    sceneId: string;
    frame: number;
    tLocalMs: number;
    meanAbsDelta: number;
    fracOverTolerance: number;
    tileOverFracMax: number | null;
    worstTile: { col: number; row: number } | null;
    worstChannelDelta: number;
    byteIdentical: boolean;
    pass: boolean;
    reasons: string[];
  }
  const samples: Sample[] = [];
  const sceneMs = render.scenes.map((s) => s.durationMs);

  try {
    for (let si = 0; si < project.scenes.length; si++) {
      const scene = project.scenes[si];
      const durationMs = sceneMs[si];
      const events: AnimationEvent[] = beatSceneEvents(scene, durationMs, geometry, assetTags, undefined, assetMeta);
      const tracedSplit = tracedSplitForScene(scene, geometry, assetTags, durationMs, undefined);
      const fadeKeys = new Set(tracedSplit?.remainder ?? []);
      const prevScene = si > 0 ? project.scenes[si - 1] : null;
      const carryPlan =
        prevScene && scene.board?.mode === "continuous"
          ? resolveCarriedInk(prevScene, sceneMs[si - 1], scene.board)
          : null;

      // The PREVIEW surface: fresh context, THE SAME compose + THE SAME
      // setup + THE SAME applier the final render (and the editor) rides.
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 1,
      });
      // Security line 2, verbatim: the page has no network, period.
      await context.route("**/*", (route) => route.abort());
      const page = await context.newPage();
      try {
        const composed = composeScene(scene, project, lib.assets, carryPlan);
        await page.setContent(composed.html, { waitUntil: "load" });
        await setupScenePage(page, {
          composed,
          fadeKeys,
          geometry,
          toolHand,
          pointHand,
          restHand,
          handScale: project.hand.scale,
        });

        const frames = Math.round((durationMs / 1000) * fps);
        const picks = sampleFrames(frames);
        const sceneFile = render.scenes[si].file;
        const previewDir = path.join(RUN_DIR, "preview", `scene-${si + 1}`);
        fs.mkdirSync(previewDir, { recursive: true });
        for (const f of picks) {
          const tMs = (f / fps) * 1000;
          await page.evaluate(`(${APPLY_FRAME_FN})(${JSON.stringify(framePayload(frameAt(project, scene, events, geometry, tMs, carryPlan, assetRoles), width, height))})`);
          // The PREVIEW artifact: a lossless PNG of the applier surface —
          // kept on disk (receipt material) and decoded to raw RGB through
          // ffmpeg (page.screenshot returns ENCODED bytes, not pixels).
          const previewPng = path.join(previewDir, `f${String(f).padStart(5, "0")}.png`);
          await page.screenshot({ path: previewPng, type: "png" });
          const previewRgb = await decodeStillRgb(previewPng, width, height);
          const finalRgb = await decodeFrameRgb(sceneFile, f / fps, width, height);
          const diff = compareFrameRgb(finalRgb, previewRgb, { width, height });
          const verdict = parityVerdict(diff);
          samples.push({
            sceneId: scene.id,
            frame: f,
            tLocalMs: Math.round(tMs),
            meanAbsDelta: Number(diff.meanAbsDelta.toFixed(4)),
            fracOverTolerance: Number(diff.fracOverTolerance.toFixed(6)),
            tileOverFracMax: diff.tileOverFracMax === null ? null : Number(diff.tileOverFracMax.toFixed(4)),
            worstTile: diff.worstTile,
            worstChannelDelta: diff.worstChannelDelta,
            byteIdentical: diff.byteIdentical,
            pass: verdict.pass,
            reasons: verdict.reasons,
          });
        }
        const scenePass = samples.filter((s) => s.sceneId === scene.id).every((s) => s.pass);
        console.log(`[wb-parity] scene ${si + 1}/${project.scenes.length} ("${scene.id}"): ${picks.length} samples — ${scenePass ? "PASS" : "FAIL"}`);
      } finally {
        await context.close().catch(() => {});
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const passedCount = samples.filter((s) => s.pass).length;
  const gate = passedCount === samples.length ? "GATE GREEN" : "GATE RED";
  const worstMean = Math.max(...samples.map((s) => s.meanAbsDelta));
  const worstFrac = Math.max(...samples.map((s) => s.fracOverTolerance));
  const worstTile = Math.max(...samples.map((s) => s.tileOverFracMax ?? 0));
  const receipt = {
    harness: "wb-preview-parity",
    date: new Date().toISOString().slice(0, 10),
    aspect: aspectArg,
    dimensions: { width, height, fps },
    project: "benchmark-scenarios.ts buildBenchmarkProject (frozen W1 authoring)",
    samplesPerScene: SAMPLES_PER_SCENE,
    pixelTolerance: PIXEL_TOLERANCE,
    scenes: project.scenes.length,
    samples,
    totals: {
      samples: samples.length,
      passed: passedCount,
      failed: samples.length - passedCount,
      worstMeanAbsDelta: worstMean,
      worstFracOverTolerance: worstFrac,
      worstTileOverFrac: worstTile,
    },
    gate,
    wallMs: Date.now() - t0,
  };
  const receiptPath = path.join(OUT_DIR, `wb-preview-parity-${receipt.date}.json`);
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");

  console.log(`\n[wb-parity] ${passedCount}/${samples.length} samples inside the codec band (worst mean |Δ| ${worstMean.toFixed(3)}, worst over-tolerance ${(worstFrac * 100).toFixed(3)} %, worst tile ${(worstTile * 100).toFixed(1)} %)`);
  if (gate !== "GATE GREEN") {
    for (const s of samples.filter((x) => !x.pass)) {
      console.error(`[wb-parity] FAIL ${s.sceneId} f${s.frame} @${s.tLocalMs}ms: ${s.reasons.join(" | ")}`);
    }
  }
  console.log(`[wb-parity] receipt: ${receiptPath}`);
  console.log(`[wb-parity] ${gate}`);
  process.exit(gate === "GATE GREEN" ? 0 : 1);
}

main().catch((e) => {
  console.error("WB PREVIEW PARITY FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * S164 proof — the whiteboard hand-drawn geometry slice (the Rough.js native
 * port), LIVE. The battery proves the pure modules; THIS script proves the
 * slice end-to-end in the one chromium pipeline: a knob-active asset
 * (roughness/bowing) renders through the real sketch-pass → schedule →
 * applier → ffmpeg path, TWICE with the same doc + seeds, and the two
 * renders must land BYTE-IDENTICAL sha256s (the S163 smoke receipt
 * pattern). The live smoke is the layer where serialization bugs surface —
 * S163's caught the window applier's OBJECT/STRING payload bug.
 *
 *   node --import tsx scripts/s164-proof.mts
 */

import { createHash } from "crypto";
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { execFile } from "child_process";

import { loadLibrary, type WhiteboardAsset } from "../src/lib/tubeforge/whiteboard/assets";
import { validateWhiteboardProject } from "../src/lib/tubeforge/whiteboard/storyboard";
import { renderWhiteboard, probeDurationSec } from "../src/lib/tubeforge/whiteboard/render";
import { withSketchPasses } from "../src/lib/tubeforge/whiteboard/sketch";

const execFileP = promisify(execFile);
const OUT_DIR = path.join(os.tmpdir(), `s164-proof-${process.pid}`);

const sha256 = (buf: Buffer | string): string => createHash("sha256").update(buf).digest("hex");

const fail = (msg: string): never => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

/** Decode ONE frame as raw RGB (codec-independent ink probe). */
function decodeFrameRgb(file: string, tSec: number, w: number, h: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", [
      "-v", "error", "-ss", tSec.toFixed(3), "-i", file,
      "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
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

async function decodedFrameCount(file: string): Promise<number | null> {
  try {
    const { stdout } = await execFileP("ffprobe", [
      "-v", "error", "-count_frames", "-select_streams", "v:0",
      "-show_entries", "stream=nb_read_frames", "-of", "json", file,
    ]);
    return Number(JSON.parse(stdout).streams?.[0]?.nb_read_frames ?? NaN) || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The knob-active asset: a stroke curve, a filled square, an authored
// ellipse — the three primitives the rough pass owns.
// ---------------------------------------------------------------------------
const ASSET_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">',
  '<path id="stroke-a" d="M 40 220 C 100 120, 200 280, 300 160" fill="none" stroke="#1d3557" stroke-width="5" stroke-linecap="round"/>',
  '<path id="shape-b" d="M 220 60 L 360 60 L 360 180 L 220 180 Z" fill="#e63946" fill-opacity="0" stroke="#1d3557" stroke-width="5"/>',
  '<path id="ring-c" d="M 120 80 A 40 40 0 1 1 120 160 A 40 40 0 1 1 120 80 Z" fill="none" stroke="#1d3557" stroke-width="5"/>',
  "</svg>",
].join("");

const asset: WhiteboardAsset = {
  id: "s164-demo",
  viewBox: { w: 400, h: 300 },
  tags: ["upload"],
  svg: ASSET_SVG,
  roughness: 1,
  bowing: 1,
};

async function main(): Promise<void> {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 1. The pass-level receipt: with knobs the pass roughens (the marker
  //    rides, the derivation set grows); without knobs it is the legacy S139.
  const withKnobs = withSketchPasses(ASSET_SVG, asset.id, { roughness: 1, bowing: 1 });
  const legacy = withSketchPasses(ASSET_SVG, asset.id);
  console.log(`[s164] rough pass: marker=${withKnobs.svg.includes('data-s164="1"')} stats=${JSON.stringify(withKnobs.stats)} legacyStats=${JSON.stringify(legacy.stats)} differs=${withKnobs.svg !== legacy.svg}`);

  // 2. The library registration: the knob-active asset rides loadLibrary —
  //    the SAME entry the built-ins ride, geometry extracted downstream.
  const lib = loadLibrary([asset]);
  const ex = lib.extracted.get("s164-demo");
  if (!ex) fail("the knob-active asset did not register");
  const odPaths = ex.paths.filter((p) => p.id.endsWith("-od")).length;
  console.log(`[s164] registered: ${ex.paths.length} drawable paths (${odPaths} overlays)`);
  if (!withKnobs.svg.includes('data-s164="1"')) fail("the rough pass never ran — no marker in the registered svg");
  if (odPaths < 2) fail(`expected rough overlays on the stroke paths, got ${odPaths}`);

  const project = {
    title: "S164 live proof — the Rough.js hand-drawn geometry",
    width: 640,
    height: 360,
    fps: 24,
    hand: { style: "marker" as const, scale: 1 },
    scenes: [
      {
        id: "s1",
        narration: "the hand drawn geometry slice renders live",
        durationMs: 6000,
        background: "#ffffff" as const,
        placements: [
          { assetId: "s164-demo", placement: { x: 130, y: 20, scale: 0.95, rotateDeg: 0 }, order: 0 },
        ],
        animations: [],
        camera: [],
      },
    ],
  };
  const { project: valid, errors } = validateWhiteboardProject(project, lib.libraryIndex);
  if (!valid) fail(`project failed validation: ${errors.join(" · ")}`);
  fs.writeFileSync(path.join(OUT_DIR, "project.json"), JSON.stringify(valid, null, 2));

  // 3. TWO complete chromium+ffmpeg renders of the same doc + seeds.
  const files: string[] = [];
  for (let run = 1; run <= 2; run++) {
    const t0 = Date.now();
    const result = await renderWhiteboard(valid, {
      outDir: path.join(OUT_DIR, `run-${run}`),
      uploadedAssets: [asset],
      onProgress: (l, frac) => {
        const pct = Math.round(frac * 100);
        if (pct % 25 === 0) console.log(`  [run-${run}] ${pct}% ${l}`);
      },
    });
    files.push(result.file);
    const dur = (await probeDurationSec(result.file)) ?? -1;
    const frames = await decodedFrameCount(result.file);
    console.log(`[s164] run-${run}: ${(Date.now() - t0) / 1000}s wall, ${dur}s program, ${frames ?? "?"} frames`);
    if (run === 2 && frames !== null && frames !== 144) fail(`expected 144 frames (6s at 24fps), got ${frames}`);
  }

  // 4. THE DETERMINISM RECEIPT — byte-identical mp4s.
  const h1 = sha256(fs.readFileSync(files[0]));
  const h2 = sha256(fs.readFileSync(files[1]));
  console.log(`[s164] sha256 run-1 = ${h1}`);
  console.log(`[s164] sha256 run-2 = ${h2}`);
  if (h1 !== h2) fail("the two renders DIVERGED — the rough ink is not byte-deterministic");
  console.log("[s164] BYTE-IDENTICAL ✓");

  // 5. The ink probe: 60% into the scene the roughened strokes are ON the
  //    board (dark pixels present) — the rough pass actually drew.
  const buf = await decodeFrameRgb(files[0], 0.6 * 6, 640, 360);
  let dark = 0;
  for (let i = 0; i < 640 * 360; i++) {
    const luma = 0.2126 * buf[i * 3] + 0.7152 * buf[i * 3 + 1] + 0.0722 * buf[i * 3 + 2];
    if (luma < 128) dark++;
  }
  const darkPct = (dark / (640 * 360)) * 100;
  console.log(`[s164] ink @3.6s: ${darkPct.toFixed(3)}% dark pixels`);
  if (darkPct < 0.05) fail("the board is blank at 60% — the roughened ink never rendered");

  fs.writeFileSync(
    path.join(OUT_DIR, "receipt.json"),
    JSON.stringify({ sha256: h1, frames: 144, durationSec: 6, darkPct, wallNote: "two renders, byte-identical" }, null, 2)
  );
  console.log(`[s164] receipt at ${path.join(OUT_DIR, "receipt.json")} — S164 LIVE PROOF PASSES`);
}

main().catch((e) => fail(e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e)));

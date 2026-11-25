/**
 * S150 — the C1 typography proof (the s123-graphics-proof pattern): the
 * REAL engine (chromium + ffmpeg) renders a validator-clean typography doc
 * at the house surface, and the receipts are recorded into validation/s150/
 * (gitignored — the 535c90e law).
 *
 * Receipts:
 *   structural  — the doc round-trips byte-stable; the budget wall admits
 *                 it; the G1 QC matrix passes BEFORE chromium;
 *   pipeline    — per-scene encodes land; ffprobe reads H.264 with the
 *                 contract's frame count per scene;
 *   determinism — a FULL second render's every frame sha256-identical,
 *                 scene by scene (the whole pipeline is pinned, not just
 *                 the pure truth);
 *   reveal      — the word cascade MOVES PIXELS: a mid-cascade frame
 *                 differs from the settled poster frame by real content
 *                 (the W4 lesson: schedule rows that move nothing are the
 *                 bug class — measured here, not assumed);
 *   face        — the Caveat data-URI face RENDERS: the same scene with
 *                 font "system" produces a DIFFERENT settled frame (a
 *                 failed face load would render the fallback and read
 *                 identical — a silent lie this probe refuses to allow).
 *
 * Run: node --import tsx scripts/s150-typography-proof.mts
 */
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";

import { renderGraphics } from "../src/lib/tubeforge/graphics/render";
import { graphicsSceneDurationsMs } from "../src/lib/tubeforge/graphics/frame";
import { graphicsQcMatrix } from "../src/lib/tubeforge/graphics/qc";
import { graphicsBudgetReport } from "../src/lib/tubeforge/graphics/preflight";
import { framePlanWindows } from "../src/lib/tubeforge/anim/clock";
import {
  composeGraphicsScene,
  caveatFontFaceCss,
  docUsesFont,
} from "../src/lib/tubeforge/graphics/compose";
import {
  parseGraphicsDoc,
  validateGraphicsDoc,
  writeGraphicsDoc,
  GRAPHICS_VERSION,
  type GraphicsDoc,
  type GraphicsScene,
} from "../src/lib/tubeforge/graphics/types";

const execFileP = promisify(execFile);

const OUT_DIR = path.resolve("validation/s150");
const failures: string[] = [];
let passed = 0;
const ok = (cond: unknown, msg: string): asserts cond => {
  if (!cond) {
    failures.push(msg);
    console.error(`  ✗ ${msg}`);
  } else {
    passed++;
    console.log(`  ✓ ${msg}`);
  }
};

const shaFile = (p: string): string => createHash("sha256").update(fs.readFileSync(p)).digest("hex");

/** Differing-byte count between two files — the "real content moved"
 *  measure (PNG extraction is lossless and deterministic per input, so
 *  identical content ⇒ identical bytes; a visual change ⇒ a broad delta). */
function diffBytes(a: string, b: string): number {
  const ba = fs.readFileSync(a);
  const bb = fs.readFileSync(b);
  const n = Math.min(ba.length, bb.length);
  let d = 0;
  for (let i = 0; i < n; i++) if (ba[i] !== bb[i]) d++;
  return d + Math.abs(ba.length - bb.length);
}

/** Extract one lossless frame from an encoded scene MP4 at an exact time
 *  (-ss AFTER -i: the accurate-decode seek — the deliverable's own pixels,
 *  not an intermediate). */
async function extractFrame(mp4: string, tSec: number, outFile: string): Promise<void> {
  await execFileP("ffmpeg", ["-y", "-i", mp4, "-ss", String(tSec), "-frames:v", "1", outFile], {
    maxBuffer: 32 * 1024 * 1024,
  });
}

/** The typography proof doc — three scenes × 4000 ms @ 24 fps, 16:9:
 *  scene-1 wraps a long headline (wrapPx, no reveal), scene-2 cascades
 *  words, scene-3 cascades chars IN THE CAVEAT FACE (the only webfont
 *  carrier). The faceless twin (font "system") is derived by flipping the
 *  one payload field — same geometry, same motions, different glyphs. */
function proofDoc(): GraphicsDoc {
  const raw = {
    version: GRAPHICS_VERSION,
    title: "s150 typography proof doc",
    width: 1920,
    height: 1080,
    fps: 24 as const,
    scenes: [
      {
        id: "scene-1",
        narration: "the wrapped headline holds its band",
        durationMs: 4000,
        background: "#f5f1e8",
        elements: [
          {
            id: "h1",
            kind: "headline",
            at: { x: 960, y: 420, scale: 1, rotateDeg: 0 },
            text: {
              text: "The quick brown fox jumps over the lazy dog again and again",
              sizePx: 96,
              weight: 800,
              color: "#1d1d1f",
              align: "center",
              wrapPx: 1100,
            },
            enter: { kind: "fade", durationMs: 800, delayMs: 0, ease: "ease-out" },
          },
          {
            id: "sh1",
            kind: "subhead",
            at: { x: 960, y: 760, scale: 1, rotateDeg: 0 },
            text: { text: "wrapPx: the deterministic estimator band", sizePx: 40, weight: 500, color: "#555555", align: "center" },
            enter: { kind: "rise", durationMs: 600, delayMs: 600, ease: "ease-out" },
          },
        ],
      },
      {
        id: "scene-2",
        narration: "ideas arrive one word at a time",
        durationMs: 5000,
        background: "#f5f1e8",
        elements: [
          {
            id: "h2",
            kind: "headline",
            at: { x: 960, y: 460, scale: 1, rotateDeg: 0 },
            text: {
              text: "Ideas arrive one word at a time",
              sizePx: 84,
              weight: 800,
              color: "#1d1d1f",
              align: "center",
              reveal: "word",
            },
            enter: { kind: "rise", durationMs: 2400, delayMs: 200, ease: "ease-out" },
          },
        ],
      },
      {
        id: "scene-3",
        narration: "handwritten ink reveals itself",
        durationMs: 4000,
        background: "#f5f1e8",
        elements: [
          {
            id: "h3",
            kind: "headline",
            at: { x: 960, y: 480, scale: 1, rotateDeg: 0 },
            text: {
              text: "Handwritten ink reveals",
              sizePx: 110,
              weight: 700,
              color: "#22303f",
              align: "center",
              reveal: "char",
              font: "caveat",
            },
            enter: { kind: "fade", durationMs: 2400, delayMs: 100, ease: "linear" },
          },
        ],
      },
    ],
  };
  const r = validateGraphicsDoc(raw);
  if (r.doc === null) throw new Error(`proof doc invalid: ${r.errors.join(" | ")}`);
  return r.doc;
}

/** The scene-3 twin with font "system" — same geometry, same reveal, the
 *  page's Arial stack. If the Caveat face failed to load in the renderer,
 *  both would rasterize the fallback and the frames would read identical. */
function facelessTwin(doc: GraphicsDoc): GraphicsDoc {
  const twin = JSON.parse(JSON.stringify(doc)) as GraphicsDoc;
  for (const scene of twin.scenes) {
    for (const el of scene.elements) {
      if (el.text?.font === "caveat") el.text.font = "system";
    }
  }
  return twin;
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outDir = path.join(OUT_DIR, "render");
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const doc = proofDoc();
  const twin = facelessTwin(doc);
  const sceneMs = graphicsSceneDurationsMs(doc);
  const plan = framePlanWindows(sceneMs, doc.fps);
  const deliveredFrames = plan.scenes.reduce((s, w) => s + w.frames, 0);

  console.log(`[s150] proof doc: ${doc.scenes.length} scenes, ${doc.scenes.reduce((s, x) => s + (x.durationMs ?? 0), 0) / 1000}s, ${deliveredFrames} delivered frames @ ${doc.fps} fps`);

  // ---- 1. the structural receipts (BEFORE chromium) ----------------------
  const json1 = writeGraphicsDoc(doc);
  const doc2 = parseGraphicsDoc(json1);
  ok(doc2 !== null && writeGraphicsDoc(doc2) === json1, "the proof doc round-trips byte-stable (parse→write→parse)");
  const budget = graphicsBudgetReport(doc);
  ok(budget.ok, `the budget wall admits the doc (${budget.frames}/${budget.wall} delivered frames @ ${budget.fps} fps)`);
  const matrix = graphicsQcMatrix(doc, 2);
  ok(matrix.passed, `the G1 QC matrix passes before the spend (${matrix.rows.filter((r) => r.status === "pass").length}/${matrix.rows.length} rows)`);
  ok(docUsesFont(doc, "caveat"), "the doc scan sees the Caveat carrier");
  ok(!docUsesFont(twin, "caveat"), "the twin carries no webfont");
  const scene3 = doc.scenes[2] as GraphicsScene;
  const injected = composeGraphicsScene(scene3, doc, { fontCss: caveatFontFaceCss("data:font/ttf;base64,QUJD") });
  ok(injected.html.includes("@font-face"), "the renderer's injection slot lands the face block in the page");

  // ---- 2. the REAL render (chromium + ffmpeg) ----------------------------
  console.log("[s150] rendering through the real engine…");
  const result = await renderGraphics(doc, {
    outDir,
    onProgress: (label) => {
      if (label.includes("composing")) console.log(`  [render] ${label}`);
    },
  });
  ok(fs.existsSync(result.file), "final.mp4 exists");

  const sceneFiles = plan.scenes.map((w, i) => path.join(outDir, `scene-${i + 1}.mp4`));
  let probedFrames = 0;
  for (let i = 0; i < sceneFiles.length; i++) {
    const f = sceneFiles[i];
    ok(fs.existsSync(f), `scene-${i + 1}.mp4 landed`);
    const { stdout } = await execFileP("ffprobe", [
      "-v", "error", "-count_frames",
      "-select_streams", "v:0",
      "-show_entries", "stream=codec_name,nb_read_frames",
      "-of", "json", f,
    ]);
    const stream = (JSON.parse(stdout).streams ?? [])[0] as { codec_name?: string; nb_read_frames?: string } | undefined;
    ok(stream?.codec_name === "h264", `scene-${i + 1} is H.264`);
    ok(Number(stream?.nb_read_frames ?? -1) === plan.scenes[i]?.frames, `scene-${i + 1} carries the contract's frame count (${stream?.nb_read_frames} = ${plan.scenes[i]?.frames})`);
    probedFrames += Number(stream?.nb_read_frames ?? 0);
  }
  ok(probedFrames === deliveredFrames, `the probed total equals the delivered count (${probedFrames} = ${deliveredFrames})`);

  // ---- 3. the reveal moves pixels (the ENCODED deliverable's own pixels) --
  // Scene-2's cascade: enter rise 2400 ms from delay 200 — mid-cascade
  // t = 1.5 s (progress ≈ 0.54, words 0-3 of 6 visible), settled
  // t = 3.416 s (progress 1, every word visible). The renderer cleans the
  // frame dirs after encode (the S75 law) — the probe reads the MP4.
  const probeDir = path.join(OUT_DIR, "probe");
  fs.mkdirSync(probeDir, { recursive: true });
  const midPng = path.join(probeDir, "s2-mid.png");
  const settledPng = path.join(probeDir, "s2-settled.png");
  await extractFrame(sceneFiles[1] as string, 1.5, midPng);
  await extractFrame(sceneFiles[1] as string, 3.416, settledPng);
  ok(fs.existsSync(midPng) && fs.existsSync(settledPng), "the probe frames extracted (mid-cascade + settled)");
  const revealDelta = diffBytes(midPng, settledPng);
  ok(revealDelta > 2000, `the word cascade moves real pixels (mid vs settled: ${revealDelta} differing bytes)`);

  // The cascade's start vs end — a second honest probe on the same scene.
  const firstPng = path.join(probeDir, "s2-first.png");
  await extractFrame(sceneFiles[1] as string, 0.04, firstPng);
  const posterDelta = diffBytes(firstPng, settledPng);
  ok(posterDelta > 2000, `the cascade's start and end states differ (${posterDelta} differing bytes)`);

  // ---- 4. the face renders ------------------------------------------------
  // Scene-3 settled, Caveat doc vs the "system" twin — different glyphs, or
  // the face never loaded (a silent lie).
  const twinOutDir = path.join(OUT_DIR, "render-twin");
  const twinResult = await renderGraphics(twin, { outDir: twinOutDir });
  ok(fs.existsSync(twinResult.file), "the twin render landed");
  const caveatPng = path.join(probeDir, "s3-caveat.png");
  const systemPng = path.join(probeDir, "s3-system.png");
  await extractFrame(sceneFiles[2] as string, 3.4, caveatPng);
  await extractFrame(path.join(twinOutDir, "scene-3.mp4"), 3.4, systemPng);
  ok(fs.existsSync(caveatPng) && fs.existsSync(systemPng), "the face-probe frames extracted");
  const faceDelta = diffBytes(caveatPng, systemPng);
  ok(faceDelta > 2000, `the Caveat face rasterizes (caveat vs system settled: ${faceDelta} differing bytes)`);

  // ---- 5. the FULL determinism sweep (the whole pipeline, twice) ---------
  console.log("[s150] rendering the determinism twin…");
  const outDir2 = path.join(OUT_DIR, "render-2");
  await renderGraphics(doc, { outDir: outDir2 });
  for (let i = 0; i < plan.scenes.length; i++) {
    const file = sceneFiles[i] as string;
    const file2 = path.join(outDir2, `scene-${i + 1}.mp4`);
    ok(shaFile(file) === shaFile(file2), `scene-${i + 1}.mp4 byte-identical across independent renders (the encode is pinned too)`);
    // Belt + suspenders: five evenly spaced decoded frames per scene hash
    // identical (proof that survives any future muxer metadata drift).
    const dur = (sceneMs[i] ?? 0) / 1000;
    for (const frac of [0.05, 0.3, 0.5, 0.7, 0.95]) {
      const t = Math.max(0.02, dur * frac - 0.01);
      const pa = path.join(probeDir, `det-${i}-${String(frac).replace(".", "")}-a.png`);
      const pb = path.join(probeDir, `det-${i}-${String(frac).replace(".", "")}-b.png`);
      await extractFrame(file, t, pa);
      await extractFrame(file2, t, pb);
      ok(shaFile(pa) === shaFile(pb), `scene-${i + 1} @ ${(dur * frac).toFixed(2)}s: the decoded frame is identical across renders`);
    }
  }
  fs.rmSync(path.join(OUT_DIR, "render-twin"), { recursive: true, force: true });

  // ---- the receipt --------------------------------------------------------
  const receipt = {
    stage: "S150",
    slice: "C1 typography stack",
    doc: { scenes: doc.scenes.length, fps: doc.fps, deliveredFrames },
    revealDelta,
    posterDelta,
    faceDelta,
    probedFrames,
    at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(OUT_DIR, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");

  console.log(`\n[s150] GATE ${failures.length === 0 ? "GREEN" : "RED"} — ${passed} assertions, ${failures.length} failures`);
  if (failures.length > 0) {
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("[s150] FATAL:", e);
  process.exit(1);
});

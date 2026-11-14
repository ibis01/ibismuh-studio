// S123 (G1) — the graphics stage proof (P5, spec §7 #9; the w7-finishing
// proof's structure, mirrored onto the graphics grammar).
//
// What this script PROVES, with receipts:
//   1. The pure laws on the pin fixture: the R-1 two-arithmetic pin
//      (DELIVERED vs whole-doc frame counts), the effective-clock
//      precedence, the draft viewport math, the QC subcheck matrix, the
//      tracks→plan contract read.
//   2. THE REAL RENDER: the fixture doc through renderGraphics — the
//      chromium loop (fresh context per scene, the no-network security
//      line, APPLY_GRAPHICS_FRAME_FN per frame) + the ffmpeg encode + the
//      assembly clock assertion — then ffprobe agrees with the delivered
//      clock and the QC battery measures the artifact.
//   3. THE DRAFT-SPEED RECEIPT (acceptance criterion 7): the same doc at
//      the 0.5× draft raster must be ≥ 2× faster than the full raster.
//      Drafts are looks, not certified outputs — but they must be CHEAP
//      looks, or the iteration loop the b6 pattern promises is a lie.
//   4. The QC battery on the standing final (playable, duration,
//      loudness, true-peak, cut-alignment against the graphics hard-cut
//      grammar) + the graphics QC group (the g-* rows) re-proved against
//      the doc the render consumed.
//
// Run: node --import tsx scripts/s123-graphics-proof.mts
// Needs ffmpeg/ffprobe on PATH + the playwright chromium. No DATABASE_URL.

import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

import { framePlanWindows } from "../src/lib/tubeforge/anim/clock";
import { planFromTracks } from "../src/lib/tubeforge/composition-plan";
import {
  effectiveGraphicsDoc,
  graphicsFrameCount,
  graphicsSceneDurationsMs,
} from "../src/lib/tubeforge/graphics/frame";
import { graphicsBudgetReport } from "../src/lib/tubeforge/graphics/preflight";
void graphicsBudgetReport;
import { graphicsTracks } from "../src/lib/tubeforge/graphics/tracks";
import {
  GRAPHICS_VERSION,
  validateGraphicsDoc,
  type GraphicsDoc,
} from "../src/lib/tubeforge/graphics/types";
import { graphicsDesignedBlackWindows, graphicsDesignedHolds } from "../src/lib/tubeforge/graphics/frame";
import { graphicsDraftFps, graphicsDraftViewport } from "../src/lib/tubeforge/graphics/draft";
import { runGraphicsQc } from "../src/lib/tubeforge/graphics/qc";
import { renderGraphics } from "../src/lib/tubeforge/graphics/render";
import { probeDurationSec } from "../src/lib/tubeforge/whiteboard/render";
import { expectedCutsForTimeline } from "../src/lib/tubeforge/render-qc";
import { runQcReport, type QcReport } from "../src/lib/tubeforge/qc";
import type { TransitionSettings } from "../src/lib/tubeforge/transitions";

const execFileP = promisify(execFile);

const OUT_DIR = path.resolve("validation/s123");
const failures: string[] = [];
const ok = (cond: unknown, msg: string): asserts cond => {
  if (!cond) {
    failures.push(msg);
    console.error(`  ✗ ${msg}`);
  } else {
    console.log(`  ✓ ${msg}`);
  }
};

async function synthWav(file: string, seconds: number): Promise<void> {
  await execFileP(
    "ffmpeg",
    [
      "-y", "-v", "error",
      "-f", "lavfi",
      "-i", `sine=frequency=330:duration=${seconds}`,
      "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
      "-ar", "48000", "-ac", "2",
      "-c:a", "pcm_s16le",
      file,
    ],
    { maxBuffer: 32 * 1024 * 1024 }
  );
}

/** The pin fixture — 2 scenes with explicit clocks, mixed element kinds
 *  covering the reveal channels (kinetic headline, a counter tween, a bar
 *  wipe, a drawn icon). */
const FIXTURE_RAW = {
  version: GRAPHICS_VERSION,
  title: "s123 proof fixture",
  width: 1920,
  height: 1080,
  fps: 24,
  scenes: [
    {
      id: "scene-1",
      narration: "Growth compounds faster than anyone expects in the first year.",
      durationMs: 4000,
      background: "#ffffff",
      elements: [
        {
          id: "h1", kind: "headline", at: { x: 960, y: 200, scale: 1, rotateDeg: 0 },
          text: { text: "Compounding", sizePx: 72, weight: 800, color: "#112233", align: "center" },
          enter: { kind: "rise", durationMs: 600, delayMs: 0, ease: "ease-back" },
        },
        {
          id: "cn", kind: "counter", at: { x: 960, y: 540, scale: 1, rotateDeg: 0 },
          counter: { from: 0, to: 100, unit: "%", decimals: 0 },
          enter: { kind: "count", durationMs: 1400, delayMs: 500, ease: "linear" },
        },
        {
          id: "br", kind: "bar", at: { x: 480, y: 820, scale: 1, rotateDeg: 0 },
          bar: { data: [{ label: "year 1", value: 3 }, { label: "year 2", value: 7 }] },
          enter: { kind: "wipe", durationMs: 900, delayMs: 900, ease: "ease-out" },
        },
      ],
    },
    {
      id: "scene-2",
      narration: "Small gains stack into the curve nobody saw coming.",
      durationMs: 3500,
      background: "#101820",
      elements: [
        {
          id: "ic1", kind: "icon", at: { x: 400, y: 400, scale: 1, rotateDeg: 0 },
          icon: { paths: ["M 0 24 L 12 0 L 24 24 Z"] },
          enter: { kind: "draw", durationMs: 700, delayMs: 300, ease: "linear" },
        },
        {
          id: "sh", kind: "subhead", at: { x: 1100, y: 420, scale: 1, rotateDeg: 0 },
          text: { text: "The stack effect", sizePx: 48, weight: 700, color: "#e8eef4", align: "left" },
          enter: { kind: "slide", durationMs: 500, delayMs: 600, ease: "ease-in-out" },
        },
      ],
    },
  ],
};

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outDir = path.join(OUT_DIR, "render");
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  console.log("\n[s123] 1 — the pure laws on the fixture");
  const validated = validateGraphicsDoc(FIXTURE_RAW);
  ok(validated.doc !== null, "the fixture validates clean");
  const doc = validated.doc as GraphicsDoc;

  // R-1 — the two arithmetics held APART on a rounding-sensitive shape: 24
  // scenes × 1085 ms @ 30 fps round UP per scene (32.55 → 33 frames each →
  // 792 delivered) while the whole-doc clock rounds the total DOWN (26,040
  // ms → 781) — the preflight wall MUST read the delivered count, or a doc
  // the whole-doc figure "clears" ships an encode past the wall.
  const roundMs = Array.from({ length: 24 }, () => 1085);
  const roundDoc = (id: string) => validateGraphicsDoc({
    version: GRAPHICS_VERSION, title: id, width: 1920, height: 1080, fps: 30,
    scenes: roundMs.map((ms, i) => ({
      id: `scene-${i + 1}`, narration: "x", durationMs: ms, background: "#ffffff",
      elements: [{ id: "h", kind: "headline", at: { x: 100, y: 100, scale: 1, rotateDeg: 0 },
        text: { text: "x" }, enter: { kind: "fade", durationMs: 300, delayMs: 0, ease: "linear" } }],
    })),
  }).doc as GraphicsDoc;
  const delivered = framePlanWindows(roundMs, 30).scenes.reduce((s, w) => s + w.frames, 0);
  const wholeDoc = graphicsFrameCount(roundDoc("r1 whole-doc"));
  ok(delivered === 792, `delivered arithmetic: 24×1085ms@30fps → ${delivered} frames (per-scene rounding UP)`);
  ok(wholeDoc === 781, `whole-doc arithmetic: graphicsFrameCount → ${wholeDoc} frames (the total rounds DOWN)`);
  ok(delivered > wholeDoc, "the delivered count EXCEEDS the whole-doc figure (the R-1 gap is real)");
  const r1 = graphicsBudgetReport(roundDoc("r1 wall"));
  ok(r1.frames === delivered && r1.ok, `the preflight wall reads the DELIVERED count (${r1.frames} ≤ ${r1.wall}) at doc.fps`);

  // The effective clock precedence: explicit wins on the fixture (every
  // scene carries one), and the VO fill applies on the STRIPPED twin.
  const voProbe = new Map([["scene-2", 3000]]);
  const effective = effectiveGraphicsDoc(doc, voProbe);
  ok(effective.scenes[0].durationMs === 4000, "explicit durationMs wins (a measurement never overrides)");
  ok(effective.scenes[1].durationMs === 3500, "scene-2 keeps its explicit 3500 ms over the measured 3000");
  const stripped = validateGraphicsDoc({
    ...FIXTURE_RAW,
    title: "s123 vo-fill fixture",
    scenes: FIXTURE_RAW.scenes.map(({ durationMs: _dm, ...rest }) => rest),
  }).doc as GraphicsDoc;
  const filled = effectiveGraphicsDoc(stripped, voProbe);
  ok(filled.scenes[1].durationMs === 3350, "measured VO fills the absent clock (+ the house 350 ms tail)");

  // The draft viewport.
  const vp = graphicsDraftViewport(doc, 0.5);
  ok(vp.width === 960 && vp.height === 540, `the 0.5× draft raster is ${vp.width}×${vp.height} (even dims)`);

  // The QC subcheck matrix on the fixture.
  const gqc = runGraphicsQc(doc);
  ok(gqc.passed, `the QC subcheck matrix passes (${gqc.rows.length} rows)`);

  // The contract read.
  const tracks = graphicsTracks(doc);
  const plan = planFromTracks({ tracks }, doc.scenes.length);
  ok(plan !== null && plan.scenes.every((s) => s.kind === "graphics"), "planFromTracks maps the graphics kind");

  console.log("\n[s123] 2 — the real render (chromium + ffmpeg)");
  // Fixture VO: synthesized sine slots at the scenes' measured durations
  // (the loudness contract applies inside the renderer's VO normalization).
  const voDir = path.join(OUT_DIR, "vo");
  fs.mkdirSync(voDir, { recursive: true });
  const vo1 = path.join(voDir, "scene-1.wav");
  const vo2 = path.join(voDir, "scene-2.wav");
  await synthWav(vo1, 3.2);
  await synthWav(vo2, 2.9);
  const voFiles = new Map([["scene-1", vo1], ["scene-2", vo2]]);

  const result = await renderGraphics(doc, {
    outDir,
    voFiles,
    onProgress: (label) => console.log(`  [render] ${label}`),
  });
  ok(fs.existsSync(result.file), "the full render landed");

  // The probe's own VO durations (what ffprobe reports for the synth slots
  // — the SAME measurement the renderer's preflight made, so the clock the
  // proof asserts against is the clock the render actually delivered).
  const vo1Sec = (await probeDurationSec(vo1)) ?? 0;
  const vo2Sec = (await probeDurationSec(vo2)) ?? 0;
  const probeEffective = effectiveGraphicsDoc(doc, new Map([["scene-1", vo1Sec * 1000], ["scene-2", vo2Sec * 1000]]));
  const probeClock = framePlanWindows(graphicsSceneDurationsMs(probeEffective), doc.fps);
  const deliveredSec = probeClock.scenes.reduce((a, s) => a + s.deliveredSec, 0);
  const probedSec = (await probeDurationSec(result.file)) ?? 0;
  ok(
    Math.abs(probedSec - deliveredSec) <= 0.05,
    `ffprobe agrees with the delivered clock: ${probedSec.toFixed(2)}s ≈ ${deliveredSec.toFixed(2)}s`
  );
  ok(
    Math.abs(result.plan.totalSec - deliveredSec) <= 0.05,
    `the contract plan agrees with the delivery: ${result.plan.totalSec.toFixed(2)}s (the assembly assertion held)`
  );

  console.log("\n[s123] 3 — the draft-speed receipt (acceptance criterion 7)");
  // The SPEED fixture: 6 dense scenes × 5000 ms (720 frames @ 24 fps) —
  // enough pixels and enough content that the pixel-dependent costs
  // (chromium raster + JPEG encode) dominate the fixed per-frame protocol
  // roundtrip, which is the honest shape of a production graphics doc.
  // Silent (no VO slots) — the probe measures the raster loop, not the
  // audio path.
  const speedScenes = Array.from({ length: 6 }, (_, i) => ({
    id: `scene-${i + 1}`,
    narration: `Speed probe scene ${i + 1} narration.`,
    durationMs: 5000,
    background: i % 2 === 0 ? "#ffffff" : "#101820",
    elements: [
      { id: "h", kind: "headline", at: { x: 960, y: 160, scale: 1, rotateDeg: 0 },
        text: { text: `Dense scene ${i + 1}`, sizePx: 64, weight: 800, color: i % 2 === 0 ? "#112233" : "#e8eef4", align: "center" },
        enter: { kind: "rise", durationMs: 600, delayMs: 0, ease: "ease-back" } },
      { id: "sub", kind: "subhead", at: { x: 960, y: 300, scale: 1, rotateDeg: 0 },
        text: { text: "The compound story continues", sizePx: 40, weight: 600, color: i % 2 === 0 ? "#334455" : "#c8d4e0", align: "center" },
        enter: { kind: "slide", durationMs: 500, delayMs: 300, ease: "ease-in-out" } },
      ...[1, 2, 3].map((n) => ({
        id: `b${n}`, kind: "bullet", at: { x: 560, y: 420 + n * 90, scale: 1, rotateDeg: 0 },
        text: { text: `Point ${n} — the numbers speak for themselves`, sizePx: 28, weight: 500, color: i % 2 === 0 ? "#223344" : "#b8c4d0", align: "left" },
        enter: { kind: "fade", durationMs: 400, delayMs: 500 + n * 200, ease: "linear" },
      })),
      { id: "chart", kind: "barChart", at: { x: 1400, y: 540, scale: 1, rotateDeg: 0 },
        bar: { data: [{ label: "q1", value: 4 }, { label: "q2", value: 7 }, { label: "q3", value: 6 }, { label: "q4", value: 9 }] },
        enter: { kind: "grow", durationMs: 1000, delayMs: 800, ease: "ease-out" } },
      { id: "cn", kind: "counter", at: { x: 380, y: 860, scale: 1, rotateDeg: 0 },
        counter: { from: 0, to: 2500 + i * 111, unit: "", decimals: 0 },
        enter: { kind: "count", durationMs: 1500, delayMs: 1200, ease: "linear" } },
      { id: "ic", kind: "icon", at: { x: 700, y: 900, scale: 1, rotateDeg: 0 },
        icon: { paths: ["M 0 32 L 16 0 L 32 32 Z", "M 32 32 L 48 8 L 64 32"] },
        enter: { kind: "draw", durationMs: 800, delayMs: 1500, ease: "linear" } },
      { id: "sp", kind: "shape", at: { x: 960, y: 940, scale: 1, rotateDeg: 0 },
        shape: { kind: "rect", w: 400, h: 4, stroke: i % 2 === 0 ? "#1a2a3a" : "#3a4a5a", fill: i % 2 === 0 ? "#1a2a3a" : "#3a4a5a", strokeWidth: 2 },
        enter: { kind: "wipe", durationMs: 700, delayMs: 1800, ease: "ease-out" } },
    ],
  }));
  const speedRaw = { version: GRAPHICS_VERSION, title: "s123 speed fixture", width: 1920, height: 1080, fps: 24, scenes: speedScenes };
  const speedDoc = validateGraphicsDoc(speedRaw).doc as GraphicsDoc;
  ok(speedDoc.scenes.length === 6, "the speed fixture validates (6 dense scenes)");

  const speedOutDir = path.join(OUT_DIR, "speed");
  fs.rmSync(speedOutDir, { recursive: true, force: true });
  fs.mkdirSync(speedOutDir, { recursive: true });
  const speedFullT0 = Date.now();
  await renderGraphics(speedDoc, { outDir: speedOutDir, onProgress: () => {} });
  const speedFullMs = Date.now() - speedFullT0;
  const draftViewport2 = graphicsDraftViewport(speedDoc, 0.5);
  const draftFps = graphicsDraftFps(speedDoc, 0.5);
  const draftT0 = Date.now();
  await renderGraphics(speedDoc, { outDir: speedOutDir, draftViewport: draftViewport2, draftFps, onProgress: () => {} });
  const speedDraftMs = Date.now() - draftT0;
  const speedup = speedFullMs / speedDraftMs;
  console.log(`  [probe] full raster: ${(speedFullMs / 1000).toFixed(2)}s · draft 0.5×: ${(speedDraftMs / 1000).toFixed(2)}s · speedup ${speedup.toFixed(2)}×`);
  ok(
    speedup >= 2,
    `the draft is ≥ 2× faster than the final (measured ${speedup.toFixed(2)}× — acceptance criterion 7)`
  );

  console.log("\n[s123] 4 — the QC battery on the standing final");
  // The graphics hard-cut grammar: scene boundaries are cuts (the doc's
  // exits are in-scene motion, not track blends) — the continuity lens gets
  // the SAME expectation the lane's timeline carries.
  const settings: TransitionSettings[] = [];
  for (let b = 0; b + 1 < probeClock.scenes.length; b++) settings.push({ style: "cut", durationSec: 0 });
  const expectedCuts = expectedCutsForTimeline(
    probeClock.scenes.map((s) => s.deliveredSec),
    settings
  );
  const narrationSec = vo1Sec + vo2Sec;
  // S123 — the DESIGNED evidence rides (the expectedBlack pattern, twice
  // over): the static holds explain the composition's resting state for the
  // frozen-frames lens, and the dark scenes' lead-ins explain the black
  // dips for the black-frame lens — both per-evidence, never lane-wide
  // exemptions; anything outside the designed windows still fails.
  const expectedHolds = graphicsDesignedHolds(probeEffective).map(
    (h) => [h.startSec, h.endSec] as [number, number]
  );
  const designedBlack = graphicsDesignedBlackWindows(probeEffective).map(
    (w) => [w.startSec, w.endSec] as [number, number]
  );
  ok(expectedHolds.length >= 2, `the designed holds derive (${expectedHolds.length} windows on the delivered clock)`);
  const qc: QcReport = await runQcReport({
    mp4Path: result.file,
    videoDuration: probedSec,
    narrationSec,
    srtPath: null,
    expectedAspect: "16:9",
    expectedBlack: designedBlack,
    expectedCuts,
    frameRate: doc.fps,
    expectedHolds,
  });
  const byId = new Map(qc.checks.map((c) => [c.id, c]));
  for (const id of ["playable", "duration", "loudness", "true-peak", "black-frames", "frozen-frames", "cut-alignment"]) {
    const c = byId.get(id);
    ok(c !== undefined && c.status === "pass", `QC ${id}: ${c ? `${c.status} (${c.value})` : "MISSING"}`);
  }

  // The graphics QC group — the SAME rows the production battery appends.
  const gqcFinal = runGraphicsQc(doc);
  ok(gqcFinal.passed, `the graphics QC group passes on the render's doc (${gqcFinal.rows.length} rows)`);

  // The receipt.
  const receipt = {
    stage: "S123 (G1) — motion graphics",
    what: "the peer-lane proof: pure laws + the real chromium render + the draft-speed receipt + the QC battery",
    fixture: { scenes: doc.scenes.length, fps: doc.fps, surface: `${doc.width}x${doc.height}` },
    render: {
      deliveredSec: Number(deliveredSec.toFixed(3)),
      probedSec: Number(probedSec.toFixed(3)),
      planTotalSec: result.plan.totalSec,
      frames: probeClock.scenes.reduce((a, s) => a + s.frames, 0),
    },
    draftProbe: {
      speedFullMs,
      speedDraftMs,
      speedup: Number(speedup.toFixed(2)),
      draftViewport: draftViewport2,
    },
    qc: {
      passed: qc.passed,
      expectedHolds,
      designedBlack,
      checks: qc.checks.map((c) => ({
        id: c.id,
        status: c.status,
        value: c.value,
        ...(c.detail ? { detail: c.detail } : {}),
      })),
    },
    graphicsQcGroup: { passed: gqcFinal.passed, rows: gqcFinal.rows.map((r) => ({ id: r.id, status: r.status, value: r.value })) },
    failures,
    recordedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(OUT_DIR, "s123-proof.json"), JSON.stringify(receipt, null, 2));

  console.log(`\n[s123] PROOF ${failures.length === 0 ? "GREEN" : "RED"} — receipt: validation/s123/s123-proof.json`);
  if (failures.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error("[s123] PROOF FAILED:", e);
  process.exit(1);
});

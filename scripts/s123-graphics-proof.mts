/**
 * S123 — the motion-graphics proof (G1 §7 #9, the w7-finishing-proof
 * pattern): the REAL engine (chromium + ffmpeg) renders a validator-clean
 * doc at the house surface, and the receipts below are recorded into
 * validation/s123/ (gitignored — the 535c90e law).
 *
 * Receipts:
 *   structural — the preflight matrix passes BEFORE chromium (fail-closed
 *                evidence); the delivered frame count equals the
 *                framePlanWindows Σ the R-1 wall checked; per-scene encodes
 *                land under graphics/scene-N.mp4;
 *   clock      — final.mp4's probed duration equals the contract's
 *                delivered total (the two-clock assert, measured);
 *   determinism— the pure frame-truth sweep double-runs byte-identical,
 *                and the 24/30 fps series are distinct (the D3 law,
 *                recorded here on the REAL doc);
 *   draft      — THE ACCEPTANCE CRITERION 7 PROBE: the 0.5× labelled draft
 *                renders ≥ 2× faster than the final (wall-clock, same
 *                machine, same doc);
 *   qc         — the FULL battery on the mixed final WITH the graphics
 *                group's designed holds (judgeFreezes/judgeStaticRuns) —
 *                the loudness contract + the hold-window judgment GREEN.
 *
 * Run: node --import tsx scripts/s123-graphics-proof.mts
 */
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";

import { renderGraphics } from "../src/lib/tubeforge/graphics/render";
import { frameAt, graphicsSceneDurationsMs } from "../src/lib/tubeforge/graphics/frame";
import { graphicsQcMatrix, graphicsHoldWindows, graphicsExpectedCuts } from "../src/lib/tubeforge/graphics/qc";
import { graphicsBudgetReport } from "../src/lib/tubeforge/graphics/preflight";
import { graphicsDraftDoc } from "../src/lib/tubeforge/graphics/draft";
import { framePlanWindows } from "../src/lib/tubeforge/anim/clock";
import { validateGraphicsDoc, writeGraphicsDoc, GRAPHICS_VERSION, type GraphicsDoc } from "../src/lib/tubeforge/graphics/types";
import { runQcReport } from "../src/lib/tubeforge/qc";

const execFileP = promisify(execFile);

const OUT_DIR = path.resolve("validation/s123");
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

async function synthWav(file: string, args: string[]): Promise<void> {
  await execFileP("ffmpeg", ["-y", ...args, file], { maxBuffer: 32 * 1024 * 1024 });
}

const sha = (s: string): string => createHash("sha256").update(s).digest("hex");

/** The proof doc — six scenes ≈ 24s of delivered video (the shape a real
 *  project renders; the speed probe needs the per-frame raster cost to
 *  dominate the pipeline's fixed overheads). The same archetype family the
 *  S123 fixture pins: opener/closer cards, counters, bars, icons, subheads
 *  and bullets, wipe/draw/rise/slide/pop motions, mixed VO (scenes 1–2
 *  carry slots, 3–6 ride the silent-fill law). Explicit 4000 ms clocks,
 *  24 fps, the house 16:9 surface. */
function proofDoc(): GraphicsDoc {
  const textEl = (id: string, kind: "headline" | "subhead", y: number, t: string, sizePx: number, enterKind: "rise" | "slide" | "fade", delayMs: number, exit?: { kind: "fade"; durationMs: number; delayMs: number; ease: "linear" }, color = "#112233") => ({
    id,
    kind,
    at: { x: 960, y, scale: 1, rotateDeg: 0 },
    text: { text: t, sizePx, weight: kind === "headline" ? 800 : 500, color, align: "center" },
    enter: { kind: enterKind, durationMs: 600, delayMs, ease: "ease-out" },
    ...(exit ? { exit } : {}),
  });
  const raw = {
    version: GRAPHICS_VERSION,
    title: "s123 proof doc",
    width: 1920,
    height: 1080,
    fps: 24,
    scenes: [
      {
        id: "scene-1",
        narration: "The proof opens with a headline and a counter beat.",
        durationMs: 4000,
        background: "#ffffff",
        elements: [
          textEl("h1", "headline", 300, "The graphics proof", 76, "rise", 0, { kind: "fade", durationMs: 400, delayMs: 3400, ease: "linear" }),
          {
            id: "cn",
            kind: "counter",
            at: { x: 960, y: 620, scale: 1, rotateDeg: 0 },
            counter: { from: 0, to: 100, unit: "%", decimals: 0 },
            enter: { kind: "count", durationMs: 1200, delayMs: 500, ease: "linear" },
            emphasis: { kind: "pop", durationMs: 300, delayMs: 2400, ease: "pop" },
          },
        ],
      },
      {
        id: "scene-2",
        narration: "The second beat draws a bar chart to the point.",
        durationMs: 4000,
        background: "#f8f5ee",
        elements: [
          {
            id: "br",
            kind: "bar",
            at: { x: 960, y: 480, scale: 1, rotateDeg: 0 },
            bar: { data: [{ label: "alpha", value: 3 }, { label: "beta", value: 5 }, { label: "gamma", value: 4 }] },
            enter: { kind: "wipe", durationMs: 900, delayMs: 200, ease: "ease-out" },
          },
          {
            id: "ic",
            kind: "icon",
            at: { x: 960, y: 860, scale: 1, rotateDeg: 0 },
            icon: { paths: ["M 0 12 L 8 0 L 16 12 Z"] },
            enter: { kind: "draw", durationMs: 600, delayMs: 1400, ease: "linear" },
          },
        ],
      },
      {
        id: "scene-3",
        narration: "Next a subhead introduces the framework beats.",
        durationMs: 4000,
        background: "#ffffff",
        elements: [
          textEl("sh1", "subhead", 420, "Three ideas carry the deck", 48, "slide", 100),
          {
            id: "bl1",
            kind: "bullet",
            at: { x: 660, y: 640, scale: 1, rotateDeg: 0 },
            text: { text: "One clock, one truth", sizePx: 36, weight: 400, color: "#223344", align: "left" },
            enter: { kind: "fade", durationMs: 500, delayMs: 900, ease: "ease-out" },
            exit: { kind: "fade", durationMs: 300, delayMs: 3500, ease: "linear" },
          },
          {
            id: "bl2",
            kind: "bullet",
            at: { x: 660, y: 760, scale: 1, rotateDeg: 0 },
            text: { text: "Named walls everywhere", sizePx: 36, weight: 400, color: "#223344", align: "left" },
            enter: { kind: "fade", durationMs: 500, delayMs: 1600, ease: "ease-out" },
            exit: { kind: "fade", durationMs: 300, delayMs: 3500, ease: "linear" },
          },
        ],
      },
      {
        id: "scene-4",
        narration: "Then the chart beat compares the lanes.",
        durationMs: 4000,
        background: "#f8f5ee",
        elements: [
          {
            id: "bc",
            kind: "barChart",
            at: { x: 960, y: 540, scale: 1, rotateDeg: 0 },
            bar: { data: [{ label: "story", value: 6 }, { label: "whiteboard", value: 7 }, { label: "graphics", value: 5 }], horizontal: false },
            enter: { kind: "grow", durationMs: 1000, delayMs: 200, ease: "ease-out" },
            emphasis: { kind: "wipe", durationMs: 300, delayMs: 2600, ease: "ease-out" },
          },
        ],
      },
      {
        id: "scene-5",
        narration: "A callout pins the design law to the screen.",
        durationMs: 4000,
        background: "#ffffff",
        elements: [
          {
            id: "co",
            kind: "callout",
            at: { x: 960, y: 460, scale: 1, rotateDeg: 0 },
            callout: { text: "The doc clock IS the timeline", pointsAt: { x: 960, y: 640 } },
            enter: { kind: "pop", durationMs: 500, delayMs: 300, ease: "ease-back" },
            exit: { kind: "fade", durationMs: 350, delayMs: 3450, ease: "linear" },
          },
          {
            id: "ic5",
            kind: "icon",
            at: { x: 960, y: 760, scale: 1.5, rotateDeg: 0 },
            icon: { paths: ["M 0 16 L 16 16", "M 16 16 L 16 0", "M 16 0 L 0 0"] },
            enter: { kind: "draw", durationMs: 700, delayMs: 1200, ease: "linear" },
          },
        ],
      },
      {
        id: "scene-6",
        narration: "The closer restates the promise and holds.",
        durationMs: 4000,
        background: "#112233",
        elements: [
          textEl("h6", "headline", 480, "Declarative. Deterministic. $0.", 64, "rise", 0, undefined, "#f8f5ee"),
          textEl("k6", "subhead", 640, "S123 · motion graphics", 36, "fade", 700, undefined, "#c8ccd4"),
        ],
      },
    ],
  };
  const r = validateGraphicsDoc(raw);
  if (r.doc === null) throw new Error(`the proof doc must validate: ${r.errors.join(" | ")}`);
  return r.doc;
}

/** The deterministic frame-truth sweep hash — the pure truth the renderer
 *  reads, hashed over a fixed ms grid. */
function sweepHash(doc: GraphicsDoc): string {
  const total = graphicsSceneDurationsMs(doc).reduce((a, b) => a + b, 0);
  let acc = "";
  for (let t = 0; t <= total; t += 100) acc += JSON.stringify(frameAt(doc, t)) + "\n";
  return sha(acc);
}

/** The per-fps frame-series hash — the frame-indexed truth (tMs = frame ·
 *  1000/fps), distinct per rate (D3). */
function seriesHash(doc: GraphicsDoc, fps: 24 | 30): { hash: string; frames: number } {
  const total = graphicsSceneDurationsMs(doc).reduce((a, b) => a + b, 0);
  const frames = Math.round((total * fps) / 1000);
  let acc = "";
  for (let f = 0; f < frames; f++) acc += JSON.stringify(frameAt(doc, (f * 1000) / fps)) + "\n";
  return { hash: sha(acc), frames };
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outDir = path.join(OUT_DIR, "render");
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const doc = proofDoc();
  const sceneMs = graphicsSceneDurationsMs(doc);
  const plan = framePlanWindows(sceneMs, doc.fps);
  const deliveredFrames = plan.scenes.reduce((s, w) => s + w.frames, 0);
  const deliveredSec = plan.scenes.reduce((s, w) => s + w.deliveredSec, 0);

  console.log(`[s123] proof doc: ${doc.scenes.length} scenes, ${(deliveredSec).toFixed(2)}s delivered (${deliveredFrames} frames @ ${doc.fps} fps)`);

  // ---- 1. the preflight evidence (fail-closed, BEFORE chromium) ----------
  const budget = graphicsBudgetReport(doc);
  ok(budget.ok, `the budget wall admits the doc (${budget.frames}/${budget.wall} delivered frames @ ${budget.fps} fps)`);
  const matrix = graphicsQcMatrix(doc, 2);
  ok(matrix.passed, `the G1 QC matrix passes before the spend (${matrix.rows.filter((r) => r.status === "pass").length}/${matrix.rows.length} rows)`);

  // ---- 2. the pure determinism receipts ---------------------------------
  const sweep1 = sweepHash(doc);
  const sweep2 = sweepHash(doc);
  ok(sweep1 === sweep2, `the frame-truth sweep double-runs byte-identical (${sweep1.slice(0, 16)}…)`);
  const at24 = seriesHash(doc, 24);
  const at30 = seriesHash(doc, 30);
  ok(at24.frames === deliveredFrames, `the 24 fps series covers the delivered count (${at24.frames})`);
  ok(at24.hash !== at30.hash, "the 24 and 30 fps frame series are DISTINCT (the D3 law, recorded on the proof doc)");
  ok(sweepHash({ ...doc, fps: 30 }) === sweep1, "the ms-sampled truth is fps-free (same doc, other rate)");

  // ---- 3. the REAL render (chromium + ffmpeg, VO + bed) ------------------
  console.log("[s123] rendering through the real engine (full surface, VO + bed)…");
  const voFile = path.join(outDir, "vo-s1.wav");
  await synthWav(voFile, [
    "-f", "lavfi", "-i", "sine=frequency=220:duration=3.8",
    "-af", "afade=t=in:d=0.1,afade=t=out:st=3.6:d=0.2,volume=0.8",
    "-ar", "48000", "-ac", "2",
  ]);
  const voFile2 = path.join(outDir, "vo-s2.wav");
  await synthWav(voFile2, [
    "-f", "lavfi", "-i", "sine=frequency=196:duration=3.6",
    "-af", "afade=t=in:d=0.1,afade=t=out:st=3.4:d=0.2,volume=0.8",
    "-ar", "48000", "-ac", "2",
  ]);
  const bedFile = path.join(OUT_DIR, "bed.wav");
  // A REALISTIC bed: the house library tracks are mastered near −16 LUFS,
  // so the ducked arm (0.16 ≈ −16 dB) still sits far above the battery's
  // −40 dB silence floor. The first proof run's bed synth rode at −30 dB
  // mean and the ducked arm measured −46 dB — a synthetic-input artifact
  // (the dead-air lens correctly flagged it; recorded in the receipt).
  await synthWav(bedFile, [
    "-f", "lavfi", "-i", "sine=frequency=55:duration=9",
    "-af", "volume=20dB",
    "-ar", "48000", "-ac", "2",
  ]);

  const tFull0 = Date.now();
  const result = await renderGraphics(doc, {
    outDir,
    voFiles: new Map([["scene-1", voFile], ["scene-2", voFile2]]),
    musicPath: bedFile,
    onProgress: (label, frac) => {
      if (label.includes("composing") || Math.abs(frac * 100) % 25 < 1)
        console.log(`  [render] ${label}`);
    },
  });
  const fullMs = Date.now() - tFull0;
  console.log(`  [render] full render: ${(fullMs / 1000).toFixed(1)}s wall-clock`);

  ok(fs.existsSync(result.file), "final.mp4 exists");
  ok(result.scenes.length === 6, "six per-scene encodes recorded");
  ok(result.scenes.every((s) => fs.existsSync(s.file)), "every per-scene encode landed under graphics/");
  ok(
    result.scenes.every((s, i) => s.frames === plan.scenes[i].frames),
    `the per-scene frames equal the framePlanWindows Σ (${result.scenes.map((s) => s.frames).join("+")} = ${deliveredFrames})`
  );
  ok(
    Math.abs(result.plan.totalSec - Math.round(deliveredSec * 100) / 100) <= 0.001,
    `the contract plan equals the delivered clock (${result.plan.totalSec}s)`
  );

  // The probed duration — the two-clock assert, MEASURED on the artifact.
  const { stdout: durOut } = await execFileP("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", result.file]);
  const probed = Number(JSON.parse(durOut).format?.duration ?? 0);
  ok(Math.abs(probed - deliveredSec) < 0.15, `final.mp4's probed duration matches the delivered clock (${probed.toFixed(2)}s ≈ ${deliveredSec.toFixed(2)}s)`);

  // The audio truth rode the tracks (2 VO slots + the bed clip).
  const voClips = result.tracks.find((t) => t.kind === "audio")?.clips ?? [];
  ok(voClips.length === 3, `the audio truth carries both VO slots + the bed clip (${voClips.map((c) => c.id).join(", ")})`);

  // ---- 4. THE DRAFT SPEED PROBE (acceptance criterion 7) ----------------
  console.log("[s123] rendering the 0.5× labelled draft for the speed probe (look-rate riding)…");
  const draftDoc = graphicsDraftDoc(doc, 0.5);
  if (!draftDoc) throw new Error("the 0.5 draft doc must build");
  const draftDir = path.join(OUT_DIR, "draft");
  fs.mkdirSync(draftDir, { recursive: true });
  const tDraft0 = Date.now();
  const draftResult = await renderGraphics(draftDoc, {
    outDir: draftDir,
    voFiles: new Map([["scene-1", voFile], ["scene-2", voFile2]]),
    frameStep: 2, // the look-rate: every OTHER frame at its exact doc time
  });
  const draftMs = Date.now() - tDraft0;
  const speedup = fullMs / draftMs;
  console.log(`  [render] draft: ${(draftMs / 1000).toFixed(1)}s wall-clock — ${speedup.toFixed(2)}× vs the full surface`);
  // The look's own clock honesty: same program duration, half the frames.
  ok(
    draftResult.scenes.every((s, i) => s.frames === Math.ceil(plan.scenes[i].frames / 2)),
    `the look samples every OTHER frame (${draftResult.scenes.map((s) => s.frames).join("+")} vs the final's ${plan.scenes.reduce((a, w) => a + w.frames, 0)})`
  );
  const { stdout: durOutDraft } = await execFileP("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", draftResult.file]);
  const probedDraft = Number(JSON.parse(durOutDraft).format?.duration ?? 0);
  ok(Math.abs(probedDraft - deliveredSec) < 0.15, `the look spans EXACTLY the program (${probedDraft.toFixed(2)}s ≈ ${deliveredSec.toFixed(2)}s — the look-rate never changes the clock)`);
  ok(
    draftMs * 2 <= fullMs,
    `ACCEPTANCE 7: the 0.5× draft is ≥ 2× faster than the final (${(draftMs / 1000).toFixed(1)}s vs ${(fullMs / 1000).toFixed(1)}s — ${speedup.toFixed(2)}×)`
  );

  // ---- 5. the QC battery WITH the graphics group ------------------------
  console.log("[s123] the full QC battery on the mixed final (the graphics lane semantics riding)…");
  const holds = graphicsHoldWindows(doc);
  const qc = await runQcReport({
    mp4Path: result.file,
    videoDuration: deliveredSec,
    narrationSec: null,
    srtPath: null,
    expectedAspect: "16:9",
    frameRate: doc.fps,
    expectedCuts: graphicsExpectedCuts(doc),
    designedFreezes: holds.map((h) => [h.startSec, h.endSec] as [number, number]),
    graphicsLane: true,
    sceneCutThreshold: 0.025, // the graphics lane's calibration (the P5 finding)
  });
  const checks = (qc as { checks?: { id: string; status: string; value?: string; detail?: string }[] }).checks ?? [];
  for (const c of checks) console.log(`  [qc] ${c.id}: ${c.status}${c.value ? ` (${c.value})` : ""}`);
  const qcFails = checks.filter((c) => c.status === "fail");
  ok(qcFails.length === 0, `QC GREEN on the mixed final${qcFails.length ? " — fails: " + qcFails.map((c) => c.id).join(", ") : ""}`);
  const frozen = checks.find((c) => c.id === "frozen-frames");
  ok(frozen && frozen.status === "pass", `the frozen-frames lens rides the dead-compositor semantics (${frozen?.value ?? "?"})`);
  const statics = checks.find((c) => c.id === "static-shots");
  ok(statics && statics.status === "pass", `the static-shots lens judges the doc's designed holds (${statics?.value ?? "?"})`);
  const loudness = checks.find((c) => c.id === "loudness");
  ok(loudness && loudness.status === "pass", `the loudness contract holds on the mixed VO + bed program (${loudness?.value ?? "?"})`);
  const cuts = checks.find((c) => c.id === "cut-alignment");
  ok(cuts && cuts.status === "pass", `the hard-cut alignment holds at the frame-quantized boundaries (${cuts?.value ?? "?"})`);

  // ---- the receipt (local, gitignored) ----------------------------------
  const receipt = {
    stage: "S123",
    generatedAt: new Date().toISOString(),
    doc: writeGraphicsDoc(doc),
    delivered: { frames: deliveredFrames, totalSec: Math.round(deliveredSec * 100) / 100, fps: doc.fps },
    determinism: {
      sweepHash: sweep1,
      seriesAt24: at24.hash,
      seriesAt30: at30.hash,
      seriesFramesAt24: at24.frames,
    },
    speed: { fullMs, draftMs, speedup: Math.round(speedup * 100) / 100 },
    qc: { passed: qc.passed, checks: checks.map((c) => ({ id: c.id, status: c.status, value: c.value })) },
    gate: { passed: failures.length === 0, passedAssertions: passed, failures },
  };
  fs.writeFileSync(path.join(OUT_DIR, "s123-graphics-proof-receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
  console.log(`\n[s123] receipt → validation/s123/s123-graphics-proof-receipt.json`);
  if (failures.length > 0) {
    console.error(`[s123] GATE RED — ${failures.length} failure(s)`);
    process.exit(1);
  }
  console.log(`[s123] GATE GREEN — ${passed} assertions passed`);
}

main().catch((err) => {
  console.error("[s123] the proof crashed:", err);
  process.exit(1);
});

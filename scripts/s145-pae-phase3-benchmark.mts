// S145 — PAE Phase 3: the production benchmark harness (the spec §6 program,
// the PAE record's §4 "Remaining"). The six tickets landed (S129–S134); this
// is the benchmarks-not-code stage: a FIXED doc — three scenes carrying the
// historical / educational / motion-graphics programs, one scene each — that
// exercises EVERY directive kind (all six tween channels, scene camera keys,
// all three event kinds) plus the 3D object adapter's keyed objects, measured
// on the five axes the spec names:
//
//   (a) frame-at evaluation cost (µs/frame, warm sweep, per scene + objectAt)
//   (b) full-render wall time: the full doc vs its STRIPPED twin (the same
//       doc with tweens/camera/events deleted — the byte-identity baseline
//       arm), same rig, same session (no historical S128 receipt exists in
//       docs/baselines/ — the same-session A/B is the honest comparison)
//   (c) determinism: two independent full renders — per-scene FRAME-SERIES
//       sha256 equality (the container may carry metadata; the frames are
//       the law)
//   (d) the resume drill: a child render SIGKILLed mid-program, resumed
//       through the S132 manifest seam — the reused scene byte-compares,
//       the re-rendered scenes' frame series match the control
//   (e) the G1-READ-1 readcheck report (every on-screen text's window)
//
// Phased (each phase fits a foreground run; state rides
// validation/pae-phase3/state.json):
//
//   node --import tsx scripts/s145-pae-phase3-benchmark.mts sweep
//   node --import tsx scripts/s145-pae-phase3-benchmark.mts full1
//   node --import tsx scripts/s145-pae-phase3-benchmark.mts full2
//   node --import tsx scripts/s145-pae-phase3-benchmark.mts baseline
//   node --import tsx scripts/s145-pae-phase3-benchmark.mts resume
//   node --import tsx scripts/s145-pae-phase3-benchmark.mts report
//
// Receipt: docs/baselines/pae-phase3-<date>.txt

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import {
  validateGraphicsDoc,
  GRAPHICS_VERSION,
  type GraphicsDoc,
} from "../src/lib/tubeforge/graphics/types";
import { renderGraphics, readRenderManifest } from "../src/lib/tubeforge/graphics/render";
import { graphicsReadcheck, graphicsDeterminismSweep, readcheckMinMs } from "../src/lib/tubeforge/graphics/qc";
import { frameAt } from "../src/lib/tubeforge/graphics/frame";
import { objectAt, type Scene3DObject } from "../src/lib/tubeforge/scene3d";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATE_DIR = path.join(REPO_ROOT, "validation", "pae-phase3");
const STATE_FILE = path.join(STATE_DIR, "state.json");

const phase = process.argv[2] ?? "";
const CHILD_MODE = process.argv.includes("--child");
const CHILD_OUT = process.argv[process.argv.indexOf("--child") + 1] ?? "";

interface SceneStat { mean: number; p50: number; p95: number; max: number; samples: number }
interface RenderState {
  wallMs: number;
  scenes: { sceneId: string; frames: number; file: string; bytes: number; streamSha: string; byteSha: string }[];
  file: string;
  fileBytes: number;
}
interface DrillState {
  killedAtScene: number;
  manifestAfterKill: boolean;
  resumedScenes: string[];
  reRenderedScenes: string[];
  manifestDeletedAfterCompletion: boolean;
  reusedSceneByteEqual: boolean;
  reRenderedStreamMatch: boolean;
  sceneMp4ByteEqual: boolean;
  resumeWallMs: number;
}
interface SweepState {
  perScene: Record<string, SceneStat>;
  objectAt: SceneStat;
  objectAtDeterminism: boolean;
  detSweepHash: string;
  detSweepFinite: boolean;
  readcheckRows: { id: string; chars: number; minMs: number; visibleMs: number }[];
  readcheckViolations: string[];
}

// ---------------------------------------------------------------------------
// The fixed benchmark doc — THREE scenes (historical / educational /
// motion-graphics, one scene each ≈ 10 s apiece = ~30 s @ 24 fps, the spec's
// shape), exercising EVERY directive kind: all six tween channels
// (dx, dy, scale, rotateDeg, opacity, progress), scene camera keys, and all
// three event kinds (sfx / hit / cue). Every tween window sits INSIDE its
// scene clock (time-sanity is the ERROR class — the motions-loop law).
// ---------------------------------------------------------------------------

function benchmarkDoc(): GraphicsDoc {
  const raw = {
    version: GRAPHICS_VERSION,
    title: "s145 PAE phase-3 benchmark doc",
    width: 1920,
    height: 1080,
    fps: 24 as const,
    scenes: [
      {
        // The HISTORICAL program — a dated headline, a counting figure, a
        // slow documentary camera, beat hits.
        id: "scene-1",
        narration: "History turns on dated moments, not vague moods.",
        durationMs: 10_000,
        background: "#14100c",
        camera: [
          { tMs: 0, zoom: 1, tx: 0, ty: 0 },
          { tMs: 4000, zoom: 1.6, tx: -80, ty: -40, ease: "ease-out" },
          { tMs: 8000, zoom: 1.15, tx: 40, ty: 20, ease: "ease-in-out" },
        ],
        events: [
          { tMs: 2000, kind: "hit", label: "date lands" },
          { tMs: 8000, kind: "cue", label: "hold for the close" },
        ],
        elements: [
          {
            id: "h1",
            kind: "headline",
            at: { x: 960, y: 320, scale: 1, rotateDeg: 0 },
            text: { text: "1440 — the press moves words", sizePx: 72, weight: 800, color: "#f3ede2", align: "center" },
            enter: { kind: "rise", durationMs: 700, delayMs: 0, ease: "ease-out" },
            exit: { kind: "fade", durationMs: 400, delayMs: 9400, ease: "linear" },
            tweens: [
              {
                delayMs: 1200, durationMs: 6000,
                channels: [
                  { channel: "dx", keys: [{ tMs: 0, value: -50 }, { tMs: 6000, value: 50, ease: "ease-in-out" }] },
                  { channel: "rotateDeg", keys: [{ tMs: 0, value: 0 }, { tMs: 6000, value: 2, ease: "ease-in-out" }] },
                ],
              },
            ],
          },
          {
            id: "cn1",
            kind: "counter",
            at: { x: 960, y: 620, scale: 1, rotateDeg: 0 },
            counter: { from: 0, to: 1800, unit: "", decimals: 0 },
            enter: { kind: "count", durationMs: 1400, delayMs: 1800, ease: "linear" },
            emphasis: { kind: "pop", durationMs: 300, delayMs: 6000, ease: "pop" },
            tweens: [
              {
                delayMs: 3600, durationMs: 5000,
                channels: [
                  { channel: "opacity", keys: [{ tMs: 0, value: 1 }, { tMs: 2500, value: 0.82, ease: "ease-in-out" }, { tMs: 5000, value: 1, ease: "ease-in-out" }] },
                ],
              },
            ],
          },
          {
            id: "ic1",
            kind: "icon",
            at: { x: 960, y: 860, scale: 1.4, rotateDeg: 0 },
            icon: { paths: ["M 0 18 L 12 0 L 24 18 Z", "M 4 24 L 28 24"], color: "#c9b38a", strokeWidth: 3 },
            enter: { kind: "draw", durationMs: 800, delayMs: 3200, ease: "linear" },
          },
        ],
      },
      {
        // The EDUCATIONAL program — a chart that grows, bullets that breathe,
        // an sfx slot on the reveal, a camera that pushes on the point.
        id: "scene-2",
        narration: "Practice beats exposure when the feedback is immediate.",
        durationMs: 10_000,
        background: "#f6f3ea",
        camera: [
          { tMs: 0, zoom: 1, tx: 0, ty: 0 },
          { tMs: 5000, zoom: 1.35, tx: 0, ty: -60, ease: "ease-in-out" },
        ],
        events: [
          { tMs: 1500, kind: "sfx", label: "chart reveal whoosh" },
          { tMs: 5200, kind: "hit", label: "the lesson lands" },
        ],
        elements: [
          {
            id: "sh2",
            kind: "subhead",
            at: { x: 960, y: 260, scale: 1, rotateDeg: 0 },
            text: { text: "The feedback loop, measured", sizePx: 48, weight: 500, color: "#2a2318", align: "center" },
            enter: { kind: "slide", durationMs: 600, delayMs: 100, ease: "ease-out" },
            tweens: [
              {
                delayMs: 2000, durationMs: 4000,
                channels: [
                  { channel: "dy", keys: [{ tMs: 0, value: 0 }, { tMs: 2000, value: 14, ease: "ease-in-out" }, { tMs: 4000, value: 0, ease: "ease-in-out" }] },
                ],
              },
            ],
          },
          {
            id: "bc2",
            kind: "barChart",
            at: { x: 960, y: 560, scale: 1, rotateDeg: 0 },
            bar: { data: [{ label: "exposure", value: 4 }, { label: "practice", value: 9 }, { label: "tested", value: 7 }], horizontal: false, unit: "recall" },
            enter: { kind: "grow", durationMs: 1100, delayMs: 1300, ease: "ease-out" },
            emphasis: { kind: "wipe", durationMs: 300, delayMs: 5400, ease: "ease-out" },
            tweens: [
              {
                delayMs: 4200, durationMs: 3000,
                channels: [
                  { channel: "progress", keys: [{ tMs: 0, value: 1 }, { tMs: 1500, value: 0.55, ease: "ease-in-out" }, { tMs: 3000, value: 1, ease: "ease-out" }] },
                ],
              },
            ],
          },
          {
            id: "bl2a",
            kind: "bullet",
            at: { x: 620, y: 800, scale: 1, rotateDeg: 0 },
            text: { text: "one clock, one truth", sizePx: 34, weight: 400, color: "#4a4030", align: "left" },
            enter: { kind: "fade", durationMs: 500, delayMs: 3400, ease: "ease-out" },
            tweens: [
              {
                delayMs: 5200, durationMs: 3000,
                channels: [
                  { channel: "scale", keys: [{ tMs: 0, value: 1 }, { tMs: 1500, value: 1.08, ease: "ease-in-out" }, { tMs: 3000, value: 1, ease: "ease-in-out" }] },
                ],
              },
            ],
          },
          {
            id: "bl2b",
            kind: "bullet",
            at: { x: 620, y: 890, scale: 1, rotateDeg: 0 },
            text: { text: "named walls everywhere", sizePx: 34, weight: 400, color: "#4a4030", align: "left" },
            enter: { kind: "fade", durationMs: 500, delayMs: 4100, ease: "ease-out" },
            exit: { kind: "fade", durationMs: 350, delayMs: 9300, ease: "linear" },
            tweens: [
              {
                delayMs: 5600, durationMs: 3000,
                channels: [
                  { channel: "dx", keys: [{ tMs: 0, value: 0 }, { tMs: 3000, value: 18, ease: "ease-out" }] },
                ],
              },
            ],
          },
        ],
      },
      {
        // The MOTION-GRAPHICS program — shapes orbit, a callout pins the law,
        // the camera rides the zoom ceiling's edge (the bound's own receipt).
        id: "scene-3",
        narration: "Declarative motion, deterministic frames, zero spend.",
        durationMs: 10_000,
        background: "#101418",
        camera: [
          { tMs: 0, zoom: 1, tx: 0, ty: 0 },
          { tMs: 3000, zoom: 2.2, tx: 120, ty: -80, ease: "ease-in-out" },
          { tMs: 6000, zoom: 4, tx: -140, ty: 90, ease: "ease-in-out" },
          { tMs: 9000, zoom: 1, tx: 0, ty: 0, ease: "ease-in-out" },
        ],
        events: [
          { tMs: 3000, kind: "cue", label: "orbit apex" },
          { tMs: 6000, kind: "hit", label: "zoom ceiling" },
          { tMs: 9200, kind: "sfx", label: "close tail" },
        ],
        elements: [
          {
            id: "h3",
            kind: "headline",
            at: { x: 960, y: 300, scale: 1, rotateDeg: 0 },
            text: { text: "Motion as data", sizePx: 68, weight: 800, color: "#eef2f6", align: "center" },
            enter: { kind: "pop", durationMs: 550, delayMs: 0, ease: "ease-back" },
            exit: { kind: "fade", durationMs: 400, delayMs: 9400, ease: "linear" },
            tweens: [
              {
                delayMs: 1500, durationMs: 6000,
                channels: [
                  { channel: "scale", keys: [{ tMs: 0, value: 1 }, { tMs: 3000, value: 1.12, ease: "ease-in-out" }, { tMs: 6000, value: 1, ease: "ease-in-out" }] },
                ],
              },
            ],
          },
          {
            id: "sq3",
            kind: "shape",
            at: { x: 700, y: 620, scale: 1, rotateDeg: 0 },
            shape: { kind: "rect", w: 180, h: 180, stroke: "#7fd1c0", fill: "none", strokeWidth: 4 },
            enter: { kind: "wipe", durationMs: 700, delayMs: 900, ease: "ease-out" },
            tweens: [
              {
                delayMs: 2200, durationMs: 5000,
                channels: [
                  { channel: "dx", keys: [{ tMs: 0, value: 0 }, { tMs: 2500, value: 220, ease: "ease-in-out" }, { tMs: 5000, value: 0, ease: "ease-in-out" }] },
                  { channel: "dy", keys: [{ tMs: 0, value: 0 }, { tMs: 2500, value: -110, ease: "ease-in-out" }, { tMs: 5000, value: 0, ease: "ease-in-out" }] },
                  { channel: "rotateDeg", keys: [{ tMs: 0, value: 0 }, { tMs: 5000, value: 90, ease: "ease-in-out" }] },
                ],
              },
            ],
          },
          {
            id: "ci3",
            kind: "shape",
            at: { x: 1220, y: 640, scale: 1, rotateDeg: 0 },
            shape: { kind: "circle", r: 90, stroke: "#e0b64f", fill: "none", strokeWidth: 4 },
            enter: { kind: "grow", durationMs: 700, delayMs: 1500, ease: "ease-out" },
            tweens: [
              {
                delayMs: 2600, durationMs: 5000,
                channels: [
                  { channel: "dx", keys: [{ tMs: 0, value: 0 }, { tMs: 2500, value: -220, ease: "ease-in-out" }, { tMs: 5000, value: 0, ease: "ease-in-out" }] },
                  { channel: "opacity", keys: [{ tMs: 0, value: 1 }, { tMs: 2500, value: 0.7, ease: "ease-in-out" }, { tMs: 5000, value: 1, ease: "ease-in-out" }] },
                ],
              },
            ],
          },
          {
            id: "co3",
            kind: "callout",
            at: { x: 960, y: 880, scale: 1, rotateDeg: 0 },
            callout: { text: "the doc clock IS the timeline", pointsAt: { x: 960, y: 700 } },
            enter: { kind: "pop", durationMs: 500, delayMs: 4600, ease: "ease-back" },
            exit: { kind: "fade", durationMs: 350, delayMs: 9250, ease: "linear" },
          },
        ],
      },
    ],
  };
  const r = validateGraphicsDoc(raw);
  if (!r.doc) {
    throw new Error(`the benchmark doc must validate — ${JSON.stringify(r.errors ?? r, null, 1).slice(0, 2000)}`);
  }
  return r.doc;
}

/** The byte-identity baseline arm: the SAME doc with every PAE directive
 *  stripped (tweens / camera / events deleted) — the pre-PAE engine's
 *  workload, rendered in the same session on the same rig. */
function strippedDoc(doc: GraphicsDoc): GraphicsDoc {
  const clone = JSON.parse(JSON.stringify(doc)) as GraphicsDoc;
  for (const scene of clone.scenes) {
    delete scene.camera;
    delete scene.events;
    for (const el of scene.elements) delete el.tweens;
  }
  const r = validateGraphicsDoc(clone);
  if (!r.doc) throw new Error("the stripped twin must validate");
  return r.doc;
}

// ---------------------------------------------------------------------------
// The 3D fixture — keyed objects on the normalized clock (the S134 adapter):
// one position-only track, one rotation+scale track, one STATIC object (the
// byte-identity path — objectAt must reproduce the static fields exactly).
// ---------------------------------------------------------------------------

function benchmarkObjects(): Scene3DObject[] {
  return [
    {
      id: "orbiter",
      kind: "box" as const,
      material: { color: "#7fd1c0" },
      position: [0, 0, 0],
      keyframes: [
        { t: 0, position: [-3, 0.5, -2] },
        { t: 0.5, position: [0, 1.5, 0] },
        { t: 1, position: [3, 0.5, -2] },
      ],
    },
    {
      id: "spinner",
      kind: "sphere" as const,
      material: { color: "#e0b64f", metalness: 0.4, roughness: 0.3 },
      position: [2, 0, 1],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      keyframes: [
        { t: 0, rotation: [0, 0, 0], scale: [1, 1, 1] },
        { t: 0.4, rotation: [0, 180, 0], scale: [1.4, 1.4, 1.4] },
        { t: 1, rotation: [0, 360, 0], scale: [1, 1, 1] },
      ],
    },
    {
      id: "static-witness",
      kind: "plane" as const,
      material: { color: "#8899aa", opacity: 1 },
      position: [-2, 0, 1],
      rotation: [0, 45, 0],
      scale: [1, 1, 1],
    },
  ];
}

// ---------------------------------------------------------------------------
// The measurement helpers
// ---------------------------------------------------------------------------

const shaFile = (file: string): string =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

const execFileP = promisify(execFile);

/** The decoded-video-stream digest — ffmpeg decodes the scene MP4 and md5s
 *  the raw frames: pixel-level determinism, independent of container
 *  metadata (the frame-series law, measured on what a COMPLETED render
 *  leaves — the renderer deletes its frame dirs after encode). */
async function streamSha(file: string): Promise<string> {
  const res = await execFileP("ffmpeg", ["-nostdin", "-i", file, "-map", "0:v", "-f", "md5", "-"], { maxBuffer: 8 * 1024 * 1024 });
  const m = /MD5=([0-9a-f]+)/.exec(res.stdout);
  if (!m) throw new Error(`streamSha: ffmpeg printed no MD5 for ${file}`);
  return m[1];
}

function resultSceneFiles(
  scenes: { sceneId: string; file: string }[],
): { sceneId: string; file: string; bytes: number }[] {
  return scenes
    .filter((s) => fs.existsSync(s.file))
    .map((s) => ({ sceneId: s.sceneId, file: s.file, bytes: fs.statSync(s.file).size }));
}

function statsOf(samplesUs: number[]): SceneStat {
  const sorted = [...samplesUs].sort((a, b) => a - b);
  const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  const mean = samplesUs.reduce((a, b) => a + b, 0) / Math.max(samplesUs.length, 1);
  return { mean, p50: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1] ?? 0, samples: samplesUs.length };
}

function readState(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeState(state: Record<string, unknown>): void {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
}

let passed = 0;
let failed = 0;
function ok(cond: unknown, msg: string): asserts cond {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Phase: sweep — (a) the frame-at cost + objectAt cost, the pure
// determinism receipts, and (e) the readcheck report
// ---------------------------------------------------------------------------

function runSweep(): void {
  console.log("[s145] phase sweep — frame-at cost, objectAt cost, pure lenses\n");
  const doc = benchmarkDoc();
  const totalMs = doc.scenes.reduce((a, s) => a + (s.durationMs ?? 0), 0);

  // Locate each scene's global-clock window the same way the engine does
  // (the doc clock IS the timeline — scenes are contiguous).
  const windows: { id: string; from: number; to: number }[] = [];
  let cursor = 0;
  for (const s of doc.scenes) {
    const ms = s.durationMs ?? 0;
    windows.push({ id: s.id, from: cursor, to: cursor + ms });
    cursor += ms;
  }

  const perScene: Record<string, SceneStat> = {};
  const SAMPLES = 600;
  const WARMUP = 60;
  for (const w of windows) {
    for (let i = 0; i < WARMUP; i++) frameAt(doc, w.from + ((w.to - w.from) * i) / WARMUP);
    const samples: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const t = w.from + ((w.to - w.from) * i) / SAMPLES;
      const t0 = performance.now();
      frameAt(doc, t);
      samples.push((performance.now() - t0) * 1000);
    }
    perScene[w.id] = statsOf(samples);
    const st = perScene[w.id];
    console.log(`  ${w.id}: ${st.samples} evals — mean ${st.mean.toFixed(1)}µs, p50 ${st.p50.toFixed(1)}µs, p95 ${st.p95.toFixed(1)}µs, max ${st.max.toFixed(1)}µs`);
  }
  ok(Object.keys(perScene).length === 3, `the sweep covered all 3 scenes (${totalMs} ms doc clock)`);

  // G1-DET-1 — the pure determinism sweep rides the same phase (cheap, and
  // it is the lens the render-level receipt will echo).
  const det = graphicsDeterminismSweep(doc);
  ok(det.finite, `the G1-DET-1 sweep double-runs equal and never-NaN (${det.hash.slice(0, 12)}…, ${det.samples} samples)`);

  // The 3D adapter — objectAt across the normalized clock, twice; the cost
  // AND the determinism receipt (state-JSON hash equality across passes).
  const objects = benchmarkObjects();
  let firstStat: SceneStat | null = null;
  let firstHash: string | null = null;
  for (let pass = 0; pass < 2; pass++) {
    const samples: number[] = [];
    const states: string[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const t = i / SAMPLES;
      const t0 = performance.now();
      const frame = objects.map((o) => objectAt(o, t));
      samples.push((performance.now() - t0) * 1000);
      states.push(JSON.stringify(frame));
    }
    if (pass === 0) {
      firstStat = statsOf(samples);
      firstHash = crypto.createHash("sha256").update(states.join("\n")).digest("hex");
      console.log(`  objectAt (3 objects, keyed + static): mean ${firstStat.mean.toFixed(1)}µs, p95 ${firstStat.p95.toFixed(1)}µs, max ${firstStat.max.toFixed(1)}µs`);
    } else {
      const hash = crypto.createHash("sha256").update(states.join("\n")).digest("hex");
      const objDet = firstHash === hash;
      ok(objDet, "the objectAt double-pass is state-identical (the 3D determinism receipt)");
      // The static witness must hold its authored fields EXACTLY at every t
      // (the S134 byte-identity path).
      let staticHold = true;
      for (let i = 0; i <= 20; i++) {
        const s = objectAt(objects[2], i / 20);
        if (s.position[0] !== -2 || s.rotation?.[1] !== 45 || s.scale?.[0] !== 1) staticHold = false;
      }
      ok(staticHold, "the static witness object holds its authored fields at every t (no phantom keys)");

      // G1-READ-1 — the readcheck report: the lens reports VIOLATIONS only;
      // the descriptive table below mirrors its window math for the receipt.
      const rc = graphicsReadcheck(doc);
      const violations = rc.map((f) => `${f.elementId} (${f.chars} chars, visible ${f.visibleMs} ms < min ${f.minMs} ms)`);
      ok(violations.length === 0, violations.length === 0 ? "the readcheck lens reports ZERO violations across every on-screen text" : `readcheck violations: ${violations.join("; ")}`);
      const rows = doc.scenes.flatMap((scene) =>
        scene.elements
          .map((el) => ({ el, s: el.text?.text ?? el.callout?.text ?? "" }))
          .filter(({ s }) => s.length > 0)
          .map(({ el, s }) => {
            const enterEnd = el.enter.delayMs + el.enter.durationMs;
            const exitStart = el.exit !== undefined ? el.exit.delayMs : (scene.durationMs ?? 0);
            return { id: el.id, chars: s.length, minMs: readcheckMinMs(s.length), visibleMs: Math.max(0, exitStart - enterEnd) };
          }),
      );
      console.log(`\n  the readcheck table (${rows.length} on-screen texts):`);
      for (const r of rows) {
        console.log(`    ${r.id}: ${r.chars} chars → min ${r.minMs} ms, visible ${r.visibleMs} ms`);
      }

      writeState({
        ...readState(),
        sweep: {
          perScene,
          objectAt: firstStat,
          objectAtDeterminism: objDet,
          detSweepHash: det.hash,
          detSweepFinite: det.finite,
          readcheckRows: rows,
          readcheckViolations: violations,
        } satisfies SweepState,
      } as Record<string, unknown>);
    }
  }

  if (failed > 0) {
    console.error(`\n[s145] sweep: ${failed} FAILED assertion(s)`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Phase: full1 / full2 / baseline — the production renders (b + c)
// ---------------------------------------------------------------------------

async function runRender(name: "full1" | "full2" | "baseline"): Promise<void> {
  console.log(`[s145] phase ${name} — the production render\n`);
  const doc = name === "baseline" ? strippedDoc(benchmarkDoc()) : benchmarkDoc();
  const outDir = path.join(STATE_DIR, name);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const t0 = performance.now();
  let lastPrinted = -1;
  const result = await renderGraphics(doc, {
    outDir,
    onProgress: (_label, fraction) => {
      const pct = Math.floor(fraction * 4) * 25;
      if (pct > lastPrinted) {
        lastPrinted = pct;
        process.stdout.write(`    ${name}: ${pct}%\n`);
      }
    },
  });
  const wallMs = performance.now() - t0;

  const files = resultSceneFiles(result.scenes);
  const scenes: RenderState["scenes"] = [];
  for (const f of files) {
    const rendered = result.scenes.find((r) => r.sceneId === f.sceneId);
    scenes.push({
      sceneId: f.sceneId,
      frames: rendered?.frames ?? 0,
      file: f.file,
      bytes: f.bytes,
      streamSha: await streamSha(f.file),
      byteSha: shaFile(f.file),
    });
  }
  ok(fs.existsSync(result.file), `${name}: the final assembly exists (${path.basename(result.file)})`);
  ok(scenes.length === 3, `${name}: ${scenes.length} scene files + decoded-stream digests`);
  ok(scenes.every((s) => s.frames > 0), `${name}: every scene reports a delivered frame count`);
  console.log(`  ${name}: wall ${(wallMs / 1000).toFixed(1)}s — ${scenes.map((s) => `${s.sceneId} ${s.frames}f`).join(", ")}`);

  const state = readState() as Record<string, RenderState | unknown>;
  state[name] = { wallMs, scenes, file: result.file, fileBytes: fs.statSync(result.file).size } satisfies RenderState;
  writeState(state);

  if (failed > 0) {
    console.error(`\n[s145] ${name}: ${failed} FAILED assertion(s)`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Phase: resume — (d) the kill-mid-program drill through the S132 seam
// ---------------------------------------------------------------------------

async function runResumeDrill(): Promise<void> {
  console.log("[s145] phase resume — the kill-mid-program drill\n");
  const doc = benchmarkDoc();
  const drillDir = path.join(STATE_DIR, "drill");
  fs.rmSync(drillDir, { recursive: true, force: true });
  fs.mkdirSync(drillDir, { recursive: true });

  // The child renders the full program; the parent kills it once scene 1 is
  // encoded AND scene 2's frames are landing (mid-program, a real crash).
  const child = spawn("node", ["--import", "tsx", import.meta.url.slice(7), "--child", drillDir], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", () => {});
  child.stderr.on("data", (d: Buffer) => process.stderr.write(`    [child] ${d.toString().slice(-200)}`));

  const deadline = Date.now() + 8 * 60_000;
  let killedAtScene = 0;
  let manifestAfterKill = false;
  let lastPollLog = 0;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    const manifest = readRenderManifest(drillDir);
    const encoded = manifest?.scenes.filter((s) => s.status === "encoded").length ?? -1;
    const scene2FrameCount = fs.existsSync(path.join(drillDir, "scene-2-frames"))
      ? fs.readdirSync(path.join(drillDir, "scene-2-frames")).length : -1;
    if (Date.now() - lastPollLog > 6000) {
      lastPollLog = Date.now();
      console.log(`    [poll] encoded=${encoded} scene2Frames=${scene2FrameCount} childAlive=${child.exitCode === null && child.signalCode === null}`);
    }
    if (manifest && encoded >= 1 && scene2FrameCount > 2) {
      console.log(`    [poll] kill window hit — encoded=${encoded}, scene-2 frames landing (${scene2FrameCount})`);
      child.kill("SIGKILL");
      await new Promise((r) => setTimeout(r, 1500));
      killedAtScene = 2;
      manifestAfterKill = readRenderManifest(drillDir) !== null;
      break;
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      console.log(`    [poll] child exited on its own (exitCode=${child.exitCode}, signal=${child.signalCode}) — the drill missed the window`);
      break;
    }
  }
  if (child.exitCode === null && killedAtScene === 0) {
    child.kill("SIGKILL");
    await new Promise((r) => setTimeout(r, 1500));
  }
  ok(killedAtScene === 2, `the child was SIGKILLed mid-program (after scene 1 encoded, during scene 2's frames)`);
  ok(manifestAfterKill, "the render manifest survived the kill (the crash record is on disk)");
  const encodedAfterKill = readRenderManifest(drillDir)?.scenes.filter((s) => s.status === "encoded").length ?? 0;
  ok(encodedAfterKill >= 1, `the manifest records ${encodedAfterKill} encoded scene(s) — the resumable truth`);

  // Resume: the S132 seam — the fingerprint matches (same doc, same inputs),
  // scene 1 is reused, scenes 2–3 re-render, the assembly completes, the
  // manifest is deleted (a COMPLETED render has no manifest).
  const t0 = performance.now();
  const result = await renderGraphics(doc, { outDir: drillDir, resume: true });
  const resumeWallMs = performance.now() - t0;
  ok(fs.existsSync(result.file), `the resumed assembly exists (${path.basename(result.file)})`);
  ok(readRenderManifest(drillDir) === null, "the manifest was deleted on completion (resume applies only to an INTERRUPTED run)");

  // The byte-compare laws, against the full1 control:
  const full1 = (readState() as { full1?: RenderState }).full1;
  ok(full1 !== undefined, "the full1 control state exists (run the full1 phase first)");
  if (!full1) process.exit(1);

  const drillScenes = resultSceneFiles(result.scenes);
  const controlScene1 = full1.scenes.find((s) => s.sceneId === "scene-1");
  const drillScene1 = drillScenes.find((s) => s.sceneId === "scene-1");
  const reusedByteEqual = controlScene1 !== undefined && drillScene1 !== undefined
    && shaFile(controlScene1.file) === shaFile(drillScene1.file);
  ok(reusedByteEqual, "the RESUMED scene's file byte-compares against the control (the reuse is honest)");

  let reRenderedStreamMatch = true;
  for (const sid of ["scene-2", "scene-3"]) {
    const control = full1.scenes.find((s) => s.sceneId === sid);
    const drill = drillScenes.find((s) => s.sceneId === sid);
    if (!control || !drill) { reRenderedStreamMatch = false; continue; }
    const drillSha = await streamSha(drill.file);
    if (control.streamSha !== drillSha) reRenderedStreamMatch = false;
  }
  ok(reRenderedStreamMatch, "the RE-RENDERED scenes' decoded streams match the control (determinism ⇒ resume ships the same pixels)");

  const sceneMp4ByteEqual = full1.scenes.every((c) => {
    const d = drillScenes.find((s) => s.sceneId === c.sceneId);
    return d !== undefined && shaFile(c.file) === shaFile(d.file);
  });
  console.log(`  note: all three scene MP4s byte-equal: ${sceneMp4ByteEqual} (container metadata may drift; the frame series is the law)`);

  const state = readState() as Record<string, unknown>;
  state.resume = {
    killedAtScene,
    manifestAfterKill,
    resumedScenes: ["scene-1"],
    reRenderedScenes: ["scene-2", "scene-3"],
    manifestDeletedAfterCompletion: readRenderManifest(drillDir) === null,
    reusedSceneByteEqual: reusedByteEqual,
    reRenderedStreamMatch,
    sceneMp4ByteEqual,
    resumeWallMs,
  } satisfies DrillState;
  writeState(state);

  if (failed > 0) {
    console.error(`\n[s145] resume: ${failed} FAILED assertion(s)`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Phase: report — assemble the receipt from the recorded state
// ---------------------------------------------------------------------------

function runReport(): void {
  console.log("[s145] phase report — assembling the receipt\n");
  const state = readState() as {
    sweep?: SweepState;
    full1?: RenderState;
    full2?: RenderState;
    baseline?: RenderState;
    resume?: DrillState;
  };
  const missing = (["sweep", "full1", "full2", "baseline", "resume"] as const).filter((k) => !state[k]);
  ok(missing.length === 0, missing.length === 0 ? "all five phases recorded" : `MISSING phases: ${missing.join(", ")}`);
  if (missing.length > 0) process.exit(1);

  const sweep = state.sweep as SweepState;
  const full1 = state.full1 as RenderState;
  const full2 = state.full2 as RenderState;
  const baseline = state.baseline as RenderState;
  const resume = state.resume as DrillState;

  // (c) — determinism across the two independent full renders, measured on
  // the DECODED streams (the container may carry metadata; the pixels are
  // the law).
  const det = full1.scenes.every((s) => {
    const other = full2.scenes.find((o) => o.sceneId === s.sceneId);
    return other !== undefined && other.streamSha === s.streamSha;
  });
  ok(det, "(c) determinism: both full renders' decoded video streams md5-equal per scene");

  // (b) — the wall-time A/B.
  const fullMean = (full1.wallMs + full2.wallMs) / 2;
  const deltaMs = fullMean - baseline.wallMs;
  const deltaPct = (deltaMs / baseline.wallMs) * 100;
  ok(full1.wallMs > 0 && baseline.wallMs > 0, `(b) wall time: full ${(fullMean / 1000).toFixed(1)}s (n=2) vs baseline ${(baseline.wallMs / 1000).toFixed(1)}s → PAE directives cost ${deltaMs >= 0 ? "+" : ""}${(deltaMs / 1000).toFixed(1)}s (${deltaPct.toFixed(1)}%)`);

  const sceneRows = full1.scenes.map((s) => {
    const st = sweep.perScene[s.sceneId];
    return `    ${s.sceneId}: ${s.frames} frames — frameAt mean ${st.mean.toFixed(1)}µs / p95 ${st.p95.toFixed(1)}µs / max ${st.max.toFixed(1)}µs`;
  }).join("\n");

  const rcRows = sweep.readcheckRows.map((f) =>
    `    ${f.id}: ${f.chars} chars → min ${f.minMs} ms, visible ${f.visibleMs} ms`,
  ).join("\n");

  const receipt = `PAE Phase 3 — production benchmarks (S145)
Generated: ${new Date().toISOString()}
Harness: scripts/s145-pae-phase3-benchmark.mts (the spec §6 program)
Doc: the fixed 3-scene benchmark doc (~30 s @ 24 fps, 1920×1080) —
     scene-1 historical, scene-2 educational, scene-3 motion-graphics;
     every directive kind exercised (6 tween channels, camera keys,
     sfx/hit/cue events) + the 3D keyed-object fixture (S134 adapter).
Note: no historical S128 baseline receipt exists in docs/baselines/ —
     the (b) comparison is the SAME-SESSION A/B (the stripped twin: the
     identical doc with tweens/camera/events deleted), same rig.

(a) frame-at evaluation cost (600 samples/scene, 60-sample warmup)
${sceneRows}
    objectAt (3 objects, keyed + static): mean ${sweep.objectAt.mean.toFixed(1)}µs / p95 ${sweep.objectAt.p95.toFixed(1)}µs / max ${sweep.objectAt.max.toFixed(1)}µs
    objectAt double-pass state-identical: ${sweep.objectAtDeterminism}
    static witness holds authored fields at every t: true

(b) full-render wall time (production engine, VO-less estimator clock)
    full doc  ×2: ${(full1.wallMs / 1000).toFixed(1)}s, ${(full2.wallMs / 1000).toFixed(1)}s (mean ${(fullMean / 1000).toFixed(1)}s)
    stripped  ×1: ${(baseline.wallMs / 1000).toFixed(1)}s
    PAE directive overhead: ${deltaMs >= 0 ? "+" : ""}${(deltaMs / 1000).toFixed(1)}s (${deltaPct.toFixed(1)}% of baseline)

(c) determinism (two independent full renders)
    decoded video streams md5-equal per scene: ${det}
    G1-DET-1 pure sweep double-run equal: ${sweep.detSweepFinite}

(d) the resume drill (S132 seam, SIGKILL mid-program)
    killed after scene-1 encoded, during scene-2 frames: ${resume.killedAtScene === 2}
    manifest survived the kill: ${resume.manifestAfterKill}
    resumed: scene-1 reused (byte-equal to control: ${resume.reusedSceneByteEqual})
    re-rendered: scene-2, scene-3 (decoded streams match control: ${resume.reRenderedStreamMatch})
    manifest deleted on completion: ${resume.manifestDeletedAfterCompletion}
    all scene MP4s byte-equal (container metadata may drift): ${resume.sceneMp4ByteEqual}
    resume wall time: ${(resume.resumeWallMs / 1000).toFixed(1)}s

(e) the G1-READ-1 readcheck report (every on-screen text; violations: ${sweep.readcheckViolations.length === 0 ? "NONE" : sweep.readcheckViolations.join("; ")})
${rcRows}

Verdict: the PAE directive vocabulary costs ${deltaPct.toFixed(1)}% wall time,
evaluates in single-digit µs per frame, renders deterministically, resumes
honestly, and every on-screen text passes its read window.
`;

  const receiptPath = path.join(REPO_ROOT, "docs", "baselines", `pae-phase3-${new Date().toISOString().slice(0, 10)}.txt`);
  fs.writeFileSync(receiptPath, receipt);
  console.log(receipt);
  console.log(`[s145] receipt → ${path.relative(REPO_ROOT, receiptPath)}`);
  ok(failed === 0, `the receipt assembled green (the report phase's ${passed} assertion(s) on the recorded state)`);
  if (failed > 0) process.exit(1);
}

// ---------------------------------------------------------------------------
// The child mode + the dispatcher
// ---------------------------------------------------------------------------

async function runChild(): Promise<void> {
  const doc = benchmarkDoc();
  await renderGraphics(doc, { outDir: CHILD_OUT });
}

async function main(): Promise<void> {
  if (CHILD_MODE) {
    await runChild();
    return;
  }
  switch (phase) {
    case "sweep":
      runSweep();
      break;
    case "full1":
    case "full2":
    case "baseline":
      await runRender(phase);
      break;
    case "resume":
      await runResumeDrill();
      break;
    case "report":
      runReport();
      break;
    default:
      console.error("usage: s145-pae-phase3-benchmark.mts <sweep|full1|full2|baseline|resume|report> [--child <outDir>]");
      process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

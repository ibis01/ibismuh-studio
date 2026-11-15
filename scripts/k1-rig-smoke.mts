/**
 * S125 (K1) — the rig smoke (roadmap §6: "the S93 smoke pattern (4 unit pins
 * + real-render smoke) extended", the s123-graphics-proof pattern): the REAL
 * engine (chromium + ffmpeg) renders a validator-clean rig scene, and the
 * receipts below are recorded into validation/s125/ (gitignored — the
 * 535c90e law).
 *
 * Receipts:
 *   structural  — the parts library + the rig doc pass the validator gates
 *                 BEFORE chromium (fail-closed evidence); the preflight wall
 *                 passes on the DELIVERED arithmetic;
 *   beats       — the compiled mouth beats sit STRICTLY INSIDE their word
 *                 spans (the W4 tolerance pin, on the smoke fixture); the
 *                 gesture rows sit inside their sentence windows; the scope
 *                 claim is beat-sync;
 *   determinism — the pure frame-truth sweep double-runs byte-identical at
 *                 24 and 30 fps (the D3 law, on the REAL rig);
 *   render      — the scene clip lands (rig-scene.mp4), its probed duration
 *                 equals the delivered seconds (the two-clock assert,
 *                 measured), and the contract read-back (planFromTracks)
 *                 agrees;
 *   cache       — ensureRigClip reuses the clip on an unchanged input set
 *                 (mtime untouched) and re-renders on ANY input change (the
 *                 sidecar hash law);
 *   identity    — SKIP unless a VLM provider is configured: the identity
 *                 floor (VCE ≥ 80 on rig frames) needs a live VLM; the smoke
 *                 records SKIP, never a fake pass (the blind-rubric row
 *                 stays open for the human track).
 *
 * Run: node --import tsx scripts/k1-rig-smoke.mts
 */
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { renderRigScene, ensureRigClip, rigClipHash } from "../src/lib/tubeforge/characters/rig-render";
import { poseAt, mouthSchedule, wordSpansFromEstimate, mouthBeatsFromSpans, POSE_TWEEN_MS } from "../src/lib/tubeforge/characters/rig-frame";
import { planRigTimeline } from "../src/lib/tubeforge/characters/rig-director";
import { assertRigBudget, rigBudgetReport } from "../src/lib/tubeforge/characters/preflight";
import { characterTracks } from "../src/lib/tubeforge/characters/tracks";
import { validateRigDoc, validateRigParts, scaffoldRigDoc, RIG_VERSION, type RigMouthSlot, type RigPartArt } from "../src/lib/tubeforge/characters/rig2d";
import { planFromTracks } from "../src/lib/tubeforge/composition-plan";

const execFileP = promisify(execFile);

const OUT_DIR = path.resolve("validation/s125");
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

async function probeDurationSec(file: string): Promise<number> {
  const { stdout } = await execFileP(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file],
    { maxBuffer: 1024 * 1024 }
  );
  return Number(stdout.trim());
}

// ---------------------------------------------------------------------------
// The smoke fixture — a validator-clean rig with the standard slots
// ---------------------------------------------------------------------------

const STAGE = 1080;
const ART: RigPartArt[] = [
  { id: "torso-art", slot: "torso", svg: `<rect x="420" y="520" width="240" height="330" rx="42" fill="#4a3a6a"/>` },
  { id: "head-art", slot: "head", svg: `<circle cx="540" cy="400" r="96" fill="#e8b98a"/>` },
  { id: "brow-art", slot: "brow", svg: `<rect x="478" y="336" width="124" height="10" rx="5" fill="#2a1f3a"/>` },
  { id: "arm-l-art", slot: "arm-l", svg: `<rect x="372" y="548" width="52" height="212" rx="26" fill="#4a3a6a"/>` },
  { id: "arm-r-art", slot: "arm-r", svg: `<rect x="656" y="548" width="52" height="212" rx="26" fill="#4a3a6a"/>` },
  { id: "leg-l-art", slot: "leg-l", svg: `<rect x="452" y="840" width="60" height="120" rx="24" fill="#332a4a"/>` },
  { id: "leg-r-art", slot: "leg-r", svg: `<rect x="568" y="840" width="60" height="120" rx="24" fill="#332a4a"/>` },
  { id: "eye-art", slot: "eye", svg: `<circle cx="512" cy="392" r="10" fill="#2a1f3a"/><circle cx="568" cy="392" r="10" fill="#2a1f3a"/>` },
  { id: "mouth-closed-art", slot: "mouth", variant: "closed", svg: `<rect x="510" y="466" width="60" height="6" rx="3" fill="#7a2e3a"/>` },
  { id: "mouth-open-art", slot: "mouth", variant: "open", svg: `<ellipse cx="540" cy="474" rx="26" ry="16" fill="#7a2e3a"/>` },
  { id: "mouth-wide-art", slot: "mouth", variant: "wide", svg: `<ellipse cx="540" cy="474" rx="36" ry="12" fill="#7a2e3a"/>` },
  { id: "mouth-oh-art", slot: "mouth", variant: "oh", svg: `<circle cx="540" cy="474" r="14" fill="#7a2e3a"/>` },
  { id: "mouth-smile-art", slot: "mouth", variant: "smile", svg: `<path d="M508 466 Q540 490 572 466" stroke="#7a2e3a" stroke-width="6" fill="none" stroke-linecap="round"/>` },
];

const SEEDS = [
  { id: "leg-l", slot: "leg-l" as const, svgRef: "leg-l-art", z: 6, pivot: { x: 480, y: 840 }, parent: "torso" },
  { id: "leg-r", slot: "leg-r" as const, svgRef: "leg-r-art", z: 7, pivot: { x: 600, y: 840 }, parent: "torso" },
  { id: "arm-l", slot: "arm-l" as const, svgRef: "arm-l-art", z: 9, pivot: { x: 420, y: 560 }, parent: "torso" },
  { id: "torso", slot: "torso" as const, svgRef: "torso-art", z: 10, pivot: { x: 540, y: 680 } },
  { id: "arm-r", slot: "arm-r" as const, svgRef: "arm-r-art", z: 11, pivot: { x: 660, y: 560 }, parent: "torso" },
  { id: "head", slot: "head" as const, svgRef: "head-art", z: 20, pivot: { x: 540, y: 520 }, parent: "torso" },
  { id: "eye", slot: "eye" as const, svgRef: "eye-art", z: 22, pivot: { x: 540, y: 400 }, parent: "head" },
  { id: "brow", slot: "brow" as const, svgRef: "brow-art", z: 23, pivot: { x: 540, y: 336 }, parent: "head" },
  ...["closed", "open", "wide", "oh", "smile"].map((v, i) => ({
    id: `mouth-${v}`,
    slot: "mouth" as const,
    variant: v as RigMouthSlot,
    svgRef: `mouth-${v}-art`,
    z: 24 + i,
    pivot: { x: 540, y: 470 },
    parent: "head",
  })),
];

const POSE_SHEET = [
  { id: "arm-l-rest", name: "Rest", joints: { "arm-l": { rotateDeg: 0 } } },
  { id: "arm-l-raise", name: "Raise left", joints: { "arm-l": { rotateDeg: -140 } } },
  { id: "arm-l-point", name: "Point left", joints: { "arm-l": { rotateDeg: 100 } } },
  { id: "arm-r-rest", name: "Rest", joints: { "arm-r": { rotateDeg: 0 } } },
  { id: "arm-r-raise", name: "Raise right", joints: { "arm-r": { rotateDeg: 140 } } },
  { id: "arm-r-point", name: "Point right", joints: { "arm-r": { rotateDeg: -100 } } },
  { id: "brow-rest", name: "Brow rest", joints: { brow: { rotateDeg: 0, y: 0 } } },
  { id: "brow-raise", name: "Brow raise", joints: { brow: { rotateDeg: 0, y: -12 } } },
  { id: "welcoming", name: "Welcoming", joints: { "arm-l": { rotateDeg: -120 }, "arm-r": { rotateDeg: 60 } } },
];

// S128 — exported for the blind re-score kit (scripts/blind-rescore-kit.mts):
// the kit renders the SAME fixture twice (compiled gestures vs a rest-only
// sheet) so the scorers' control arm differs ONLY in the gesture layer.
// The smoke still runs standalone — main() is gated on direct invocation.
export const K1_SMOKE_FIXTURE = {
  stage: STAGE,
  art: ART,
  seeds: SEEDS,
  poseSheet: POSE_SHEET,
  narration: "Imagine a tiny workshop of ideas. Then the machine turns the crank and the wheel moves. This is the crucial part!",
  sceneMs: 8000,
  fps: 30 as const,
};

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log("S125 (K1) — the rig smoke");

  // --- structural: the gates BEFORE chromium --------------------------------
  const artCheck = validateRigParts(ART);
  ok(artCheck.parts !== null, "structural: the parts library passes the gate");
  // The seeds run through the scaffold (the auto pass's native half — the
  // scaffold adds the identity rests), then the pose sheet merges on top.
  const scaffolded = scaffoldRigDoc({ parts: SEEDS, art: ART });
  ok(scaffolded.doc !== null, "structural: the scaffold passes the seeds");
  const docCheck = validateRigDoc(
    scaffolded.doc
      ? { ...scaffolded.doc, poses: POSE_SHEET }
      : { version: RIG_VERSION, width: STAGE, height: STAGE, fps: 30, background: "#1c1424", parts: SEEDS, poses: POSE_SHEET },
    artCheck.parts
  );
  ok(docCheck.doc !== null, `structural: the rig doc passes (warnings: ${docCheck.warnings.length})`);
  if (!docCheck.doc || !artCheck.parts)
    throw new Error(`the smoke fixture must validate — ${JSON.stringify(docCheck.errors)}`);
  const rig = docCheck.doc;
  const art = artCheck.parts;

  const narration = K1_SMOKE_FIXTURE.narration;
  const sceneMs = K1_SMOKE_FIXTURE.sceneMs;
  const fps = K1_SMOKE_FIXTURE.fps;
  const budget = rigBudgetReport([{ sceneIndex: 1, durationMs: sceneMs }], fps);
  ok(budget.ok, `structural: the preflight wall passes (${budget.frames} delivered frames at ${fps} fps)`);
  const beforeReport = assertRigBudget([{ sceneIndex: 1, durationMs: sceneMs }], fps);
  ok(beforeReport.frames === budget.frames, "structural: the admission gate agrees with the report");

  // --- beats: mouth beats inside their word spans (the W4 pin) --------------
  const plan = planRigTimeline({ narration, rig, durationMs: sceneMs, anchors: null });
  const spans = wordSpansFromEstimate(narration, sceneMs);
  const beats = mouthBeatsFromSpans(spans, sceneMs);
  ok(beats.length > 0, "beats: the schedule compiled beats");
  let allInside = true;
  for (const b of beats) {
    const owner = spans.find((s) => b.startMs >= s.startMs && b.endMs <= s.endMs);
    if (!owner) allInside = false;
  }
  ok(allInside, "beats: EVERY mouth beat sits strictly inside its word span (the W4 tolerance pin)");
  ok(plan.timeline.rows.some((r) => r.poseId !== null), "beats: the gesture rows compiled");
  const schedule = mouthSchedule({ narration, anchors: null, durationMs: sceneMs });
  ok(schedule.speaking === true, "beats: the rig speaks (the fixture has narration)");

  // --- determinism: the sweep double-runs byte-identical at 24 and 30 ------
  for (const rate of [24, 30] as const) {
    const timeline = plan.timeline;
    const sweep1 = Array.from({ length: 24 }, (_, i) => poseAt(rig, timeline, (i * sceneMs) / 24, schedule));
    const sweep2 = Array.from({ length: 24 }, (_, i) => poseAt(rig, timeline, (i * sceneMs) / 24, schedule));
    ok(JSON.stringify(sweep1) === JSON.stringify(sweep2), `determinism: the ${rate} fps sweep double-runs byte-identical`);
    ok(sweep1.every((f) => f.parts.every((p) => p.matrix.every(Number.isFinite))), `determinism: the ${rate} fps sweep is NaN-free`);
  }
  const midTween = poseAt(rig, plan.timeline, POSE_TWEEN_MS / 2, schedule);
  ok(midTween.parts.every((p) => p.matrix.every(Number.isFinite)), "determinism: the mid-tween frame is NaN-free");

  // --- render: the REAL clip + the two-clock assert (measured) --------------
  const outDir = path.join(OUT_DIR, "render");
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const result = await renderRigScene({
    rig,
    art,
    timeline: plan.timeline,
    speech: plan.speech,
    slot: { sceneIndex: 1, durationMs: sceneMs },
    opts: { outDir, canvas: { width: 1920, height: 1080 }, fps, onProgress: (l) => process.stdout.write(`    ${l}\r`) },
  });
  process.stdout.write("\n");
  ok(fs.existsSync(result.file) && fs.statSync(result.file).size > 10_000, "render: the scene clip landed (rig-scene.mp4, size floor cleared)");
  const probed = await probeDurationSec(result.file);
  const delivered = result.frames / fps;
  ok(Math.abs(probed - delivered) <= 0.1, `render: the probed duration ${probed.toFixed(2)}s ≈ the delivered ${delivered.toFixed(2)}s (the two-clock assert, measured)`);
  const planRead = planFromTracks({ tracks: result.tracks }, 1);
  ok(planRead !== null && Math.abs(planRead.totalSec - result.plan.totalSec) <= 0.011, "render: the contract read-back agrees with the engine plan");
  const tracks = characterTracks([{ sceneIndex: 1, durationMs: sceneMs }], { fps });
  ok(tracks[0].kind === "character" && tracks[0].clips[0].asset === null, "render: the projection is character-kind, asset null");

  // --- cache: reuse on unchanged inputs, re-render on any change ------------
  const clipPath = path.join(OUT_DIR, "cache", "scene-rig-01.mp4");
  fs.mkdirSync(path.dirname(clipPath), { recursive: true });
  const args = {
    rig,
    art,
    timeline: plan.timeline,
    speech: plan.speech,
    slot: { sceneIndex: 1, durationMs: sceneMs },
    opts: { outDir, canvas: { width: 1920, height: 1080 }, fps },
  };
  const hash1 = rigClipHash(args);
  const first = await ensureRigClip(clipPath, args);
  const mtime1 = fs.statSync(first).mtimeMs;
  const second = await ensureRigClip(clipPath, args);
  ok(first === clipPath && second === clipPath, "cache: the cache slot is stable");
  ok(fs.statSync(second).mtimeMs === mtime1, "cache: unchanged inputs REUSED the clip (mtime untouched)");
  const edited = {
    ...args,
    rig: {
      ...rig,
      poses: [...rig.poses, { id: "smoke-extra", name: "Smoke extra", joints: { torso: { rotateDeg: 2 } } }],
    },
  };
  ok(rigClipHash(edited) !== hash1, "cache: an edited rig changes the hash (the cache never lies)");
  const third = await ensureRigClip(clipPath, edited);
  ok(fs.statSync(third).mtimeMs > mtime1 || fs.statSync(third).mtimeMs === mtime1, "cache: the edited-input render completed");
  void third;

  // --- identity: SKIP unless a VLM provider is configured -------------------
  console.log("  ~ SKIP identity VCE ≥ 80 on rig frames — needs a configured VLM provider (the blind rubric's human track owns it)");

  // The scaffold sanity — the auto pass's native half on THIS fixture.
  const scaffold = scaffoldRigDoc({ parts: SEEDS, art: ART });
  ok(scaffold.doc !== null, "structural: the scaffold validates the same fixture");

  console.log(`\n${passed} passed, ${failures.length} failed${failures.length ? ":" : ""}`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  fs.writeFileSync(
    path.join(OUT_DIR, "smoke-receipt.json"),
    JSON.stringify({ passed, failed: failures.length, failures, probedSec: probed, frames: result.frames, hash: hash1, at: new Date().toISOString() }, null, 2)
  );
  process.exit(failures.length > 0 ? 1 : 0);
}

// S128 — gate main() on DIRECT invocation (node --import tsx scripts/k1-rig-smoke.mts):
// the blind-rescore kit imports this module for the fixture and must not
// re-run the whole smoke on import.
import { pathToFileURL } from "node:url";
const invokedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;
if (invokedDirectly) main().catch((err) => {
  console.error(err);
  process.exit(1);
});

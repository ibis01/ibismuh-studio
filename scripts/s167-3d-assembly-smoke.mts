// S167 smoke — THE 3D CLIP APPEARS IN A RENDERED ASSEMBLY (the audit's
// acceptance, on real bytes, foreground).
//
// The smallest honest walk of the REAL pipeline pieces the wiring rides:
//   1. a Scene3D doc carrying the S167 finisher fields (shake + pushIn)
//      renders for REAL through the 3D engine (three.js WebGL 2 under the
//      SwiftShader headless chromium — the S94 receipt path);
//   2. the schema-2 tracks doc READS the 3d kind (planFromTracks — the real
//      reader) and the engineSegmentVerdict ADMISSION law runs both arms
//      (with the segment → ok; without → fail-closed, the wall refuses);
//   3. the compositor's own STAGING pass (engineSegmentTranscodeArgs — the
//      S143 transcode the render loop runs) letterboxes the engine canvas
//      into the render geometry + the segment profile;
//   4. the assembly: the staged 3D segment + a second segment (a flat
//      colour card through the SAME staging function — identical codec
//      parameters, the concat demuxer's law) stitch into final.mp4;
//   5. the probe proves the 3D ink IS in the final: the duration is the
//      exact sum, and a frame sampled inside the 3D window carries real
//      raster detail (pixel variance) while the card window is flat.
//
// Run: timeout 590 node --import tsx scripts/s167-3d-assembly-smoke.mts
// Receipt: docs/audits/s167-3d-assembly-smoke.json
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile as execFileCb } from "child_process";
import { promisify } from "util";

const execFileP = promisify(execFileCb);
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

async function ffmpeg(args: string[]): Promise<void> {
  await execFileP("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args], {
    timeout: 180_000,
    maxBuffer: 16 * 1024 * 1024,
  });
}

async function probeDurationSec(file: string): Promise<number | null> {
  try {
    const { stdout } = await execFileP(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "json", file],
      { timeout: 30_000 }
    );
    const d = Number(JSON.parse(stdout)?.format?.duration);
    return Number.isFinite(d) && d > 0 ? d : null;
  } catch {
    return null;
  }
}

/** Extract one frame as raw gray bytes (the variance probe's input). */
async function frameGray(file: string, tSec: number, size: string): Promise<Uint8Array> {
  const { stdout } = (await execFileP(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error",
      "-ss", tSec.toFixed(3),
      "-i", file,
      "-frames:v", "1",
      "-vf", `scale=${size},format=gray`,
      "-f", "rawvideo", "-",
    ],
    { timeout: 60_000, maxBuffer: 8 * 1024 * 1024, encoding: "buffer" }
  )) as unknown as { stdout: Buffer };
  return new Uint8Array(stdout.buffer, stdout.byteOffset, stdout.length);
}

function meanAbsDiff(a: Uint8Array, b: Uint8Array): number {
  if (a.length === 0 || a.length !== b.length) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

function variance(a: Uint8Array): number {
  let sum = 0;
  for (const v of a) sum += v;
  const mean = sum / a.length;
  let acc = 0;
  for (const v of a) acc += (v - mean) * (v - mean);
  return acc / a.length;
}

async function main() {
  console.log("S167 smoke — the 3D clip appears in a rendered assembly");
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "s167-smoke-"));
  const receiptPath = "docs/audits/s167-3d-assembly-smoke.json";
  try {
    // ---------- 1. the S167 finisher doc renders for REAL ----------
    const { parseScene3D, serializeScene3D } = await import("../src/lib/tubeforge/scene3d.ts");
    const { renderScene3D } = await import("../src/lib/tubeforge/render3d.ts");
    // 640x360, 2s @ 24 fps — 48 frames; the finisher fields SHIP (the fBM
    // shake rides the camera, the exponential push-in dollies in).
    const docJson = JSON.stringify({
      version: 1,
      aspect: "16:9",
      width: 640,
      height: 360,
      fps: 24,
      durationSec: 2,
      background: "#1a2436",
      sky: { top: "#7fb0e8", horizon: "#f0d8b8" },
      shadows: true,
      camera: {
        fov: 55,
        keyframes: [
          { t: 0, position: [0, 2.2, 7], lookAt: [0, 0.3, 0], ease: "measured-in-out" },
          { t: 1, position: [0, 2.2, 7], lookAt: [0, 0.3, 0], ease: "measured-in-out" },
        ],
        // THE S167 FINISHER CHANNELS — a held shot with a slow exponential
        // push-in and the fBM handheld shake on top.
        pushIn: 0.18,
        shake: { strength: 0.06, seed: 167 },
      },
      objects: [
        { id: "ground", kind: "plane", position: [0, -0.5, 0], scale: [12, 1, 12], material: { color: "#c8b890", roughness: 0.9 } },
        { id: "cube", kind: "box", position: [0, 0.3, 0], material: { color: "#e08040", metalness: 0.1, roughness: 0.5 } },
        { id: "pillar", kind: "box", position: [-1.4, 0.5, -0.8], scale: [0.6, 2, 0.6], material: { color: "#40a080", roughness: 0.6 } },
        { id: "ball", kind: "sphere", position: [1.3, 0.4, 0.5], scale: [1.4, 1.4, 1.4], material: { color: "#8050c0", roughness: 0.35 } },
      ],
      lights: [
        { kind: "ambient", color: "#8fa8c0", intensity: 0.5 },
        { kind: "directional", color: "#ffffff", intensity: 1.2, direction: [0.4, 1, 0.6] },
      ],
    });
    const doc = parseScene3D(docJson);
    ok(doc != null && doc.camera.shake != null && doc.camera.pushIn === 0.18, "the finisher doc parses with its shake + pushIn");
    ok(doc != null && serializeScene3D(doc) === serializeScene3D(doc), "the doc round-trips byte-stable");
    const res = await renderScene3D(doc!, {
      outDir: path.join(work, "3d"),
      onProgress: () => {},
      budgetMs: 300_000,
    });
    ok(fs.existsSync(res.file), `the 3D engine rendered ${res.frames} frames @ ${doc!.fps}fps (${doc!.durationSec}s) — scene-3d.mp4 exists`);
    // THE FINISHER IS LIVE IN THE RASTER: the camera keys HOLD at [0,2.2,7]
    // across the whole scene — the only motion is the push-in + the shake,
    // so consecutive hold frames MUST differ (an inert camera would dither
    // to zero delta).
    const f0 = await frameGray(res.file, 0.5, "160x90");
    const f1 = await frameGray(res.file, 0.75, "160x90");
    const holdDelta = meanAbsDiff(f0, f1);
    ok(Number.isFinite(holdDelta) && holdDelta > 0.05, `the finisher channels move the held camera (hold-frame |Δ| = ${holdDelta.toFixed(3)} > 0.05 — an inert camera would be 0)`);

    // ---------- 2. the plan reads the 3d kind; the admission law runs ----------
    const { planFromTracks, engineSegmentVerdict, validatePlanKinds } =
      await import("../src/lib/tubeforge/composition-plan.ts");
    const tracksDoc = {
      tracks: [
        {
          name: "visual",
          kind: "visual",
          clips: [
            { id: "c1", sceneIndex: 1, kind: "3d", startSec: 0, endSec: 2, transitionIn: null },
            { id: "c2", sceneIndex: 2, kind: "video", startSec: 2, endSec: 3, transitionIn: null },
          ],
        },
      ],
    };
    const plan = planFromTracks(tracksDoc as never, 2);
    ok(plan != null && plan.scenes.map((s) => s.kind).join(",") === "3d,video", "the schema-2 tracks doc reads the 3d kind (planFromTracks)");
    ok(validatePlanKinds(plan!.scenes.map((s) => s.kind)).ok === false, "the routing wall holds for the 3d kind (no compositor segment builder)");
    const verdictMissing = engineSegmentVerdict(plan!.scenes.map((s) => s.kind), [null, null]);
    ok(!verdictMissing.ok && verdictMissing.missing.length === 1 && verdictMissing.missing[0].kind === "3d", "fail-closed: the verdict refuses the 3d scene with no engine segment");

    // ---------- 3. the compositor's STAGING pass (the real S143 args) ----------
    const { engineSegmentTranscodeArgs } = await import("../src/lib/tubeforge/render.ts");
    const seg1 = path.join(work, "seg-01.mp4");
    const seg2 = path.join(work, "seg-02.mp4");
    const stage = (src: string, out: string): string[] =>
      engineSegmentTranscodeArgs({
        src,
        out,
        aspect: "16:9",
        fps: 24,
        quality: { crf: "20", preset: "veryfast" },
      });
    await ffmpeg(stage(res.file, seg1));
    ok(fs.existsSync(seg1), "the 3D engine segment staged to the segment profile (engineSegmentTranscodeArgs)");
    // The second segment: a flat colour card through the SAME staging
    // function — identical codec parameters (the concat's -c copy law).
    const card = path.join(work, "card.mp4");
    await ffmpeg([
      "-y", "-f", "lavfi", "-i", "color=c=#202028:size=1280x720:rate=24:duration=1",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
      card,
    ]);
    await ffmpeg(stage(card, seg2));
    ok(fs.existsSync(seg2), "the card segment staged through the SAME transcode (identical codec parameters)");
    const verdictOk = engineSegmentVerdict(plan!.scenes.map((s) => s.kind), [seg1, seg2]);
    ok(verdictOk.ok, "admitted: both plan scenes carry their segments — the compositor's only admission check passes");

    // ---------- 4. the assembly (the concat demuxer, the render's stitch) ----------
    const listFile = path.join(work, "segments.txt");
    fs.writeFileSync(listFile, `file '${seg1}'\nfile '${seg2}'\n`);
    const finalPath = path.join(work, "final.mp4");
    await ffmpeg(["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", finalPath]);
    const dur = await probeDurationSec(finalPath);
    ok(dur != null && Math.abs(dur - 3.0) < 0.15, `the assembly carries BOTH segments (probe duration ${dur?.toFixed(2)}s ≈ 2+1)`);

    // ---------- 5. the 3D ink IS in the final ----------
    const in3d = await frameGray(finalPath, 1.0, "160x90"); // inside the 3d window
    const inCard = await frameGray(finalPath, 2.5, "160x90"); // inside the card window
    const var3d = variance(in3d);
    const varCard = variance(inCard);
    ok(var3d > 40, `the 3d window carries real raster detail (luma variance ${var3d.toFixed(0)} — the engine's ink)`);
    ok(varCard < 2, `the card window is flat (luma variance ${varCard.toFixed(2)} — the null segment)`);
    const cross = meanAbsDiff(in3d, inCard);
    ok(cross > 1, `the two windows are different pictures (mean |Δ| = ${cross.toFixed(2)}) — the 3d clip PLAYS in the assembly`);
    ok(!var3d.toFixed(0).includes("NaN") && !varCard.toFixed(0).includes("NaN"), "the probes measured real bytes (no NaN laundering)");

    // ---------- the receipt ----------
    const receipt = {
      slice: "S167",
      what: "the 3D clip appears in a rendered assembly — the Part 0.3 gap closed on real bytes",
      doc: { aspect: "16:9", fps: doc!.fps, durationSec: doc!.durationSec, frames: res.frames, finisher: { pushIn: doc!.camera.pushIn, shake: doc!.camera.shake } },
      stages: {
        engineRender: res.file,
        engineRenderBytes: fs.statSync(res.file).size,
        stagingArgs: stage(res.file, seg1),
        assemblyList: "seg-01.mp4 (the 3d engine segment) + seg-02.mp4 (the card, same staging)",
        stitch: "concat demuxer, -c copy",
      },
      measured: {
        holdFrameMeanAbsDelta: Number(holdDelta.toFixed(4)),
        finalDurationSec: dur,
        lumaVariance3dWindow: Number(var3d.toFixed(1)),
        lumaVarianceCardWindow: Number(varCard.toFixed(1)),
        windowMeanAbsDelta: Number(cross.toFixed(3)),
        finalBytes: fs.existsSync(finalPath) ? fs.statSync(finalPath).size : null,
      },
      admission: { planKinds: plan!.scenes.map((s) => s.kind), failClosed: verdictMissing, admitted: verdictOk.ok },
      at: new Date(0).toISOString(),
      note: "rendered in the dev sandbox, foreground; the timestamp is pinned to epoch (the receipt is content-addressed, not clock-addressed)",
    };
    fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
    fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
    console.log(`  receipt → ${receiptPath}`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("smoke failed:", err);
  process.exit(1);
});

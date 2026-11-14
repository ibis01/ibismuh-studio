// S123 (G1) — the graphics engine renderer (P3, the peer-lane landing —
// external roadmap Part G phase 1: "exactly the whiteboard's integration").
// The whiteboard engine's proven chromium shape (fresh context per scene —
// the S75 E10 OOM receipt; the no-network security line; JPEG q92 frame
// screenshots; the ffmpeg encode + VO slot normalization), applied to the
// graphics grammar — NOT a competing renderer. The compositor (render.ts)
// never sees a graphics plan (the routing wall); this module owns the
// lane's frames the same way renderWhiteboard owns the whiteboard's.
//
// THE ONE CLOCK LAW AT RENDER TIME: the doc's own clock (explicit
// durationMs > the house estimate — frame.ts's ONE rule) is the truth; the
// VO-measured durations RIDE THE RENDER CALL (the anchors-are-inputs law,
// W4 — spec §5.2's audio-sync row): a scene without an explicit clock takes
// the measured WAV duration as its explicit one FOR THIS RENDER
// (effectiveGraphicsDoc below), so the frame truth, the tracks projection,
// the preflight wall and the encoder all read ONE derivation. The stored
// doc is never mutated; the same voFiles → the same effective doc → the
// same bytes (determinism).
//
// PREFLIGHT BEFORE SPEND: assertGraphicsBudget (the R-1 DELIVERED-count
// wall at doc.fps) runs BEFORE chromium launches — a 4 GB worker must
// never learn about an unbounded render from the OOM killer (the E0 audit
// §6 risk-4 receipt).
//
// COMPOSE THROUGH THE CONTRACT: the frame plan maps onto graphics-kind
// clips (graphicsTracks) and reads back through planFromTracks — the SAME
// read the compositor lane uses. The assembly asserts the contract total
// against the delivered Σ (a loop that ever drifts from the tracks refuses
// here instead of shipping a desynced projection).
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { log } from "../log";
import { framePlanWindows, quantizeClock } from "../anim/clock";
import { planFromTracks } from "../composition-plan";
import { WB_CHROMIUM_LAUNCH_ARGS, normalizeVoSlot, probeDurationSec } from "../whiteboard/render";
import {
  APPLY_GRAPHICS_FRAME_FN,
  composeGraphicsScene,
  graphicsFramePayload,
} from "./compose";
import { effectiveGraphicsDoc, frameAt, graphicsSceneDurationsMs } from "./frame";
import { assertGraphicsBudget } from "./preflight";
import { graphicsTracks } from "./tracks";
import type { GraphicsDoc } from "./types";

const renderLog = log.child({ mod: "graphics-render" });
const execFileAsync = promisify(execFile);

async function runFfmpeg(args: string[]): Promise<void> {
  await execFileAsync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", ...args],
    { timeout: 300_000, maxBuffer: 16 * 1024 * 1024 }
  );
}

export interface GraphicsRenderOptions {
  outDir: string;
  /** Narration WAVs keyed by scene id (the scene-<n> → sceneWavFile mapping
   *  the job builds — the only mapping the WAV layout supports). */
  voFiles?: Map<string, string>;
  /** The music bed — joins at assembly under the whiteboard's mix law
   *  (ducked 0.16 under narration; solo bed at program level). */
  musicPath?: string;
  /** The draft raster (graphics/draft.ts) — scales the VIEWPORT + a CSS
   *  transform only; the frame truth, the composer and the doc are
   *  untouched (draft pixels are final pixels at a smaller raster). */
  draftViewport?: { width: number; height: number };
  onProgress?: (label: string, fraction: number) => void;
}

export interface GraphicsSceneRenderResult {
  sceneId: string;
  durationMs: number;
  frames: number;
  file: string;
}

export interface GraphicsRenderResult {
  scenes: GraphicsSceneRenderResult[];
  file: string;
  /** The contract projection this render delivered (the job's manifest and
   *  the QC group read the SAME truth). */
  tracks: ReturnType<typeof graphicsTracks>;
  plan: NonNullable<ReturnType<typeof planFromTracks>>;
  /** The effective clocks the render delivered (ms truth, per scene). */
  sceneMs: number[];
}

/**
 * The render-time clock — moved to frame.ts (effectiveGraphicsDoc, the ONE
 * clock rule's home) at P4 so the studio preview and the renderer share
 * the SAME client-safe derivation. This module imports it from there.
 */

export async function renderGraphics(
  doc: GraphicsDoc,
  opts: GraphicsRenderOptions
): Promise<GraphicsRenderResult> {
  // ---- preflight: VO slots + the effective clock + the budget wall ----
  const voMsBySceneId = new Map<string, number>();
  const voResolved = new Map<string, string>();
  let anyVoAudio = false;
  const voNormDir = path.join(opts.outDir, "vo-norm");
  for (const scene of doc.scenes) {
    const voRaw = opts.voFiles?.get(scene.id) ?? null;
    if (!voRaw) continue;
    anyVoAudio = true;
    const voPath = await normalizeVoSlot(voRaw, voNormDir, scene.id);
    voResolved.set(scene.id, voPath);
    const voDurSec = await probeDurationSec(voPath);
    if (voDurSec !== null) voMsBySceneId.set(scene.id, voDurSec * 1000);
  }
  const effective = effectiveGraphicsDoc(doc, voMsBySceneId);

  // The R-1 wall — DELIVERED frames at doc.fps, BEFORE chromium launches.
  const budget = assertGraphicsBudget(effective);

  const sceneMs = graphicsSceneDurationsMs(effective);
  const clock = framePlanWindows(sceneMs, effective.fps);

  // Compose through the contract: the engine's own tracks → the compositor's
  // plan read. A null plan here is an engine bug (we JUST derived the tracks
  // from a validated doc) — the whiteboard's refusal, mirrored.
  const tracks = graphicsTracks(effective);
  const plan = planFromTracks({ tracks }, effective.scenes.length);
  if (!plan) {
    throw new Error(
      "the graphics frame plan failed the timeline contract — an engine bug, not a doc problem"
    );
  }
  const deliveredSec = clock.scenes.reduce((a, s) => a + s.deliveredSec, 0);
  if (Math.abs(plan.totalSec - quantizeClock(deliveredSec)) > 0.001) {
    throw new Error(
      "the graphics assembly clock diverged from the timeline contract — an engine bug, not a doc problem"
    );
  }
  renderLog.info("graphics preflight", {
    fps: budget.fps,
    frames: budget.frames,
    scenes: effective.scenes.length,
    totalSec: plan.totalSec,
  });

  // ---- the chromium loop (the whiteboard's shape, verbatim posture) ----
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true, args: [...WB_CHROMIUM_LAUNCH_ARGS] });

  const sceneFiles: GraphicsSceneRenderResult[] = [];
  const rasterW = opts.draftViewport?.width ?? effective.width;
  const rasterH = opts.draftViewport?.height ?? effective.height;
  // The CSS transform that fits the doc's own geometry into the draft raster
  // (1 at full raster — the transform is absent, the path is byte-identical).
  const fitScale = opts.draftViewport ? rasterW / effective.width : 1;

  try {
    for (let si = 0; si < effective.scenes.length; si++) {
      const scene = effective.scenes[si];
      const frames = clock.scenes[si].frames;
      // The doc clock's start of THIS scene (ms truth — the same cursor
      // frameAt resolves; never the frame-quantized window, which is the
      // delivery's shape, not the motion's clock).
      const sceneStartMs = sceneMs.slice(0, si).reduce((a, b) => a + b, 0);
      // Per-scene page recycling (the S75 E10 receipt — ONE page held across
      // the project grew until the 4GB worker's OOM killer fired; a fresh
      // context per scene hands chromium's memory back at every boundary).
      const context = await browser.newContext({
        viewport: { width: rasterW, height: rasterH },
        deviceScaleFactor: 1,
      });
      // Security line 2 (the whiteboard's, verbatim): the page has no
      // network, period.
      await context.route("**/*", (route) => route.abort());
      const page = await context.newPage();
      try {
        opts.onProgress?.(
          `scene ${si + 1}/${effective.scenes.length} ("${scene.id}"): composing`,
          si / effective.scenes.length
        );
        const composed = composeGraphicsScene(scene, effective);
        await page.setContent(composed.html, { waitUntil: "load" });
        if (fitScale !== 1) {
          // The draft raster: scale the page, never the truth.
          await page.addStyleTag({
            content: `html,body{transform:scale(${fitScale});transform-origin:0 0}`,
          });
        }
        const framesDir = path.join(opts.outDir, `scene-${si + 1}-frames`);
        fs.mkdirSync(framesDir, { recursive: true });
        for (let f = 0; f < frames; f++) {
          const tMs = sceneStartMs + (f / effective.fps) * 1000;
          const frame = frameAt(effective, tMs);
          await page.evaluate(
            `(${APPLY_GRAPHICS_FRAME_FN})(${graphicsFramePayload(frame)})`
          );
          await page.screenshot({
            path: path.join(framesDir, `f${String(f).padStart(5, "0")}.jpg`),
            type: "jpeg",
            quality: 92,
            clip: { x: 0, y: 0, width: rasterW, height: rasterH },
          });
          if (f % 24 === 0) {
            opts.onProgress?.(
              `scene ${si + 1}/${effective.scenes.length} ("${scene.id}"): frame ${f + 1}/${frames}`,
              (si + (f + 1) / frames) / effective.scenes.length
            );
          }
        }

        // Encode the scene: frames (+ VO when present). Music joins at
        // assembly. voResolved carries the LOUDNESS-CONTRACT slots. The
        // stream-homogeneity law (S87 slice 5, the whiteboard's find): when
        // ANY scene carries VO, every scene file carries an audio stream —
        // the concat demuxer is stream-homogeneous. VO-less scenes fill
        // with anullsrc under the same apad/-t bounds; a FULLY silent doc
        // keeps the video-only shape (the silent-draft law).
        const voPath = voResolved.get(scene.id) ?? null;
        const silentFill = !voPath && anyVoAudio;
        const sceneFile = path.join(opts.outDir, `scene-${si + 1}.mp4`);
        const durSec = clock.scenes[si].deliveredSec;
        const args: string[] = [
          "-y",
          "-framerate", String(effective.fps),
          "-i", path.join(framesDir, "f%05d.jpg"),
        ];
        if (voPath) args.push("-i", voPath);
        else if (silentFill) args.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo");
        args.push(
          "-filter_complex", "[0:v]format=yuv420p[v]",
          "-map", "[v]",
          // apad (not -shortest): the VO PADS to the scene duration so the
          // delivered seconds are exactly what framePlanWindows laid down
          // (the S75 E10 receipt — -shortest ate the tail).
          ...((voPath || silentFill) ? ["-map", "1:a", "-c:a", "aac", "-b:a", "160k", "-af", "apad"] : []),
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "19",
          "-t", durSec.toFixed(3),
          sceneFile,
        );
        await runFfmpeg(args);
        fs.rmSync(framesDir, { recursive: true, force: true });
        sceneFiles.push({ sceneId: scene.id, durationMs: sceneMs[si], frames, file: sceneFile });
      } finally {
        // The scene's chromium memory goes back to the OS here.
        await context.close().catch(() => {});
      }
    }

    // ---- final assembly: concat + the music bed (or stream copy) ----
    const finalFile = path.join(opts.outDir, "final.mp4");
    const totalSec = quantizeClock(deliveredSec);
    const listFile = path.join(opts.outDir, "concat.txt");
    fs.writeFileSync(listFile, sceneFiles.map((s) => `file '${path.resolve(s.file)}'`).join("\n") + "\n");

    if (opts.musicPath) {
      // The whiteboard's mix law, mirrored: with narration the bed ducks to
      // 0.16 UNDER THE VOICE; a SOLO bed carries the program at full level
      // (the S64 receipt: a ducked solo bed measured −32.1 LUFS and failed).
      // amix's normalize=0 keeps the voice at its own level (the S75 receipt:
      // a mix that mapped only the bed silenced the narration).
      const bedGain = anyVoAudio ? 0.16 : 1.0;
      const bedChain =
        "[1:a]volume=" + bedGain +
        ",afade=t=in:st=0:d=1.5" +
        ",afade=t=out:st=" + Math.max(0, totalSec - 2).toFixed(3) + ":d=2";
      await runFfmpeg([
        "-y",
        "-f", "concat", "-safe", "0", "-i", listFile,
        "-stream_loop", "-1", "-t", totalSec.toFixed(3), "-i", opts.musicPath,
        "-filter_complex",
          anyVoAudio
            ? "[0:v]format=yuv420p[v];" + bedChain + "[bed];[0:a][bed]amix=inputs=2:duration=first:normalize=0[a]"
            : "[0:v]format=yuv420p[v];" + bedChain + "[a]",
        "-map", "[v]", "-map", "[a]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "19",
        "-c:a", "aac", "-b:a", "160k",
        finalFile,
      ]);
    } else if (anyVoAudio) {
      await runFfmpeg([
        "-y",
        "-f", "concat", "-safe", "0", "-i", listFile,
        "-c", "copy",
        finalFile,
      ]);
    } else {
      await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", finalFile]);
    }
    return { scenes: sceneFiles, file: finalFile, tracks, plan, sceneMs };
  } finally {
    await browser.close();
  }
}

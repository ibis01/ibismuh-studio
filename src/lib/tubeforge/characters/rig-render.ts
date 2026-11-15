// S125 (K1) — the rig scene renderer: chromium rasterizes, FFmpeg encodes —
// and every frame's state comes from the PURE frame truth (rig-frame.ts
// poseAt) through the ONE applier (rig-compose.ts APPLY_RIG_FRAME_FN), never
// from CSS animation (the determinism law; the graphics render.ts shape,
// mirrored for the scene-clip seat).
//
// THE SEAT: the rig renders ONE story scene's pixels as a VIDEO-ONLY clip —
// narration rides the story segment's audio graph (buildSegment is the mix
// owner; the rig never mixes a second VO path — one clock, one mix). The
// story segment composes the clip through the same footage path i2v uses.
//
// THE CLOCK: the clip renders at the program's rate EXCEPT the 60fps video
// case — the rig grammar draws at 24|30 (the shared timebase, D3), so a
// 60fps program's rig clips render at 30 and the segment's -r resample
// carries them onto the program clock (the i2v clips are 30fps containers
// today; same seam). Frames come from frameCountOf(slotMs, fps) — the ONE
// clock derivation shared with the preflight wall (R-1) and characterTracks,
// so budget, contract and delivered frames agree by construction. The
// two-clock assert (plan ≡ delivered) runs before the clip is returned.
//
// THE CACHE: a rig clip is deterministic from its inputs — the clip cache
// keys on a sha256 of (rig doc bytes, art bytes, compiled timeline, speech
// schedule, duration, fps, canvas); the sidecar next to the clip carries the
// hash and a mismatch re-renders (an edited rig must re-render — the cache
// never lies). The i2v clip cache's shape (exists + size floor), upgraded
// with the sidecar.
//
// SECURITY POSTURE (whiteboard/graphics parity): sanitizeSvg runs at compose
// time (first line); chromium launches with ALL network routes aborted
// (second line); per-scene context recycling hands chromium's memory back
// (the S75 E10 receipt — one context per renderRigScene call, closed in
// finally).
import { execFile } from "child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "util";

import { WB_CHROMIUM_LAUNCH_ARGS } from "../whiteboard/render";
import { frameCountOf } from "../anim/clock";
import { planFromTracks, type CompositionPlan } from "../composition-plan";
import type { TimelineTrack } from "../timeline";
import { APPLY_RIG_FRAME_FN, composeRigScene, rigFramePayload } from "./rig-compose";
import { poseAt, type MouthSchedule, type RigPoseTimeline } from "./rig-frame";
import { assertRigBudget } from "./preflight";
import { characterTracks, type RigSceneSlot } from "./tracks";
import { writeRigDoc, writeRigParts, type CharacterRigDoc, type RigPartArt } from "./rig2d";

const execFileP = promisify(execFile);

async function runFfmpeg(args: string[]): Promise<void> {
  await execFileP("ffmpeg", args, { maxBuffer: 32 * 1024 * 1024 }).catch((e) => {
    throw new Error(`ffmpeg failed: ${String(e.stderr ?? e.message).slice(-1200)}`);
  });
}

export interface RenderRigSceneOptions {
  outDir: string;
  /** The video's canvas (the aspect's OUTPUT_SIZE) — the stage contain-fits
   *  into it, centered (the compose seam's canvas law). */
  canvas: { width: number; height: number };
  /** The program's render rate — the rig draws at min(rate, 30) (the D3
   *  shared timebase; the segment's -r resample carries 30 onto 60). */
  fps: number;
  onProgress?: (label: string, fraction: number) => void;
}

export interface RigSceneRenderResult {
  file: string;
  frames: number;
  durationMs: number;
  /** The contract artifacts: the engine-authored tracks + the clock
   *  read-back — the graphics render result's shape, one slot. */
  tracks: TimelineTrack[];
  plan: CompositionPlan;
}

/** The per-scene encode args — video-only (no VO: the story segment owns
 *  the mix), yuv420p, -t bounded to the DELIVERED seconds (the R-1
 *  arithmetic the wall checked). Exported for the unit pins — the arg list
 *  IS the contract. */
export function rigEncodeArgs(input: {
  framesDir: string;
  fps: number;
  durSec: number;
  sceneFile: string;
}): string[] {
  return [
    "-y",
    "-framerate", String(input.fps),
    "-i", path.join(input.framesDir, "f%05d.jpg"),
    "-filter_complex", "[0:v]format=yuv420p[v]",
    "-map", "[v]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "19",
    "-t", input.durSec.toFixed(3),
    input.sceneFile,
  ];
}

export interface RenderRigSceneArgs {
  rig: CharacterRigDoc;
  art: RigPartArt[];
  timeline: RigPoseTimeline;
  speech: MouthSchedule;
  slot: RigSceneSlot;
  opts: RenderRigSceneOptions;
}

/** Render ONE rig scene clip to <outDir>/rig-scene.mp4. The caller passes
 *  the output of parseRigDoc/parseRigParts (validated at admission) and the
 *  compiled timeline (planRigTimeline) — the doc IS the render input of
 *  record. */
export async function renderRigScene(args: RenderRigSceneArgs): Promise<RigSceneRenderResult> {
  const { rig, art, timeline, speech, slot, opts } = args;
  // The shared timebase: the rig draws at 24|30; a 60fps program's clip
  // renders at 30 (the segment's -r resample owns the program clock).
  const fps = Math.min(opts.fps, 30);
  if (fps !== 24 && fps !== 30) {
    throw new Error(`rig render fps must be 24 or 30 (the shared timebase) — got ${opts.fps}`);
  }
  // The preflight wall FIRST (R-1, the delivered arithmetic) — before
  // chromium launches.
  assertRigBudget([slot], fps);

  const frames = frameCountOf(slot.durationMs, fps);
  const durSec = frames / fps;

  // COMPOSE THROUGH THE CONTRACT: the engine emits its tracks and the plan
  // is read back through the same planFromTracks every engine-lane consumer
  // uses — the two-clock assert below enforces plan ≡ delivered (a null
  // here is an engine bug: we JUST derived the tracks).
  const tracks = characterTracks([{ ...slot, voOn: slot.voOn ?? false }], { fps });
  const contractPlan = planFromTracks({ tracks }, 1);
  if (!contractPlan) {
    throw new Error("the rig scene plan failed the timeline contract — an engine bug, not a doc problem");
  }

  const { chromium } = await import("playwright");
  fs.mkdirSync(opts.outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: [...WB_CHROMIUM_LAUNCH_ARGS] });
  const sceneFile = path.join(opts.outDir, "rig-scene.mp4");
  try {
    // Security line 2 + memory discipline (per-call context, closed below).
    const context = await browser.newContext({
      viewport: { width: opts.canvas.width, height: opts.canvas.height },
      deviceScaleFactor: 1,
    });
    await context.route("**/*", (route) => route.abort());
    const page = await context.newPage();
    try {
      opts.onProgress?.("composing the rig", 0);
      const composed = composeRigScene(rig, art, { canvas: opts.canvas });
      await page.setContent(composed.html, { waitUntil: "load" });

      const framesDir = path.join(opts.outDir, "rig-frames");
      fs.mkdirSync(framesDir, { recursive: true });
      for (let f = 0; f < frames; f++) {
        // The scene-local clock — the clip IS the scene (the slot's own
        // window starts at zero on this program's clock).
        const tMs = (f / fps) * 1000;
        const payload = rigFramePayload(poseAt(rig, timeline, tMs, speech));
        // The whiteboard's evaluate law verbatim: the payload STRING is
        // double-encoded into a quoted literal — the applier JSON.parses it
        // inside the page.
        await page.evaluate(`(${APPLY_RIG_FRAME_FN})(${JSON.stringify(payload)})`);
        await page.screenshot({
          path: path.join(framesDir, `f${String(f).padStart(5, "0")}.jpg`),
          type: "jpeg",
          quality: 92,
          clip: { x: 0, y: 0, width: opts.canvas.width, height: opts.canvas.height },
        });
        if (f % 24 === 0) {
          opts.onProgress?.(`rig frame ${f + 1}/${frames}`, (f + 1) / frames);
        }
      }

      await runFfmpeg(rigEncodeArgs({ framesDir, fps, durSec, sceneFile }));
      fs.rmSync(framesDir, { recursive: true, force: true });
    } finally {
      await context.close().catch(() => {});
    }

    // The two-clock assert: the delivered seconds must equal the contract's
    // total, or the render refuses instead of shipping a desynced
    // projection (the whiteboard law, verbatim shape).
    if (Math.abs(contractPlan.totalSec - Math.round(durSec * 100) / 100) > 0.011) {
      throw new Error(
        "the rig scene clock diverged from the timeline contract — an engine bug, not a doc problem"
      );
    }
    return {
      file: sceneFile,
      frames,
      durationMs: slot.durationMs,
      tracks,
      plan: contractPlan,
    };
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// The clip cache — the i2v shape (exists + size floor), upgraded with a
// sha256 sidecar so an edited rig re-renders (the cache never lies).
// ---------------------------------------------------------------------------

/** The cache hash — deterministic over EVERY render input. Pure. */
export function rigClipHash(args: RenderRigSceneArgs): string {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        rig: writeRigDoc(args.rig),
        art: writeRigParts(args.art),
        timeline: { durationMs: args.timeline.durationMs, rows: args.timeline.rows },
        speech: args.speech,
        slot: { sceneIndex: args.slot.sceneIndex, durationMs: args.slot.durationMs },
        fps: Math.min(args.opts.fps, 30),
        canvas: args.opts.canvas,
      })
    )
    .digest("hex");
}

export const RIG_CLIP_SIZE_FLOOR = 10_000;

/** Generate (or reuse a cached) rig scene clip. `clipPath` is the caller's
 *  cache slot (videoDir/scene-rig-NN.mp4); the sidecar `<clipPath>.hash`
 *  carries the input hash — a mismatch (edited rig/pose/narration) renders
 *  fresh. */
export async function ensureRigClip(
  clipPath: string,
  args: RenderRigSceneArgs
): Promise<string> {
  const hashPath = `${clipPath}.hash`;
  const hash = rigClipHash(args);
  if (
    fs.existsSync(clipPath) &&
    fs.existsSync(hashPath) &&
    fs.readFileSync(hashPath, "utf8").trim() === hash &&
    fs.statSync(clipPath).size > RIG_CLIP_SIZE_FLOOR
  ) {
    return clipPath;
  }
  const result = await renderRigScene({ ...args, opts: { ...args.opts, outDir: path.dirname(clipPath) } });
  // The renderer writes rig-scene.mp4 into the clip's directory; move it
  // into the cache slot and stamp the sidecar.
  fs.renameSync(result.file, clipPath);
  fs.writeFileSync(hashPath, hash);
  return clipPath;
}

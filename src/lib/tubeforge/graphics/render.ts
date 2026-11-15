// S123 (G1) P3 — the graphics engine renderer: chromium rasterizes, FFmpeg
// assembles — and every frame's state comes from the PURE frame truth
// (frame.ts frameAt) through the ONE applier (compose.ts
// APPLY_GRAPHICS_FRAME_FN), never from CSS animation (the determinism law,
// the wb-page.ts seam mirrored: one compose, one applier, two callers).
//
// Per scene: compose the validated scene into the page-sized SVG skeleton
// (composeGraphicsScene), then per frame apply the frame state (channels,
// bar lengths, counter values, stroke-dash draws, grow/wipe geometry) and
// screenshot. Scenes encode from the frame sequence (+ narration VO when
// present — the S76 loudness contract normalized at the engine boundary,
// the whiteboard's normalizeVoSlot REUSED, never a private copy), then the
// concat + the house music bed produce the final MP4.
//
// THE CLOCK (the doc law — "the doc clock IS the timeline", compose.ts):
// scene durations come from graphicsSceneDurationsMs (explicit durationMs >
// the house 2.6-wps estimate — ONE clock model) and frames come from
// framePlanWindows at doc.fps — the SAME derivation the preflight wall (R-1)
// and the tracks projection read, so budget, contract and delivered frames
// agree by construction. VO does NOT extend a graphics scene: the apad law
// pads a short slot to the scene's delivered length, and an overrun slot
// truncates at the scene boundary (the doc owns duration; the QC battery's
// narration-sync check is the judge). Per-frame time enters frameAt as the
// GLOBAL doc clock (sceneCursorMs + the frame's scene-local offset) so the
// render reads the exact truth the editor reads — scene resolution and the
// scene-local motion evaluation stay one function call apart (the R-6 law).
//
// Security posture (whiteboard parity): chromium launches with ALL network
// routes aborted — the page can only ever render the markup compose.ts
// wrote into it (sanitizeSvg first, HTML-escape second, in the composer);
// this network abort is the second line. Per-scene context recycling: ONE
// page held across the project grew until the 4GB worker's OOM killer
// fired (the S75 E10 receipt) — a fresh context per scene hands chromium's
// memory back at every scene boundary; the browser itself is reused.
import { execFile } from "child_process";
import { createHash } from "crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "util";

// The container-safe launch args + the VO loudness contract — the
// whiteboard engine's exported seams, reused verbatim (the S113
// no-private-copies law extended to the engine plumbing).
import { WB_CHROMIUM_LAUNCH_ARGS, normalizeVoSlot } from "../whiteboard/render";
import { framePlanWindows } from "../anim/clock";
import { planFromTracks, type CompositionPlan } from "../composition-plan";
import type { TimelineTrack } from "../timeline";
import { APPLY_GRAPHICS_FRAME_FN, composeGraphicsScene, graphicsFramePayload } from "./compose";
import { graphicsEventList, type GraphicsEventSlot } from "./events";
import { frameAt, graphicsSceneDurationsMs } from "./frame";
import { assertGraphicsBudget } from "./preflight";
import { graphicsTracks } from "./tracks";
import { writeGraphicsDoc, type GraphicsDoc } from "./types";

const execFileP = promisify(execFile);

async function runFfmpeg(args: string[]): Promise<void> {
  await execFileP("ffmpeg", args, { maxBuffer: 32 * 1024 * 1024 }).catch((e) => {
    throw new Error(`ffmpeg failed: ${String(e.stderr ?? e.message).slice(-1200)}`);
  });
}

export interface RenderGraphicsOptions {
  outDir: string;
  /** Real narration audio per scene id (absolute or cwd-relative path). */
  voFiles?: Map<string, string>;
  /** Music bed path (FLAC/WAV); mixed at the house gains under the final assembly. */
  musicPath?: string;
  onProgress?: (label: string, fraction: number) => void;
  /** The LOOK-RATE lever (labelled drafts only, closed set {1, 2}): step 2
   *  renders every OTHER frame — at its EXACT doc-clock time, through the
   *  same frame truth and applier — and encodes at doc.fps/2 (12 or 15).
   *  The program duration is UNCHANGED (every encode stays bounded to the
   *  final's delivered seconds), so the look spans exactly the program it
   *  previews; only its temporal sampling halves (the whiteboard preview
   *  precedent: a look rides its own surface/rate law, 720p/24 regardless
   *  of the project). The P5 acceptance-7 probe records why: the 0.5×
   *  surface lever alone measured ~1.4× on the proof rig — the pipeline's
   *  fixed costs dominate a short program — and the look-rate closes the
   *  ≥ 2× criterion honestly. FINAL renders never step (1, by absence). */
  frameStep?: 1 | 2;
  /** S126 — the RESOLVED import assets (the import store's one seam):
   *  assetKey → data URIs (sheet = [strip], sequence = [f0..fN]). A doc
   *  that references an import the caller did not resolve REFUSES
   *  fail-closed (the G1-IMP lens's enforcement half — a silently missing
   *  sprite is the exact lie the lane exists to catch). */
  spriteAssets?: Map<string, string[]>;
  /** S132 (PAE-4) — resume an INTERRUPTED render: encoded scenes (per the
   *  outDir's render-manifest.json, the doc fingerprint matching, and the
   *  scene files still on disk) skip chromium + encode and rejoin the
   *  assembly. FAIL-CLOSED: a fingerprint mismatch (the doc, the VO/music
   *  inputs, the frame step, or the sprite assets changed) refuses — a
   *  resumed render that mixes two renders' scenes would ship a lie. A
   *  completed render deletes its manifest: resume applies only to an
   *  INTERRUPTED run. */
  resume?: boolean;
}

export interface GraphicsSceneRenderResult {
  sceneId: string;
  durationMs: number;
  frames: number;
  file: string;
}

/** The contract artifacts a graphics render returns alongside the files —
 *  the whiteboard shape mirrored (minus boardModes: the graphics doc has
 *  no board policy; the doc clock IS the timeline): the engine-authored
 *  tracks (the frame plan in the universal grammar, audio truth included)
 *  and the composition plan read BACK from them through the same
 *  planFromTracks every engine-lane consumer uses — the two-clock pin
 *  (plan ≡ delivered frames) is enforced below. */
export interface GraphicsRenderResult {
  scenes: GraphicsSceneRenderResult[];
  file: string;
  tracks: TimelineTrack[];
  plan: CompositionPlan;
  /** S131 — the doc's events projected onto the global doc clock (the
   *  event channel's one seam — the audio/QC consumers' fact source;
   *  cues are not clips, so they never ride the tracks). */
  events: GraphicsEventSlot[];
}

// ---------------------------------------------------------------------------
// S132 — the resume manifest: the interrupted render's record. ONE file in
// the outDir (render-manifest.json), written after every encoded scene so
// a crash loses at most the scene it was mid-rendering. The fingerprint
// pins EVERY input that shapes the scene files (the doc's strict write,
// the raw VO/music paths, the frame step, the sprite assets) — resume
// against different inputs refuses instead of mixing two renders.
// ---------------------------------------------------------------------------

const RENDER_MANIFEST_VERSION = 1;

interface RenderManifestScene {
  sceneId: string;
  index: number;
  status: "encoded" | "pending";
  file: string;
  frames: number;
}

interface RenderManifest {
  version: number;
  fingerprint: string;
  scenes: RenderManifestScene[];
}

function renderManifestPath(outDir: string): string {
  return path.join(outDir, "render-manifest.json");
}

/** The tolerant read (the house doc law): null on unreadable — junk JSON,
 *  a wrong version, structural nonsense. A corrupt manifest is treated as
 *  NO manifest: the render starts fresh rather than resuming from a lie.
 *  Exported for the unit pins (the io contract IS the recovery contract). */
export function readRenderManifest(outDir: string): RenderManifest | null {
  try {
    const raw = JSON.parse(fs.readFileSync(renderManifestPath(outDir), "utf8")) as RenderManifest;
    if (
      raw === null || typeof raw !== "object" || raw.version !== RENDER_MANIFEST_VERSION ||
      typeof raw.fingerprint !== "string" || !Array.isArray(raw.scenes)
    ) {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

function writeRenderManifest(outDir: string, manifest: RenderManifest): void {
  fs.writeFileSync(renderManifestPath(outDir), JSON.stringify(manifest, null, 2) + "\n");
}
/** Exported for the unit pins alongside the read. */
export { writeRenderManifest, renderManifestPath };

/** The render fingerprint — sha256 over EVERY input that shapes the scene
 *  files: the doc's strict write (version-first, key-stable), the raw VO
 *  and music paths, the frame step, the sprite assets. Deterministic; a
 *  change in any of them refuses resume (fail-closed). Exported for the
 *  unit pins. */
export function renderFingerprint(doc: GraphicsDoc, opts: RenderGraphicsOptions): string {
  const vo = [...(opts.voFiles?.entries() ?? [])].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const sprites = [...(opts.spriteAssets?.entries() ?? [])].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return createHash("sha256")
    .update(writeGraphicsDoc(doc))
    .update(JSON.stringify({ vo, music: opts.musicPath ?? null, frameStep: opts.frameStep ?? 1, sprites }))
    .digest("hex")
    .slice(0, 32);
}

/** S132 — the resume decision, PURE (file existence rides a predicate so
 *  the pins run without a filesystem). null ⇒ nothing to resume (a fresh
 *  start); a refusal ⇒ the fingerprint mismatch (fail-closed, the exact
 *  reason text); else the plan — the manifest plus the encoded-and-present
 *  scenes that skip chromium + encode and rejoin the assembly. Exported
 *  for the unit pins (the decision IS the contract). */
export function resumePlan(
  manifest: RenderManifest | null,
  fingerprint: string,
  fileExists: (p: string) => boolean,
): { refusal: string } | { plan: RenderManifest; resumable: Map<number, { file: string; frames: number }> } | null {
  if (manifest === null) return null;
  if (manifest.fingerprint !== fingerprint) {
    return {
      refusal:
        "the render inputs changed since the interrupted run (the doc, the VO/music inputs, the frame step or the sprite assets) — resume refuses rather than mixing two renders' scenes",
    };
  }
  const resumable = new Map<number, { file: string; frames: number }>();
  for (const s of manifest.scenes) {
    if (s.status === "encoded" && fileExists(s.file)) {
      resumable.set(s.index, { file: s.file, frames: s.frames });
    }
  }
  return { plan: manifest, resumable };
}

/** The scene clock's absolute start in ms — the EXACT running sum of the
 *  scene durations (the same arithmetic frame.ts sceneClocks performs
 *  internally), so the render's global frame time and frameAt's internal
 *  scene resolution can never disagree. Exported for the unit pins. */
export function sceneCursorMs(sceneMs: number[], index: number): number {
  let cursor = 0;
  for (let i = 0; i < index; i++) cursor += sceneMs[i];
  return cursor;
}

/** The per-scene encode args — the whiteboard encode law, mirrored: frames
 *  at doc.fps, yuv420p, VO (apad — the slot must PAD to the scene duration
 *  so the hold survives, never -shortest) or the anullsrc silent fill (the
 *  S87 slice-5 stream-homogeneity law: when ANY scene carries VO, EVERY
 *  scene file carries an audio stream, or the concat's amix seam matches
 *  no streams). -t bounds every stream to the DELIVERED seconds (the
 *  frame-quantized clock — the R-1 arithmetic the preflight wall checked).
 *  Exported for the unit pins (the arg list IS the contract). */
export function graphicsEncodeArgs(input: {
  framesDir: string;
  /** The encode's OWN rate — the final's doc.fps, or the look's
   *  doc.fps / frameStep (12 | 15). Never assumed from either. */
  fps: number;
  durSec: number;
  voPath: string | null;
  silentFill: boolean;
  sceneFile: string;
}): string[] {
  const args: string[] = [
    "-y",
    "-framerate", String(input.fps),
    "-i", path.join(input.framesDir, "f%05d.jpg"),
  ];
  if (input.voPath) args.push("-i", input.voPath);
  else if (input.silentFill) args.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo");
  args.push(
    "-filter_complex", "[0:v]format=yuv420p[v]",
    "-map", "[v]",
    ...((input.voPath || input.silentFill)
      ? ["-map", "1:a", "-c:a", "aac", "-b:a", "160k", "-af", "apad"]
      : []),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "19",
    "-t", input.durSec.toFixed(3),
    input.sceneFile,
  );
  return args;
}

/** The final assembly args — the whiteboard assembly law, mirrored (minus
 *  the SFX layer, which v1 graphics does not carry): concat + the bed at
 *  the house gains (0.16 UNDER the voice, 1.0 solo — the S64 receipt), the
 *  amix arms normalize=0 (never amix's hidden ½ divider), every stream
 *  bounded (the bed by -t, the mix by duration=first, the video by the
 *  concat). No bed: stream copy (the concat is the whole program).
 *  Exported for the unit pins. */
export function graphicsAssemblyArgs(input: {
  listFile: string;
  finalFile: string;
  totalSec: number;
  musicPath: string | null;
  anyVoAudio: boolean;
}): string[] {
  if (!input.musicPath) {
    return ["-y", "-f", "concat", "-safe", "0", "-i", input.listFile, "-c", "copy", input.finalFile];
  }
  const bedGain = input.anyVoAudio ? 0.16 : 1.0;
  const bedChain =
    "[1:a]volume=" + bedGain +
    ",afade=t=in:st=0:d=1.5" +
    ",afade=t=out:st=" + Math.max(0, input.totalSec - 2).toFixed(3) + ":d=2";
  return [
    "-y",
    "-f", "concat", "-safe", "0", "-i", input.listFile,
    "-stream_loop", "-1", "-t", input.totalSec.toFixed(3), "-i", input.musicPath,
    "-filter_complex",
      input.anyVoAudio
        ? "[0:v]format=yuv420p[v];" + bedChain + "[bed];[0:a][bed]amix=inputs=2:duration=first:normalize=0[a]"
        : "[0:v]format=yuv420p[v];" + bedChain + "[a]",
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "19",
    "-c:a", "aac", "-b:a", "160k",
    input.finalFile,
  ];
}

/** Render one validated graphics doc to <outDir>/final.mp4. The caller
 *  passes the output of parseGraphicsDoc/validateGraphicsDoc — the doc IS
 *  the render input of record (the grammar gate ran at admission). */
export async function renderGraphics(
  doc: GraphicsDoc,
  opts: RenderGraphicsOptions
): Promise<GraphicsRenderResult> {
  // The preflight wall FIRST (the E0 audit §6 risk-4 receipt: 4GB workers
  // learn about unbounded renders from the OOM killer, never from this
  // renderer) — the DELIVERED frame arithmetic at doc.fps (R-1), before
  // chromium launches.
  assertGraphicsBudget(doc);

  // The clock — ONE derivation shared with the wall and the tracks.
  const sceneMs = graphicsSceneDurationsMs(doc);
  const plan = framePlanWindows(sceneMs, doc.fps);

  // The VO slots: normalized at the engine boundary (the S76 loudness
  // contract — in-window slots pass through untouched), probed BEFORE
  // chromium so the encode law knows every stream's shape up front.
  const voResolved = new Map<string, string>();
  let anyVoAudio = false;
  const voNormDir = path.join(opts.outDir, "vo-norm");
  for (const scene of doc.scenes) {
    const voRaw = opts.voFiles?.get(scene.id) ?? null;
    if (!voRaw) continue;
    anyVoAudio = true;
    const voPath = await normalizeVoSlot(voRaw, voNormDir, scene.id);
    voResolved.set(scene.id, voPath);
  }

  // S87 slice 3 — COMPOSE THROUGH THE CONTRACT: the engine emits its
  // timeline tracks (visual + the P3 audio truth), and the plan is read
  // back from those tracks through the same planFromTracks the compositor
  // lane uses. The loop and the assembly below read the frame-quantized
  // clock the tracks carry — one derivation (a null plan here is an engine
  // bug: we JUST derived the tracks from a validated doc).
  const tracks = graphicsTracks(doc, {
    voSceneIds: voResolved.keys(),
    musicOn: opts.musicPath != null,
  });
  const contractPlan = planFromTracks({ tracks }, doc.scenes.length);
  if (!contractPlan) {
    throw new Error(
      "the graphics frame plan failed the timeline contract — an engine bug, not a doc problem"
    );
  }

  const { chromium } = await import("playwright");
  fs.mkdirSync(opts.outDir, { recursive: true });

  // S132 — the resume setup. The fingerprint pins every input that shapes
  // the scene files; a mismatch refuses (fail-closed) instead of mixing
  // two renders' scenes. Encoded scenes rejoin only when their FILE still
  // exists — a cleaned outDir simply re-renders.
  const fingerprint = renderFingerprint(doc, opts);
  let manifest: RenderManifest | null = null;
  const resumable = new Map<number, { file: string; frames: number }>();
  if (opts.resume === true) {
    const decision = resumePlan(readRenderManifest(opts.outDir), fingerprint, (p) => fs.existsSync(p));
    if (decision !== null && "refusal" in decision) throw new Error(decision.refusal);
    if (decision !== null) {
      manifest = decision.plan;
      for (const [i, r] of decision.resumable) resumable.set(i, r);
    } else {
      manifest = {
        version: RENDER_MANIFEST_VERSION,
        fingerprint,
        scenes: doc.scenes.map((scene, i) => ({
          sceneId: scene.id,
          index: i,
          status: "pending" as const,
          file: path.join(opts.outDir, `scene-${i + 1}.mp4`),
          frames: 0,
        })),
      };
      writeRenderManifest(opts.outDir, manifest);
    }
  }

  // The look-rate (labelled drafts only — see RenderGraphicsOptions).
  const step = opts.frameStep === 2 ? 2 : 1;
  const effFps = doc.fps / step;
  const browser = await chromium.launch({ headless: true, args: [...WB_CHROMIUM_LAUNCH_ARGS] });

  const sceneFiles: GraphicsSceneRenderResult[] = [];
  try {
    for (let si = 0; si < doc.scenes.length; si++) {
      const scene = doc.scenes[si];
      const frames = Math.ceil(plan.scenes[si].frames / step);
      const durSec = plan.scenes[si].deliveredSec;
      const durationMs = sceneMs[si];
      const cursorMs = sceneCursorMs(sceneMs, si);

      // S132 — the resume skip: an encoded scene whose file survived the
      // interruption rejoins the assembly untouched (chromium + encode
      // never run for it; the manifest is the record, the fingerprint the
      // guarantee its content matches this render's inputs).
      const resumed = resumable.get(si);
      if (resumed !== undefined) {
        opts.onProgress?.(
          `scene ${si + 1}/${doc.scenes.length} ("${scene.id}"): resumed (the encoded scene reused)`,
          si / doc.scenes.length,
        );
        sceneFiles.push({ sceneId: scene.id, durationMs, frames: resumed.frames, file: resumed.file });
        continue;
      }

      // Per-scene context recycling (the S75 E10 receipt) + security line 2.
      const context = await browser.newContext({
        viewport: { width: doc.width, height: doc.height },
        deviceScaleFactor: 1,
      });
      await context.route("**/*", (route) => route.abort());
      const page = await context.newPage();
      try {
        opts.onProgress?.(
          `scene ${si + 1}/${doc.scenes.length} ("${scene.id}"): composing`,
          si / doc.scenes.length
        );
        const composed = composeGraphicsScene(scene, doc, { spriteAssets: opts.spriteAssets });
        // S126 — fail-closed on unresolved imports: the compose records the
        // missing keys; the render refuses BEFORE any chromium work on
        // them (a silently missing sprite would ship a lie).
        if (composed.missingAssets.length > 0) {
          throw new Error(
            `unresolved sprite imports (${composed.missingAssets.join(", ")}) — resolve them through the import store before rendering`
          );
        }
        await page.setContent(composed.html, { waitUntil: "load" });

        const framesDir = path.join(opts.outDir, `scene-${si + 1}-frames`);
        fs.mkdirSync(framesDir, { recursive: true });
        for (let f = 0; f < frames; f++) {
          // The GLOBAL doc clock — the exact truth the editor reads: scene
          // resolution + the scene-local motion evaluation stay one call
          // (the R-6 law), with no quantization drift (cursorMs is the
          // exact ms sum, not the frame-quantized boundary). A look-rate
          // (step 2) samples every OTHER frame at its exact doc time.
          const tMs = cursorMs + ((f * step) / doc.fps) * 1000;
          const payload = graphicsFramePayload(frameAt(doc, tMs));
          // The whiteboard's evaluate law verbatim: the payload STRING is
          // double-encoded into a quoted literal — the applier JSON.parses
          // it inside the page. Interpolating the raw JSON here would pass
          // an OBJECT where the applier expects a string (the exact
          // SyntaxError the P5 proof caught on its first run).
          await page.evaluate(`(${APPLY_GRAPHICS_FRAME_FN})(${JSON.stringify(payload)})`);
          await page.screenshot({
            path: path.join(framesDir, `f${String(f).padStart(5, "0")}.jpg`),
            type: "jpeg",
            quality: 92,
            clip: { x: 0, y: 0, width: doc.width, height: doc.height },
          });
          if (f % 24 === 0) {
            opts.onProgress?.(
              `scene ${si + 1}/${doc.scenes.length} ("${scene.id}"): frame ${f + 1}/${frames}`,
              (si + (f + 1) / frames) / doc.scenes.length
            );
          }
        }

        // Encode the scene: frames (+ VO when present). Music joins at
        // assembly. The S87 slice-5 law: every scene carries an audio
        // stream when ANY scene does.
        const voPath = voResolved.get(scene.id) ?? null;
        const silentFill = !voPath && anyVoAudio;
        const sceneFile = path.join(opts.outDir, `scene-${si + 1}.mp4`);
        await runFfmpeg(graphicsEncodeArgs({
          framesDir,
          fps: effFps,
          durSec,
          voPath,
          silentFill,
          sceneFile,
        }));
        fs.rmSync(framesDir, { recursive: true, force: true });
        sceneFiles.push({ sceneId: scene.id, durationMs, frames, file: sceneFile });
        // S132 — the manifest records the encoded scene the moment it
        // exists: a crash after this line loses at most the NEXT scene.
        if (manifest !== null) {
          const entry = manifest.scenes[si];
          if (entry !== undefined) {
            entry.status = "encoded";
            entry.frames = frames;
            entry.file = sceneFile;
            writeRenderManifest(opts.outDir, manifest);
          }
        }
      } finally {
        await context.close().catch(() => {});
      }
    }

    // Final assembly: the two-clock assert first (the whiteboard law — the
    // delivered Σ must equal the contract's total, or the render refuses
    // instead of shipping a desynced projection), then concat + bed.
    const finalFile = path.join(opts.outDir, "final.mp4");
    const totalSec = plan.scenes.reduce((a, s) => a + s.deliveredSec, 0);
    if (Math.abs(contractPlan.totalSec - Math.round(totalSec * 100) / 100) > 0.001) {
      throw new Error(
        "the graphics assembly clock diverged from the timeline contract — an engine bug, not a doc problem"
      );
    }
    const listFile = path.join(opts.outDir, "concat.txt");
    fs.writeFileSync(listFile, sceneFiles.map((s) => `file '${path.resolve(s.file)}'`).join("\n") + "\n");
    await runFfmpeg(graphicsAssemblyArgs({
      listFile,
      finalFile,
      totalSec,
      musicPath: opts.musicPath ?? null,
      anyVoAudio,
    }));
    // S132 — the render COMPLETED: the manifest's purpose (resuming an
    // interrupted run) is spent. Delete it so the next run starts fresh;
    // the scene mp4s stay (today's behavior).
    if (manifest !== null) fs.rmSync(renderManifestPath(opts.outDir), { force: true });
    return { scenes: sceneFiles, file: finalFile, tracks, plan: contractPlan, events: graphicsEventList(doc, doc.fps) };
  } finally {
    await browser.close();
  }
}

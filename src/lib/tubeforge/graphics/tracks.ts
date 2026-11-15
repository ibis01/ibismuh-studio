// S123 (G1) — the graphics engine EMITS timeline tracks: the graphics doc's
// frame plan mapped onto the Universal Timeline contract's vocabulary.
//
// The whiteboard/tracks.ts law, mirrored (the peer-MODE law): the graphics
// engine is a PEER at the engine level (own doc, own composer, own planner)
// but is UNIFIED at the contract level — its composition truth (per-scene
// windows on the composition clock) is expressed in the SAME track/clip
// grammar every other engine speaks, so the compositor, the QC battery and
// the critic read one composition truth.
//
// The clock law — frame quantization: scene windows carry the FRAME-
// QUANTIZED durations (what actually lands in final.mp4), derived through
// framePlanWindows(sceneMs, doc.fps) — the ONE clock derivation, shared
// with the preflight wall (R-1) and the anim substrate. The scene clocks
// come from the ONE clock rule (frame.ts graphicsSceneDurationsMs —
// explicit > the house estimate). Contiguity holds by construction at
// either fps (D3).
//
// Pure, deterministic, ffmpeg-free. The graphics module stays a leaf:
// this imports the shared contract types (timeline.ts) + the engine's own
// frame truth — never Director, never generation APIs (the §1 laws).
import { framePlanWindows } from "../anim/clock";
import type { TimelineClip, TimelineTrack, TimelineTrackKind } from "../timeline";
import { graphicsSceneDurationsMs } from "./frame";
import type { GraphicsDoc } from "./types";

/** The story-row linkage: the planner names scenes `scene-<storyIndex>`
 *  (the only mapping the WAV layout supports); hand-authored ids carry no
 *  row linkage — null is the honest read, position still orders the clip.
 *  (whiteboard/tracks.ts rowSceneIndex, mirrored.) */
function rowSceneIndex(sceneId: string): number | null {
  const m = /^scene-(\d+)$/.exec(sceneId);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= 1 && n <= 999 ? n : null;
}

/**
 * Map the graphics doc's frame plan onto contract tracks — the doc's
 * composition truth in the universal grammar:
 *
 * • VISUAL track, kind "graphics" — one clip per graphics scene over its
 *   frame-quantized window (contiguous by construction at either fps).
 *   `asset: null` — the frame is DRAWN by the engine (the contract's
 *   "null = the frame is generated" law); the doc stays the execution
 *   truth, the clip is the composition fact. Scene boundaries are the
 *   concat's hard cuts — transitionIn/Out stay null (the doc's exits are
 *   in-scene motion, not track blends).
 * • AUDIO track — empty at P2: graphics narration rides the render call
 *   (VO-measured durations are anchors-are-inputs, W4); the slots project
 *   when the renderer integrates (P3), mirroring the whiteboard's VO
 *   clips over the same windows.
 * • SUBTITLE track — empty (shape-stable for the compositor's dispatch).
 */
/** P3 — the renderer's audio truth rides the SAME projection: per-scene VO
 *  slots (the encoder pads/truncates VO to the scene duration, so the
 *  window IS the slot — the whiteboard grammar, mirrored) and ONE
 *  doc-spanning music-bed clip (`a-music`) when the bed is on. Absent opts
 *  keeps the P2 shape byte-identical (the pinned contract). */
export interface GraphicsTracksOptions {
  /** Scene ids whose narration WAV exists (the render's voFilesFor map). */
  voSceneIds?: Iterable<string>;
  /** True when the render assembles a music bed. */
  musicOn?: boolean;
}

export function graphicsTracks(doc: GraphicsDoc, opts: GraphicsTracksOptions = {}): TimelineTrack[] {
  const plan = framePlanWindows(graphicsSceneDurationsMs(doc), doc.fps);

  const visualClips: TimelineClip[] = doc.scenes.map((scene, i) => ({
    id: `g${i}`,
    kind: "graphics" as TimelineTrackKind,
    sceneIndex: rowSceneIndex(scene.id),
    startSec: plan.scenes[i].startSec,
    endSec: plan.scenes[i].endSec,
    transitionIn: null,
    transitionOut: null,
    asset: null, // the frame is drawn by the engine, not referenced
  }));

  // P3 — the audio truth (mirrors whiteboardTracks): one clip per
  // VO-carrying scene over the SAME window the picture was delivered on,
  // plus the doc-spanning bed clip when music rides.
  const voIds = new Set(opts.voSceneIds);
  const audioClips: TimelineClip[] = [];
  doc.scenes.forEach((scene, i) => {
    if (!voIds.has(scene.id)) return;
    audioClips.push({
      id: `a-g${i}`,
      kind: "audio",
      sceneIndex: rowSceneIndex(scene.id),
      startSec: plan.scenes[i].startSec,
      endSec: plan.scenes[i].endSec,
      transitionIn: null,
      transitionOut: null,
      asset: null,
    });
  });
  if (opts.musicOn && doc.scenes.length > 0) {
    audioClips.push({
      id: "a-music", // the contract's bed grammar — doc-spanning, not scene-bound
      kind: "audio",
      sceneIndex: null,
      startSec: 0,
      endSec: plan.totalSec,
      transitionIn: null,
      transitionOut: null,
      asset: null,
    });
  }

  return [
    { kind: "graphics", name: "visual", clips: visualClips },
    { kind: "audio", name: "audio", clips: audioClips },
    { kind: "subtitle", name: "subtitle", clips: [] },
  ];
}

// S125 (K1) — the rig engine EMITS timeline tracks: the rig scene plan
// mapped onto the Universal Timeline contract's vocabulary. The
// graphics/tracks.ts law, mirrored (the peer-MODE law): the rig is a PEER at
// the engine level (own doc, own composer, own planner) but UNIFIED at the
// contract level — its composition truth (per-scene windows on a
// frame-quantized clock) is expressed in the SAME track/clip grammar every
// other engine speaks, so the QC battery and the critic read one composition
// truth.
//
// THE CLOCK LAW — frame quantization: the windows come from
// framePlanWindows(slotMs, fps) — the ONE clock derivation, shared with the
// preflight wall (R-1) and the anim substrate. Contiguous from zero by
// construction at either fps (D3). The RENDER HOOK renders at the VIDEO's
// fps (the shared render clock); these tracks describe the rig's own
// delivered program (the clip sequence), whose windows agree with what the
// encoder lays down because they come from the same framePlanWindows call.
//
// Pure, deterministic, ffmpeg-free. The characters module stays a leaf:
// this imports the shared contract types (timeline.ts) + the engine's own
// clock inputs — never Director, never generation APIs (the §1 laws).
import { framePlanWindows } from "../anim/clock";
import type { TimelineClip, TimelineTrack, TimelineTrackKind } from "../timeline";

/** One rig-rendered scene slot — the renderer's per-scene plan row. */
export interface RigSceneSlot {
  /** The story scene this clip renders (1-based — the rowSceneIndex law:
   *  `scene-<n>` ↔ Scene.index). Null for rig programs without a story-row
   *  linkage (a direct lane render). */
  sceneIndex: number | null;
  /** The scene's clock in ms (the caller's measured duration — the VO law:
   *  durations are inputs, never stored). */
  durationMs: number;
  /** True when the scene's narration WAV rides (the audio slot projects). */
  voOn?: boolean;
}

export interface RigTracksOptions {
  /** The program's render rate — the VIDEO's fps at the hook (the shared
   *  render clock), the doc's fps for direct lane renders. Default 30. */
  fps?: 24 | 30;
  /** True when the render assembles a music bed. */
  musicOn?: boolean;
}

/** Map the rig scene plan onto contract tracks — the rig's composition truth
 *  in the universal grammar:
 *
 * • VISUAL track, kind "character" — one clip per rig slot over its
 *   frame-quantized window (contiguous from zero by construction at either
 *   fps). `asset: null` — the frame is DRAWN by the engine (the contract's
 *   "null = the frame is generated" law); the rig doc + the compiled
 *   timeline stay the execution truth, the clip is the composition fact.
 *   Scene boundaries are hard cuts — transitionIn/Out stay null (the pose
 *   timeline's holds are in-scene motion, not track blends).
 * • AUDIO track — one clip per VO-carrying slot over the SAME window the
 *   picture was delivered on (the encoder pads/truncates VO to the scene
 *   duration — the whiteboard grammar), plus ONE program-spanning bed clip
 *   (`a-music`) when the bed rides.
 * • SUBTITLE track — empty (shape-stable for the compositor's dispatch).
 */
export function characterTracks(slots: RigSceneSlot[], opts: RigTracksOptions = {}): TimelineTrack[] {
  const fps = opts.fps === 24 ? 24 : 30;
  const plan = framePlanWindows(
    slots.map((s) => s.durationMs),
    fps
  );

  const visualClips: TimelineClip[] = slots.map((slot, i) => ({
    id: `r${i}`,
    kind: "character" as TimelineTrackKind,
    sceneIndex: slot.sceneIndex,
    startSec: plan.scenes[i].startSec,
    endSec: plan.scenes[i].endSec,
    transitionIn: null,
    transitionOut: null,
    asset: null, // the frame is drawn by the engine, not referenced
  }));

  const audioClips: TimelineClip[] = [];
  slots.forEach((slot, i) => {
    if (!slot.voOn) return;
    audioClips.push({
      id: `a-r${i}`,
      kind: "audio",
      sceneIndex: slot.sceneIndex,
      startSec: plan.scenes[i].startSec,
      endSec: plan.scenes[i].endSec,
      transitionIn: null,
      transitionOut: null,
      asset: null,
    });
  });
  if (opts.musicOn && slots.length > 0) {
    audioClips.push({
      id: "a-music", // the contract's bed grammar — program-spanning, not scene-bound
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
    { kind: "character", name: "visual", clips: visualClips },
    { kind: "audio", name: "audio", clips: audioClips },
    { kind: "subtitle", name: "subtitle", clips: [] },
  ];
}

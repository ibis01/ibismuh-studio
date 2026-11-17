// G1.2 — frame truth: the ONE source of motion truth for the graphics
// engine (S120 §5 / Part B). Pure: same (doc, tMs) → byte-identical frame
// state; no fs, no DOM, no clock, no randomness (the S64 law generalizes).
//
// THE CONTRACT: callers pass a VALIDATED GraphicsDoc (graphics/types.ts is
// the guarantee) — frameAt carries no defensive branches (the Part F law:
// validate integrity once, schedule purely everywhere else).
//
// THE MOTION MODEL (v1 semantics — the numbers are receipts to tune; the
// NAMES are the contract, exported as GRAPHICS_MOTION_SEMANTICS):
//
//   Each motion owns the window [delayMs, delayMs + durationMs] on its
//   scene clock. Local progress is CLAMPED: before the window a motion
//   holds its start state, after it its end state — so every channel is
//   continuous and finite for ALL t (the never-NaN pin holds outside every
//   motion window by construction, not by guarding).
//
//   Channels (what a frame carries per element):
//     opacity     base opacity × the owned opacity factor
//     x / y       placement + the owned offsets (scene units)
//     scale       placement scale × the owned scale factor
//     rotateDeg   placement rotation (no motion rotates in v1)
//     progress    0..1 reveal — the composer's wipe/grow/draw channel
//                 (bar lengths, shape reveals, icon stroke-dash); 1 when
//                 no motion drives it
//     counterValue counter kind only — the tweened number
//
//   Composition order is FIXED: enter → tweens → exit → emphasis (the G1.2
//   precedence pin, emphasis > exit > enter, manifests as composition
//   order — emphasis is applied LAST, so it shapes the final state over
//   whatever the tween/exit/enter layers produced):
//     enter  drives its channels from their start state to the placed
//            state (clamped: the start state holds pre-window);
//     tweens (S129, PAE-1) are the AUTHOR's keyframed directives: each
//            directive's per-channel keys are delay-shifted onto the
//            scene clock and evaluated through the SHARED Stage-S
//            substrate (anim/keyframe evalAt — clamped holds outside the
//            keys, the destination key's ease drives the segment), then
//            folded in array order — additive channels (dx/dy/rotateDeg)
//            SUM, multiplicative channels (scale/opacity/progress)
//            MULTIPLY. Rotation is the tween's alone (v1 motions never
//            rotate — the delta is the only writer of rotateDelta);
//     exit   multiplies the placed state down to its end state (a fade
//            exits 1→0, a wipe un-reveals ×(1−e), a count drains the
//            captured value back to `from` — captured at the exit's start
//            so the boundary is continuous even mid-enter);
//     emphasis is IN-WINDOW only (identity outside) and is env-bounded:
//            the triangle phase q(p) eased by the motion's own curve —
//            0 at both window edges, so emphasis never discontinues the
//            state it lands on.
//
//   Emphasis semantics per kind: fade → opacity dip; pop/grow → scale
//   pulse; rise/slide → offset nudge; wipe/draw → progress re-trace;
//   count → the POP channel only (the value channel is untouched — an
//   overshoot would falsify the number).
//
//   The scene clock (S152 — the measured-narration law, the whiteboard
//   lane's sceneDurationMs precedence mirrored): explicit durationMs >
//   MEASURED narration (+ the VO tail) > the house 2.6-wps estimate
//   (timing.ts#estimateNarrationMs — ONE clock model, reused, never
//   re-implemented). The measured map is the renderer-side ffprobe/WAV
//   truth threaded through every clock reader (frameAt, the preflight
//   wall, the tracks projection, the QC lenses) so budget, contract and
//   delivered frames agree on the SAME extended clock — a scene holds its
//   narration instead of truncating it mid-sentence at the 2.6-wps
//   boundary. An EXPLICIT durationMs still wins: the author's cut is
//   deliberate, and the QC battery's narration-sync check judges it.
//   frameAt resolves the ACTIVE scene for the doc clock and clamps to
//   [0, total].
//
// Deviation from the Part B sketch, recorded: frameAt(doc, tMs) — the
// sketch's geometry arg came from the whiteboard pattern; the graphics
// grammar carries placement inline (GraphicsElement.at), so there is no
// external geometry to resolve.
import { frameCountOf } from "../anim/clock";
import { evalEase } from "../anim/easing";
import { evalAt } from "../anim/keyframe";
import { estimateNarrationMs } from "../whiteboard/timing";
import { cameraAt, type GraphicsCameraState } from "./camera";
import type { ElementMotion, ElementTween, GraphicsDoc, GraphicsElement, GraphicsEvent } from "./types";

/** The v1 motion semantics — ONE source, cited by the pins and the design
 *  record. Values are receipts to tune; the names are the contract. */
export const GRAPHICS_MOTION_SEMANTICS = {
  /** enter rise offset (scene units, from below). */
  risePx: 48,
  /** enter slide offset (scene units, from the left). */
  slidePx: 120,
  /** enter pop start scale. */
  popFrom: 0.6,
  /** exit rise offset (scene units, upward). */
  exitRisePx: 48,
  /** exit slide offset (scene units, rightward). */
  exitSlidePx: 120,
  /** emphasis opacity dip (fade). */
  emphasisFadeDip: 0.4,
  /** emphasis scale pulse (pop / grow / count). */
  emphasisPopScale: 0.15,
  /** emphasis rise nudge (scene units). */
  emphasisRisePx: 24,
  /** emphasis slide nudge (scene units). */
  emphasisSlidePx: 48,
  /** emphasis re-trace dip (wipe / draw). */
  emphasisNudge: 0.25,
  /** S160 — the impact kick (the animated-shorts KICKS grammar, ported
   *  from references/reports/motion.md): a `hit` event shakes the scene
   *  camera — the offset flips sign EVERY frame and decays over this many
   *  frames, at this amplitude in px at the 720p REFERENCE height (scaled
   *  to the doc's own height by the caller), with the y-axis swing at
   *  this factor of the x swing (the judder reads as a shake, not a
   *  diagonal slide). */
  hitKickFrames: 7,
  hitKickBasePx: 3,
  hitKickYFactor: 0.6,
} as const;

/** The motion kinds that drive the opacity channel (enter: 0→1; exit:
 *  1→0; emphasis: the dip). wipe/grow drive reveal, count drives the
 *  value — their opacity stays at the base. */
const OPACITY_KINDS = new Set(["fade", "rise", "slide", "pop"]);
/** The motion kinds that drive the reveal-progress channel. */
const PROGRESS_KINDS = new Set(["wipe", "grow", "draw"]);

export interface GraphicsElementFrame {
  id: string;
  /** base opacity × the composed factor, 0..1. */
  opacity: number;
  /** scene-space position: placement + the composed offsets. */
  x: number;
  y: number;
  /** placement scale × the composed factor. */
  scale: number;
  rotateDeg: number;
  /** 0..1 reveal — the composer's wipe/grow/draw channel. */
  progress: number;
  /** counter kind only — the tweened value (absent otherwise). */
  counterValue?: number;
  /** S126 — sprite kind only: the bounded frame index from the scene-local
   *  clock at the payload's fps (absent otherwise). The applier consumes it
   *  (sheet viewBox window / sequence display toggle). */
  frameIndex?: number;
}

export interface GraphicsFrameState {
  /** the scene the doc clock resolved to. */
  sceneId: string;
  /** the scene-local clock (ms into THIS scene) — what the composer renders against. */
  sceneTMs: number;
  /** S130 — the scene camera's world→screen state, present ONLY when the
   *  active scene carries a camera directive (absence keeps every
   *  camera-less payload byte-identical — the additive-seam law). */
  camera?: GraphicsCameraState;
  /** the active scene's elements in doc order, each at its frame state. */
  elements: GraphicsElementFrame[];
}

interface SceneClock {
  scene: GraphicsDoc["scenes"][number];
  startMs: number;
  endMs: number;
  durationMs: number;
}

/** The VO tail (ms) — the hold after the last spoken word before the cut
 *  (the whiteboard lane's 350 ms stroke-landing tail, mirrored: a scene
 *  that ends the instant the narration stops feels clipped). ONE named
 *  constant — the clock rule and the pins cite it. */
export const GRAPHICS_VO_TAIL_MS = 350;

/** The per-scene effective clocks: explicit > measured VO + tail > the
 *  house estimate (ONE clock model — S152, the whiteboard precedence
 *  mirrored). `voMsBySceneId` is the renderer-side measurement (WAV
 *  header math on the standing scene WAVs); absent → the estimate only
 *  (the client editor's shape). Pure — recomputed per call, cheap at the
 *  grammar's walls (≤24 scenes). */
function sceneClocks(doc: GraphicsDoc, voMsBySceneId?: Map<string, number>): SceneClock[] {
  if (doc.scenes.length === 0) {
    // Junk input is a CALLER bug (the keyframe.ts law) — the validator
    // refuses empty docs; frameAt refuses loudly too, never fabricates.
    throw new Error("frameAt: the doc has no scenes — pass a validated GraphicsDoc");
  }
  const clocks: SceneClock[] = [];
  let cursor = 0;
  for (const scene of doc.scenes) {
    const voMs = voMsBySceneId?.get(scene.id);
    const durationMs = scene.durationMs !== undefined && scene.durationMs > 0
      ? scene.durationMs
      : voMs !== undefined && voMs > 0
        ? Math.round(voMs + GRAPHICS_VO_TAIL_MS)
        : estimateNarrationMs(scene.narration);
    clocks.push({ scene, startMs: cursor, endMs: cursor + durationMs, durationMs });
    cursor += durationMs;
  }
  return clocks;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * S160 — the hit kick: the camera shake a `hit` event fires (the
 * animated-shorts camera grammar's KICKS law, measured in its motion
 * report and ported here). The LATEST hit inside the window owns the
 * shake (overlapping hits never stack); the offset flips sign every
 * delivered frame and decays over `hitKickFrames` frames; the amplitude
 * is `hitKickBasePx` at the 720p reference height, scaled to the doc's
 * own height. PURE — the decay is sqrt(u)·u (IEEE sqrt is exactly
 * specified — the no-pow law holds); same inputs → byte-identical
 * offsets. No events / no live window → the zero offset (the seam law:
 * every pre-S160 payload evaluates unchanged).
 */
export function hitKickOffset(
  events: readonly GraphicsEvent[] | undefined,
  sceneTMs: number,
  fps: number,
  docHeight: number,
): { dx: number; dy: number } {
  if (!events || events.length === 0) return { dx: 0, dy: 0 };
  const S = GRAPHICS_MOTION_SEMANTICS;
  const frameMs = 1000 / fps;
  let latest: number | null = null; // the smallest n = the most recent live hit
  for (const ev of events) {
    if (ev.kind !== "hit") continue;
    const n = (sceneTMs - ev.tMs) / frameMs;
    // The window [0, frames) with the epsilon fold on the far edge (a
    // floating-point n that lands a hair under the close must read as
    // outside — same fold as the parity below).
    if (n < 0 || n >= S.hitKickFrames - 1e-9) continue;
    if (latest === null || n < latest) latest = n;
  }
  if (latest === null) return { dx: 0, dy: 0 };
  const u = 1 - latest / S.hitKickFrames;
  const decay = Math.sqrt(u) * u; // (1 − n/frames)^1.5, sqrt-exact
  const px = S.hitKickBasePx * (docHeight / 720) * decay;
  // The flip parity snaps to the OWNING frame (a floating-point n that
  // lands a hair under a frame boundary must not read as the previous
  // frame — the epsilon-fold law).
  const sign = Math.floor(latest + 1e-9) % 2 === 0 ? 1 : -1;
  return { dx: px * sign, dy: px * S.hitKickYFactor * -sign };
}

/** The emphasis envelope: triangle phase eased by the motion's own curve —
 *  0 at both window edges (continuity at emphasis boundaries), 1 at the
 *  window midpoint. */
function emphasisEnv(m: ElementMotion, tMs: number): number {
  const p = clamp01((tMs - m.delayMs) / m.durationMs);
  const q = p <= 0.5 ? p * 2 : (1 - p) * 2;
  return evalEase(m.ease, q);
}

interface Channels {
  opacityFactor: number;
  dx: number;
  dy: number;
  scaleFactor: number;
  /** S129 — the tween fold's additive rotation delta (the ONLY writer;
   *  v1 motions never rotate). */
  rotateDelta: number;
  progress: number;
  /** the counter value the ENTER layer produces at clamped progress —
   *  captured by the exit's drain (continuity at the exit boundary). */
  counterFromEnter: number;
}

/** The counter value the enter layer holds at time t (clamped): from at
 *  the window start, to after it. */
function counterAtEnter(el: GraphicsElement, enter: ElementMotion, tMs: number): number {
  const payload = el.counter;
  if (payload === undefined) return 0;
  const e = evalEase(enter.ease, clamp01((tMs - enter.delayMs) / enter.durationMs));
  return payload.from + (payload.to - payload.from) * e;
}

function enterChannels(el: GraphicsElement, tMs: number, out: Channels): void {
  const m = el.enter;
  const e = evalEase(m.ease, clamp01((tMs - m.delayMs) / m.durationMs));
  if (OPACITY_KINDS.has(m.kind)) out.opacityFactor = e;
  if (PROGRESS_KINDS.has(m.kind)) out.progress = e;
  if (m.kind === "rise") out.dy += GRAPHICS_MOTION_SEMANTICS.risePx * (1 - e);
  if (m.kind === "slide") out.dx -= GRAPHICS_MOTION_SEMANTICS.slidePx * (1 - e);
  if (m.kind === "pop") out.scaleFactor = GRAPHICS_MOTION_SEMANTICS.popFrom + (1 - GRAPHICS_MOTION_SEMANTICS.popFrom) * e;
  if (m.kind === "count") out.counterFromEnter = counterAtEnter(el, m, tMs);
}

/** S129 — the tween fold. The validator guarantees finite values and
 *  strictly-ascending window-relative keys, so evalAt's refusals are
 *  unreachable here (the Part F law: validate once, schedule purely). */
function tweenChannels(tweens: readonly ElementTween[], tMs: number, out: Channels): void {
  for (const tw of tweens) {
    for (const track of tw.channels) {
      const v = evalAt(
        track.keys.map((k) => ({ tMs: tw.delayMs + k.tMs, value: k.value, ease: k.ease })),
        tMs,
      );
      switch (track.channel) {
        case "dx": out.dx += v; break;
        case "dy": out.dy += v; break;
        case "scale": out.scaleFactor *= v; break;
        case "rotateDeg": out.rotateDelta += v; break;
        case "opacity": out.opacityFactor *= v; break;
        case "progress": out.progress *= v; break;
      }
    }
  }
}

function exitChannels(el: GraphicsElement, exit: ElementMotion, tMs: number, out: Channels): void {
  const e = evalEase(exit.ease, clamp01((tMs - exit.delayMs) / exit.durationMs));
  if (OPACITY_KINDS.has(exit.kind)) out.opacityFactor *= 1 - e;
  if (PROGRESS_KINDS.has(exit.kind)) out.progress *= 1 - e;
  if (exit.kind === "rise") out.dy -= GRAPHICS_MOTION_SEMANTICS.exitRisePx * e;
  if (exit.kind === "slide") out.dx += GRAPHICS_MOTION_SEMANTICS.exitSlidePx * e;
  if (exit.kind === "pop") out.scaleFactor *= 1 - (1 - GRAPHICS_MOTION_SEMANTICS.popFrom) * e;
  if (exit.kind === "count") {
    // The drain is captured at the exit's START (continuity even when the
    // exit begins mid-enter): V0 = the enter value at exitStart → from.
    const v0 = counterAtEnter(el, el.enter, exit.delayMs);
    const payload = el.counter;
    const from = payload !== undefined ? payload.from : 0;
    out.counterFromEnter = v0 + (from - v0) * e;
  }
}

function emphasisChannels(emphasis: ElementMotion, tMs: number, out: Channels): void {
  // IN-WINDOW ONLY — identity outside (emphasis never holds a state).
  if (tMs < emphasis.delayMs || tMs > emphasis.delayMs + emphasis.durationMs) return;
  const env = emphasisEnv(emphasis, tMs);
  const S = GRAPHICS_MOTION_SEMANTICS;
  if (emphasis.kind === "fade") out.opacityFactor *= 1 - S.emphasisFadeDip * env;
  if (emphasis.kind === "pop" || emphasis.kind === "grow" || emphasis.kind === "count") {
    out.scaleFactor *= 1 + S.emphasisPopScale * env;
  }
  if (emphasis.kind === "rise") out.dy -= S.emphasisRisePx * env;
  if (emphasis.kind === "slide") out.dx += S.emphasisSlidePx * env;
  if (emphasis.kind === "wipe" || emphasis.kind === "draw") out.progress *= 1 - S.emphasisNudge * env;
}

function elementFrame(el: GraphicsElement, tMs: number): GraphicsElementFrame {
  const out: Channels = {
    opacityFactor: 1,
    dx: 0,
    dy: 0,
    scaleFactor: 1,
    rotateDelta: 0,
    progress: 1,
    counterFromEnter: el.counter !== undefined ? el.counter.to : 0,
  };
  enterChannels(el, tMs, out);
  if (el.tweens !== undefined) tweenChannels(el.tweens, tMs, out);
  if (el.exit !== undefined) exitChannels(el, el.exit, tMs, out);
  if (el.emphasis !== undefined) emphasisChannels(el.emphasis, tMs, out);
  const frame: GraphicsElementFrame = {
    id: el.id,
    opacity: clamp01((el.opacity ?? 1) * out.opacityFactor),
    x: el.at.x + out.dx,
    y: el.at.y + out.dy,
    scale: el.at.scale * out.scaleFactor,
    rotateDeg: el.at.rotateDeg + out.rotateDelta,
    progress: clamp01(out.progress),
  };
  if (el.counter !== undefined) frame.counterValue = out.counterFromEnter;
  // S126 — the sprite's frame index: derived from the SCENE-LOCAL clock at
  // the payload's fps (the shared timebase — no second clock), BOUNDED to
  // [0, frames-1] (the clip ends on its last frame; a loop is a future
  // flag, not a drive-by). Deterministic; validated payload in.
  if (el.sprite !== undefined) {
    const idx = Math.floor((tMs / 1000) * el.sprite.fps);
    frame.frameIndex = Math.max(0, Math.min(el.sprite.frames - 1, idx));
  }
  return frame;
}

/**
 * frameAt — the one source of motion truth. Resolves the doc clock to the
 * active scene (clamped to [0, total]) and returns that scene's elements
 * at their composed frame state. PURE: same input → byte-identical output
 * (pinned by the sweep-hash test).
 */
export function frameAt(
  doc: GraphicsDoc,
  tMs: number,
  voMsBySceneId?: Map<string, number>
): GraphicsFrameState {
  const clocks = sceneClocks(doc, voMsBySceneId);
  const last: SceneClock | undefined = clocks[clocks.length - 1];
  if (last === undefined) throw new Error("frameAt: the doc has no scenes — pass a validated GraphicsDoc");
  const total = last.endMs;
  const t = tMs < 0 ? 0 : tMs > total ? total : tMs;
  let active: SceneClock | undefined;
  for (const clock of clocks) {
    if (t < clock.endMs) {
      active = clock;
      break;
    }
  }
  if (active === undefined) active = last;
  const sceneT = t - active.startMs;
  // S160 — the camera fold: the pure cameraAt evaluation plus the hit
  // kick (a `hit` event's decaying shake, converted from screen px to
  // board units through the zoom the applier scales by). No camera → the
  // field stays ABSENT (the additive-seam law holds both ways); a camera
  // with no live hit window evaluates byte-identically to cameraAt alone.
  let camera: GraphicsCameraState | undefined;
  if (active.scene.camera !== undefined) {
    const cam = cameraAt(active.scene.camera, sceneT);
    const kick = hitKickOffset(active.scene.events, sceneT, doc.fps, doc.height);
    camera = kick.dx !== 0 || kick.dy !== 0
      ? { zoom: cam.zoom, tx: cam.tx + kick.dx / cam.zoom, ty: cam.ty + kick.dy / cam.zoom }
      : cam;
  }
  // S130 — the camera resolves on the SCENE-LOCAL clock (the R-6 law: one
  // scene resolution, one scene-local evaluation, one function call apart).
  return {
    sceneId: active.scene.id,
    sceneTMs: sceneT,
    ...(camera !== undefined ? { camera } : {}),
    // R-6 (the S123 multi-scene pin): element motions are SCENE-LOCAL (the
    // validator's time-sanity law bounds every motion span by its own
    // scene's clock), so they evaluate against the scene-local clock —
    // passing the global doc time here made every scene after the first
    // skip its entrances (the motion windows clamped complete). The
    // single-scene suite could not see it; the multi-scene pin does.
    elements: active.scene.elements.map((el) => elementFrame(el, sceneT)),
  };
}

/** The doc-level frame count — the render pre-flight's arithmetic (G1.5)
 *  against GRAPHICS_FRAME_BUDGET, exposed here so the wall has one
 *  calculator. Uses the anim/clock frame rule (round to whole frames —
 *  frameCountOf's Math.round). */
export function graphicsFrameCount(doc: GraphicsDoc, voMsBySceneId?: Map<string, number>): number {
  const clocks = sceneClocks(doc, voMsBySceneId);
  const last: SceneClock | undefined = clocks[clocks.length - 1];
  if (last === undefined) throw new Error("graphicsFrameCount: the doc has no scenes — pass a validated GraphicsDoc");
  return frameCountOf(last.endMs, doc.fps);
}

/** The per-scene clocks in ms — explicit durationMs > measured VO + tail
 *  > the house estimate (ONE clock rule; this is its single home, shared
 *  with the preflight wall (R-1) and the tracks projection, which
 *  quantize it through framePlanWindows at doc.fps — S152: every reader
 *  takes the SAME measured map so the wall, the contract and the
 *  delivered frames agree on the extended clock). Pure. */
export function graphicsSceneDurationsMs(
  doc: GraphicsDoc,
  voMsBySceneId?: Map<string, number>
): number[] {
  return sceneClocks(doc, voMsBySceneId).map((c) => c.durationMs);
}

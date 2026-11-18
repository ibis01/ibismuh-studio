// S163 Phase B — the NATIVE graphics transition engine (the six-engine
// audit's S163 Phase B staging): scene-to-scene transitions composited
// from the two scenes' SNAPSHOTS — the outgoing scene's final frame and
// the incoming scene's first frame — with transform/alpha/mask hooks,
// executed as canvas ops inside the ONE chromium screenshot pipeline.
//
// THE ARCHITECTURE (the audit's MC-buffer description, nativized): a
// transition WINDOW is a segment kind of its own — N composited frames
// that join the concat list between the two scene clips. The window's
// frames are carved OUT of the outgoing scene's tail (the OVERLAP
// ACCOUNTING LAW below), so the delivered program stays exactly the doc
// clock: Σ delivered clips + Σ windows ≡ Σ scene clocks. The window shows
// the outgoing scene FROZEN on its final delivered frame while the
// incoming scene's first frame reveals through the type's geometry — the
// pure endpoints of the blend live OUTSIDE the window (A's last clip
// frame before it, B's own first frame after it), so the window's progress
// rides the OPEN interval (k+1)/(N+1) and both seams are quantization-tight.
//
// THE OVERLAP ACCOUNTING LAW (opus specDuration law, net-zero form): the
// transition frames OVERLAP the joined scenes' clock — the window is
// SUBTRACTED from the outgoing scene's delivered frames and given back as
// the window clip, never added on top. planNativeTransitions is the ONE
// derivation; the renderer reads its numbers (clip frames, clip seconds,
// window seconds, totals) and the two-clock assert compares its totalSec
// against the unchanged contract (the tracks still carry the doc clock —
// the windows live INSIDE the outgoing scene's tail, so narration, QC
// lenses and the editor preview never move). An off-by-one here — a window
// added, a carve forgotten, a double carve — breaks the identity and the
// assembly refuses (an engine bug, never a doc problem).
//
// THE AUDIO LAW: the outgoing scene's VO tail that the carve removes from
// its clip CONTINUES through the window (the encode offsets the VO slot by
// the outgoing clip's delivered seconds), so a narration that spans the
// seam is never clipped mid-word — the same contract the video lane's
// acrossfade sits inside (its 0.85s tail + 0.35s lead comment). Windows
// longer than the VO tail eat into the outgoing scene's designed hold, the
// way every measured beat eats the tail it was measured against.
//
// THE FPS-FREE LAW (Phase A's law, mirrored): a spec stores FRAMES — the
// opus table's unit of account — and derives seconds ONCE: the reference
// table below at the pinned 30 fps reference (the opus DEFAULTS numbers,
// parity-pinned with Phase A's TRANSITION_PRESET_DEFAULTS), and the plan
// builder's single frames ÷ doc.fps for the delivered clock. The renderer
// never re-derives a duration from frames anywhere else.
//
// PURE MODULE — no fs, no ffmpeg spawn, no Date.now, no Math.random (the
// house frame-truth laws; the source pins scan for exactly that). The
// renderer owns execution; this module owns the truth: the vocabulary,
// the seeded geometry, the per-frame compositor descriptions, the plan,
// and the page + applier strings the ONE screenshot pipeline evaluates.
import type { AnimClockScene } from "../anim/clock";
import { quantizeClock } from "../anim/clock";

// ---------------------------------------------------------------------------
// The vocabulary — the closed native set (grammar-sprawl law: new members
// are a design-doc slice). The opus beats keep their MEASURED frame counts
// (the audit's DEFAULTS numbers, provenance in Phase A's table); the wipes
// and the crossfade ride the house 0.5s beat at the reference rate (15f).
// ---------------------------------------------------------------------------

export type NativeTransitionType =
  | "crossfade"
  | "iris" // the opus iris beat — a growing circle reveals the incoming scene
  | "whiteout" // the opus whiteout beat — a dip through the dip color
  | "zoomthrough" // the opus zoom beat — push through the cut into the next scene
  | "wipeleft" // the seeded-edge wipe family — the edge travels right→left
  | "wiperight"; // the seeded-edge wipe family — the edge travels left→right

export const NATIVE_TRANSITION_TYPES: readonly NativeTransitionType[] = [
  "crossfade",
  "iris",
  "whiteout",
  "zoomthrough",
  "wipeleft",
  "wiperight",
];

export interface TransitionSpec {
  type: NativeTransitionType;
  /** Window length in FRAMES at the doc's own fps — the unit of account
   *  (the fps-free law). Absent on the raw doc → the type's measured
   *  default below; the sanitizer always lands an integer here. */
  frames: number;
  /** Edge tilt in degrees (the wipe family — the reveal edge shears about
   *  the frame center; −GRAPHICS_TRANSITION_ANGLE_MAX..+MAX). */
  angle?: number;
  /** The whiteout dip color (#rrggbb; absent → the house white). */
  color?: string;
  /** The wipe family's band count (the staggered sweep; 1 = one edge). */
  bands?: number;
  /** The wipe family's edge seed — binds the per-band stagger through
   *  hash01. Absent → GRAPHICS_TRANSITION_SEED_DEFAULT. */
  seed?: number;
}

/** The opus-measured defaults (frames at the doc's own rate): iris 8 /
 *  whiteout 42 / zoom 14 are the audit's DEFAULTS numbers read at source
 *  (Phase A carries the same provenance); the wipes and the crossfade ride
 *  the house 0.5s beat — 15 frames at the 30 fps reference. */
export const NATIVE_TRANSITION_DEFAULT_FRAMES: Readonly<Record<NativeTransitionType, number>> = {
  crossfade: 15,
  iris: 8,
  whiteout: 42,
  zoomthrough: 14,
  wipeleft: 15,
  wiperight: 15,
};

// ---------------------------------------------------------------------------
// Named walls — values are receipts to tune; the NAMES are the contract.
// ---------------------------------------------------------------------------

/** A window shorter than this does not read as a beat. */
export const GRAPHICS_TRANSITION_FRAMES_MIN = 2;
/** The window ceiling — 1.5s at the 30 fps reference, the assembly's own
 *  TRANSITION_DURATION_MAX (one duration ceiling across both lanes). */
export const GRAPHICS_TRANSITION_FRAMES_MAX = 45;
export const GRAPHICS_TRANSITION_BANDS_MAX = 12;
export const GRAPHICS_TRANSITION_ANGLE_MAX = 45;
/** The seed bound (31-bit) — hash01 mixes any int, but the wall keeps a
 *  stored spec's seed inside the grammar's integer shape. */
export const GRAPHICS_TRANSITION_SEED_MAX = 2_147_483_647;
export const GRAPHICS_TRANSITION_SEED_DEFAULT = 0;
/** The whiteout's house dip color when the spec carries none. */
export const WHITEOUT_DEFAULT_COLOR = "#ffffff";
/** The wipe family's per-band stagger ceiling — a band may lag this far
 *  into the window (hash01-derived) before it completes its own sweep. */
export const WIPE_LAG_MAX = 0.35;
/** The zoomthrough's peak scale — the outgoing scene grows to this as the
 *  incoming scene settles from it (the push-through reads at 3× on the
 *  house surfaces; a receipt to tune). */
export const ZOOM_PEAK_SCALE = 3;

/** The pinned reference rate — the opus table's own 30 fps (Phase A's
 *  provenance). The ONLY rate the reference table divides by. */
export const GRAPHICS_TRANSITION_REFERENCE_FPS = 30;

/** THE ONE frames→seconds conversion at the reference rate (3-dp, the
 *  house clock's precision). The plan builder's delivered window seconds
 *  are the OTHER pinned site (frames ÷ doc.fps); nothing else converts. */
export function transitionSecondsAtReference(frames: number): number {
  return Math.round((frames / GRAPHICS_TRANSITION_REFERENCE_FPS) * 1000) / 1000;
}

/** The measured beats' seconds priors — derived ONCE at module load from
 *  the frames table, parity-pinned with Phase A's TRANSITION_PRESET_DEFAULTS
 *  (iris 0.267 / whiteout 1.4 / zoomthrough 0.467; the 15f beats → 0.5). */
export const NATIVE_TRANSITION_REFERENCE_SECONDS: Readonly<Record<NativeTransitionType, number>> = {
  crossfade: transitionSecondsAtReference(15),
  iris: transitionSecondsAtReference(8),
  whiteout: transitionSecondsAtReference(42),
  zoomthrough: transitionSecondsAtReference(14),
  wipeleft: transitionSecondsAtReference(15),
  wiperight: transitionSecondsAtReference(15),
};

// ---------------------------------------------------------------------------
// The opus kit geometry — pure seeded helpers (the audit names them; opus
// source is NOT vendored, these are the in-house implementations).
// ---------------------------------------------------------------------------

/** hash01 — a seeded 0..1 scalar (FNV-1a-style 32-bit integer mix, the
 *  whiteboard roughen precedent: a pure integer hash, NO shared mutable
 *  stream, no ambient state). Identical (seed, index) → identical value,
 *  in any process, on any day. */
export function hash01(seed: number, index: number): number {
  let h = 0x811c9dc5 ^ Math.imul(seed | 0, 0x01000193);
  h = Math.imul(h ^ (index | 0), 0x01000193);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491);
  h ^= h >>> 13;
  return (h >>> 0) / 0x100000000;
}

export interface WipeAxis {
  /** The sweep axis in frame space. */
  axis: "x" | "y";
  /** The travel direction: +1 = the edge moves with the axis (wiperight),
   *  −1 = against it (wipeleft). */
  sign: 1 | -1;
}

/** axisFor — the wipe's sweep axis + direction. wiperight's edge travels
 *  left→right (the incoming scene reveals FROM the left edge, matching the
 *  Phase A catalog's arrow semantics); wipeleft mirrors it. Non-wipe types
 *  have no sweep — the neutral x/+1 axis keeps the table total. */
export function axisFor(type: NativeTransitionType): WipeAxis {
  switch (type) {
    case "wipeleft":
      return { axis: "x", sign: -1 };
    case "wiperight":
      return { axis: "x", sign: 1 };
    default:
      return { axis: "x", sign: 1 };
  }
}

/** cornerR — the wipe band's corner rounding radius in px (1.5% of the
 *  surface height: ≈16px at 1080, ≈5px at 360) — the band edges read soft
 *  instead of aliased. Pure surface geometry, no seed. */
export function cornerR(height: number): number {
  return Math.max(0, Math.round(height * 0.015));
}

// ---------------------------------------------------------------------------
// The frame description — the compositor's whole output: a JSON-stable
// layer list the renderer executes as canvas ops through the ONE applier
// below. Numbers are quantized to 3 dp so the description byte-stabilizes
// for the sweep-hash pins (the determinism law extends to the window).
// ---------------------------------------------------------------------------

export interface TransitionMaskRect {
  kind: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  /** Corner radius in px (the executor clamps to the rect's half-sides). */
  radius: number;
}

export interface TransitionMaskCircle {
  kind: "circle";
  cx: number;
  cy: number;
  r: number;
}

export interface TransitionMaskPoly {
  kind: "poly";
  pts: [number, number][];
}

export type TransitionMask = TransitionMaskRect | TransitionMaskCircle | TransitionMaskPoly;

export interface TransitionLayer {
  /** What paints: a snapshot ("A" = outgoing, "B" = incoming) or a solid. */
  source: "A" | "B" | { color: string };
  /** 0..1 layer opacity. */
  alpha: number;
  /** Uniform scale about the frame center (1 = the full surface). */
  scale: number;
  /** Post-scale offset in px from the frame center. */
  dx: number;
  dy: number;
  /** Optional mask — only the masked region paints (a canvas clip). */
  mask?: TransitionMask;
}

export interface TransitionFrameDescription {
  width: number;
  height: number;
  /** The frame's own progress, 3-dp (the sweep-hash pin's key). */
  progress: number;
  layers: TransitionLayer[];
}

export interface SnapshotGeometry {
  width: number;
  height: number;
}

export interface TransitionCtx {
  width: number;
  height: number;
}

const r3 = (n: number): number => Math.round(n * 1000) / 1000;
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

function snapshotLayer(source: "A" | "B", alpha: number, scale = 1): TransitionLayer {
  return { source, alpha: r3(alpha), scale: r3(scale), dx: 0, dy: 0 };
}

function colorLayer(color: string, alpha: number): TransitionLayer {
  return { source: { color }, alpha: r3(alpha), scale: 1, dx: 0, dy: 0 };
}

/**
 * ONE composited window frame — the pure frame-compositor the audit
 * stages: (frameA, frameB, progress, spec, ctx) → the frame description.
 * The snapshots ride by GEOMETRY only (the module never touches pixels —
 * the renderer screenshots the two frames and the applier draws them), so
 * the function is exactly as pure as the scene frame truth.
 *
 * `frameA`/`frameB` are the two snapshots' surfaces; a mismatch with the
 * output ctx is an engine bug and refuses loudly (the renderer composes
 * both snapshots on the doc's own surface — they can never disagree).
 */
export function compositeTransitionFrame(
  frameA: SnapshotGeometry,
  frameB: SnapshotGeometry,
  progress: number,
  spec: TransitionSpec,
  ctx: TransitionCtx,
): TransitionFrameDescription {
  if (frameA.width !== ctx.width || frameA.height !== ctx.height || frameB.width !== ctx.width || frameB.height !== ctx.height) {
    throw new Error(
      `compositeTransitionFrame: the snapshots (${frameA.width}×${frameA.height}, ${frameB.width}×${frameB.height}) do not match the output surface (${ctx.width}×${ctx.height}) — an engine bug, not a spec problem`,
    );
  }
  const w = ctx.width;
  const h = ctx.height;
  const p = clamp01(progress);
  const layers: TransitionLayer[] = [];

  switch (spec.type) {
    case "crossfade": {
      // A holds under B's rising alpha — the plain melt.
      layers.push(snapshotLayer("A", 1));
      layers.push(snapshotLayer("B", p));
      break;
    }
    case "iris": {
      // The circle grows from the center to the frame's half-diagonal (the
      // radius that just covers the corners) — the opus snap beat.
      const rMax = Math.hypot(w, h) / 2;
      layers.push(snapshotLayer("A", 1));
      layers.push({
        source: "B",
        alpha: 1,
        scale: 1,
        dx: 0,
        dy: 0,
        mask: { kind: "circle", cx: r3(w / 2), cy: r3(h / 2), r: r3(p * rMax) },
      });
      break;
    }
    case "whiteout": {
      // Two halves through the dip color: A → color (p < 0.5), color → B.
      const color = spec.color ?? WHITEOUT_DEFAULT_COLOR;
      if (p < 0.5) {
        layers.push(snapshotLayer("A", 1));
        layers.push(colorLayer(color, p * 2));
      } else {
        layers.push(snapshotLayer("B", (p - 0.5) * 2));
        layers.push(colorLayer(color, 1 - (p - 0.5) * 2));
      }
      break;
    }
    case "zoomthrough": {
      // Push through the cut: the outgoing scene grows toward the camera
      // and fades while the incoming scene settles from the peak scale —
      // both alive mid-window (no dip), the pass-through reads.
      layers.push(snapshotLayer("B", p, ZOOM_PEAK_SCALE - (ZOOM_PEAK_SCALE - 1) * p));
      layers.push(snapshotLayer("A", 1 - p, 1 + (ZOOM_PEAK_SCALE - 1) * p));
      break;
    }
    case "wipeleft":
    case "wiperight": {
      // The seeded-edge wipe: the surface splits into `bands` horizontal
      // strips; each strip's sweep lags by hash01(seed, band) — the stagger
      // IS the seeded edge — and a spec angle shears every edge about the
      // frame center. The reveal polygon per band is exact (edge × band
      // window), the tilt switches the mask to the sharp quad.
      layers.push(snapshotLayer("A", 1));
      const axis = axisFor(spec.type);
      const bands = Math.max(1, Math.floor(spec.bands ?? 1));
      const seed = spec.seed ?? GRAPHICS_TRANSITION_SEED_DEFAULT;
      const tilt = Math.tan(((spec.angle ?? 0) * Math.PI) / 180);
      const tiltSpan = Math.abs(tilt) * h;
      const bandH = h / bands;
      const radius = cornerR(h);
      for (let b = 0; b < bands; b++) {
        const lag = WIPE_LAG_MAX * hash01(seed, b);
        const bp = clamp01((p - lag) / (1 - lag));
        const y0 = b * bandH;
        const y1 = (b + 1) * bandH;
        // The edge's x at the band's top/bottom — sweep about the center,
        // tilted, mirrored for the travel direction (axisFor's sign).
        const sweepAt = (y: number): number =>
          (bp - 0.5) * (w + tiltSpan) + axis.sign * tilt * (y - h / 2);
        const edgeX = (y: number): number => w / 2 + sweepAt(y);
        if (axis.sign > 0) {
          // wiperight: the reveal is LEFT of the edge — [0, edgeX].
          const e0 = Math.max(0, Math.min(w, edgeX(y0)));
          const e1 = Math.max(0, Math.min(w, edgeX(y1)));
          if (e0 <= 0 && e1 <= 0) continue;
          if (tilt === 0) {
            layers.push({
              source: "B",
              alpha: 1,
              scale: 1,
              dx: 0,
              dy: 0,
              mask: { kind: "rect", x: 0, y: r3(y0), w: r3(Math.max(e0, e1)), h: r3(y1 - y0), radius },
            });
          } else {
            layers.push({
              source: "B",
              alpha: 1,
              scale: 1,
              dx: 0,
              dy: 0,
              mask: { kind: "poly", pts: [[0, r3(y0)], [r3(e0), r3(y0)], [r3(e1), r3(y1)], [0, r3(y1)]] },
            });
          }
        } else {
          // wipeleft: the reveal is RIGHT of the edge — [edgeX, w].
          const e0 = Math.max(0, Math.min(w, edgeX(y0)));
          const e1 = Math.max(0, Math.min(w, edgeX(y1)));
          if (e0 >= w && e1 >= w) continue;
          if (tilt === 0) {
            layers.push({
              source: "B",
              alpha: 1,
              scale: 1,
              dx: 0,
              dy: 0,
              mask: {
                kind: "rect",
                x: r3(Math.min(e0, e1)),
                y: r3(y0),
                w: r3(w - Math.min(e0, e1)),
                h: r3(y1 - y0),
                radius,
              },
            });
          } else {
            layers.push({
              source: "B",
              alpha: 1,
              scale: 1,
              dx: 0,
              dy: 0,
              mask: { kind: "poly", pts: [[r3(e0), r3(y0)], [r3(w), r3(y0)], [r3(w), r3(y1)], [r3(e1), r3(y1)]] },
            });
          }
        }
      }
      break;
    }
  }

  return { width: w, height: h, progress: r3(p), layers };
}

// ---------------------------------------------------------------------------
// The spec sanitizer — the grammar's tolerant read for one native spec
// (types.ts calls it per entry; junk drops honestly with a warning, the
// measured defaults fill what is absent — never an error, never a refusal).
// ---------------------------------------------------------------------------

const SPEC_KEYS = new Set(["type", "frames", "angle", "color", "bands", "seed"]);

/** The grammar's #rrggbb shape (types.ts HEX_RE — restated here because
 *  this leaf module must not import the grammar; the two are parity-pinned
 *  through the round-trip test). */
const SPEC_HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function sanitizeNativeTransitionSpec(
  raw: unknown,
  where: string,
  warnings: string[],
): TransitionSpec | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    warnings.push(`${where}: dropped — not an object`);
    return null;
  }
  const rec = raw as Record<string, unknown>;
  for (const key of Object.keys(rec)) {
    if (!SPEC_KEYS.has(key)) warnings.push(`${where}: unknown field "${key}" ignored`);
  }
  const type =
    typeof rec.type === "string" && (NATIVE_TRANSITION_TYPES as readonly string[]).includes(rec.type)
      ? (rec.type as NativeTransitionType)
      : null;
  if (type === null) {
    warnings.push(
      `${where}: dropped — type not in the closed native set (${NATIVE_TRANSITION_TYPES.join(", ")})`,
    );
    return null;
  }

  const out: TransitionSpec = { type, frames: NATIVE_TRANSITION_DEFAULT_FRAMES[type] };

  // frames — the unit of account; absent → the measured default, junk →
  // the default with a note, out-of-wall → clamped with a note.
  if (rec.frames !== undefined) {
    const frames = rec.frames;
    if (typeof frames !== "number" || !Number.isFinite(frames)) {
      warnings.push(`${where}: frames dropped — not a finite number (the type's measured default ${out.frames} applies)`);
    } else {
      const rounded = Math.round(frames);
      if (rounded !== frames) warnings.push(`${where}: frames ${frames} rounded to ${rounded}`);
      if (rounded < GRAPHICS_TRANSITION_FRAMES_MIN || rounded > GRAPHICS_TRANSITION_FRAMES_MAX) {
        const clamped = Math.max(GRAPHICS_TRANSITION_FRAMES_MIN, Math.min(GRAPHICS_TRANSITION_FRAMES_MAX, rounded));
        warnings.push(
          `${where}: frames ${rounded} clamped to the ${GRAPHICS_TRANSITION_FRAMES_MIN}..${GRAPHICS_TRANSITION_FRAMES_MAX} wall`,
        );
        out.frames = clamped;
      } else {
        out.frames = rounded;
      }
    }
  }

  // angle — the wipe shear, clamped into ±GRAPHICS_TRANSITION_ANGLE_MAX.
  if (rec.angle !== undefined) {
    const angle = rec.angle;
    if (typeof angle !== "number" || !Number.isFinite(angle)) {
      warnings.push(`${where}: angle dropped — not a finite number`);
    } else if (angle < -GRAPHICS_TRANSITION_ANGLE_MAX || angle > GRAPHICS_TRANSITION_ANGLE_MAX) {
      warnings.push(`${where}: angle ${angle} clamped to ±${GRAPHICS_TRANSITION_ANGLE_MAX}`);
      out.angle = Math.max(-GRAPHICS_TRANSITION_ANGLE_MAX, Math.min(GRAPHICS_TRANSITION_ANGLE_MAX, angle));
    } else {
      out.angle = angle;
    }
  }

  // color — the whiteout dip; junk drops (an optional decoration, the
  // tolerance law), a well-formed hex lowers (the grammar's hex law).
  if (rec.color !== undefined) {
    const color = rec.color;
    if (typeof color !== "string" || !SPEC_HEX_RE.test(color)) {
      warnings.push(`${where}: color dropped — not #rrggbb`);
    } else {
      out.color = color.toLowerCase();
    }
  }

  // bands — the wipe stagger count.
  if (rec.bands !== undefined) {
    const bands = rec.bands;
    if (typeof bands !== "number" || !Number.isFinite(bands) || bands < 1) {
      warnings.push(`${where}: bands dropped — not a finite number ≥ 1`);
    } else {
      const rounded = Math.round(bands);
      if (rounded !== bands) warnings.push(`${where}: bands ${bands} rounded to ${rounded}`);
      if (rounded > GRAPHICS_TRANSITION_BANDS_MAX) {
        warnings.push(`${where}: bands ${rounded} clamped to ${GRAPHICS_TRANSITION_BANDS_MAX}`);
        out.bands = GRAPHICS_TRANSITION_BANDS_MAX;
      } else {
        out.bands = rounded;
      }
    }
  }

  // seed — the edge seed; junk drops, out-of-range wraps into the wall.
  if (rec.seed !== undefined) {
    const seed = rec.seed;
    if (typeof seed !== "number" || !Number.isFinite(seed)) {
      warnings.push(`${where}: seed dropped — not a finite number`);
    } else {
      const truncated = Math.trunc(seed);
      if (truncated !== seed) warnings.push(`${where}: seed ${seed} truncated to ${truncated}`);
      const bound = ((truncated % (GRAPHICS_TRANSITION_SEED_MAX + 1)) + GRAPHICS_TRANSITION_SEED_MAX + 1) %
        (GRAPHICS_TRANSITION_SEED_MAX + 1);
      if (bound !== truncated) warnings.push(`${where}: seed ${truncated} bound to the 0..${GRAPHICS_TRANSITION_SEED_MAX} wall`);
      out.seed = bound;
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// The overlap-accounting plan — the ONE derivation the renderer reads.
// ---------------------------------------------------------------------------

export interface NativeTransitionWindow {
  /** The boundary this window joins: between scene `boundary` and
   *  `boundary + 1` (0-based). */
  boundary: number;
  spec: TransitionSpec;
  /** Window length in frames at the doc fps. */
  frames: number;
  /** Window seconds — frames ÷ doc.fps, derived HERE once (the delivered
   *  clock's only conversion; the encode and the assert read this). */
  sec: number;
  /** The frame-quantized clock: the window occupies the outgoing scene's
   *  tail — [clip end, scene end] on the doc clock. */
  startSec: number;
  endSec: number;
}

export interface NativeTransitionPlan {
  windows: NativeTransitionWindow[];
  /** Per-scene DELIVERED clip frames — every outgoing scene carved by its
   *  own window (scene b loses windows[b].frames at its tail). */
  sceneClipFrames: number[];
  /** Per-scene delivered clip seconds (frames ÷ doc.fps). */
  sceneClipSec: number[];
  /** Σ clips + Σ windows — the doc-clock total, unchanged (the two-clock
   *  assert compares exactly this against the tracks contract). */
  totalSec: number;
}

/**
 * The transition-aware plan from the LEGACY frame plan: each boundary's
 * window carves its frames out of the OUTGOING scene's tail (the incoming
 * scene keeps its full clock — the graphics VO has no lead padding, the
 * incoming scene must never cede time), and the identity
 *     Σ sceneClipFrames + Σ window frames ≡ Σ legacy scene frames
 * holds as an INTEGER identity (an off-by-one is an engine bug; the
 * assembly's two-clock assert catches it at render time too).
 *
 * Refuses loudly (a caller bug, the framePlanWindows convention): junk
 * fps, more specs than boundaries, or a window that would leave its
 * outgoing scene without a frame.
 */
export function planNativeTransitions(input: {
  scenes: AnimClockScene[];
  fps: number;
  specs: TransitionSpec[];
}): NativeTransitionPlan | null {
  if (input.specs.length === 0) return null;
  if (!Number.isFinite(input.fps) || input.fps <= 0) {
    throw new Error(`planNativeTransitions received a junk fps (${String(input.fps)})`);
  }
  const sceneCount = input.scenes.length;
  if (input.specs.length > sceneCount - 1) {
    throw new Error(
      `planNativeTransitions received ${input.specs.length} specs for ${sceneCount} scenes — only ${Math.max(0, sceneCount - 1)} boundaries exist (the validator drops the extras; this is an engine bug)`,
    );
  }

  const clipFrames = input.scenes.map((s) => s.frames);
  const windows: NativeTransitionWindow[] = [];
  for (let b = 0; b < input.specs.length; b++) {
    const spec = input.specs[b];
    const scene = input.scenes[b];
    const carve = spec.frames;
    const remaining = scene.frames - carve;
    if (remaining < 1) {
      throw new Error(
        `the ${spec.type} window (${carve} frames) exceeds scene ${b + 1}'s clock (${scene.frames} frames) — shorten the window or lengthen the scene`,
      );
    }
    clipFrames[b] = remaining;
    const clipSec = remaining / input.fps;
    const winSec = carve / input.fps;
    windows.push({
      boundary: b,
      spec,
      frames: carve,
      sec: winSec,
      startSec: quantizeClock(scene.startSec + clipSec),
      endSec: quantizeClock(scene.startSec + clipSec + winSec),
    });
  }

  const sceneClipSec = clipFrames.map((f) => f / input.fps);
  const totalSec = quantizeClock(
    sceneClipSec.reduce((a, b) => a + b, 0) + windows.reduce((a, w) => a + w.sec, 0),
  );
  return { windows, sceneClipFrames: clipFrames, sceneClipSec, totalSec };
}

// ---------------------------------------------------------------------------
// The page seam — the compositor page + the ONE applier, the compose.ts
// pattern mirrored: the renderer builds the page (two snapshot data URIs
// baked in), evaluates the applier per frame with the JSON description,
// screenshots the canvas. The applier is set-only and idempotent (apply
// twice ≡ once): clearRect, absolute draws, no layout reads, no clock, no
// randomness — the determinism law holds inside the page too.
// ---------------------------------------------------------------------------

/** The compositor page: a canvas at the doc surface + the two snapshot
 *  images as data URIs (the network-aborted page law — the page renders
 *  only what this string carries; base64 rides as a plain JS literal). */
export function transitionCompositorPage(
  width: number,
  height: number,
  dataUriA: string,
  dataUriB: string,
): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#000;overflow:hidden}
canvas{display:block}
</style></head><body>
<canvas id="tc" width="${width}" height="${height}"></canvas>
<script>
window.__timgA = new Image();
window.__timgA.src = "${dataUriA}";
window.__timgB = new Image();
window.__timgB.src = "${dataUriB}";
</script></body></html>`;
}

/** The ONE transition applier — (descJson) → executes the description's
 *  layers as canvas ops on #tc. Masks clip (circle / rounded rect / poly),
 *  snapshots draw scaled about the center at their alpha, solid layers
 *  fill. Alpha ≤ 0 layers skip (the description still carries them — the
 *  sweep hash sees the pure math, the canvas sees the visible truth). */
export const APPLY_TRANSITION_FRAME_FN = `(descJson) => {
  const d = JSON.parse(descJson);
  const c = document.getElementById("tc");
  if (!c) return false;
  const g = c.getContext("2d");
  const W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);
  for (const layer of d.layers) {
    const alpha = Number(layer.alpha);
    if (!(alpha > 0)) continue;
    g.save();
    const m = layer.mask;
    if (m) {
      g.beginPath();
      if (m.kind === "circle") {
        g.arc(Number(m.cx), Number(m.cy), Math.max(0, Number(m.r)), 0, Math.PI * 2);
      } else if (m.kind === "rect") {
        const x = Number(m.x), y = Number(m.y);
        const w = Math.max(0, Number(m.w)), h = Math.max(0, Number(m.h));
        const r = Math.max(0, Math.min(Number(m.radius) || 0, w / 2, h / 2));
        if (r <= 0 || w <= 0 || h <= 0) {
          g.rect(x, y, w, h);
        } else {
          g.moveTo(x + r, y);
          g.arcTo(x + w, y, x + w, y + h, r);
          g.arcTo(x + w, y + h, x, y + h, r);
          g.arcTo(x, y + h, x, y, r);
          g.arcTo(x, y, x + w, y, r);
          g.closePath();
        }
      } else {
        const pts = m.pts || [];
        for (let i = 0; i < pts.length; i++) {
          const px = Number(pts[i][0]), py = Number(pts[i][1]);
          if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.closePath();
      }
      g.clip();
    }
    g.globalAlpha = alpha;
    const src = layer.source;
    if (src === "A" || src === "B") {
      const img = src === "A" ? window.__timgA : window.__timgB;
      if (img && img.complete && img.naturalWidth > 0) {
        const s = Number(layer.scale) || 1;
        g.translate(W / 2 + (Number(layer.dx) || 0), H / 2 + (Number(layer.dy) || 0));
        g.scale(s, s);
        g.drawImage(img, -W / 2, -H / 2, W, H);
      }
    } else if (src && typeof src.color === "string") {
      g.fillStyle = src.color;
      g.fillRect(0, 0, W, H);
    }
    g.restore();
  }
  return true;
}`;

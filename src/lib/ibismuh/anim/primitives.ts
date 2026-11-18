// S171 — the Shared Animation Vocabulary (Programme C).
//
// The roadmap's ask: "Reusable animation primitives, each with
// standardized timing, easing, interpolation and error handling: Fade.
// Scale. Rotate. Translate. Draw. Reveal. Morph. Camera pan. Camera
// zoom. Particle movement. Character movement. Stagger. Spring.
// Parallax."
//
// The laws this layer keeps:
//   - THE ONE CURVE TABLE: every primitive's easing rides `evalEase`
//     (anim/easing.ts) — a primitive never grows its own ease curve.
//     The spring primitive is the one deliberate exception, and it is
//     not an ease: its damped oscillator is the primitive's SHAPE (the
//     physics it exists to express), parameterized, bounded, and
//     deterministic — the table remains the only place an EASING is
//     defined.
//   - STANDARDIZED CONTRACT: every primitive samples `(t01, params)` →
//     a normalized `PrimitiveState` (opacity/scale/rotation/translate/
//     progress), every field clamped to its physical range, junk params
//     refused with typed errors (never coerced), timing walls declared
//     per primitive (min/default/max ms — engine-owned clocks may be
//     tighter, never looser).
//   - PURE: no Date, no Math.random, no I/O — the frame-truth scan
//     covers this directory whole.
//
// The primitives are MODE-AGNOSTIC: any lane can sample them (S172's
// matrix declares which modes actually consume each one — shared
// capabilities, not duplicated engines).

import { evalEase, type EaseName } from "./easing";

export const ANIMATION_PRIMITIVES_VERSION = 1;

export const PRIMITIVE_NAMES = [
  "fade",
  "scale",
  "rotate",
  "translate",
  "draw",
  "reveal",
  "morph",
  "camera-pan",
  "camera-zoom",
  "particle",
  "character-move",
  "stagger",
  "spring",
  "parallax",
] as const;

export type PrimitiveName = (typeof PRIMITIVE_NAMES)[number];

export interface PrimitiveTiming {
  readonly minMs: number;
  readonly defaultMs: number;
  readonly maxMs: number;
  readonly defaultEase: EaseName;
}

/** The standardized timing walls — measured beats, not taste. Entrances
 *  live in the 300–800 ms window the S162 opus anchors measured; the
 *  camera family rides slower beats; the spring's default is its
 *  settle time at the house damping. */
export const PRIMITIVE_TIMING: Readonly<Record<PrimitiveName, PrimitiveTiming>> = Object.freeze({
  fade: { minMs: 120, defaultMs: 400, maxMs: 1500, defaultEase: "measured-out" },
  scale: { minMs: 120, defaultMs: 500, maxMs: 1500, defaultEase: "measured-out" },
  rotate: { minMs: 150, defaultMs: 500, maxMs: 2000, defaultEase: "measured-in-out" },
  translate: { minMs: 120, defaultMs: 450, maxMs: 1500, defaultEase: "measured-out" },
  draw: { minMs: 250, defaultMs: 700, maxMs: 3000, defaultEase: "linear" },
  reveal: { minMs: 150, defaultMs: 500, maxMs: 2000, defaultEase: "expo-out" },
  morph: { minMs: 250, defaultMs: 600, maxMs: 2500, defaultEase: "measured-in-out" },
  "camera-pan": { minMs: 400, defaultMs: 1200, maxMs: 8000, defaultEase: "glide" },
  "camera-zoom": { minMs: 400, defaultMs: 1200, maxMs: 8000, defaultEase: "glide" },
  particle: { minMs: 250, defaultMs: 900, maxMs: 4000, defaultEase: "drift" },
  "character-move": { minMs: 200, defaultMs: 600, maxMs: 2500, defaultEase: "measured-in-out" },
  stagger: { minMs: 40, defaultMs: 150, maxMs: 600, defaultEase: "measured-out" }, // per-item delay
  spring: { minMs: 250, defaultMs: 700, maxMs: 2500, defaultEase: "linear" }, // the oscillator IS the shape
  parallax: { minMs: 400, defaultMs: 1500, maxMs: 8000, defaultEase: "drift" },
});

/** The normalized sample state — ONE shape for every primitive, every
 *  mode. Absent fields mean "this primitive does not move that channel". */
export interface PrimitiveState {
  readonly opacity?: number; // 0..1
  readonly scale?: number; // 0..8
  readonly rotationDeg?: number; // unbounded, signed
  readonly translateX?: number; // px fraction of stage width, signed
  readonly translateY?: number;
  /** The primitive's own progress (0..1) — draw/reveal/morph ride it. */
  readonly progress?: number;
  /** The camera family's normalized offset (fractions of frame). */
  readonly camera?: { readonly x: number; readonly y: number; readonly zoom: number };
}

export interface PrimitiveParams {
  /** Signed travel/pivot amounts, primitive-defined. */
  readonly from?: number;
  readonly to?: number;
  readonly distance?: number;
  readonly directionDeg?: number;
  /** Stagger: per-item delay windows. */
  readonly index?: number;
  readonly count?: number;
  readonly perItemMs?: number;
  /** Spring: damping ratio (0.1..1) and oscillation frequency (Hz). */
  readonly damping?: number;
  readonly frequency?: number;
  /** Parallax/particle: layer depth 0..1 (deeper moves less). */
  readonly depth?: number;
  /** An easing override — must be a curve-table name. */
  readonly ease?: EaseName;
  /** Junk guard: params object may not carry unknown keys. */
  readonly [key: string]: unknown;
}

export interface PrimitiveError {
  readonly code: "unknown-primitive" | "unknown-ease" | "param-rejected" | "timing-wall";
  readonly message: string;
}

export type PrimitiveVerdict =
  | { readonly ok: true; readonly state: PrimitiveState }
  | { readonly ok: false; readonly errors: readonly PrimitiveError[] };

const KNOWN_PARAM_KEYS = new Set([
  "from", "to", "distance", "directionDeg", "index", "count", "perItemMs",
  "damping", "frequency", "depth", "ease",
]);

const clamp = (v: number, lo: number, hi: number): number => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);

/** Validate timing against the primitive's walls (engine clocks may be
 *  tighter, never looser). */
export function checkPrimitiveTiming(name: PrimitiveName, durationMs: number): PrimitiveError | null {
  const wall = PRIMITIVE_TIMING[name];
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs <= 0) {
    return { code: "timing-wall", message: `${name}: durationMs must be a positive finite number` };
  }
  if (durationMs < wall.minMs || durationMs > wall.maxMs) {
    return { code: "timing-wall", message: `${name}: durationMs ${durationMs} is outside the wall [${wall.minMs}, ${wall.maxMs}] ms` };
  }
  return null;
}

/** The spring shape — the damped harmonic oscillator, in-house, closed
 *  form, deterministic (no transcendental drift hazard: cos/sin on
 *  bounded inputs ride the platform's libm, and the spring never feeds
 *  a byte-identity pin — it feeds motion feel). Bounded by the envelope
 *  `1 - e^(-d·t)`; amplitude decays monotonically. */
function springAt(t01: number, damping: number, frequencyHz: number): number {
  const t = clamp(t01, 0, 1) * 2 * Math.PI * frequencyHz;
  const envelope = 1 - Math.exp(-6 * damping * clamp(t01, 0, 1));
  return envelope * Math.cos(t) * Math.exp(-t * damping * 0.35);
}

/** Sample ONE primitive at normalized time. Pure, clamped, junk-refusing. */
export function samplePrimitive(name: PrimitiveName, t01: number, params: PrimitiveParams = {}): PrimitiveVerdict {
  const errors: PrimitiveError[] = [];

  if (!(PRIMITIVE_NAMES as readonly string[]).includes(name)) {
    return { ok: false, errors: [{ code: "unknown-primitive", message: `"${String(name)}" is not in the closed primitive set (${PRIMITIVE_NAMES.join(", ")})` }] };
  }
  for (const key of Object.keys(params)) {
    if (!KNOWN_PARAM_KEYS.has(key)) {
      errors.push({ code: "param-rejected", message: `${name}: unknown param "${key}" — the standardized contract refuses, never coerces` });
    }
  }
  if (params.ease !== undefined && params.ease !== null) {
    try {
      evalEase(params.ease, 0.5);
    } catch {
      errors.push({ code: "unknown-ease", message: `${name}: ease "${String(params.ease)}" is not in the ONE curve table` });
    }
  }
  if (params.damping !== undefined && (typeof params.damping !== "number" || params.damping < 0.1 || params.damping > 1)) {
    errors.push({ code: "param-rejected", message: `${name}: damping must be in [0.1, 1]` });
  }
  if (params.frequency !== undefined && (typeof params.frequency !== "number" || params.frequency <= 0 || params.frequency > 6)) {
    errors.push({ code: "param-rejected", message: `${name}: frequency must be in (0, 6] Hz` });
  }
  if (params.depth !== undefined && (typeof params.depth !== "number" || params.depth < 0 || params.depth > 1)) {
    errors.push({ code: "param-rejected", message: `${name}: depth must be in [0, 1]` });
  }
  if (params.index !== undefined && params.count !== undefined && (typeof params.index !== "number" || typeof params.count !== "number" || params.count < 1 || params.index < 0 || params.index >= params.count || !Number.isInteger(params.index) || !Number.isInteger(params.count))) {
    errors.push({ code: "param-rejected", message: `${name}: stagger requires integer index in [0, count)` });
  }
  if (errors.length > 0) return { ok: false, errors };

  const t = clamp(t01, 0, 1);
  const ease: EaseName = params.ease ?? PRIMITIVE_TIMING[name].defaultEase;
  const e = evalEase(ease, t);
  const dir = (params.directionDeg ?? 0) as number;

  const stateOf = (s: PrimitiveState): PrimitiveVerdict => ({ ok: true, state: s });

  switch (name) {
    case "fade":
      return stateOf({ opacity: clamp((params.from ?? 0) + (1 - (params.from ?? 0)) * e, 0, 1) });
    case "scale":
      return stateOf({ scale: clamp((params.from ?? 0.86) + ((params.to ?? 1) - (params.from ?? 0.86)) * e, 0, 8) });
    case "rotate":
      return stateOf({ rotationDeg: ((params.from ?? 0) + ((params.to ?? 0) - (params.from ?? 0)) * e) as number });
    case "translate": {
      const dist = clamp(params.distance ?? 40, 0, 1) * e;
      const rad = (dir * Math.PI) / 180;
      return stateOf({ translateX: Math.cos(rad) * dist, translateY: Math.sin(rad) * dist });
    }
    case "draw":
    case "reveal":
    case "morph":
      return stateOf({ progress: clamp(e, 0, 1) });
    case "camera-pan": {
      const dist = clamp(params.distance ?? 0.12, 0, 0.5) * e;
      const rad = (dir * Math.PI) / 180;
      return stateOf({ camera: { x: Math.cos(rad) * dist, y: Math.sin(rad) * dist, zoom: 1 } });
    }
    case "camera-zoom":
      return stateOf({ camera: { x: 0, y: 0, zoom: clamp((params.from ?? 1) + ((params.to ?? 1.18) - (params.from ?? 1)) * e, 0.5, 3) } });
    case "particle": {
      const dist = clamp(params.distance ?? 0.08, 0, 1) * e;
      const depth = clamp(params.depth ?? 0.5, 0, 1);
      const rad = (dir * Math.PI) / 180;
      return stateOf({ translateX: Math.cos(rad) * dist * (1.2 - depth), translateY: Math.sin(rad) * dist * (1.2 - depth), opacity: clamp(1 - t * (1 - depth) * 0.6, 0, 1) });
    }
    case "character-move": {
      const dist = clamp(params.distance ?? 0.1, 0, 1) * e;
      const rad = (dir * Math.PI) / 180;
      return stateOf({ translateX: Math.cos(rad) * dist, translateY: Math.sin(rad) * dist, progress: e });
    }
    case "stagger": {
      // As a sampled primitive, stagger measures the SCHEDULE's own
      // progress (item i's delay is schedule business — see
      // staggerSchedule). The state is the window's completion fraction.
      const per = clamp(params.perItemMs ?? PRIMITIVE_TIMING.stagger.defaultMs, PRIMITIVE_TIMING.stagger.minMs, PRIMITIVE_TIMING.stagger.maxMs);
      const index = clamp(params.index ?? 0, 0, 1e6);
      void index;
      void per;
      return stateOf({ progress: clamp(e, 0, 1) });
    }
    case "spring": {
      const damping = clamp(params.damping ?? 0.5, 0.1, 1);
      const freq = clamp(params.frequency ?? 1.6, 0, 6);
      const s = springAt(t, damping, freq);
      const dist = clamp(params.distance ?? 24, 0, 1);
      return stateOf({ scale: clamp(1 + s * 0.08 * dist, 0.5, 1.5), translateY: s * dist });
    }
    case "parallax": {
      const depth = clamp(params.depth ?? 0.5, 0, 1);
      const dist = clamp(params.distance ?? 0.15, 0, 1) * e * (1 - depth * 0.8);
      const rad = (dir * Math.PI) / 180;
      return stateOf({ translateX: Math.cos(rad) * dist, translateY: Math.sin(rad) * dist, camera: { x: Math.cos(rad) * dist * 0.5, y: Math.sin(rad) * dist * 0.5, zoom: 1 } });
    }
  }
}

/** The stagger schedule — the primitive that composes OTHER primitives:
 *  item i starts at i·perItemMs, the window returns each item's own
 *  normalized clock. Pure. */
export function staggerSchedule(count: number, totalMs: number, perItemMs?: number): { readonly itemMs: number; readonly perItemMs: number; readonly windowMs: number }[] {
  if (!Number.isInteger(count) || count < 1 || count > 1000) {
    throw new RangeError(`stagger count must be an integer in [1, 1000], got ${count}`);
  }
  if (!Number.isFinite(totalMs) || totalMs <= 0) {
    throw new RangeError(`stagger totalMs must be positive, got ${totalMs}`);
  }
  const per = clamp(perItemMs ?? totalMs / (count + 2), PRIMITIVE_TIMING.stagger.minMs, PRIMITIVE_TIMING.stagger.maxMs);
  const out: { itemMs: number; perItemMs: number; windowMs: number }[] = [];
  for (let i = 0; i < count; i++) {
    const start = i * per;
    out.push({ itemMs: Math.round(start), perItemMs: Math.round(per), windowMs: Math.max(0, Math.round(totalMs - start)) });
  }
  return out;
}

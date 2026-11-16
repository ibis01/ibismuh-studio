// MG-1 (S148) — the motion-preset registry: named rhythms compiled into
// the engines' EXISTING directives (docs/design/mg1-motion-quality.md §5).
//
// The audit's anti-duplication law: motion presets are DATA, not a
// framework. A preset compiles to a STRUCTURAL spec ({ kind, durationMs,
// delayMs, ease }) that the consuming engine validates against its own
// closed table on compile-in — the graphics grammar stays closed (presets
// are sugar over ElementMotion, not a second motion grammar), the
// substrate stays engine-neutral (this module imports only its siblings).
//
// Laws: pure; unknown preset → null (fail-safe — the caller decides, never
// a throw-through); the same (name, order) always compiles to the same
// spec (the determinism law).

import { staggerDelayMs } from "./stagger";
import type { EaseName } from "./easing";

/** One compiled motion spec — structurally an ElementMotion in the
 *  graphics grammar's terms, deliberately NOT importing the engine type:
 *  the substrate is engine-neutral, and the engine re-validates on
 *  compile-in. */
export interface MotionPresetSpec {
  /** The engine's motion-kind name (the graphics table's legal kind). */
  kind: string;
  durationMs: number;
  delayMs: number;
  ease: EaseName;
}

type PresetBuilder = (order: number) => MotionPresetSpec;

/** The registered presets — the Phase C studio picker's data source.
 *  Every builder is a closed-form function of (order) alone. */
const BUILDERS_TABLE: Record<string, PresetBuilder> = {
  // The cascade entrance — items slide in one after another.
  "stagger-in": (order) => ({
    kind: "slide",
    durationMs: 400,
    delayMs: staggerDelayMs(order, "bullets"),
    ease: "ease-out",
  }),
  // The denser cascade — cards rise on the second registered rhythm.
  "cards-in": (order) => ({
    kind: "rise",
    durationMs: 500,
    delayMs: staggerDelayMs(order, "cards"),
    ease: "ease-out",
  }),
  // The emphasis pop — one loud overshoot, no cascade.
  "pop-emphasis": () => ({
    kind: "pop",
    durationMs: 500,
    delayMs: 0,
    ease: "pop",
  }),
  // The headline reveal — rise with the gentle back-overshoot settle.
  "rise-reveal": () => ({
    kind: "rise",
    durationMs: 600,
    delayMs: 0,
    ease: "ease-back",
  }),
  // The icon trace — the draw-on with the denser cascade.
  "draw-on": (order) => ({
    kind: "draw",
    durationMs: 900,
    delayMs: staggerDelayMs(order, "cards"),
    ease: "linear",
  }),
  // The quiet entrance — fade with no motion vocabulary beyond opacity.
  "fade-hold": () => ({
    kind: "fade",
    durationMs: 400,
    delayMs: 0,
    ease: "ease-out",
  }),
};

/** The frozen registry. */
const BUILDERS: Readonly<Record<string, PresetBuilder>> = Object.freeze(BUILDERS_TABLE);

/** The frozen preset names — the picker's key list. */
export function presetNames(): string[] {
  return Object.keys(BUILDERS);
}

export function isPresetName(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(BUILDERS, name);
}

/** Compile a named preset for item `order`. Unknown name → null (the
 *  fail-safe law). Junk order is the stagger module's clamp law. */
export function compilePreset(name: string, order: number): MotionPresetSpec | null {
  const build = BUILDERS[name];
  if (!build) return null;
  return build(Number.isFinite(order) ? order : 0);
}

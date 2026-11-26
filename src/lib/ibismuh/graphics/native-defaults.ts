// native-defaults.ts — the GRAPHICS NATIVE DEFAULTS seam (Phase C of the
// catalog route's design system). The per-kind placement table, the native
// enter/exit/camera choreography, and the two text helpers, extracted
// VERBATIM from planner.ts so the design-system modules (recipes.ts,
// components.ts) can ride the SAME defaults without importing the planner
// (an import cycle: the planner adopts the component expansion, the
// expansion rides the native defaults — the seam breaks the loop, ONE
// table either way).
//
// The one-source law (the icon move's precedent, G1.5): this module is the
// ONLY home of these tables; planner.ts RE-EXPORTS every name so every
// legacy import path (llm-planner.ts, the unit suite, stored catalogs)
// keeps resolving here — never a second copy.
//
// Pure and deterministic: same inputs → the same records, byte for byte.
// No fs, no clock, no randomness.
import type { Placement } from "../whiteboard/svg";
import { GRAPHICS_MOTION_SEMANTICS } from "./frame";
import type {
  ElementMotion,
  GraphicsCameraKeyframe,
  GraphicsElementKind,
} from "./types";

// ---------------------------------------------------------------------------
// Per-kind defaults — placements (16:9 reference) and text sizes. The LLM
// planner degrades to THESE defaults (llm-planner.ts) — one default table,
// two consumers.
// ---------------------------------------------------------------------------

/** Per-kind default placements in 1920×1080 scene-space (text is anchored
 *  at its center; the chart box is 50% of the surface centered on `at`;
 *  icons are 24-unit paths scaled by `at.scale`). */
export const DEFAULT_PLACEMENT_169: Readonly<Record<GraphicsElementKind, Placement>> = {
  headline: { x: 960, y: 480, scale: 1, rotateDeg: 0 },
  subhead: { x: 960, y: 620, scale: 1, rotateDeg: 0 },
  bullet: { x: 960, y: 590, scale: 1, rotateDeg: 0 },
  counter: { x: 960, y: 470, scale: 2.5, rotateDeg: 0 },
  bar: { x: 960, y: 620, scale: 1, rotateDeg: 0 },
  barChart: { x: 960, y: 620, scale: 1, rotateDeg: 0 },
  icon: { x: 960, y: 300, scale: 4, rotateDeg: 0 },
  callout: { x: 960, y: 300, scale: 1, rotateDeg: 0 },
  shape: { x: 960, y: 540, scale: 1, rotateDeg: 0 },
  group: { x: 0, y: 0, scale: 1, rotateDeg: 0 },
  // S126 — the import lane's element: the scaffold never proposes one
  // (imports arrive through the lane, not the planner); the default only
  // satisfies the closed table.
  sprite: { x: 960, y: 540, scale: 1, rotateDeg: 0 },
};

/** Default text sizes per kind (within the validator's 12..288 band). */
export const DEFAULT_SIZE_PX: Readonly<Partial<Record<GraphicsElementKind, number>>> = {
  headline: 64,
  subhead: 40,
  bullet: 36,
  callout: 28,
};

/** Remap a 16:9 scene-space placement onto a real house surface — the
 *  whiteboard's S68 law verbatim: positions scale by axis, ink size
 *  follows the WIDTH ratio (a 9:16 board at 1080 wide draws the same ink
 *  size it would at 1080 wide in 16:9). */
export function remapPlacement(pl: Placement, width: number, height: number): Placement {
  const fx = width / 1920;
  const fy = height / 1080;
  return { x: Math.round(pl.x * fx), y: Math.round(pl.y * fy), scale: pl.scale * fx, rotateDeg: pl.rotateDeg };
}

/** Default enter motion per kind — every kind drawn from the
 *  compatibility table (a planner never proposes an illegal motion).
 *  `order` staggers repeated kinds (bullets) so the scaffold reads in
 *  sequence — S162: the stagger rides GRAPHICS_MOTION_SEMANTICS
 *  .kineticStaggerMs (the opus overlap schedule — the next row starts
 *  WITHOUT waiting for the previous to finish; the cascade is one
 *  motion). Every span stays far inside the minimum scene clock
 *  (estimateNarrationMs clamps at 4000ms; the widest default span is
 *  1500ms).
 *
 *  S162 — the table rides the MEASURED vocabulary (the six-engine audit
 *  Part 3.1, the opus ease.ts constants): entrances settle on
 *  "measured-out" (0.16,1,0.3,1 — the measured default entrance, the
 *  long-tail settle), counters and bar growth land on "expo-out"
 *  (0.19,1,0.22,1 — violent start, decelerating tail: the number/bars
 *  READ as landing, and the counter's landing pulse completes the
 *  breath), the icon's stroke draw stays "linear" (constant-speed ink is
 *  the honest hand). The pre-S162 names remain in the table — authored
 *  docs evaluate byte-identically (the additive-seam law). */
export function nativeEnterFor(kind: GraphicsElementKind, order: number): ElementMotion {
  switch (kind) {
    case "headline":
      return { kind: "rise", durationMs: 600, delayMs: 0, ease: "measured-out" };
    case "subhead":
      return { kind: "fade", durationMs: 500, delayMs: 250, ease: "measured-out" };
    case "bullet":
      return { kind: "slide", durationMs: 400, delayMs: 400 + GRAPHICS_MOTION_SEMANTICS.kineticStaggerMs * Math.max(0, order), ease: "measured-out" };
    case "counter":
      return { kind: "count", durationMs: 1200, delayMs: 300, ease: "expo-out" };
    case "bar":
    case "barChart":
      return { kind: "grow", durationMs: 900, delayMs: 300, ease: "expo-out" };
    case "icon":
      return { kind: "draw", durationMs: 700, delayMs: 350, ease: "linear" };
    case "callout":
      return { kind: "rise", durationMs: 400, delayMs: 500, ease: "measured-out" };
    case "shape":
      return { kind: "grow", durationMs: 500, delayMs: 350, ease: "measured-out" };
    case "group":
      return { kind: "fade", durationMs: 400, delayMs: 0, ease: "measured-out" };
    // S126 — the scaffold never proposes a sprite (imports arrive through
    // the lane); the default only satisfies the closed table.
    case "sprite":
      return { kind: "fade", durationMs: 400, delayMs: 0, ease: "measured-out" };
  }
}

// ---------------------------------------------------------------------------
// S162 part 2 — the measured EXIT + the camera breathe. The craft the
// round-1 blind tie asked for: the delta must READ, and an element that
// never leaves (a board that never moves) does not read. Both tables are
// TAIL-ANCHORED on the ONE clock: the caller supplies the scene clock
// (estimateNarrationMs — the same model the frame engine resolves), so
// with no VO the plan IS the delivered clock; a VO-extended scene holds
// the plan's pushed state past the last camera key (the motion clamp
// law — the documented estimate anchor). Pure: same inputs → the same
// windows, byte for byte (the determinism law).
// ---------------------------------------------------------------------------

/** The exit cascade's stagger — one bullet leaves this many ms after the
 *  previous (a fraction of the enter stagger: the clearing reads calmer
 *  than the build). */
export const GRAPHICS_EXIT_STAGGER_MS = 90;

/** The camera breathe's push magnitude — zoom 1 → 1.05 across the scene
 *  (the S130 bounds keep zoom ≥ 1, the board never shrinks into void;
 *  1.05 reads as presence, never as a zoom effect). */
export const GRAPHICS_CAMERA_PUSH_ZOOM = 1.05;

/**
 * The default exit motion per kind — endings as deliberate as the
 * entrances. Every window completes at or before `sceneMs − 60`, so the
 * scene's final frames hold the CLEARED board (the breath before the
 * next scene's transition). The choreography arc: the bullet list is
 * consumed FIRST (one bullet every GRAPHICS_EXIT_STAGGER_MS in entrance
 * order — the list leaves the way it was told), then the furniture
 * (kicker / context / icon), and the headline (with the stat's counter)
 * leaves LAST — the scene's identity holds while everything else clears.
 * Chart bars UN-REVEAL (a wipe exit drains reveal progress 1→0 — the
 * grow's mirror, continuity in both directions). Every span fits the
 * validator's time-sanity law (delayMs + durationMs ≤ sceneMs) for any
 * sceneMs ≥ 4000 — the estimator's own floor. Every kind rides its
 * MOTION_KINDS_BY_ELEMENT row (a planner never proposes an illegal
 * motion).
 *
 * `order`/`count` carry the element's index and total among its kind —
 * the same order semantics nativeEnterFor staggers by.
 */
export function nativeExitFor(
  kind: GraphicsElementKind,
  order: number,
  sceneMs: number,
  count: number,
): ElementMotion {
  // The fade helper: completes `endBefore` ms ahead of the scene tail.
  const fadeAt = (endBefore: number, durationMs: number): ElementMotion => ({
    kind: "fade",
    durationMs,
    delayMs: Math.max(0, sceneMs - endBefore - durationMs),
    ease: "measured-in-out",
  });
  switch (kind) {
    case "headline":
    case "counter":
      // The title (and the stat it carries) leaves last.
      return fadeAt(420, 360);
    case "subhead":
    case "callout":
      return fadeAt(500, 380);
    case "bullet": {
      // Entrance order = exit order; the first bullet's fade completes
      // first and the last bullet's completes at the 640 anchor — the
      // list is the first wave out (the cascade overlaps, the house
      // kinetic law; the arc still reads: list, furniture, title).
      const remaining = Math.max(0, count - 1 - order);
      const durationMs = 260;
      return {
        kind: "fade",
        durationMs,
        delayMs: Math.max(0, sceneMs - 640 - remaining * GRAPHICS_EXIT_STAGGER_MS - durationMs),
        ease: "measured-in-out",
      };
    }
    case "bar":
    case "barChart":
      // The un-reveal: progress drains 1→0 (the grow's mirror).
      return {
        kind: "wipe",
        durationMs: 420,
        delayMs: Math.max(0, sceneMs - 500 - 420),
        ease: "measured-in-out",
      };
    case "icon":
      return fadeAt(460, 300);
    case "shape":
      return fadeAt(420, 300);
    case "group":
    case "sprite":
      return fadeAt(460, 320);
  }
}

/**
 * The camera breathe: the house default push-in (the VQ1 P4 camera
 * choreography, riding the S130 camera seam — no new grammar, no new
 * renderer). Two keys: the board holds at zoom 1 while the entrances
 * play, then the +5% push completes AT the scene tail — "measured-in-out"
 * (the slow start never fights the entrances; the settle lands with the
 * exits). The last key sits exactly at the scene clock (the validator's
 * time-sanity law: a key past the clock is an error — at the clock is
 * the edge the planner owns).
 */
export function nativeCameraFor(sceneMs: number): GraphicsCameraKeyframe[] {
  return [
    { tMs: 0, zoom: 1, tx: 0, ty: 0 },
    { tMs: sceneMs, zoom: GRAPHICS_CAMERA_PUSH_ZOOM, tx: 0, ty: 0, ease: "measured-in-out" },
  ];
}

/** The kind-generic default placement, remapped onto the real surface —
 *  the LLM planner's degradation target for absent/junk placements. */
export function nativePlacementFor(kind: GraphicsElementKind, width: number, height: number): Placement {
  return remapPlacement(DEFAULT_PLACEMENT_169[kind], width, height);
}

// ---------------------------------------------------------------------------
// Text helpers — extraction only, no invention (each output is
// deterministic whitespace-collapsed truncation of a story string)
// ---------------------------------------------------------------------------

export function capLine(s: string, max = 90): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return (at > 40 ? cut.slice(0, at) : cut).trimEnd() + "…";
}

/** The text payload for an extracted line — the default palette rides
 *  compose (GRAPHICS_COMPOSE_DEFAULTS); the planner sets only what the
 *  story determined. */
export function textPayload(kind: GraphicsElementKind, text: string): { text: string; sizePx: number } {
  return { text, sizePx: DEFAULT_SIZE_PX[kind] ?? 48 };
}

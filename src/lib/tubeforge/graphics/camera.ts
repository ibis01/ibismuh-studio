// S130 (PAE-2) — the graphics scene camera: the ONE world→screen function.
//
// The 3D adapter has carried camera keyframes since S94 (Scene3DCameraKeyframe
// → cameraAt there); this module gives the 2D composer the SAME vocabulary:
// clamped, destination-eased evaluation of scene-local {tMs, zoom, tx, ty}
// keys on the scene-local clock — no second clock, the anim substrate's
// laws (evalAt's clamp-and-hold, the destination key's ease drives the
// segment), the S94 cameraAt shape.
//
// The RENDERER'S LAW (compose.ts): the board holds the world; the camera
// state transforms it through one wrapper group (#gcam) — pan and zoom
// never hand-type screen coordinates, they ride the board's own dims read
// as ATTRIBUTES (never layout) inside the applier. Pure: no fs, no clock,
// no randomness (the S64 law generalizes).
import { evalEase } from "../anim/easing";
import type { GraphicsCameraKeyframe } from "./types";

/** The camera's frame state — the world→screen inputs the applier turns
 *  into one transform about the board's center. */
export interface GraphicsCameraState {
  zoom: number;
  tx: number;
  ty: number;
}

const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;

/**
 * cameraAt — the clamped camera evaluation. Before the first key the
 * camera holds its state; after the last key it holds that too (the motion
 * clamp law, camera form) — so the state is continuous and finite for ALL
 * t, and the author controls both edge states by writing the first/last
 * keys. The segment arriving at a key is eased by THAT key's ease (absent
 * ⇒ linear — the destination-key convention every consumer shares).
 *
 * Junk input is a CALLER bug (the keyframe.ts law): the validator refuses
 * empty cameras, so the guard here is an engine-bug tripwire, not a
 * defensive branch (the Part F law: validate integrity once, schedule
 * purely everywhere else). PURE — same (keys, tMs) → byte-identical state.
 */
export function cameraAt(keys: readonly GraphicsCameraKeyframe[], tMs: number): GraphicsCameraState {
  if (keys.length === 0) {
    throw new Error("cameraAt: the camera carries no keys — pass a validated scene");
  }
  const t = Number.isFinite(tMs) ? tMs : 0;
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (t <= first.tMs) return { zoom: first.zoom, tx: first.tx, ty: first.ty };
  if (t >= last.tMs) return { zoom: last.zoom, tx: last.tx, ty: last.ty };
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t >= a.tMs && t <= b.tMs) {
      const span = b.tMs - a.tMs;
      const u = span > 0 ? (t - a.tMs) / span : 0;
      const e = evalEase(b.ease ?? "linear", u);
      return {
        zoom: lerp(a.zoom, b.zoom, e),
        tx: lerp(a.tx, b.tx, e),
        ty: lerp(a.ty, b.ty, e),
      };
    }
  }
  return { zoom: last.zoom, tx: last.tx, ty: last.ty };
}

// S124 — the element editor's pure brain: hit-testing, placement math and
// the z-order law over the closed graphics grammar. Everything the canvas
// overlay and the studio panel do to a doc flows through THIS module —
// the unit suite pins every law here, so the interactive layer is thin by
// construction (the wb/graphics pattern: validate/schedule purely, the
// component owns only the DOM reads and pointer plumbing).
//
// THE LAWS (docs/design/s124-graphics-element-editor.md):
//   hit-test    → the topmost element at a doc-space point is the LAST in
//                 doc order whose bounds contain it (SVG paints doc order,
//                 later = on top). Bounds come from the composed page's own
//                 #ge-{id} rects (the canvas reads them; this module only
//                 judges them) — never a second geometry estimator.
//   move        → exact scene-unit deltas; NO positional clamp (the grammar
//                 is unbounded — slide entrances legitimately start
//                 off-canvas).
//   scale       → anchored at the placement point (the composer's
//                 translate(x,y)…scale(s) semantics — SVG scales the group
//                 around its own origin AFTER the translation), a distance
//                 RATIO applied to the current scale, clamped to
//                 ELEMENT_EDITOR_LIMITS so the validator (which collapses
//                 non-positive scales to 1) is never silently rewritten.
//   z-order     → the four-action vocabulary (raise/lower/top/bottom — the
//                 generic editor terms, the law over scene.elements is
//                 ours) applied to the UNCLAIMED subsequence, rebuilt under
//                 the SLOTS law: claimed children keep their exact array
//                 slots, the unclaimed elements fill the remaining slots in
//                 their new order (minimal byte churn — untouched slots are
//                 untouched). Claimed members refuse (their z lives inside
//                 the group's <g>, by the group's own children order).
//
// PURE — no DOM, no clock, no randomness. Leaf-module law: imports the
// grammar (types.ts) and the composer's claim truth (compose.ts) — never
// the reverse. The claim import is the S124 one-truth law: the emission
// pass and the editor judge claims by the SAME map.
import { graphicsGroupClaims } from "./compose";
import type { Placement } from "../whiteboard/svg";
import type { GraphicsElement, GraphicsScene } from "./types";

/** The editor's scale band. The validator keeps any finite scale > 0
 *  (non-positive collapses to 1 with a warning — parsePlacement); the
 *  editor keeps the handle inside a usable band so a drag can never ship
 *  a value the validator would silently rewrite. */
export const ELEMENT_EDITOR_LIMITS = {
  scaleMin: 0.05,
  scaleMax: 20,
} as const;

/** The z-order actions — the four-action vocabulary. */
export type ZOrderAction = "raise" | "lower" | "top" | "bottom";

/** A doc-space axis-aligned bounds box, as read from the composed page's
 *  own element rects (getBoundingClientRect inside the iframe — the units
 *  ARE doc units; the view scale lives in the host wrapper). */
export interface ElementBounds {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Inclusive containment in doc space, optionally widened by a hit slop
 *  (doc units on every side — keeps zero-area geometry, like a bare
 *  <line>, grabbable along its length). */
export function boundsContain(b: ElementBounds, px: number, py: number, slop = 0): boolean {
  return px >= b.x - slop && px <= b.x + b.w + slop && py >= b.y - slop && py <= b.y + b.h + slop;
}

/** The topmost element under a doc-space point — the LAST (doc order)
 *  containing bounds wins; null on a miss. Bounds arrive in doc order
 *  (the canvas reads the page's elements in their paint order). The slop
 *  widens the test for zero-area geometry (the canvas passes one). */
export function topmostElementAt(bounds: ElementBounds[], px: number, py: number, slop = 0): string | null {
  for (let i = bounds.length - 1; i >= 0; i--) {
    const b = bounds[i];
    if (b !== undefined && boundsContain(b, px, py, slop)) return b.id;
  }
  return null;
}

/** Move — exact deltas in scene units, no clamp (the recorded law). */
export function movedPlacement(at: Placement, dxDoc: number, dyDoc: number): Placement {
  return {
    x: at.x + dxDoc,
    y: at.y + dyDoc,
    scale: at.scale,
    rotateDeg: at.rotateDeg,
  };
}

/** Scale — the placement point is the anchor; the factor is a distance
 *  RATIO from a drag gesture (distNow / distStart) applied to the
 *  element's CURRENT scale, clamped to the editor band. Non-finite factor
 *  → honest no-op (the drag numerics degenerate, the doc never does). */
export function scaledPlacement(at: Placement, factor: number): Placement {
  if (!Number.isFinite(factor)) return { ...at };
  const scale = at.scale * factor;
  const clamped = Math.min(ELEMENT_EDITOR_LIMITS.scaleMax, Math.max(ELEMENT_EDITOR_LIMITS.scaleMin, scale));
  return {
    x: at.x,
    y: at.y,
    scale: clamped,
    rotateDeg: at.rotateDeg,
  };
}

export type ZOrderResult =
  | { ok: true; elements: GraphicsElement[] }
  | { ok: false; error: string };

/** The z-order law. Reorders the UNCLAIMED subsequence of scene.elements
 *  per the action, rebuilt under the slots law (claimed children keep
 *  their exact array slots). Groups are claimants — moving a group moves
 *  its children with it (the composer nests them inside the group's <g>).
 *  Refuses: unknown ids, claimed members (the error names the owning
 *  group). The input array is never mutated. */
export function applyZOrder(scene: GraphicsScene, elId: string, action: ZOrderAction): ZOrderResult {
  const claims = graphicsGroupClaims(scene);
  const target = scene.elements.find((el) => el.id === elId);
  if (target === undefined) {
    return { ok: false, error: `applyZOrder: no element "${elId}" in scene "${scene.id}"` };
  }
  const owner = claims.get(elId);
  if (owner !== undefined) {
    return {
      ok: false,
      error: `applyZOrder: "${elId}" is a member of group "${owner}" — its z-order lives inside the group (edit the group or its children order)`,
    };
  }
  // The unclaimed subsequence (groups + unclaimed elements, in doc order).
  const topLevel = scene.elements.filter((el) => !claims.has(el.id));
  const from = topLevel.findIndex((el) => el.id === elId);
  if (from < 0) {
    // Unreachable by construction (the target is unclaimed) — the guard
    // keeps the law honest if the claim map's shape ever changes.
    return { ok: false, error: `applyZOrder: "${elId}" vanished from the unclaimed subsequence` };
  }
  const [picked] = topLevel.splice(from, 1);
  if (picked === undefined) {
    return { ok: false, error: `applyZOrder: "${elId}" vanished from the subsequence` };
  }
  let to: number;
  switch (action) {
    case "top":
      to = topLevel.length;
      break;
    case "bottom":
      to = 0;
      break;
    case "raise":
      to = Math.min(topLevel.length, from + 1);
      break;
    case "lower":
      to = Math.max(0, from - 1);
      break;
  }
  // Rebuild under the slots law: walk the ORIGINAL array; claimed children
  // keep their slot; the unclaimed slots take the reordered subsequence in
  // order. Indices of unclaimed elements in the original array, in order:
  const slots: number[] = [];
  scene.elements.forEach((el, i) => {
    if (!claims.has(el.id)) slots.push(i);
  });
  topLevel.splice(to, 0, picked);
  const elements = scene.elements.slice();
  let rank = 0;
  for (const slot of slots) {
    const el = topLevel[rank];
    if (el === undefined) break;
    elements[slot] = el;
    rank += 1;
  }
  return { ok: true, elements };
}

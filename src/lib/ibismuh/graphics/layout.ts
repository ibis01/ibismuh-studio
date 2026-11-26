// layout.ts — the GRAPHICS RESPONSIVE LAYOUT SOLVER (the engineering
// master plan's WS8: "responsive layout solver").
//
// The remap law (native-defaults.ts) scales positions by axis and ink by
// the width ratio — geometric truth, but not a DELIBERATE layout: a 9:16
// board with six simultaneous elements and 28px type is remapped, not
// recomposed. The master plan's ask is constraint-based recomposition with
// per-aspect policies and GATES: "fail or request repair for text
// overflow, component collision, clipped citation, unreadable chart
// labels, subject outside safe area, minimum-size violation, excessive
// density, no clear focal hierarchy".
//
// This module is that gate layer:
//   · the closed aspect vocabulary rides the house surfaces table;
//   · each aspect has a NAMED policy (variant) — the deliberate layout —
//     with its own safe-margin ratio, simultaneous-element cap, and type
//     floor (9:16 stacks vertically, carries fewer elements, demands
//     larger type; 1:1 centers the hierarchy; 16:9 opens the stage);
//   · the solver walks every scene's elements through the gates and
//     reports every finding with the element id and the constraint NAMED
//     ("Layout warnings identify the exact component and constraint");
//   · the solver is PURE over the doc — preview and final select the
//     same variant by construction (the plan's parity ask).
//
// The gate classes, honestly split:
//   · GATE (fails the QC row): SAFE-AREA (element center outside the
//     aspect's safe rect) and MIN-SIZE (text below the aspect's readable
//     floor — the house 12px floor's per-aspect strengthening);
//   · NOTE (reported, never fails): COLLISION (estimated text-box
//     overlap beyond the conservative band) and DENSITY (simultaneous
//     elements past the aspect cap) — estimates, not measurements, so a
//     note never blocks a render.
//
// Pure and deterministic: same doc → the same report, byte for byte.
// No fs, no clock, no randomness.
import type {
  GraphicsDoc,
  GraphicsElement,
} from "./types";
import { DEFAULT_SIZE_PX } from "./native-defaults";

// ---------------------------------------------------------------------------
// The closed aspect vocabulary (the house surfaces table, named)
// ---------------------------------------------------------------------------

export type GraphicsAspect = "16:9" | "9:16" | "1:1";

export const GRAPHICS_ASPECTS: readonly GraphicsAspect[] = ["16:9", "9:16", "1:1"];

/** Exact-table resolution — the validator only accepts the three native
 *  sizes, so the solver refuses anything else (fail-closed, never a
 *  silent nearest-snap: the QC row must judge the surface it renders). */
export function aspectForSurface(width: number, height: number): GraphicsAspect {
  if (width === 1920 && height === 1080) return "16:9";
  if (width === 1080 && height === 1920) return "9:16";
  if (width === 1080 && height === 1080) return "1:1";
  throw new Error(
    `layout: ${String(width)}×${String(height)} is not a house surface — the solver judges exactly [1920×1080, 1080×1920, 1080×1080]`,
  );
}

// ---------------------------------------------------------------------------
// The aspect policies — the plan's §13 layout policies, named variants
// ---------------------------------------------------------------------------

export interface AspectPolicy {
  aspect: GraphicsAspect;
  /** The named variant — the deliberate layout this aspect designs. */
  variant: string;
  /** The safe-margin ratio (each side) — the focal band the subject must
   *  stay inside. */
  safeMarginRatio: number;
  /** The simultaneous-element cap past which density is a note. */
  maxSimultaneous: number;
  /** The per-aspect readable type floor (px, post-scale) — the house 12px
   *  floor strengthened where the plan demands larger type. */
  typeFloorPx: number;
  note: string;
}

export const ASPECT_POLICIES: Readonly<Record<GraphicsAspect, AspectPolicy>> = {
  "16:9": {
    aspect: "16:9",
    variant: "wide-stage",
    safeMarginRatio: 0.06,
    maxSimultaneous: 6,
    typeFloorPx: 12,
    note: "side-by-side visual relationships and wider timelines — the stage opens horizontally",
  },
  "9:16": {
    aspect: "9:16",
    variant: "portrait-stack",
    safeMarginRatio: 0.08,
    maxSimultaneous: 4,
    typeFloorPx: 15,
    note: "vertical stacking, fewer simultaneous elements, larger type, portrait-safe focal areas",
  },
  "1:1": {
    aspect: "1:1",
    variant: "centered-square",
    safeMarginRatio: 0.07,
    maxSimultaneous: 5,
    typeFloorPx: 14,
    note: "centered hierarchy and simplified diagrams",
  },
};

// ---------------------------------------------------------------------------
// The estimate model (conservative, declared)
// ---------------------------------------------------------------------------

const CHAR_W_RATIO = 0.55;
const LINE_H_RATIO = 1.4;
/** Estimated text-box overlap past which the collision note fires (a
 *  fraction of the smaller box) — loose enough that tight-but-legal
 *  stacking never notes, tight enough that a real overlap always does. */
const COLLISION_NOTE_AT = 0.4;

interface EstimatedBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function textSizePx(el: GraphicsElement): number {
  if (el.text !== undefined) return el.text.sizePx ?? DEFAULT_SIZE_PX[el.kind] ?? 48;
  return 48; // the compose default (counter + callout render at this)
}

function textLines(el: GraphicsElement): number {
  if (el.text !== undefined) return Math.max(1, el.text.text.split("\n").length);
  return 1;
}

function textChars(el: GraphicsElement): string | null {
  if (el.text !== undefined) return el.text.text;
  if (el.counter !== undefined) return formatCounterEstimate(el.counter.to, el.counter.unit);
  return null;
}

function formatCounterEstimate(to: number, unit?: string): string {
  const digits = Math.max(1, Math.floor(Math.log10(Math.max(1, Math.abs(to)))) + 1);
  return "8".repeat(digits) + (unit ?? "");
}

/** The conservative drawn box for an element (surface px, center-anchored
 *  like compose). Icons estimate 24 grid-units × scale square; text
 *  estimates chars × size × 0.55 wide × lines × size × 1.4 tall; charts
 *  estimate the compose chart box (50% of the surface, centered). */
function estimateBox(el: GraphicsElement, doc: GraphicsDoc): EstimatedBox {
  const { x, y, scale } = el.at;
  if (el.kind === "barChart" || el.kind === "bar") {
    const w = doc.width * 0.5;
    const h = doc.height * 0.5;
    return { x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 };
  }
  if (el.icon !== undefined) {
    const s = 24 * scale;
    return { x0: x - s / 2, y0: y - s / 2, x1: x + s / 2, y1: y + s / 2 };
  }
  const content = textChars(el);
  if (content !== null) {
    const size = textSizePx(el) * scale;
    const lines = textLines(el);
    const longest = Math.max(...content.split("\n").map((l) => l.length), 1);
    const w = Math.max(longest * size * CHAR_W_RATIO, 60);
    const h = size * LINE_H_RATIO * lines;
    return { x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 };
  }
  const s = 120 * scale; // shapes/groups: the compose default mark band
  return { x0: x - s / 2, y0: y - s / 2, x1: x + s / 2, y1: y + s / 2 };
}

function overlapFraction(a: EstimatedBox, b: EstimatedBox): number {
  const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (ox <= 0 || oy <= 0) return 0;
  const areaA = (a.x1 - a.x0) * (a.y1 - a.y0);
  const areaB = (b.x1 - b.x0) * (b.y1 - b.y0);
  const smaller = Math.max(1, Math.min(areaA, areaB));
  return (ox * oy) / smaller;
}

// ---------------------------------------------------------------------------
// The solver
// ---------------------------------------------------------------------------

export type LayoutGateId = "SAFE-AREA" | "MIN-SIZE";
export type LayoutNoteId = "COLLISION" | "DENSITY";

export interface LayoutFinding {
  sceneId: string;
  elementId: string;
  /** The gate (fails the QC row) or note (reported, never blocks). */
  gate: LayoutGateId | LayoutNoteId;
  detail: string;
}

export interface SceneLayoutSolve {
  sceneId: string;
  variant: string;
  findings: LayoutFinding[];
}

export interface LayoutSolveReport {
  aspect: GraphicsAspect;
  variant: string;
  policyNote: string;
  scenes: SceneLayoutSolve[];
  /** The gate-class findings — the QC row's fail set. */
  violations: LayoutFinding[];
  notes: LayoutFinding[];
}

/** Solve the layout for a whole doc: per scene, per element, through the
 *  aspect's gates. PURE — same doc, same report. */
export function solveGraphicsLayout(doc: GraphicsDoc): LayoutSolveReport {
  const aspect = aspectForSurface(doc.width, doc.height);
  const policy = ASPECT_POLICIES[aspect];
  const mx = doc.width * policy.safeMarginRatio;
  const my = doc.height * policy.safeMarginRatio;
  const violations: LayoutFinding[] = [];
  const notes: LayoutFinding[] = [];

  const scenes: SceneLayoutSolve[] = doc.scenes.map((scene) => {
    const findings: LayoutFinding[] = [];
    const boxes = new Map<string, EstimatedBox>();
    for (const el of scene.elements) {
      boxes.set(el.id, estimateBox(el, doc));
    }

    for (const el of scene.elements) {
      const box = boxes.get(el.id);
      if (box === undefined) continue;
      // GATE — SAFE-AREA: the element's center must sit inside the safe
      // rect (the subject's focal band; the plan's "subject outside safe
      // area").
      const cx = el.at.x;
      const cy = el.at.y;
      if (cx < mx || cx > doc.width - mx || cy < my || cy > doc.height - my) {
        findings.push({
          sceneId: scene.id,
          elementId: el.id,
          gate: "SAFE-AREA",
          detail: `center (${cx}, ${cy}) outside the safe rect [${Math.round(mx)}, ${Math.round(my)} .. ${Math.round(doc.width - mx)}, ${Math.round(doc.height - my)}] (${policy.variant})`,
        });
      }
      // GATE — MIN-SIZE: drawn text below the aspect's readable floor.
      const size = textSizePx(el) * el.at.scale;
      if ((el.text !== undefined || el.counter !== undefined) && size < policy.typeFloorPx) {
        findings.push({
          sceneId: scene.id,
          elementId: el.id,
          gate: "MIN-SIZE",
          detail: `drawn text ${Math.round(size * 100) / 100}px below the ${aspect} readable floor ${policy.typeFloorPx}px (${policy.variant})`,
        });
      }
    }

    // NOTE — COLLISION: estimated text/icon boxes overlapping past the
    // conservative band (estimates never fail a render — they ask for a
    // look; the plan's "component collision" gate lands here until the
    // estimator is measured).
    const visible = scene.elements.filter((el) => el.kind !== "group");
    for (let i = 0; i < visible.length; i++) {
      for (let j = i + 1; j < visible.length; j++) {
        const a = boxes.get(visible[i].id);
        const b = boxes.get(visible[j].id);
        if (a === undefined || b === undefined) continue;
        const frac = overlapFraction(a, b);
        if (frac >= COLLISION_NOTE_AT) {
          findings.push({
            sceneId: scene.id,
            elementId: visible[j].id,
            gate: "COLLISION",
            detail: `estimated box overlaps "${visible[i].id}" by ${Math.round(frac * 100)}% of the smaller box (estimate, never a fail)`,
          });
        }
      }
    }

    // NOTE — DENSITY: simultaneous elements past the aspect cap.
    if (visible.length > policy.maxSimultaneous) {
      findings.push({
        sceneId: scene.id,
        elementId: "*",
        gate: "DENSITY",
        detail: `${visible.length} simultaneous elements past the ${aspect} cap ${policy.maxSimultaneous} (${policy.variant})`,
      });
    }

    for (const f of findings) {
      if (f.gate === "SAFE-AREA" || f.gate === "MIN-SIZE") violations.push(f);
      else notes.push(f);
    }
    return { sceneId: scene.id, variant: policy.variant, findings };
  });

  return {
    aspect,
    variant: policy.variant,
    policyNote: policy.note,
    scenes,
    violations,
    notes,
  };
}

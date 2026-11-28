// repair.ts — the GRAPHICS RESPONSIVE REPAIR SEAM (the engineering master
// plan's WS8 evolution; the re-audit's step 5: "evolve the current gate
// layer into measured bounds, line-break feedback, collision repair,
// chart-label fitting, and explicit user repair actions").
//
// The layout solver (layout.ts) JUDGES — safe-area and min-size fail the
// QC row, collision/density/label-fit ride as estimates. This module
// PROPOSES and APPLIES: for every finding a mechanical repair can resolve,
// a deterministic repair proposal (the same estimator, the same boxes —
// one estimate model, never a second); the user applies them through the
// studio's repair panel (explicit user repair actions — the solver never
// mutates a doc on its own authority).
//
// The repair kinds, honestly split:
//   · recenter   (SAFE-AREA) — the center clamps into the aspect's safe
//     rect; nothing else moves.
//   · bump-size  (MIN-SIZE) — the element's scale raises until the drawn
//     text reaches the aspect's readable floor (scale′ = floor ÷ (size ×
//     scale)); the payload's own sizePx never changes.
//   · reposition (COLLISION) — the finding element moves along the axis of
//     least penetration until the boxes clear the repair padding, then
//     clamps into the safe rect (a repair must not mint a new violation).
//   · wrap-text  (COLLISION on text) — the line-break feedback: the text
//     reflows greedily on words to a measured wrap width (60% of the safe
//     width), narrowing the box until the overlap clears. Chosen when the
//     element is text AND the overlap is horizontal-dominant AND wrapping
//     actually helps (the wrapped width fits beside the other box);
//     reposition takes the rest.
//   · DENSITY and LABEL-FIT are declared UNREPAIRABLE: density is an
//     authoring act (split the scene), label-fit is the payload's own data
//     (shorten the labels) — the proposal list simply carries nothing for
//     them, and the panel says so.
//
// PURE and deterministic: same doc (+ report) → the same proposals, the
// same applied doc, byte for byte. No fs, no clock, no randomness.
import type { GraphicsDoc, GraphicsElement, GraphicsScene } from "./types";
import {
  estimateBox,
  solveGraphicsLayout,
  ASPECT_POLICIES,
  type EstimatedBox,
  type LayoutFinding,
  type LayoutSolveReport,
  GRAPHICS_CHAR_W_RATIO,
  GRAPHICS_LINE_H_RATIO,
} from "./layout";

/** The clearance a reposition leaves between the two boxes (px). */
const REPAIR_PAD_PX = 12;
/** The wrap target: a fraction of the safe width the longest line must
 *  fit (the reading-comfort bound the 16:9 compose implicitly rides). */
const WRAP_WIDTH_FRACTION = 0.6;
// Phase 6 single-source law: the ratios ride layout.ts's ONE table — the
// restatement is deleted, the wrap math and the gate math now judge the
// SAME boxes.
const CHAR_W_RATIO = GRAPHICS_CHAR_W_RATIO;
const LINE_H_RATIO = GRAPHICS_LINE_H_RATIO;

// ---------------------------------------------------------------------------
// The proposals
// ---------------------------------------------------------------------------

export type GraphicsRepairKind = "recenter" | "bump-size" | "reposition" | "wrap-text";

export interface GraphicsRepair {
  kind: GraphicsRepairKind;
  sceneId: string;
  elementId: string;
  /** The finding this repair resolves (the panel's grouping key). */
  gate: LayoutFinding["gate"];
  /** The human line the panel shows (names the constraint, like the
   *  solver's own findings). */
  detail: string;
  /** recenter / reposition: the new center. */
  to?: { x: number; y: number };
  /** bump-size: the element's new scale. */
  scale?: number;
  /** wrap-text: the reflowed text (the payload's own newline law). */
  text?: string;
}

/** Greedy word-wrap at `maxChars` per line — deterministic, honest to the
 *  estimator's char model (the same 0.55 ratio compose's reader rides). */
function wrapToChars(text: string, maxChars: number): string {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    if (line.length <= maxChars) {
      out.push(line);
      continue;
    }
    const words = line.split(/\s+/).filter((w) => w !== "");
    let cur = "";
    for (const word of words) {
      const cand = cur === "" ? word : `${cur} ${word}`;
      if (cand.length > maxChars && cur !== "") {
        out.push(cur);
        cur = word;
      } else {
        cur = cand;
      }
    }
    if (cur !== "") out.push(cur);
  }
  return out.join("\n");
}

function safeRect(doc: GraphicsDoc): { mx: number; my: number } {
  // The doc's own aspect (the solver refuses non-house surfaces, so the
  // lookup is total for any doc this module receives).
  const aspect =
    doc.width === 1920 && doc.height === 1080 ? "16:9" : doc.height === 1920 ? "9:16" : "1:1";
  const policy = ASPECT_POLICIES[aspect];
  return { mx: doc.width * policy.safeMarginRatio, my: doc.height * policy.safeMarginRatio };
}

function clampCenter(doc: GraphicsDoc, x: number, y: number): { x: number; y: number } {
  const { mx, my } = safeRect(doc);
  // Round AWAY from the boundary when clamping (ceil low / floor high): a
  // rounded-down edge would sit a fraction of a pixel outside the solver's
  // float rect and mint the very violation the repair claims to fix.
  return {
    x:
      x < mx ? Math.ceil(mx)
      : x > doc.width - mx ? Math.floor(doc.width - mx)
      : Math.round(x),
    y:
      y < my ? Math.ceil(my)
      : y > doc.height - my ? Math.floor(doc.height - my)
      : Math.round(y),
  };
}

function clearOther(
  a: EstimatedBox,
  b: EstimatedBox,
): { dx: number; dy: number } | null {
  const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (ox <= 0 && oy <= 0) return null;
  // The axis of least penetration, pushed along the center-to-center
  // direction (the later element steps BACK the way it came).
  const dirX = a.x0 + a.x1 >= b.x0 + b.x1 ? 1 : -1;
  const dirY = a.y0 + a.y1 >= b.y0 + b.y1 ? 1 : -1;
  if (ox <= oy) return { dx: (ox + REPAIR_PAD_PX) * dirX, dy: 0 };
  return { dx: 0, dy: (oy + REPAIR_PAD_PX) * dirY };
}

/** Propose the deterministic repairs for a doc's layout findings. A gate
 *  the module cannot mechanically resolve (DENSITY, LABEL-FIT) proposes
 *  nothing — the panel says so rather than inventing a fake fix. */
export function proposeGraphicsRepairs(
  doc: GraphicsDoc,
  report?: LayoutSolveReport
): GraphicsRepair[] {
  const solve = report ?? solveGraphicsLayout(doc);
  const findings: LayoutFinding[] = solve.scenes.flatMap((s) => s.findings);
  const elById = new Map(
    doc.scenes.flatMap((s) => s.elements.map((el) => [`${s.id}/${el.id}` as const, { scene: s, el }]))
  );
  const proposals: GraphicsRepair[] = [];
  const { mx } = safeRect(doc);
  const wrapChars = Math.floor((doc.width - 2 * mx) * WRAP_WIDTH_FRACTION / (16 * CHAR_W_RATIO));

  for (const f of findings) {
    const hit = elById.get(`${f.sceneId}/${f.elementId}`);
    if (hit === undefined) continue; // the "*" findings (density) name no element
    const { el } = hit;

    if (f.gate === "SAFE-AREA") {
      proposals.push({
        kind: "recenter",
        sceneId: f.sceneId,
        elementId: f.elementId,
        gate: f.gate,
        detail: `move "${el.id}" into the safe rect`,
        to: clampCenter(doc, el.at.x, el.at.y),
      });
      continue;
    }
    if (f.gate === "MIN-SIZE") {
      const sizePx =
        el.text !== undefined
          ? el.text.sizePx ?? 48
          : 48; // the compose default (counter + callout render at this)
      const drawn = sizePx * el.at.scale;
      const aspect =
        doc.width === 1920 && doc.height === 1080 ? "16:9" : doc.height === 1920 ? "9:16" : "1:1";
      const floor = ASPECT_POLICIES[aspect].typeFloorPx;
      if (!(drawn < floor) || sizePx <= 0) continue;
      const needed = Math.ceil((floor / drawn) * el.at.scale * 100 + 1) / 100;
      proposals.push({
        kind: "bump-size",
        sceneId: f.sceneId,
        elementId: f.elementId,
        gate: f.gate,
        detail: `raise "${el.id}" to scale ${needed} — drawn text reaches the ${aspect} floor ${floor}px`,
        scale: needed,
      });
      continue;
    }
    if (f.gate !== "COLLISION") continue; // DENSITY / LABEL-FIT: unrepairable

    // COLLISION: the finding names the LATER element; the detail names the
    // other one ("estimated box overlaps "X" by N%").
    const other = /overlaps "([^"]+)"/.exec(f.detail)?.[1];
    const otherHit = other !== undefined ? elById.get(`${f.sceneId}/${other}`) : undefined;
    if (otherHit === undefined) continue;
    const myBox = estimateBox(el, doc);
    const otherBox = estimateBox(otherHit.el, doc);

    // The wrap-text branch (the line-break feedback): text elements whose
    // overlap is horizontal-dominant AND whose wrapped box would clear.
    const content = el.text?.text;
    if (content !== undefined && el.text !== undefined) {
      const size = (el.text.sizePx ?? 48) * el.at.scale;
      const longest = Math.max(...content.split("\n").map((l) => l.length), 1);
      const overlapX = Math.min(myBox.x1, otherBox.x1) - Math.max(myBox.x0, otherBox.x0);
      const overlapY = Math.min(myBox.y1, otherBox.y1) - Math.max(myBox.y0, otherBox.y0);
      const wrapped = wrapToChars(content, Math.max(12, wrapChars));
      const newLongest = Math.max(...wrapped.split("\n").map((l) => l.length), 1);
      const newBox = {
        x0: myBox.x0,
        x1: myBox.x0 + Math.max(newLongest * size * CHAR_W_RATIO, 60),
        y0: myBox.y0,
        y1: myBox.y0 + size * LINE_H_RATIO * wrapped.split("\n").length,
      };
      const clears =
        Math.min(newBox.x1, otherBox.x1) - Math.max(newBox.x0, otherBox.x0) <= 0 ||
        Math.min(newBox.y1, otherBox.y1) - Math.max(newBox.y0, otherBox.y0) <= 0;
      if (newLongest < longest && overlapX >= overlapY && clears) {
        proposals.push({
          kind: "wrap-text",
          sceneId: f.sceneId,
          elementId: f.elementId,
          gate: f.gate,
          detail: `wrap "${el.id}" at ~${Math.max(12, wrapChars)} chars — the box narrows beside "${other}"`,
          text: wrapped,
        });
        continue;
      }
    }

    const push = clearOther(myBox, otherBox);
    if (push === null) continue;
    const to = clampCenter(doc, el.at.x + push.dx, el.at.y + push.dy);
    proposals.push({
      kind: "reposition",
      sceneId: f.sceneId,
      elementId: f.elementId,
      gate: f.gate,
      detail: `move "${el.id}" clear of "${other}" (least-penetration axis, ${REPAIR_PAD_PX}px clearance)`,
      to,
    });
  }
  return proposals;
}

// ---------------------------------------------------------------------------
// The application
// ---------------------------------------------------------------------------

export interface GraphicsRepairOutcome {
  doc: GraphicsDoc;
  /** The repairs that landed (ids ride sceneId/elementId/kind). */
  applied: string[];
  /** The repairs that could not (the scene/element vanished — the doc
   *  changed under the panel). */
  skipped: string[];
}

/** Apply the repairs — pure, immutable, ids stable. Each repair touches
 *  ONLY its own element's `at` (recenter/reposition/bump-size) or its text
 *  payload's lines (wrap-text); a missing scene/element skips with its
 *  name (never silently half-applies). */
export function applyGraphicsRepairs(
  doc: GraphicsDoc,
  repairs: readonly GraphicsRepair[]
): GraphicsRepairOutcome {
  const applied: string[] = [];
  const skipped: string[] = [];
  const scenes: GraphicsScene[] = doc.scenes.map((scene) => {
    const forScene = repairs.filter((r) => r.sceneId === scene.id);
    if (forScene.length === 0) return scene;
    const elements: GraphicsElement[] = scene.elements.map((el) => {
      let next = el;
      for (const r of forScene) {
        if (r.elementId !== el.id) continue;
        const tag = `${r.sceneId}/${r.elementId}/${r.kind}`;
        if (r.kind === "recenter" || r.kind === "reposition") {
          if (r.to === undefined) {
            skipped.push(tag);
            continue;
          }
          next = { ...next, at: { ...next.at, x: r.to.x, y: r.to.y } };
          applied.push(tag);
        } else if (r.kind === "bump-size") {
          if (r.scale === undefined || !(r.scale > 0)) {
            skipped.push(tag);
            continue;
          }
          next = { ...next, at: { ...next.at, scale: r.scale } };
          applied.push(tag);
        } else if (r.kind === "wrap-text") {
          if (r.text === undefined || next.text === undefined) {
            skipped.push(tag);
            continue;
          }
          next = { ...next, text: { ...next.text, text: r.text } };
          applied.push(tag);
        }
      }
      return next;
    });
    return { ...scene, elements };
  });
  // Repairs naming scenes the doc does not carry skip by name too.
  const sceneIds = new Set(doc.scenes.map((s) => s.id));
  for (const r of repairs) {
    if (!sceneIds.has(r.sceneId)) skipped.push(`${r.sceneId}/${r.elementId}/${r.kind}`);
  }
  return { doc: { ...doc, scenes }, applied, skipped };
}

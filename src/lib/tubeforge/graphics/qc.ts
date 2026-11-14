// S123 (G1) — the graphics QC subcheck matrix (P3, spec §7 #4): TubeForge-
// authored rows in the Stickman QC-matrix STRUCTURE (references/
// b6-sample-1-acceptance.md — IDs, required result, allowed variation,
// restricted N/A, no broad-pass cover; the rows themselves are ours).
//
// THE STICKMAN STRUCTURE, HONORED:
//   • every row carries an ID, a REQUIRED result ("pass" — every graphics
//     row is structural), and an ALLOWED VARIATION column documenting what
//     the row tolerates, so a reviewer can never read a pass broadly;
//   • NO broad-pass cover: each row is judged alone; one failing row fails
//     the scene/the report — no row may exempt another;
//   • RESTRICTED N/A: a row that could not run reports "unmeasured" and
//     UNMEASURED IS NOT PASS (the render-qc doctrine verbatim — a check
//     that never ran must never read as clean). An unchecked subcheck
//     FAILS the scene.
//
// The rows re-prove the engine's pure laws against the doc ON THE ROW at
// QC time — defense in depth, not a validator replay for its own sake: a
// standing final whose doc no longer describes it must never certify a
// ship gate (the S117 staleness law's QC twin). Pure — no fs, no DOM, no
// clock, no DB; the QC job and the routes consume this.
import {
  legalMotions,
  validateGraphicsDoc,
  type GraphicsDoc,
  type GraphicsElement,
  type GraphicsScene,
} from "./types";
import { frameAt, graphicsSceneDurationsMs } from "./frame";
import { graphicsBudgetReport } from "./preflight";
import { framePlanWindows } from "../anim/clock";

/** The QC status vocabulary — qc.ts's own (re-declared locally: graphics is
 *  a leaf module and imports no QC plumbing). */
export type GraphicsQcStatus = "pass" | "fail" | "unmeasured";

/** One authored row — the Stickman structure's columns. */
export interface GraphicsQcRow {
  id: string;
  label: string;
  /** REQUIRED RESULT — every graphics row demands pass (structural laws,
   *  not polish). */
  required: "pass";
  /** ALLOWED VARIATION — what the row tolerates, in one line. A pass means
   *  exactly this and nothing more (no broad-pass cover). */
  allowedVariation: string;
  status: GraphicsQcStatus;
  value: string;
  detail?: string;
}

const finiteChannels = (doc: GraphicsDoc, scenes: GraphicsScene[]): string | null => {
  const clock = graphicsSceneDurationsMs(doc);
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const sceneStart = clock.slice(0, i).reduce((a, b) => a + b, 0);
    const duration = clock[i];
    // Sample the scene at its own start, midpoint and end on the doc clock.
    for (const frac of [0, 0.5, 1]) {
      const tMs = Math.min(sceneStart + duration, sceneStart + duration * frac);
      const frame = frameAt(doc, tMs);
      for (const el of frame.elements) {
        if (!Number.isFinite(el.opacity) || el.opacity < 0 || el.opacity > 1)
          return `scene "${scene.id}" element "${el.id}" opacity ${el.opacity} at ${Math.round(tMs)}ms`;
        if (!Number.isFinite(el.scale) || el.scale <= 0)
          return `scene "${scene.id}" element "${el.id}" scale ${el.scale} at ${Math.round(tMs)}ms`;
        if (!Number.isFinite(el.progress) || el.progress < 0 || el.progress > 1)
          return `scene "${scene.id}" element "${el.id}" progress ${el.progress} at ${Math.round(tMs)}ms`;
        if (!Number.isFinite(el.x) || !Number.isFinite(el.y) || !Number.isFinite(el.rotateDeg))
          return `scene "${scene.id}" element "${el.id}" geometry non-finite at ${Math.round(tMs)}ms`;
      }
    }
  }
  return null;
};

/** The doc-law rows, proved against one doc. `raw` is whatever the caller
 *  read off the row (the QC job re-proves the STORED doc, never a trusted
 *  parse). Each row is fail-closed: a throw inside a check reports
 *  "unmeasured" — which every consumer treats as NOT pass. */
export function graphicsQcRows(raw: unknown, scenes?: GraphicsScene[]): GraphicsQcRow[] {
  const rows: GraphicsQcRow[] = [];
  const row = (
    id: string,
    label: string,
    allowedVariation: string,
    run: () => { value: string; detail?: string }
  ): void => {
    try {
      const { value, detail } = run();
      rows.push({ id, label, required: "pass", allowedVariation, status: "pass", value, ...(detail ? { detail } : {}) });
    } catch (err) {
      rows.push({
        id,
        label,
        required: "pass",
        allowedVariation,
        status: "unmeasured",
        value: "not measured — the check threw",
        detail: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
      });
    }
  };

  // g-grammar — the doc parses + validates with zero errors (the stored
  // string is re-proved from scratch; warnings are the additive-read law's
  // own notes and never fail the row).
  row(
    "g-grammar",
    "GraphicsDoc grammar — the stored doc validates clean",
    "validator warnings (additive-read notes) only; zero errors",
    () => {
      const { doc, errors } = validateGraphicsDoc(raw);
      if (!doc || errors.length > 0)
        throw new Error(`${errors.length} validator error(s): ${errors.slice(0, 2).join(" · ")}`);
      return { value: `${doc.scenes.length} scene(s) clean` };
    }
  );

  const parsed = validateGraphicsDoc(raw);
  const doc: GraphicsDoc | null = parsed.doc;

  // g-motions — every motion on every element is legal for its kind (the
  // compatibility table, re-checked against the CLEANED doc).
  row(
    "g-motions",
    "Motion compatibility — every motion is legal for its element kind",
    "any motion in the element kind's closed table row",
    () => {
      if (!doc) throw new Error("no valid doc to check");
      const all = scenes ?? doc.scenes;
      let count = 0;
      for (const scene of all) {
        for (const el of scene.elements) {
          const legal = legalMotions(el.kind) as readonly string[];
          for (const m of [el.enter, el.exit, el.emphasis]) {
            if (!m) continue;
            if (!legal.includes(m.kind))
              throw new Error(`scene "${scene.id}" element "${el.id}" (${el.kind}) carries illegal motion "${m.kind}"`);
            count++;
          }
        }
      }
      return { value: `${count} motion(s) legal` };
    }
  );

  // g-clocks — the frame plan derives at doc.fps and tiles the doc clock
  // (junk scene durations throw; contiguity holds by construction and is
  // re-asserted here, seam by seam).
  row(
    "g-clocks",
    "Scene clocks — the frame plan derives and tiles contiguously at doc.fps",
    "frame-quantized windows at the doc's own fps (24 or 30)",
    () => {
      if (!doc) throw new Error("no valid doc to check");
      const sceneMs = graphicsSceneDurationsMs(doc);
      const plan = framePlanWindows(sceneMs, doc.fps);
      for (let i = 1; i < plan.scenes.length; i++) {
        if (plan.scenes[i].startSec !== plan.scenes[i - 1].endSec)
          throw new Error(`scene window ${i} does not tile: ${plan.scenes[i].startSec} ≠ ${plan.scenes[i - 1].endSec}`);
      }
      return { value: `${plan.scenes.length} window(s), ${plan.totalSec.toFixed(2)}s at ${doc.fps} fps` };
    }
  );

  // g-budget — the DELIVERED frame count fits the wall at doc.fps (the
  // R-1 arithmetic: per-scene framePlanWindows frames, never the whole-doc
  // figure).
  row(
    "g-budget",
    "Frame budget — the DELIVERED count fits the wall at doc.fps",
    "delivered frames ≤ 25,920 at the doc's own fps",
    () => {
      if (!doc) throw new Error("no valid doc to check");
      const report = graphicsBudgetReport(doc);
      if (!report.ok) throw new Error(report.refusal ?? "budget wall exceeded");
      return { value: `${report.frames}/${report.wall} frames at ${report.fps} fps` };
    }
  );

  // g-frame-truth — frameAt samples every scene at start/mid/end and every
  // channel stays finite and in range (the frame engine's own contract,
  // re-proved end to end).
  row(
    "g-frame-truth",
    "Frame truth — every channel finite and in range at scene start/mid/end",
    "opacity 0..1, scale > 0 finite, progress 0..1, finite geometry",
    () => {
      if (!doc) throw new Error("no valid doc to check");
      const bad = finiteChannels(doc, scenes ?? doc.scenes);
      if (bad) throw new Error(bad);
      return { value: `${doc.scenes.length} scene(s) sampled ×3` };
    }
  );

  // g-groups — group integrity: every group child resolves to an element
  // in its own scene (the validator's law, re-checked; a dangling child
  // would silently vanish from the composition).
  row(
    "g-groups",
    "Group integrity — every group child resolves inside its scene",
    "groups of depth ≤ 1 whose children all exist in the same scene",
    () => {
      if (!doc) throw new Error("no valid doc to check");
      const all = scenes ?? doc.scenes;
      let groups = 0;
      for (const scene of all) {
        const ids = new Set(scene.elements.map((e) => e.id));
        for (const el of scene.elements as GraphicsElement[]) {
          if (el.kind !== "group" || el.group === undefined) continue;
          groups++;
          for (const child of el.group.children) {
            if (!ids.has(child))
              throw new Error(`scene "${scene.id}" group "${el.id}" references missing child "${child}"`);
          }
        }
      }
      return { value: groups === 0 ? "no groups" : `${groups} group(s) intact` };
    }
  );

  return rows;
}

export interface GraphicsQcResult {
  /** rows.length > 0 AND every row passes — the battery's own passed law
   *  (an empty report never passes; unmeasured never passes). */
  passed: boolean;
  rows: GraphicsQcRow[];
}

/** The full-doc matrix. */
export function runGraphicsQc(raw: unknown): GraphicsQcResult {
  const rows = graphicsQcRows(raw);
  return { passed: rows.length > 0 && rows.every((r) => r.status === "pass"), rows };
}

/** The per-scene slice — the SAME rows scoped to one scene's motions,
 *  clocks and frame truth (the Stickman per-scene matrix shape). The doc
 *  rows (grammar/budget) are project-wide and still run: a failing project
 *  row fails every scene that rides it (no broad-pass cover). An unknown
 *  scene id fails honestly — it cannot have passed anything. */
export function runGraphicsSceneQc(raw: unknown, sceneId: string): GraphicsQcResult & { sceneExists: boolean } {
  const parsed = validateGraphicsDoc(raw);
  const doc = parsed.doc;
  const scene = doc?.scenes.find((s) => s.id === sceneId) ?? null;
  const rows = graphicsQcRows(raw, scene ? [scene] : undefined);
  if (!scene) {
    rows.push({
      id: "g-scene-exists",
      label: `Scene "${sceneId}" exists in the doc`,
      required: "pass",
      allowedVariation: "the scene id resolves in the stored doc",
      status: "fail",
      value: "scene not found",
    });
  }
  return {
    passed: rows.length > 0 && rows.every((r) => r.status === "pass"),
    rows,
    sceneExists: scene !== null,
  };
}

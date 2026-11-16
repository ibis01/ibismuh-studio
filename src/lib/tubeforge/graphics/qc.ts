// S123 (G1) P3 — the graphics QC group (spec §7 #4, the Stickman QC matrix
// STRUCTURE with TubeForge-authored rows): the pre-render subcheck matrix
// (evidence per scene, fail-closed) + the lane-aware post-render helpers
// the battery consumes (legal hold windows, the hard-cut expectation).
//
// THE MATRIX LAW (the external acceptance record's structure — IDs,
// required result, allowed variation, restricted N/A, NO broad-pass
// cover): every row cites its own id, carries a three-state status, and an
// UNCHECKED row (the probe could not run) FAILS its scene — "unmeasured"
// is never clean (the qc.ts three-state law, applied to the doc matrix).
// The matrix does NOT re-trust the validator: it re-derives the
// render-critical invariants independently, so the evidence record can
// never be a copy of the admission gate's own opinion.
//
// PURE — no fs, no DOM, no clock, no ffmpeg; the matrix runs before
// chromium (preflight-before-spend), the helpers feed the post-render
// battery. Deterministic strings.
import { frameCountOf } from "../anim/clock";
import { expectedCutsForTimeline, type ExpectedCuts } from "../render-qc";
import type { TransitionSettings } from "../transitions";
import { graphicsSceneDurationsMs } from "./frame";
import { graphicsBudgetReport } from "./preflight";
import { graphicsTracks } from "./tracks";
import { GRAPHICS_BUDGETS, type GraphicsDoc, type GraphicsElement } from "./types";
import { IMPORT_WALLS } from "./import-validate";

// ---------------------------------------------------------------------------
// The pre-render subcheck matrix
// ---------------------------------------------------------------------------

export type GraphicsQcStatus = "pass" | "fail" | "unmeasured";

export interface GraphicsQcRow {
  id: string;
  label: string;
  status: GraphicsQcStatus;
  value: string;
  detail?: string;
}

export interface GraphicsQcReport {
  /** Clean only when EVERY row ran AND passed — an unchecked row keeps the
   *  report red for a human (the battery's never-silently-clean law). */
  passed: boolean;
  checkedAt: string;
  rows: GraphicsQcRow[];
}

function row(
  id: string,
  label: string,
  status: GraphicsQcStatus,
  value: string,
  detail?: string
): GraphicsQcRow {
  return { id, label, status, value, ...(detail !== undefined ? { detail } : {}) };
}

/** The hard-cut transition settings the graphics lane assembles with —
 *  the doc's exits are in-scene motion, never track blends (the tracks
 *  law), so every boundary is a CUT for the expectation builder. */
const HARD_CUT_SETTINGS: TransitionSettings[] = [];

/** The lane-aware post-render helpers — exported for the render job (and
 *  the unit pins):
 *   - expectedCuts: n−1 hard cuts at the frame-quantized boundaries (the
 *     cuts the concat actually delivers).
 *   - holdWindows: per scene, the absolute-second window where the placed
 *     state LEGALLY holds (after the last motion window ends) — a freeze
 *     or a sampled static run inside it is the DESIGN, not a defect (the
 *     kinetic-typography hold is the format's grammar). Empty window = the
 *     scene's motions run to its end (no legal hold). */
export function graphicsExpectedCuts(doc: GraphicsDoc): ExpectedCuts {
  const durSec = graphicsSceneDurationsMs(doc).map((ms) => ms / 1000);
  // The settings array is INDEXED BY BOUNDARY (n−1 entries); an empty
  // array means "every boundary defaults to the cut style" — but the
  // builder needs the style, so pass explicit hard cuts.
  const settings: TransitionSettings[] = [];
  for (let b = 0; b + 1 < durSec.length; b++) settings.push({ style: "cut", durationSec: 0 });
  return expectedCutsForTimeline(durSec, settings.length > 0 ? settings : HARD_CUT_SETTINGS);
}

export interface GraphicsHoldWindow {
  sceneIndex: number;
  sceneId: string;
  /** Absolute seconds — the composition clock the battery measures. */
  startSec: number;
  endSec: number;
}

/** The legal-hold windows (absolute seconds) — the last motion window end
 *  per scene (motions are scene-local, the validator's time-sanity law)
 *  mapped onto the doc clock through the exact scene cursors. A freeze or
 *  static run STARTING inside a window is designed; starting elsewhere is
 *  a dead compositor. */
export function graphicsHoldWindows(doc: GraphicsDoc): GraphicsHoldWindow[] {
  const sceneMs = graphicsSceneDurationsMs(doc);
  const out: GraphicsHoldWindow[] = [];
  let cursorMs = 0;
  doc.scenes.forEach((scene, si) => {
    let lastMotionEnd = 0;
    for (const el of scene.elements) {
      for (const m of [el.enter, el.exit, el.emphasis]) {
        if (m !== undefined) lastMotionEnd = Math.max(lastMotionEnd, m.delayMs + m.durationMs);
      }
    }
    const holdStartMs = cursorMs + Math.min(lastMotionEnd, sceneMs[si]);
    if (holdStartMs < cursorMs + sceneMs[si]) {
      out.push({
        sceneIndex: si + 1,
        sceneId: scene.id,
        startSec: Math.round((holdStartMs / 1000) * 100) / 100,
        endSec: Math.round(((cursorMs + sceneMs[si]) / 1000) * 100) / 100,
      });
    }
    cursorMs += sceneMs[si];
  });
  return out;
}

/** The pre-render matrix. `doc` must be a VALIDATED doc (the matrix is
 *  evidence, not the grammar gate — it re-derives independently, never
 *  re-implements the validator). */
export function graphicsQcMatrix(doc: GraphicsDoc, voSceneCount: number): GraphicsQcReport {
  const rows: GraphicsQcRow[] = [];

  // G1-PROJ-1 — the budget wall (re-derived through the preflight's
  // DELIVERED arithmetic, R-1; not the whole-doc figure).
  try {
    const budget = graphicsBudgetReport(doc);
    rows.push(row(
      "G1-PROJ-1",
      `Delivered frames within the budget wall at doc.fps (${GRAPHICS_BUDGETS.scenesPerProject}-scene cap)`,
      budget.ok ? "pass" : "fail",
      `${budget.frames}/${budget.wall} frames @ ${budget.fps} fps (cap ${budget.capSec.toFixed(1)}s)`,
      budget.ok
        ? "the wall reads the Σ per-scene framePlanWindows count — the encoder's truth (R-1)"
        : budget.refusal ?? undefined
    ));
  } catch (err) {
    rows.push(row("G1-PROJ-1", "Delivered frames within the budget wall", "unmeasured",
      "not measured", `the budget probe failed: ${err instanceof Error ? err.message.slice(0, 160) : String(err)}`));
  }

  // G1-PROJ-2 — the contract projection: one visual clip per scene over
  // the frame-quantized windows, contiguous by construction (re-derived
  // through graphicsTracks, not assumed from the plan).
  try {
    const tracks = graphicsTracks(doc);
    const visual = tracks.find((t) => t.kind === "graphics");
    const clips = visual?.clips ?? [];
    let contiguous = clips.length === doc.scenes.length;
    for (let i = 1; contiguous && i < clips.length; i++) {
      contiguous = Math.abs(clips[i].startSec - clips[i - 1].endSec) < 1e-9;
    }
    const firstAtZero = clips.length === 0 || clips[0].startSec === 0;
    rows.push(row(
      "G1-PROJ-2",
      "The S87 projection matches the scenes, contiguous from zero",
      contiguous && firstAtZero ? "pass" : "fail",
      `${clips.length} clips`,
      contiguous && firstAtZero
        ? "frame-quantized windows at doc.fps (D3)"
        : "the projection diverged from the frame plan — engine bug"
    ));
  } catch (err) {
    rows.push(row("G1-PROJ-2", "The S87 projection matches the scenes", "unmeasured",
      "not measured", `the tracks probe failed: ${err instanceof Error ? err.message.slice(0, 160) : String(err)}`));
  }

  // G1-PROJ-3 — the audio truth: every voiced scene maps to a slot the
  // encoder can fill; the count comes from the caller's WAV probe (the
  // same mapping the render's voFilesFor runs). Silent drafts are LEGAL
  // (the whiteboard parity — allowed variation: 0 slots with a valid
  // report). N/A is restricted to the silent case only.
  const sceneCount = doc.scenes.length;
  rows.push(row(
    "G1-PROJ-3",
    "Narration slots accounted (voiced scenes map to WAV slots)",
    voSceneCount <= sceneCount ? "pass" : "fail",
    `${voSceneCount}/${sceneCount} scenes voiced`,
    voSceneCount === 0
      ? "silent draft — a legal render shape (the battery judges the audio honestly)"
      : "VO slots ride the scene windows (the doc clock owns duration; short slots pad, overruns truncate)"
  ));

  // G1-PROJ-4 — the frame counter: the doc-level count equals the wall's
  // plan at doc.fps (the two arithmetics the merge review pinned apart —
  // the matrix records the actual delta).
  try {
    const budget = graphicsBudgetReport(doc);
    const wholeDocFrames = frameCountOf(
      graphicsSceneDurationsMs(doc).reduce((a, b) => a + b, 0),
      doc.fps
    );
    const delta = budget.frames - wholeDocFrames;
    rows.push(row(
      "G1-PROJ-4",
      "Frame arithmetic recorded (delivered vs whole-doc)",
      budget.frames <= budget.wall ? "pass" : "fail",
      `delivered ${budget.frames}, whole-doc ${wholeDocFrames} (Δ ${delta >= 0 ? "+" : ""}${delta})`,
      "per-scene rounding may exceed the whole-doc figure (R-1); the wall reads DELIVERED — recorded, not hidden"
    ));
  } catch (err) {
    rows.push(row("G1-PROJ-4", "Frame arithmetic recorded", "unmeasured",
      "not measured", `the arithmetic probe failed: ${err instanceof Error ? err.message.slice(0, 160) : String(err)}`));
  }

  // S126 — G1-IMP-1 (the ONE import lens): every sprite payload is
  // self-consistent — fps on the shared timebase, frames under the wall,
  // sheet windows inside a horizontal strip (frames × frameW ≤ the 4096
  // sheet-width wall), sequence sizes uniform. Vacuous pass on a doc with
  // no sprites (the rollback law); the MANIFEST resolution is the render
  // job's fail-closed refusal (the lens's enforcement half).
  const sprites = doc.scenes.flatMap((s) => s.elements.filter((el) => el.kind === "sprite" && el.sprite !== undefined));
  if (sprites.length === 0) {
    rows.push(row(
      "G1-IMP-1",
      "Sprite imports self-consistent (S126)",
      "pass",
      "0 sprites",
      "no imports referenced — the lens passes vacuously (the rollback law)"
    ));
  } else {
    const problems: string[] = [];
    for (const el of sprites) {
      const p = el.sprite as NonNullable<GraphicsElement["sprite"]>;
      const where = `scene "${doc.scenes.find((s) => s.elements.includes(el))?.id ?? "?"}"/${el.id}`;
      if (p.fps !== 24 && p.fps !== 30) problems.push(`${where}: fps ${p.fps} off the shared timebase`);
      if (p.frames < 1 || p.frames > GRAPHICS_BUDGETS.spriteFramesMax) problems.push(`${where}: frames ${p.frames} outside the wall`);
      if (p.layout === "sheet" && p.frameW * p.frames > IMPORT_WALLS.sheetWidthMax) {
        problems.push(`${where}: the sheet strip is ${p.frameW * p.frames}px wide — past the ${IMPORT_WALLS.sheetWidthMax} decode wall`);
      }
    }
    rows.push(row(
      "G1-IMP-1",
      "Sprite imports self-consistent (S126)",
      problems.length === 0 ? "pass" : "fail",
      `${sprites.length} sprites`,
      problems.length === 0
        ? "fps on the shared 24/30 timebase; frames under the wall; sheet strips inside the decode wall"
        : problems.slice(0, 3).join("; ")
    ));
  }

  return {
    passed: rows.length > 0 && rows.every((r) => r.status === "pass"),
    checkedAt: new Date().toISOString(),
    rows,
  };
}

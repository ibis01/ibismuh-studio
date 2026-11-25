// video-lanes.ts — THE CANONICAL LANE REGISTRY (P1).
//
// Single source of truth for the six create presets. Before this module the
// lane knowledge was scattered: the create wizard carried its own literals
// (create-view VIDEO_TYPES), the render-mode catalog sat in types.ts, the
// render lane resolver sat in render-lane.ts, the heavy-ffmpeg job cap sat in
// queue.ts, and the slides 9:16 geometry law sat inline in video-jobs.ts.
// A preset change meant five coordinated edits and four places to drift.
//
// THE CONTRACT (P1): every consumer that needs "what does this lane mean"
// reads the registry. A new lane is not "implemented" until its registry
// entry exists, its renderMode seats in the RENDER_MODES picker catalog, its
// format seats in FORMATS, and validateLaneRegistry() passes — the unit
// suite pins all of it (scripts/test-video-lanes.mts).
//
// What this module deliberately IS NOT: it does not replace render-lane.ts
// (S119 — the admission-time body-vs-row truth table, unit-pinned) and it
// does not move the RENDER_MODES/FORMATS catalogs (types.ts remains the
// brief-level catalog the API validates against). It DECLARES the six
// create presets as contracts over those catalogs and hosts the laws that
// keep the catalogs and the presets in lockstep.

import { FORMATS, RENDER_MODES } from "./types";

// ---------- the contract (P1 shape, verbatim from the plan) ----------

export type VideoType =
  | "classic"
  | "story"
  | "whiteboard"
  | "graphics2d"
  | "character"
  | "slides";

export interface VideoLaneContract {
  type: VideoType;
  format: "script" | "story";
  /** The row's renderMode truth this preset pins (the RENDER_MODES id). */
  renderMode: string;
  /** Version of the lane's plan document schema (bump on breaking shape). */
  planVersion: number;
  /** The brief shape the lane accepts (api-schemas family id). */
  inputSchema: string;
  /** The content planner stage that writes the lane's plan. */
  planner: string;
  /** The final renderer stage that consumes the plan. */
  renderer: string;
  /** The DECLARED fallback chain — every degradation this lane may take,
   *  named. A fallback that is not listed here must not exist silently. */
  fallbackPolicy: string;
  /** The QC calibration family the lane's renders are judged by. */
  qcProfile: string;
  supportedAspects: readonly string[];
}

// ---------- UI metadata (kept outside the contract interface) ----------

export interface LaneUiMeta {
  title: string;
  desc: string;
  /** lucide icon name (resolved client-side — icons are components). */
  icon: string;
  accent: string;
  preview: string;
}

// ---------- the registry ----------

export const LANE_ORDER: readonly VideoType[] = [
  "classic",
  "story",
  "whiteboard",
  "graphics2d",
  "character",
  "slides",
];

export const LANE_REGISTRY: Record<VideoType, VideoLaneContract> = {
  classic: {
    type: "classic",
    format: "script",
    renderMode: "kenburns",
    planVersion: 1,
    inputSchema: "brief-script-v1",
    planner: "script-job",
    renderer: "story-compositor",
    fallbackPolicy:
      "no provider art → gradient boards; no voice provider → silent render declared in QC; i2v never applies",
    qcProfile: "story-compositor-v1",
    supportedAspects: ["16:9", "9:16", "1:1"],
  },
  story: {
    type: "story",
    format: "story",
    renderMode: "kenburns",
    planVersion: 1,
    inputSchema: "brief-story-v1",
    planner: "storyboard-job",
    renderer: "story-compositor",
    fallbackPolicy:
      "no footage match → Smart Motion art; i2v unavailable → Ken Burns (declared per scene); board flips sweep artifacts",
    qcProfile: "story-compositor-v1",
    supportedAspects: ["16:9", "9:16", "1:1"],
  },
  whiteboard: {
    type: "whiteboard",
    format: "story",
    renderMode: "whiteboard",
    planVersion: 1,
    inputSchema: "brief-story-v1",
    planner: "whiteboard-engine (beat plan + voice anchors)",
    renderer: "whiteboard-engine",
    fallbackPolicy:
      "no ASR word anchors → silencedetect runs → word-proportional estimate (declared in the anchors' timingSource)",
    qcProfile: "whiteboard-engine-v1",
    supportedAspects: ["16:9", "9:16", "1:1"],
  },
  graphics2d: {
    type: "graphics2d",
    format: "story",
    renderMode: "graphics",
    planVersion: 1,
    inputSchema: "brief-story-v1",
    planner: "graphics-engine (declarative doc)",
    renderer: "graphics-engine",
    fallbackPolicy:
      "doc rejected → named parser error (never silent); resume fingerprint mismatch → fail-closed re-render",
    qcProfile: "graphics-engine-v1",
    supportedAspects: ["16:9", "9:16", "1:1"],
  },
  character: {
    type: "character",
    format: "story",
    // The character preset shares the story compositor path (S125's rig
    // channel rides INSIDE the kenburns lane) — the REGISTRY makes that
    // sharing explicit instead of two duplicated literals, and the rig-aware
    // channel is declared as this lane's planner/renderer truth.
    renderMode: "kenburns",
    planVersion: 1,
    inputSchema: "brief-story-v1",
    planner: "storyboard-job + native-rig channel",
    renderer: "story-compositor + native-rig channel",
    fallbackPolicy:
      "corrupt rig columns → native rig skipped (logged, never silent); rig unavailable per scene → Ken Burns fallback (declared per scene)",
    qcProfile: "story-compositor-v1",
    supportedAspects: ["16:9", "9:16", "1:1"],
  },
  slides: {
    type: "slides",
    format: "story",
    renderMode: "slides",
    planVersion: 1,
    inputSchema: "brief-story-v1",
    planner: "slides-deck (LLM plan) + kinetic pass",
    renderer: "slides-deck (+ kinetic clips)",
    fallbackPolicy:
      "kinetic clip failed/over wall → still deck with camera moves (declared per scene); deck geometry pinned 9:16",
    qcProfile: "story-compositor-v1",
    supportedAspects: ["9:16"],
  },
};

export const LANE_UI_META: Record<VideoType, LaneUiMeta> = {
  classic: {
    title: "Classic narration",
    desc: "AI writes a flowing narration + metadata — classic render with a thumbnail package.",
    icon: "FileText",
    accent: "text-primary",
    preview: "/formats/classic.jpg",
  },
  story: {
    title: "Scene story",
    desc: "Scene-by-scene script and storyboard art — Smart Motion pans & zooms per scene.",
    icon: "Clapperboard",
    accent: "text-amber-300",
    preview: "/formats/story.jpg",
  },
  whiteboard: {
    title: "Whiteboard explainer",
    desc: "A hand draws every scene in real time — narrated whiteboard animation.",
    icon: "PenTool",
    accent: "text-sky-300",
    preview: "/formats/whiteboard.jpg",
  },
  graphics2d: {
    title: "Motion graphics (2D)",
    desc: "A native 2D engine animates headlines, counters, bar charts and icons from a declarative doc — kinetic and $0, no image generation.",
    icon: "BarChart3",
    accent: "text-emerald-300",
    preview: "/formats/graphics2d.jpg",
  },
  character: {
    title: "Character animation",
    desc: "Your Cast character performs the story — attach a rigged character and the native rig channel draws it pose-by-pose into every scene; without one, storyboard art carries the scene.",
    icon: "PersonStanding",
    accent: "text-fuchsia-300",
    preview: "/formats/character.jpg",
  },
  slides: {
    title: "Keynote slides",
    desc: "A kinetic-typography slide deck, one designed slide per beat — no image generation.",
    icon: "Presentation",
    accent: "text-violet-300",
    preview: "/formats/slides.jpg",
  },
};

// ---------- laws ----------

export interface LaneRegistryIssue {
  lane: VideoType;
  message: string;
}

/** Validate the registry against the brief-level catalogs (types.ts):
 *  every preset's renderMode must seat in RENDER_MODES, its format in
 *  FORMATS, its aspects in RENDER_ASPECTS, and every field must carry
 *  meaningful content. Returns [] when the registry is coherent. */
export function validateLaneRegistry(): LaneRegistryIssue[] {
  const issues: LaneRegistryIssue[] = [];
  const formatIds = FORMATS.map((f) => f.id);
  const modeIds = RENDER_MODES.map((m) => m.id);
  const aspectIds = ["16:9", "9:16", "1:1"];
  const seen = new Set<string>();
  for (const id of LANE_ORDER) {
    const c = LANE_REGISTRY[id];
    if (seen.has(c.renderMode) && c.renderMode !== "kenburns") {
      // kenburns is deliberately shared (classic/story/character) — every
      // other renderMode belongs to exactly one preset.
      issues.push({ lane: id, message: `renderMode "${c.renderMode}" is pinned by more than one preset` });
    }
    seen.add(c.renderMode);
    if (!formatIds.includes(c.format as (typeof formatIds)[number])) {
      issues.push({ lane: id, message: `format "${c.format}" is not a FORMATS id` });
    }
    if (!modeIds.includes(c.renderMode as (typeof modeIds)[number])) {
      issues.push({ lane: id, message: `renderMode "${c.renderMode}" is not a RENDER_MODES id` });
    }
    for (const aspect of c.supportedAspects) {
      if (!aspectIds.includes(aspect)) {
        issues.push({ lane: id, message: `unsupported aspect "${aspect}"` });
      }
    }
    for (const [field, value] of Object.entries({
      inputSchema: c.inputSchema,
      planner: c.planner,
      renderer: c.renderer,
      fallbackPolicy: c.fallbackPolicy,
      qcProfile: c.qcProfile,
    })) {
      if (typeof value !== "string" || value.trim().length === 0) {
        issues.push({ lane: id, message: `${field} must be a non-empty declaration` });
      }
    }
    if (!Number.isInteger(c.planVersion) || c.planVersion < 1) {
      issues.push({ lane: id, message: "planVersion must be a positive integer" });
    }
  }
  return issues;
}

// ---------- cross-module consumers ----------

/** The engine-lane vocabulary, restated from the registry's renderer stage
 *  ids so render-lane.ts's EngineLaneId and this table can never drift. */
export const ENGINE_LANE_RENDER_MODES: readonly string[] = ["whiteboard", "graphics"];

/**
 * The heavy-ffmpeg job kinds, declared HERE (P1): the queue's per-org
 * concurrency cap reads this list instead of an inline literal. Every
 * engine lane (chromium + ffmpeg is the same CPU/RAM class — design §3.2)
 * and every compositor render is heavy; graphics joins whiteboard instead
 * of silently bypassing the cap.
 */
export const HEAVY_JOB_KINDS: readonly string[] = [
  "render",
  "short",
  "convert",
  "whiteboard",
  "graphics",
];

export function isHeavyJobKind(kind: string): boolean {
  return (HEAVY_JOB_KINDS as readonly string[]).includes(kind);
}

/**
 * The render geometry law (T-6.8), declared HERE: slides pins 9:16 (the
 * keynote deck geometry) regardless of any request; every other lane
 * honors the requested aspect when legal and falls back to 16:9.
 * video-jobs.ts consumes this instead of an inline ternary.
 */
export function resolveRenderAspect(
  renderMode: string,
  requested: string | null | undefined
): "16:9" | "9:16" | "1:1" {
  if (renderMode === "slides") return "9:16";
  if (requested === "9:16" || requested === "1:1" || requested === "16:9") return requested;
  return "16:9";
}

/** The registry entry for a renderMode (null = not a create-preset mode —
 *  stock/animated are story sub-modes with no preset of their own). */
export function laneByRenderMode(renderMode: string): VideoLaneContract | null {
  for (const id of LANE_ORDER) {
    if (LANE_REGISTRY[id].renderMode === renderMode) return LANE_REGISTRY[id];
  }
  return null;
}

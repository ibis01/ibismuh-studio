// planner-types.ts — THE LANE PLAN VOCABULARY (master plan §4.2 + §5 workstreams C–G).
//
// The seam every planner compiles INTO and every consumer (assembler, QC,
// preview renderer, inspector) reads. One unified `LaneScene` carries the
// scene/beat/slide identity; lane-specific payloads ride as typed fields —
// whiteboard paths (Drawable IR), graphics components, slides beats,
// character pose plans. This module is pure: both server planners and the
// client preview renderer import it.

import type { VideoType } from "./studio-lanes";

export const RENDERER_VERSION = "ibismuh-studio-renderer-v1";

// ---------- whiteboard drawable IR (Workstream E) ----------

/** One drawable stroke: stable id, SVG path in viewBox coords, declared role. */
export interface DrawablePath {
  id: string;
  /** SVG path data in the 1280x720 board space. */
  d: string;
  /** Closed role vocabulary — every visible path declares why it exists. */
  role: "frame" | "shape" | "arrow" | "underline" | "glyph" | "emphasis" | "connector";
  /** The concept this stroke expresses (semantic mapping). */
  semanticGroup: string;
  /** Calibrated stroke duration (length × complexity × emphasis). */
  strokeMs: number;
  /** Deterministic draw order (endpoint-aware sequencing result). */
  order: number;
}

// ---------- motion graphics semantic components (Workstream F) ----------

export type GraphicComponentKind =
  | "headline"
  | "statistic"
  | "comparison"
  | "timeline"
  | "chart"
  | "quote"
  | "cta"
  | "lower-third"
  | "icon-group";

export interface GraphicComponent {
  id: string;
  kind: GraphicComponentKind;
  /** Component payload (headline text, stat value/label, chart bars...). */
  props: Record<string, string | number | boolean>;
  /** Normalized layout rect (0..1 of the frame) — the layout gate reads this. */
  layout: { x: number; y: number; w: number; h: number };
  /** Data provenance citation for data-driven components. */
  citation?: string;
}

// ---------- slides beat (Workstream F — slides) ----------

export type SlideTemplate = "title" | "title-body" | "stat" | "quote" | "section" | "closing";

export interface SlideBeat {
  template: SlideTemplate;
  title: string;
  body?: string[];
  stat?: { value: string; label: string };
  quote?: { text: string; attribution: string };
  citation?: string;
}

// ---------- character pose plan (Workstream G) ----------

export type CharacterRigMode = "native-rig" | "storyboard-fallback";

export interface PoseKeyframe {
  id: string;
  /** ms offset inside the scene window. */
  at: number;
  pose: "neutral" | "idle" | "gesture-emphasis" | "gesture-open" | "gesture-point" | "walk" | "look-left" | "look-right";
  viseme?: "rest" | "aa" | "ee" | "oo" | "mm";
  hold?: boolean;
}

export interface PosePlan {
  rigMode: CharacterRigMode;
  poses: PoseKeyframe[];
  /** Lip-sync is validated or explicitly disabled — never silent. */
  lipSync: "validated" | "disabled";
  identityAnchor: string;
}

// ---------- scene story bible + continuity (Workstream D) ----------

export interface StoryBibleCharacter {
  id: string;
  name: string;
  description: string;
  wardrobe: string;
}

export interface StoryBibleLocation {
  id: string;
  name: string;
  description: string;
}

export interface StoryBible {
  characters: StoryBibleCharacter[];
  locations: StoryBibleLocation[];
  palette: string[];
  style: string;
}

export interface ContinuityIssue {
  sceneRef: string;
  kind: "wardrobe" | "location" | "palette" | "character" | "prop";
  severity: "info" | "warn";
  message: string;
}

// ---------- the unified scene ----------

export type TransitionId = "cut" | "fade" | "fadeblack" | "dissolve" | "slide-left" | "slide-up";

/** Camera pose for Smart Motion lanes (classic/story/character fallback). */
export interface CameraPose {
  /** Ken Burns start rect, normalized 0..1: {x,y,w,h}. */
  start: { x: number; y: number; w: number; h: number };
  end: { x: number; y: number; w: number; h: number };
  easing: "smooth" | "linear";
}

/**
 * The unified scene vocabulary: every lane's plan is an array of these.
 * Identity: `id` is stable across revisions (repairs reference it);
 * timing: `estimatedDurationMs` is the DECLARED deterministic estimate
 * used before measurement lands.
 */
export interface LaneScene {
  id: string;
  index: number;
  narration: string;
  /** What the frame must show — image prompt intent, headline, or concept. */
  visualIntent: string;
  caption?: string;
  /** Deterministic estimate BEFORE measured audio (declared, never silent). */
  estimatedDurationMs: number;
  transitionIn?: TransitionId;
  /** Smart Motion camera (kenburns lanes). */
  camera?: CameraPose;
  /** Whiteboard drawable IR (whiteboard lane). */
  paths?: DrawablePath[];
  /** Motion graphics components (graphics2d lane). */
  components?: GraphicComponent[];
  /** Slides beat (slides lane). */
  slide?: SlideBeat;
  /** Character pose plan (character lane). */
  pose?: PosePlan;
  /** Declared per-scene mode (character rig truth rides here). */
  mode?: string;
}

// ---------- the planner output ----------

export interface PlannerOutput {
  lane: VideoType;
  scenes: LaneScene[];
  /** Scene Story's persisted-before-scenes story bible. */
  storyBible?: StoryBible;
  /** Scene Story's continuity report (adjacent-scene comparison). */
  continuity?: ContinuityIssue[];
  /** The DECLARED fallback decision — never silent. */
  fallback: {
    mode: string;
    reason: string;
    perScene?: Array<{ sceneRef: string; mode: string; reason: string }>;
  };
  /** Named planner provenance (which planner + whether the LLM pass ran). */
  plannerMeta: {
    planner: string;
    llmPass: "full" | "partial" | "skipped";
    note?: string;
  };
}

// ---------- the brief ----------

export interface BriefSceneInput {
  id?: string;
  narration: string;
  visualIntent?: string;
  caption?: string;
}

/**
 * The validated brief: what the creator wrote. `briefHash` (computed by
 * the pipeline) covers every byte of this object — the plan's fingerprint
 * inherits it, so any brief edit invalidates the plan.
 */
export interface StudioBrief {
  topic: string;
  /** Classic: the full narration script. Story lanes: optional (AI writes scenes when absent). */
  script?: string;
  /** Story lanes: creator-authored scenes (empty = AI drafts them). */
  scenes?: BriefSceneInput[];
  tone?: string;
  /** Character lane: the cast identity anchor. */
  characterName?: string;
  characterDescription?: string;
}

export function briefContentHash(brief: StudioBrief): string {
  // Server-side callers use canonical.ts; this helper is intentionally
  // NOT the fingerprint primitive — pipelines compute the real hash with
  // sha256Hex(canonicalStringify(brief)). Client code never hashes.
  return JSON.stringify(brief);
}

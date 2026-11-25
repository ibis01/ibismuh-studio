// planners/index.ts — the planner input contract, shared deterministic
// helpers, and the planLane dispatch (master plan §4.2).
//
// Every lane planner compiles a validated StudioBrief into a PlannerOutput:
// stable scene ids (s1, s2, ...), declared estimate timing, honest fallback
// declarations, and a named LLM-pass result. THE LAW: a planner NEVER
// throws — the LLM pass is best-effort and every failure lands on the
// deterministic path; only UNKNOWN lanes fail closed (here, via the
// registry's resolveLane). estimateNarrationMs is THE shared timing
// estimator: ~380ms per word + 400ms punctuation pause, floor 1200ms.

import { LANE_REGISTRY, resolveLane, type VideoType } from "../studio-lanes";
import type { CameraPose, LaneScene, PlannerOutput, StudioBrief, TransitionId } from "../planner-types";
import { planClassic } from "./classic";
import { planStory } from "./story";
import { planWhiteboard } from "./whiteboard";
import { planGraphics } from "./graphics";
import { planCharacter } from "./character";
import { planSlides } from "./slides";

// ---------- re-exports (every lane planner is public through the barrel) ----------

export { planClassic } from "./classic";
export { planStory } from "./story";
export { planWhiteboard } from "./whiteboard";
export { planGraphics } from "./graphics";
export { planCharacter } from "./character";
export { planSlides } from "./slides";

// ---------- the shared planner input ----------

export interface PlannerInput {
  brief: StudioBrief;
  aspect: "16:9" | "9:16" | "1:1";
  fps: number;
  voice: string;
  tone?: string;
}

// ---------- dispatch ----------

/**
 * Route a lane to its planner. Unknown lanes fail closed through the
 * registry (resolveLane throws); known lanes are wrapped in a safety net
 * so a planner crash still emits a valid, declared PlannerOutput.
 */
export async function planLane(lane: VideoType, input: PlannerInput): Promise<PlannerOutput> {
  const contract = resolveLane(lane); // fail closed on unknown lanes
  switch (contract.type) {
    case "classic":
      return guarded(contract.type, input, planClassic);
    case "story":
      return guarded(contract.type, input, planStory);
    case "whiteboard":
      return guarded(contract.type, input, planWhiteboard);
    case "graphics2d":
      return guarded(contract.type, input, planGraphics);
    case "character":
      return guarded(contract.type, input, planCharacter);
    case "slides":
      return guarded(contract.type, input, planSlides);
  }
}

async function guarded(
  lane: VideoType,
  input: PlannerInput,
  plan: (input: PlannerInput) => Promise<PlannerOutput>,
): Promise<PlannerOutput> {
  try {
    return await plan(input);
  } catch {
    return minimalOutput(lane, input);
  }
}

/** Last-resort plan: one declared scene, honest provenance, no throw. */
function minimalOutput(lane: VideoType, input: PlannerInput): PlannerOutput {
  const narration = collapse(input.brief.script ?? input.brief.topic ?? "");
  const scene: LaneScene = {
    ...sceneShell(0, narration, `minimal declared scene for the ${lane} lane`),
  };
  return {
    lane,
    scenes: [scene],
    fallback: {
      mode: LANE_REGISTRY[lane].renderMode,
      reason: "planner hit an unexpected error — minimal single-scene plan (declared)",
    },
    plannerMeta: {
      planner: LANE_REGISTRY[lane].planner,
      llmPass: "skipped",
      note: "planner crashed — minimal declared fallback emitted instead of throwing",
    },
  };
}

// ---------- timing estimate (THE shared estimator) ----------

const MS_PER_WORD = 380;
const PAUSE_MS = 400;
const MIN_SCENE_MS = 1200;

export function estimateNarrationMs(text: string): number {
  const words = text.trim().split(/\s+/).filter((w) => w.length > 0).length;
  const pauses = (text.match(/[.!?;:]/g) ?? []).length;
  return Math.max(MIN_SCENE_MS, words * MS_PER_WORD + pauses * PAUSE_MS);
}

// ---------- scene shell (stable ids, declared estimate, transition cycle) ----------

const TRANSITION_CYCLE: readonly TransitionId[] = ["cut", "fade", "fadeblack", "dissolve"];

export function transitionFor(index: number): TransitionId {
  const n = TRANSITION_CYCLE.length;
  return TRANSITION_CYCLE[((index % n) + n) % n];
}

/**
 * The common scene fields every lane shares: stable id ("s" + 1-based
 * index), declared estimate, cycled transition, first-sentence caption.
 */
export function sceneShell(index: number, narration: string, visualIntent: string) {
  return {
    id: `s${index + 1}`,
    index,
    narration,
    visualIntent,
    caption: captionFor(narration),
    estimatedDurationMs: estimateNarrationMs(narration),
    transitionIn: transitionFor(index),
  };
}

/** Ken Burns poses alternate zoom-in / zoom-out with smooth easing. */
export function kenburnsPose(index: number): CameraPose {
  const zoomIn = index % 2 === 0;
  return {
    start: zoomIn ? { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } : { x: 0, y: 0, w: 1, h: 1 },
    end: zoomIn ? { x: 0, y: 0, w: 1, h: 1 } : { x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
    easing: "smooth",
  };
}

// ---------- deterministic text helpers ----------

export function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Sentence split without lookbehind (punctuation + optional closing quote). */
export function splitSentences(text: string): string[] {
  const normalized = collapse(text);
  if (normalized.length === 0) return [];
  const matches = normalized.match(/[^.!?]+[.!?]+(?:["”')\]]+)?|[^.!?]+$/g);
  return (matches ?? [normalized]).map((s) => s.trim()).filter((s) => s.length > 0);
}

export function firstSentence(text: string): string {
  return splitSentences(text)[0] ?? collapse(text);
}

/** Truncate to max chars (ellipsis included) on a word boundary. */
export function truncate(text: string, max: number): string {
  const t = collapse(text);
  if (t.length <= max) return t;
  const cut = t.slice(0, Math.max(1, max - 1));
  const space = cut.lastIndexOf(" ");
  const body = space > Math.floor(max / 2) ? cut.slice(0, space) : cut;
  return `${body.trimEnd()}…`;
}

/** The caption law: first sentence, trimmed to 80 chars. */
export function captionFor(text: string): string {
  return truncate(firstSentence(text), 80);
}

export function firstWords(text: string, n: number): string {
  return collapse(text).split(/\s+/).filter(Boolean).slice(0, n).join(" ");
}

export function wordCount(text: string): number {
  return collapse(text).split(/\s+/).filter(Boolean).length;
}

export function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** FNV-1a 32-bit — deterministic, dependency-free hash for rotations. */
export function stableHash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Evenly group items into at most `groups` buckets (joined by spaces). */
export function groupEven(items: string[], groups: number): string[] {
  if (items.length === 0 || groups <= 0) return [];
  const base = Math.floor(items.length / groups);
  let extra = items.length % groups;
  const out: string[] = [];
  let cursor = 0;
  for (let g = 0; g < groups; g++) {
    const take = Math.min(base + (extra > 0 ? 1 : 0), items.length - cursor);
    if (extra > 0) extra--;
    const joined = items.slice(cursor, cursor + take).join(" ").trim();
    cursor += take;
    if (joined.length > 0) out.push(joined);
    if (cursor >= items.length) break;
  }
  return out;
}

// ---------- LLM answer narrowing ----------

/** Non-empty trimmed string, else null. */
export function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/** Object rows of a possibly-malformed LLM array, capped at `max`. */
export function asRecordArray(v: unknown, max: number): Array<Record<string, unknown>> {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x))
    .slice(0, max);
}

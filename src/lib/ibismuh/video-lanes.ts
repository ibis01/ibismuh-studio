// video-lanes.ts — THE /VIDEOS SURFACE ADAPTER over the single-source lane
// contract data (master plan §4.1 P1 → Phase 1.1, post-f53b8c7).
//
// The six contract objects, the order, the closed vocabularies, and every
// registry-pure law live ONCE in lane-contracts.ts. This adapter derives
// from it and keeps only the /videos-specific truth:
//
//   1. catalog binding — validateLaneRegistry() checks the contracts
//      against types.ts's FORMATS/RENDER_MODES (the brief-level catalog
//      the /videos API validates against);
//   2. UI meta vocabulary — theme CLASSES (`accent`, text-primary …) plus
//      the preview art path; the /studio twin carries canvas hex instead.
//
// Before Phase 1 this file DECLARED the contracts itself and
// studio-lanes.ts duplicated them under the drift law
// (scripts/test-lane-registry-drift.mts). The copy is gone: the battery
// now asserts both adapters DERIVE from lane-contracts.ts (identity) and
// keeps the semantic-equality net for the surface-specific metadata.
// Every export name below is unchanged — the 12 /videos consumers keep
// their imports untouched.

import { FORMATS, RENDER_MODES } from "./types";
import {
  ENGINE_LANE_RENDER_MODES,
  HEAVY_JOB_KINDS,
  LANE_CAPABILITY_IDS,
  LANE_CONTRACTS,
  LANE_ORDER,
  LANE_REPAIR_OPERATIONS,
  LANE_UI_META_BASE,
  type LaneModeDecl,
  type LaneRegistryIssue,
  type LaneRowResolution,
  type VideoLaneContract,
  type VideoType,
  isHeavyJobKind,
  isLaneCapability,
  isLaneRepairOperation,
  isVideoType,
  laneByRenderMode,
  resolveLane,
  resolveLaneFromRow,
  resolveLaneOrNull,
  resolveRenderAspect,
  validateLaneContractsAgainst,
} from "./lane-contracts";

// ---------- the contract shape (re-exported from the single source) ----------

export type { VideoType, VideoLaneContract, LaneModeDecl, LaneRegistryIssue, LaneRowResolution };
export {
  ENGINE_LANE_RENDER_MODES,
  HEAVY_JOB_KINDS,
  LANE_CAPABILITY_IDS,
  LANE_ORDER,
  LANE_REPAIR_OPERATIONS,
  isHeavyJobKind,
  isLaneCapability,
  isLaneRepairOperation,
  isVideoType,
  laneByRenderMode,
  resolveLane,
  resolveLaneFromRow,
  resolveLaneOrNull,
  resolveRenderAspect,
};

// ---------- the registry (DERIVED — never copied) ----------

/** The /videos registry view. Same object identity as the /studio twin's —
 *  the single LANE_CONTRACTS source in lane-contracts.ts. */
export const LANE_REGISTRY: Record<VideoType, VideoLaneContract> = LANE_CONTRACTS;

// ---------- UI metadata (the /videos presentation vocabulary) ----------

export interface LaneUiMeta {
  title: string;
  desc: string;
  /** lucide icon name (resolved client-side — icons are components). */
  icon: string;
  accent: string;
  preview: string;
}

/** Per-lane theme accent classes — the /videos-specific half of the UI
 *  meta (the shared title/desc/icon trio comes from LANE_UI_META_BASE). */
const ACCENT_CLASSES: Record<VideoType, string> = {
  classic: "text-primary",
  story: "text-amber-300",
  whiteboard: "text-sky-300",
  graphics2d: "text-emerald-300",
  character: "text-fuchsia-300",
  slides: "text-violet-300",
};

/** Per-lane preview art — also /videos-specific (the pipeline surface has
 *  no preview imagery). */
const PREVIEW_ART: Record<VideoType, string> = {
  classic: "/formats/classic.jpg",
  story: "/formats/story.jpg",
  whiteboard: "/formats/whiteboard.jpg",
  graphics2d: "/formats/graphics2d.jpg",
  character: "/formats/character.jpg",
  slides: "/formats/slides.jpg",
};

export const LANE_UI_META: Record<VideoType, LaneUiMeta> = {
  classic: { ...LANE_UI_META_BASE.classic, accent: ACCENT_CLASSES.classic, preview: PREVIEW_ART.classic },
  story: { ...LANE_UI_META_BASE.story, accent: ACCENT_CLASSES.story, preview: PREVIEW_ART.story },
  whiteboard: { ...LANE_UI_META_BASE.whiteboard, accent: ACCENT_CLASSES.whiteboard, preview: PREVIEW_ART.whiteboard },
  graphics2d: { ...LANE_UI_META_BASE.graphics2d, accent: ACCENT_CLASSES.graphics2d, preview: PREVIEW_ART.graphics2d },
  character: { ...LANE_UI_META_BASE.character, accent: ACCENT_CLASSES.character, preview: PREVIEW_ART.character },
  slides: { ...LANE_UI_META_BASE.slides, accent: ACCENT_CLASSES.slides, preview: PREVIEW_ART.slides },
};

// ---------- laws ----------

/** Validate the registry against the brief-level catalogs (types.ts):
 *  every preset's renderMode must seat in RENDER_MODES, its format in
 *  FORMATS, its aspects in RENDER_ASPECTS, and every field must carry
 *  meaningful content. Returns [] when the registry is coherent. */
export function validateLaneRegistry(): LaneRegistryIssue[] {
  return validateLaneContractsAgainst(FORMATS.map((f) => f.id), RENDER_MODES.map((m) => m.id));
}

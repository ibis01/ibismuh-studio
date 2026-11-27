// studio-lanes.ts — THE /STUDIO PIPELINE ADAPTER over the single-source
// lane contract data (master plan §4.1 P1 → Phase 1.1, post-f53b8c7).
//
// The six contract objects, the order, the closed vocabularies, and every
// registry-pure law live ONCE in lane-contracts.ts. This adapter derives
// from it and keeps only the /studio-specific truth:
//
//   1. catalog binding — validateLaneRegistry() checks the contracts
//      against studio-catalogs' FORMATS/RENDER_MODES (the pipeline's own
//      brief-level catalogs);
//   2. UI meta vocabulary — canvas HEX (`accentHex`, consumed by the
//      canvas renderers and badges — real colors, not Tailwind classes);
//      the /videos twin carries theme classes + preview art instead.
//
// Before Phase 1 this file was a full fork of video-lanes.ts guarded by
// the drift law (scripts/test-lane-registry-drift.mts). The copy is gone:
// the battery now asserts both adapters DERIVE from lane-contracts.ts
// (identity) and keeps the semantic-equality net for the surface-specific
// metadata. Every export name below is unchanged — the 23 /studio
// consumers keep their imports untouched.

import { FORMATS, RENDER_MODES } from "./studio-catalogs";
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

/** The /studio registry view. Same object identity as the /videos twin's —
 *  the single LANE_CONTRACTS source in lane-contracts.ts. */
export const LANE_REGISTRY: Record<VideoType, VideoLaneContract> = LANE_CONTRACTS;

// ---------- UI metadata (the /studio presentation vocabulary) ----------

export interface LaneUiMeta {
  title: string;
  desc: string;
  /** lucide icon name (resolved client-side — icons are components). */
  icon: string;
  /** Hex accent for canvas renderers and badges (never a local literal). */
  accentHex: string;
}

/** Per-lane canvas hex accents — the /studio-specific half of the UI meta
 *  (the shared title/desc/icon trio comes from LANE_UI_META_BASE). */
const ACCENT_HEXES: Record<VideoType, string> = {
  classic: "#e8b64c",
  story: "#d98f3e",
  whiteboard: "#4ec9b0",
  graphics2d: "#5fbf77",
  character: "#c77dba",
  slides: "#a58fd8",
};

export const LANE_UI_META: Record<VideoType, LaneUiMeta> = {
  classic: { ...LANE_UI_META_BASE.classic, accentHex: ACCENT_HEXES.classic },
  story: { ...LANE_UI_META_BASE.story, accentHex: ACCENT_HEXES.story },
  whiteboard: { ...LANE_UI_META_BASE.whiteboard, accentHex: ACCENT_HEXES.whiteboard },
  graphics2d: { ...LANE_UI_META_BASE.graphics2d, accentHex: ACCENT_HEXES.graphics2d },
  character: { ...LANE_UI_META_BASE.character, accentHex: ACCENT_HEXES.character },
  slides: { ...LANE_UI_META_BASE.slides, accentHex: ACCENT_HEXES.slides },
};

// ---------- laws ----------

/** Validate the registry against the brief-level catalogs (studio-catalogs):
 *  every preset's renderMode must seat in RENDER_MODES, its format in
 *  FORMATS, its aspects in the closed aspect set, and every field must
 *  carry meaningful content. Returns [] when the registry is coherent. */
export function validateLaneRegistry(): LaneRegistryIssue[] {
  return validateLaneContractsAgainst(FORMATS.map((f) => f.id), RENDER_MODES.map((m) => m.id));
}

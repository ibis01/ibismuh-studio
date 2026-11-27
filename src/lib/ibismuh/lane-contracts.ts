// lane-contracts.ts — THE SINGLE-SOURCE LANE CONTRACT DATA (master plan
// Phase 1.1, post-f53b8c7).
//
// The six lane contracts used to live TWICE, deliberately: video-lanes.ts
// (the /videos surface — imports ./types) and studio-lanes.ts (the /studio
// pipeline — imports ./studio-catalogs), with the drift law
// (scripts/test-lane-registry-drift.mts) keeping the twins in lockstep.
// Phase 1 retires the copy: the contract OBJECTS, the order, the closed
// vocabularies, and every registry-pure law live HERE, ONCE. The two
// surface adapters derive from this module and keep only what genuinely
// differs per surface:
//
//   video-lanes.ts   — /videos: validates against types.ts catalogs; UI
//                      meta carries theme CLASSES (`accent`) + preview art.
//   studio-lanes.ts  — /studio: validates against studio-catalogs; UI meta
//                      carries canvas HEX (`accentHex`) — canvas renderers
//                      and badges need real colors, not Tailwind classes.
//
// The adapters still re-export every name, so the 35 consumers keep their
// imports untouched. The drift battery remains as the compatibility pin:
// it now asserts BOTH adapters derive from this module (identity, not
// copy) and keeps the semantic-equality net for the surface-specific
// metadata.
//
// Phase 1.3 (registry versioning) also lives here: LANE_CONTRACT_VERSION +
// a canonical fingerprint over the whole contract surface. Plan envelopes
// stamp the fingerprint they were compiled under (plan-envelope.ts) and
// refuse to parse a plan whose stamp disagrees with the live registry —
// an incompatible plan is refused with a named recompile error, never
// silently rendered.

import { canonicalStringify, sha256Hex } from "./canonical";

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
  /** The scene/slide/beat-level preview renderer stage. */
  previewRenderer: string;
  /** The DECLARED fallback chain — every degradation this lane may take,
   *  named. A fallback that is not listed here must not exist silently. */
  fallbackPolicy: string;
  /** The closed capability ids this lane requires to run full-fidelity
   *  (LANE_CAPABILITY_IDS vocabulary). The UI's honesty badges read this. */
  capabilities: readonly string[];
  /** The DECLARED lane modes — every way this lane can truthfully run.
   *  Absent = the lane runs exactly one way. Character declares its
   *  rig/fallback split here; the UI and the manifest must surface it. */
  modes?: readonly LaneModeDecl[];
  /** The repair operations the lane supports (closed vocabulary). */
  repairOperations: readonly string[];
  /** The queue job kind this lane's render enqueues. */
  queueJobKind: string;
  /** Stable analytics identity — dashboards read this, never the renderMode. */
  analyticsId: string;
  /** The QC calibration family the lane's renders are judged by. */
  qcProfile: string;
  supportedAspects: readonly string[];
  /** The frame rates this lane's renderer actually produces. */
  supportedFps: readonly number[];
}

/** One declared way a lane can truthfully run (workstream G — capability truth). */
export interface LaneModeDecl {
  id: string;
  /** The honest UI-facing label (e.g. "Rig attached", "Storyboard fallback"). */
  label: string;
  /** The declared condition under which this mode applies. */
  when: string;
}

export interface LaneRegistryIssue {
  lane: VideoType;
  message: string;
}

// ---------- UI metadata base (the surface-shared half) ----------

/** The title/desc/icon trio both surfaces agree on, verbatim, once. The
 *  accent vocabulary is genuinely surface-specific (classes vs canvas hex)
 *  and stays in the adapters. */
export const LANE_UI_META_BASE: Record<VideoType, { title: string; desc: string; icon: string }> = {
  classic: {
    title: "Classic narration",
    desc: "AI writes a flowing narration + metadata — classic render with a thumbnail package.",
    icon: "FileText",
  },
  story: {
    title: "Scene story",
    desc: "Scene-by-scene script and storyboard art — Smart Motion pans & zooms per scene.",
    icon: "Clapperboard",
  },
  whiteboard: {
    title: "Whiteboard explainer",
    desc: "A hand draws every scene in real time — narrated whiteboard animation.",
    icon: "PenTool",
  },
  graphics2d: {
    title: "Motion graphics (2D)",
    desc: "A native 2D engine animates headlines, counters, bar charts and icons from a declarative doc — kinetic and $0, no image generation.",
    icon: "BarChart3",
  },
  character: {
    title: "Character animation",
    desc: "Your Cast character performs the story — attach a rigged character and the native rig channel draws it pose-by-pose into every scene; without one, storyboard art carries the scene.",
    icon: "PersonStanding",
  },
  slides: {
    title: "Keynote slides",
    desc: "A kinetic-typography slide deck, one designed slide per beat — no image generation.",
    icon: "Presentation",
  },
};

// ---------- the capability + repair vocabularies (closed) ----------

/** Closed capability vocabulary — every id a lane's `capabilities` may use. */
export const LANE_CAPABILITY_IDS = [
  "image-provider",
  "voice-provider",
  "measured-audio",
  "word-anchors",
  "native-rig",
  "chromium-engine",
  "ffmpeg-compositor",
  "image-free-render",
] as const;

/** Closed repair-operation vocabulary — every id a lane's `repairOperations` may use. */
export const LANE_REPAIR_OPERATIONS = [
  "beat-visual",
  "beat-camera",
  "beat-caption",
  "beat-timing",
  "music",
  "scene-art",
  "scene-narration",
  "scene-timing",
  "scene-transition",
  "scene-plan",
  "scene-assets",
  "component-doc",
  "rig-assignment",
  "slide-content",
  "slide-template",
  "reveal-timing",
] as const;

export function isLaneCapability(id: string): boolean {
  return (LANE_CAPABILITY_IDS as readonly string[]).includes(id);
}

export function isLaneRepairOperation(id: string): boolean {
  return (LANE_REPAIR_OPERATIONS as readonly string[]).includes(id);
}

// ---------- THE registry (the only copy of the six contracts) ----------

export const LANE_ORDER: readonly VideoType[] = [
  "classic",
  "story",
  "whiteboard",
  "graphics2d",
  "character",
  "slides",
];

export const LANE_CONTRACTS: Record<VideoType, VideoLaneContract> = {
  classic: {
    type: "classic",
    format: "script",
    renderMode: "kenburns",
    planVersion: 1,
    inputSchema: "brief-script-v1",
    planner: "script-job",
    renderer: "story-compositor",
    previewRenderer: "story-compositor scene preview",
    fallbackPolicy:
      "no provider art → gradient boards; no voice provider → silent render declared in QC; i2v never applies",
    capabilities: ["image-provider", "voice-provider", "measured-audio", "ffmpeg-compositor"],
    repairOperations: ["beat-visual", "beat-camera", "beat-caption", "beat-timing", "music"],
    queueJobKind: "render",
    analyticsId: "lane.classic",
    qcProfile: "story-compositor-v1",
    supportedAspects: ["16:9", "9:16", "1:1"],
    supportedFps: [30],
  },
  story: {
    type: "story",
    format: "story",
    renderMode: "kenburns",
    planVersion: 1,
    inputSchema: "brief-story-v1",
    planner: "storyboard-job",
    renderer: "story-compositor",
    previewRenderer: "story-compositor scene preview",
    fallbackPolicy:
      "no footage match → Smart Motion art; i2v unavailable → Ken Burns (declared per scene); board flips sweep artifacts",
    capabilities: ["image-provider", "voice-provider", "measured-audio", "ffmpeg-compositor"],
    repairOperations: ["scene-art", "scene-narration", "scene-timing", "scene-transition"],
    queueJobKind: "render",
    analyticsId: "lane.story",
    qcProfile: "story-compositor-v1",
    supportedAspects: ["16:9", "9:16", "1:1"],
    supportedFps: [30],
  },
  whiteboard: {
    type: "whiteboard",
    format: "story",
    renderMode: "whiteboard",
    planVersion: 1,
    inputSchema: "brief-story-v1",
    planner: "whiteboard-engine (beat plan + voice anchors)",
    renderer: "whiteboard-engine",
    previewRenderer: "whiteboard single-scene preview (720p/24fps, no music bed)",
    fallbackPolicy:
      "no ASR word anchors → silencedetect runs → word-proportional estimate (declared in the anchors' timingSource)",
    capabilities: ["voice-provider", "measured-audio", "word-anchors", "chromium-engine", "image-free-render"],
    repairOperations: ["scene-plan", "scene-assets", "scene-timing"],
    queueJobKind: "whiteboard",
    analyticsId: "lane.whiteboard",
    qcProfile: "whiteboard-engine-v1",
    supportedAspects: ["16:9", "9:16", "1:1"],
    supportedFps: [24, 30],
  },
  graphics2d: {
    type: "graphics2d",
    format: "story",
    renderMode: "graphics",
    planVersion: 1,
    inputSchema: "brief-story-v1",
    planner: "graphics-engine (declarative doc)",
    renderer: "graphics-engine",
    previewRenderer: "graphics-engine doc preview",
    fallbackPolicy:
      "doc rejected → named parser error (never silent); resume fingerprint mismatch → fail-closed re-render",
    capabilities: ["voice-provider", "measured-audio", "chromium-engine", "image-free-render"],
    repairOperations: ["component-doc"],
    queueJobKind: "graphics",
    analyticsId: "lane.graphics2d",
    qcProfile: "graphics-engine-v1",
    supportedAspects: ["16:9", "9:16", "1:1"],
    supportedFps: [30],
  },
  character: {
    type: "character",
    format: "story",
    // The character preset shares the story compositor path (the rig
    // channel rides INSIDE the kenburns lane) — the REGISTRY makes that
    // sharing explicit instead of two duplicated literals, and the rig-aware
    // channel is declared as this lane's planner/renderer truth.
    renderMode: "kenburns",
    planVersion: 1,
    inputSchema: "brief-story-v1",
    planner: "storyboard-job + native-rig channel",
    renderer: "story-compositor + native-rig channel",
    previewRenderer: "story-compositor scene preview + native-rig channel",
    fallbackPolicy:
      "corrupt rig columns → native rig skipped (logged, never silent); rig unavailable per scene → Ken Burns fallback (declared per scene)",
    capabilities: ["image-provider", "voice-provider", "measured-audio", "native-rig", "ffmpeg-compositor"],
    modes: [
      {
        id: "native-rig",
        label: "Rig attached",
        when: "the scene has a valid rig — the native rig channel performs it pose-by-pose",
      },
      {
        id: "storyboard-fallback",
        label: "Storyboard fallback",
        when: "no valid rig for the scene — storyboard art carries it, declared per scene, never silent",
      },
    ],
    repairOperations: ["scene-art", "scene-narration", "scene-timing", "rig-assignment"],
    queueJobKind: "render",
    analyticsId: "lane.character",
    qcProfile: "story-compositor-v1",
    supportedAspects: ["16:9", "9:16", "1:1"],
    supportedFps: [30],
  },
  slides: {
    type: "slides",
    format: "story",
    renderMode: "slides",
    planVersion: 1,
    inputSchema: "brief-story-v1",
    planner: "slides-deck (LLM plan) + kinetic pass",
    renderer: "slides-deck (+ kinetic clips)",
    previewRenderer: "slides-deck slide preview",
    fallbackPolicy:
      "kinetic clip failed/over wall → still deck with camera moves (declared per scene); deck geometry pinned 9:16",
    capabilities: ["voice-provider", "measured-audio", "chromium-engine", "image-free-render"],
    repairOperations: ["slide-content", "slide-template", "reveal-timing"],
    queueJobKind: "render",
    analyticsId: "lane.slides",
    qcProfile: "story-compositor-v1",
    supportedAspects: ["9:16"],
    supportedFps: [30],
  },
};

// ---------- the catalog-parameterized validator ----------

/** Validate the contracts against a surface's brief-level catalogs: every
 *  preset's renderMode must seat in the surface's RENDER_MODES, its format
 *  in FORMATS, its aspects in the closed aspect set, and every field must
 *  carry meaningful content. Returns [] when the registry is coherent. */
export function validateLaneContractsAgainst(formatIds: readonly string[], modeIds: readonly string[]): LaneRegistryIssue[] {
  const issues: LaneRegistryIssue[] = [];
  const aspectIds = ["16:9", "9:16", "1:1"];
  const seen = new Set<string>();
  for (const id of LANE_ORDER) {
    const c = LANE_CONTRACTS[id];
    if (seen.has(c.renderMode) && c.renderMode !== "kenburns") {
      // kenburns is deliberately shared (classic/story/character) — every
      // other renderMode belongs to exactly one preset.
      issues.push({ lane: id, message: `renderMode "${c.renderMode}" is pinned by more than one preset` });
    }
    seen.add(c.renderMode);
    if (!formatIds.includes(c.format)) {
      issues.push({ lane: id, message: `format "${c.format}" is not a FORMATS id` });
    }
    if (!modeIds.includes(c.renderMode)) {
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
      previewRenderer: c.previewRenderer,
      fallbackPolicy: c.fallbackPolicy,
      qcProfile: c.qcProfile,
      analyticsId: c.analyticsId,
    })) {
      if (typeof value !== "string" || value.trim().length === 0) {
        issues.push({ lane: id, message: `${field} must be a non-empty declaration` });
      }
    }
    if (!Number.isInteger(c.planVersion) || c.planVersion < 1) {
      issues.push({ lane: id, message: "planVersion must be a positive integer" });
    }
    if (!isHeavyJobKind(c.queueJobKind)) {
      issues.push({ lane: id, message: `queueJobKind "${c.queueJobKind}" is not a known job kind` });
    }
    for (const cap of c.capabilities) {
      if (!isLaneCapability(cap)) {
        issues.push({ lane: id, message: `capability "${cap}" is not in the closed vocabulary` });
      }
    }
    for (const op of c.repairOperations) {
      if (!isLaneRepairOperation(op)) {
        issues.push({ lane: id, message: `repair operation "${op}" is not in the closed vocabulary` });
      }
    }
    if (c.repairOperations.length === 0) {
      issues.push({ lane: id, message: "repairOperations must declare at least one operation" });
    }
    if (c.supportedFps.length === 0 || c.supportedFps.some((fps) => !Number.isInteger(fps) || fps <= 0)) {
      issues.push({ lane: id, message: "supportedFps must be a non-empty list of positive integers" });
    }
    for (const mode of c.modes ?? []) {
      for (const [field, value] of Object.entries({ id: mode.id, label: mode.label, when: mode.when })) {
        if (typeof value !== "string" || value.trim().length === 0) {
          issues.push({ lane: id, message: `lane mode ${field} must be a non-empty declaration` });
        }
      }
    }
  }
  return issues;
}

// ---------- cross-module consumers (registry-pure — no catalog dependency) ----------

/** The engine-lane vocabulary, restated from the registry's renderer stage
 *  ids so the engine-lane resolvers and this table can never drift. */
export const ENGINE_LANE_RENDER_MODES: readonly string[] = ["whiteboard", "graphics"];

/**
 * The heavy-job kinds, declared HERE (P1): the queue's per-org concurrency
 * cap reads this list instead of an inline literal. Every engine lane
 * (chromium + ffmpeg is the same CPU/RAM class — design §3.2) and every
 * compositor render is heavy; graphics joins whiteboard instead of
 * silently bypassing the cap.
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
    if (LANE_CONTRACTS[id].renderMode === renderMode) return LANE_CONTRACTS[id];
  }
  return null;
}

// ---------- typed lookup (master plan §4.1 — no lane string invented locally) ----------

/** Type guard: is this string a closed lane id? */
export function isVideoType(value: string): value is VideoType {
  return (LANE_ORDER as readonly string[]).includes(value);
}

/** Registry entry for a lane id, or null when unknown. */
export function resolveLaneOrNull(value: string): VideoLaneContract | null {
  return isVideoType(value) ? LANE_CONTRACTS[value] : null;
}

/** Registry entry for a lane id — FAILS CLOSED on unknown values with a
 *  useful error listing the valid ids. No route, component, queue handler,
 *  or analytics query should invent a lane string locally. */
export function resolveLane(value: string): VideoLaneContract {
  if (isVideoType(value)) return LANE_CONTRACTS[value];
  throw new Error(`unknown lane "${value}" — valid lanes: ${LANE_ORDER.join(", ")}`);
}

// ---------- persistence adapter (master plan §7 — additive compatibility) ----------

export type LaneRowResolution =
  | { status: "resolved"; lane: VideoLaneContract }
  | { status: "ambiguous"; candidates: VideoType[]; message: string }
  | { status: "unknown"; message: string };

/**
 * Resolve a persisted (format, renderMode) row to its lane — the additive
 * compatibility seam while persistence still carries format + renderMode
 * instead of a canonical lane column (master plan §7: backfill only after a
 * migration design review).
 *
 * THE LAW: an unambiguous pair resolves; the story/kenburns pair is
 * AMBIGUOUS (story and character deliberately share it — the rig channel
 * rides inside the compositor lane) and reports its candidates instead of
 * silently picking Ken Burns; an unknown pair fails closed. Nothing here
 * ever defaults.
 */
export function resolveLaneFromRow(format: string, renderMode: string): LaneRowResolution {
  const candidates = LANE_ORDER.filter(
    (id) => LANE_CONTRACTS[id].format === format && LANE_CONTRACTS[id].renderMode === renderMode,
  );
  if (candidates.length === 1) return { status: "resolved", lane: LANE_CONTRACTS[candidates[0]] };
  if (candidates.length > 1) {
    return {
      status: "ambiguous",
      candidates,
      message: `format "${format}" + renderMode "${renderMode}" matches ${candidates.join(", ")} — a canonical lane column is required to disambiguate; no silent Ken Burns default`,
    };
  }
  return {
    status: "unknown",
    message: `no lane pins format "${format}" + renderMode "${renderMode}" — unknown rows fail closed`,
  };
}

// ---------- Phase 1.3: the contract version + capability fingerprint ----------

/**
 * The lane-contract surface version. Bump WHEN a contract edit changes
 * compiled-plan semantics (renderMode, planner/renderer stage ids, qc
 * profile, aspect/fps truths, capability or repair vocabulary). Cosmetic
 * UI-meta changes do NOT bump this — they don't live here.
 */
export const LANE_CONTRACT_VERSION = 1;

/** The stamp a compiled plan carries: which contract surface produced it. */
export interface LaneContractStamp {
  version: number;
  /** sha256 over the canonical {version, order, contracts} document. */
  fingerprint: string;
}

/** sha256 over the canonical serialization of the whole contract surface —
 *  ANY contract edit (including vocabulary and order changes) moves it. */
export function computeLaneContractFingerprint(): string {
  return sha256Hex(
    canonicalStringify({
      version: LANE_CONTRACT_VERSION,
      order: LANE_ORDER,
      contracts: LANE_CONTRACTS,
    }),
  );
}

/** The stamp the CURRENT registry would put on a freshly compiled plan. */
export function currentLaneContractStamp(): LaneContractStamp {
  return { version: LANE_CONTRACT_VERSION, fingerprint: computeLaneContractFingerprint() };
}

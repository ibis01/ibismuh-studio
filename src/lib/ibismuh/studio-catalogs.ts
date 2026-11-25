// types.ts — THE BRIEF-LEVEL CATALOGS (formats, render modes, aspects, voices).
//
// These are the catalogs the API validates briefs against; the lane
// registry (video-lanes.ts) declares the six create presets as contracts
// over them. Kept deliberately small: the sandbox studio speaks exactly
// these ids — nothing else is accepted.

export interface FormatCatalogEntry {
  id: "script" | "story";
  label: string;
  desc: string;
}

export const FORMATS: readonly FormatCatalogEntry[] = [
  {
    id: "script",
    label: "Narration script",
    desc: "One flowing narration — the lane splits it into beats.",
  },
  {
    id: "story",
    label: "Scene story",
    desc: "Scene-by-scene structure with per-scene narration and visuals.",
  },
];

export interface RenderModeCatalogEntry {
  id: string;
  label: string;
  desc: string;
}

export const RENDER_MODES: readonly RenderModeCatalogEntry[] = [
  {
    id: "kenburns",
    label: "Smart Motion (Ken Burns)",
    desc: "Generated art with camera pans and zooms per scene.",
  },
  {
    id: "whiteboard",
    label: "Whiteboard engine",
    desc: "A hand draws every scene — deterministic stroke planning.",
  },
  {
    id: "graphics",
    label: "Motion graphics engine",
    desc: "Declarative 2D components — headlines, counters, charts.",
  },
  {
    id: "slides",
    label: "Keynote slides",
    desc: "A kinetic-typography slide deck, one designed slide per beat.",
  },
];

export type AspectId = "16:9" | "9:16" | "1:1";

export const RENDER_ASPECTS: readonly AspectId[] = ["16:9", "9:16", "1:1"];

export interface AspectGeometry {
  width: number;
  height: number;
}

/** The render geometry law: canonical pixel sizes per aspect (30fps lanes). */
export const ASPECT_GEOMETRY: Record<AspectId, AspectGeometry> = {
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 720, height: 1280 },
  "1:1": { width: 1080, height: 1080 },
};

export const VOICES = [
  { id: "tongtong", label: "Tongtong", desc: "Warm, friendly narrator" },
  { id: "xiaochen", label: "Xiaochen", desc: "Steady, professional narrator" },
  { id: "jam", label: "Jam", desc: "British storyteller" },
  { id: "kazi", label: "Kazi", desc: "Clear, standard explainer" },
  { id: "chuichui", label: "Chuichui", desc: "Lively, upbeat tone" },
] as const;

export type VoiceId = (typeof VOICES)[number]["id"];

export function isVoiceId(v: string): v is VoiceId {
  return VOICES.some((voice) => voice.id === v);
}

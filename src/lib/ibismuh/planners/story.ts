// story.ts — the story-lane planner (scene story + bible + continuity).
//
// Creator-authored scenes win as-is; otherwise the LLM drafts 4-6 scenes
// with a light story bible; otherwise a deterministic sentence split. The
// bible palette is chosen deterministically from the topic hash over a
// fixed warm table, and adjacent scenes get an honest, light continuity
// pass (location keyword overlap + wardrobe anchoring).

import type { ContinuityIssue, LaneScene, PlannerOutput, StoryBible } from "../planner-types";
import { LANE_REGISTRY } from "../studio-lanes";
import { chatJson } from "../providers/llm";
import {
  asRecordArray,
  asString,
  collapse,
  firstWords,
  groupEven,
  kenburnsPose,
  sceneShell,
  splitSentences,
  stableHash,
  type PlannerInput,
} from "./index";

const LANE = LANE_REGISTRY.story;
const MIN_LLM_SCENES = 4;
const MAX_LLM_SCENES = 6;

const WARM_PALETTE: readonly string[] = [
  "#c77b4a",
  "#e8b64c",
  "#8a5a33",
  "#f2e3c6",
  "#d98f3e",
  "#b5651d",
  "#7a9e7e",
  "#5b4a3f",
  "#e6c79c",
  "#a34a2a",
];

interface SceneDraft {
  narration: string;
  visualIntent: string;
}

interface LlmBible {
  characters: Array<{ name: string; description: string; wardrobe: string }>;
  locations: Array<{ name: string; description: string }>;
}

export async function planStory(input: PlannerInput): Promise<PlannerOutput> {
  const brief = input.brief;
  let llmPass: "full" | "skipped" = "skipped";
  let note = "deterministic scene split (declared)";
  let drafts: SceneDraft[] | null = null;
  let llmBible: LlmBible | null = null;

  const creatorScenes = (brief.scenes ?? []).filter((s) => collapse(s.narration).length > 0);
  if (creatorScenes.length > 0) {
    drafts = creatorScenes.map((s) => ({
      narration: collapse(s.narration),
      visualIntent: collapse(s.visualIntent ?? ""),
    }));
    note = `creator-authored scenes used as-is (${drafts.length} scenes); llm pass not required`;
  } else {
    const script = collapse(brief.script ?? brief.topic ?? "");
    if (script.length > 0) {
      const system = [
        `You are the story-lane planner for Ibismuh Studio.`,
        `Draft ${MIN_LLM_SCENES}-${MAX_LLM_SCENES} scenes.`,
        `Reply with ONLY JSON (no prose, no fences):`,
        `{"scenes":[{"narration":"...","visualIntent":"...","location":"..."}],"characters":[{"name":"...","description":"...","wardrobe":"..."}],"locations":[{"name":"...","description":"..."}]}`,
        `visualIntent is an image prompt (subject, setting, mood, lighting); location names the setting for continuity.`,
      ].join(" ");
      const user = [
        brief.topic ? `Topic: ${brief.topic}` : "",
        input.tone ? `Tone: ${input.tone}` : "",
        brief.characterName ? `Lead character: ${brief.characterName}` : "",
        brief.characterDescription ? `Character description: ${brief.characterDescription}` : "",
        `Script: ${script}`,
      ]
        .filter(Boolean)
        .join("\n");
      const raw = await chatJson<unknown>(system, user);
      const validated = validateLlmStory(raw);
      if (validated !== null) {
        drafts = validated.scenes;
        llmBible = validated.bible;
        llmPass = "full";
        note = `llm scene plan accepted (${drafts.length} scenes)`;
      }
    }
    if (drafts === null) {
      drafts = deterministicScenes(script);
    }
  }

  const scenes: LaneScene[] = drafts.map((d, i) => ({
    ...sceneShell(i, d.narration, d.visualIntent || `editorial illustration: ${firstWords(d.narration, 12)}`),
    camera: kenburnsPose(i),
  }));

  return {
    lane: "story",
    scenes,
    storyBible: buildBible(input, llmBible),
    continuity: buildContinuity(scenes, brief.characterName),
    fallback: {
      mode: "kenburns",
      reason: "no footage or rig guarantee at plan time — Smart Motion kenburns is the lane's declared default",
    },
    plannerMeta: { planner: LANE.planner, llmPass, note },
  };
}

function validateLlmStory(raw: unknown): { scenes: SceneDraft[]; bible: LlmBible } | null {
  if (typeof raw !== "object" || raw === null) return null;
  const doc = raw as Record<string, unknown>;
  const rows = asRecordArray(doc.scenes, MAX_LLM_SCENES);
  if (rows.length < MIN_LLM_SCENES) return null;
  const scenes: SceneDraft[] = [];
  for (const row of rows) {
    const narration = asString(row.narration);
    if (narration === null) return null;
    scenes.push({
      narration: collapse(narration),
      visualIntent: collapse(asString(row.visualIntent) ?? ""),
    });
  }
  const characters = asRecordArray(doc.characters, 4)
    .map((c) => ({ name: asString(c.name), description: asString(c.description) ?? "", wardrobe: asString(c.wardrobe) ?? "" }))
    .filter((c): c is { name: string; description: string; wardrobe: string } => c.name !== null)
    .map((c) => ({ name: c.name, description: c.description, wardrobe: c.wardrobe }));
  const locations = asRecordArray(doc.locations, 6)
    .map((l) => ({ name: asString(l.name), description: asString(l.description) ?? "" }))
    .filter((l): l is { name: string; description: string } => l.name !== null)
    .map((l) => ({ name: l.name, description: l.description }));
  return { scenes, bible: { characters, locations } };
}

function buildBible(input: PlannerInput, llmBible: LlmBible | null): StoryBible {
  const brief = input.brief;
  const characters: StoryBible["characters"] = [];
  if (brief.characterName) {
    characters.push({
      id: "c1",
      name: brief.characterName,
      description: collapse(brief.characterDescription ?? "") || "story host",
      wardrobe: "signature outfit, consistent across scenes",
    });
  }
  for (const c of llmBible?.characters ?? []) {
    if (characters.some((k) => k.name.toLowerCase() === c.name.toLowerCase())) continue;
    characters.push({
      id: `c${characters.length + 1}`,
      name: c.name,
      description: c.description || "supporting character",
      wardrobe: c.wardrobe || "unspecified (verify consistency)",
    });
  }
  const locations = (llmBible?.locations ?? []).map((l, i) => ({
    id: `l${i + 1}`,
    name: l.name,
    description: l.description,
  }));
  const start = stableHash(brief.topic || "ibismuh") % WARM_PALETTE.length;
  const palette: string[] = [];
  for (let i = 0; i < 5; i++) palette.push(WARM_PALETTE[(start + i) % WARM_PALETTE.length]);
  return { characters, locations, palette, style: "cinematic editorial" };
}

// ---------- continuity (light, honest, adjacent-scene comparison) ----------

const STOPWORDS = new Set([
  "the", "and", "with", "from", "that", "this", "into", "over", "under", "then",
  "when", "while", "their", "they", "have", "will", "your", "scene", "setting",
  "editorial", "illustration", "lighting", "mood", "shows", "frame",
]);

function keywords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  return new Set(words);
}

function buildContinuity(scenes: LaneScene[], characterName?: string): ContinuityIssue[] {
  const issues: ContinuityIssue[] = [];
  for (let i = 0; i < scenes.length - 1; i++) {
    const a = keywords(scenes[i].visualIntent);
    const b = keywords(scenes[i + 1].visualIntent);
    const shared = [...a].filter((w) => b.has(w));
    if (shared.length === 0) {
      issues.push({
        sceneRef: scenes[i + 1].id,
        kind: "location",
        severity: "info",
        message: `scene ${scenes[i].id} → ${scenes[i + 1].id} setting change; verify continuity`,
      });
    }
  }
  if (characterName && scenes.length > 0) {
    const wardrobeMentioned = scenes.some((s) =>
      /wear|outfit|wardrobe|jacket|coat|dress|shirt|suit|hat|uniform/i.test(`${s.narration} ${s.visualIntent}`),
    );
    if (!wardrobeMentioned) {
      issues.push({
        sceneRef: scenes[0].id,
        kind: "wardrobe",
        severity: "info",
        message: `no scene anchors ${characterName}'s wardrobe — add a wardrobe cue for visual consistency`,
      });
    }
  }
  return issues;
}

function deterministicScenes(script: string): SceneDraft[] {
  const chunks = splitSentences(script);
  if (chunks.length === 0) return [];
  const scenes = chunks.length > MAX_LLM_SCENES ? groupEven(chunks, MAX_LLM_SCENES) : chunks;
  return scenes.map((narration) => ({ narration, visualIntent: "" }));
}

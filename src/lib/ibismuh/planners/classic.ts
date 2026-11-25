// classic.ts — the classic-lane planner (script → 3-7 kenburns beats).
//
// The full narration is split into beats: an LLM pass drafts them, with a
// deterministic sentence split as the declared fallback. Every beat gets
// an image-prompt visual intent, an alternating Ken Burns camera, the
// shared estimate timing, and a caption from its first sentence.

import type { LaneScene, PlannerOutput } from "../planner-types";
import { LANE_REGISTRY } from "../studio-lanes";
import { chatJson } from "../providers/llm";
import {
  asRecordArray,
  asString,
  captionFor,
  collapse,
  firstWords,
  groupEven,
  kenburnsPose,
  sceneShell,
  splitSentences,
  truncate,
  type PlannerInput,
} from "./index";

const LANE = LANE_REGISTRY.classic;
const MIN_BEATS = 3;
const MAX_BEATS = 7;

interface BeatDraft {
  narration: string;
  visualIntent: string;
  caption: string;
}

export async function planClassic(input: PlannerInput): Promise<PlannerOutput> {
  const script = collapse(input.brief.script ?? input.brief.topic ?? "");
  let llmPass: "full" | "skipped" = "skipped";
  let note = "llm pass unavailable — deterministic sentence split (declared)";
  let beats: BeatDraft[] | null = null;

  if (script.length > 0) {
    const system = [
      `You are the classic-lane beat planner for Ibismuh Studio.`,
      `Split the narration into ${MIN_BEATS}-${MAX_BEATS} spoken beats.`,
      `Reply with ONLY a JSON array (no prose, no markdown fences):`,
      `[{"narration":"...","visualIntent":"...","caption":"..."}]`,
      `narration: 1-3 sentences of the script, in order, covering it completely;`,
      `visualIntent: image prompt (subject, setting, mood, lighting);`,
      `caption: max 80 chars.`,
    ].join(" ");
    const user = [
      input.brief.topic ? `Topic: ${input.brief.topic}` : "",
      input.tone ? `Tone: ${input.tone}` : "",
      `Script: ${script}`,
    ]
      .filter(Boolean)
      .join("\n");
    const raw = await chatJson<unknown>(system, user, { maxItems: MAX_BEATS });
    beats = validateBeats(raw);
    if (beats !== null) {
      llmPass = "full";
      note = `llm beat plan accepted (${beats.length} beats)`;
    }
  } else {
    note = "empty brief script — single declared placeholder beat";
  }

  const finalBeats = beats ?? deterministicBeats(script);
  const scenes: LaneScene[] = finalBeats.map((b, i) => {
    const shell = sceneShell(i, b.narration, b.visualIntent || `editorial illustration: ${firstWords(b.narration, 12)}`);
    return {
      ...shell,
      caption: b.caption.length > 0 ? b.caption : shell.caption,
      camera: kenburnsPose(i),
    };
  });

  return {
    lane: "classic",
    scenes,
    fallback: {
      mode: "kenburns",
      reason:
        "plan-time default — provider art availability is decided later in the pipeline; Smart Motion kenburns is the lane's declared render mode",
    },
    plannerMeta: { planner: LANE.planner, llmPass, note },
  };
}

function validateBeats(raw: unknown): BeatDraft[] | null {
  const rows = asRecordArray(raw, MAX_BEATS);
  if (rows.length < MIN_BEATS) return null;
  const beats: BeatDraft[] = [];
  for (const row of rows) {
    const narration = asString(row.narration);
    if (narration === null) return null;
    beats.push({
      narration: collapse(narration),
      visualIntent: collapse(asString(row.visualIntent) ?? ""),
      caption: truncate(asString(row.caption) ?? "", 80),
    });
  }
  return beats;
}

function deterministicBeats(script: string): BeatDraft[] {
  let chunks = splitSentences(script);
  if (chunks.length === 0) chunks = script.trim().length > 0 ? [script.trim()] : [];
  // A very short script cannot honestly yield MIN_BEATS — split clauses, else keep fewer beats.
  if (chunks.length < MIN_BEATS) {
    chunks = chunks
      .flatMap((s) => s.split(/[,;:]\s*/))
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  if (chunks.length === 0) {
    return [{ narration: "", visualIntent: "editorial illustration: topic placeholder", caption: "" }];
  }
  const grouped = chunks.length > MAX_BEATS ? groupEven(chunks, MAX_BEATS) : chunks;
  return grouped.map((narration) => ({
    narration,
    visualIntent: `editorial illustration: ${firstWords(narration, 12)}`,
    caption: captionFor(narration),
  }));
}

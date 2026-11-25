// character.ts — the character-lane planner (pose plan + rig truth).
//
// Sandbox truth: no rig doc ships with the brief, so the default rigMode
// is storyboard-fallback; native-rig is granted ONLY when the brief's
// characterDescription explicitly declares a rigged character (honest
// capability gate). Pose keyframes sit at 0 / 40% / 70% of the scene, the
// mid-scene keyframe carries the "aa" viseme when narration exists, and
// lip-sync is "validated" only under native-rig — never silently enabled.
// The rig mode is DECLARED per scene (scene.mode + fallback.perScene).

import type { LaneScene, PlannerOutput, PosePlan } from "../planner-types";
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
  type PlannerInput,
} from "./index";

const LANE = LANE_REGISTRY.character;
const MIN_SCENES = 3;
const MAX_SCENES = 6;

interface SceneDraft {
  narration: string;
  visualIntent: string;
}

export async function planCharacter(input: PlannerInput): Promise<PlannerOutput> {
  const brief = input.brief;
  const rigMode: PosePlan["rigMode"] = /rigged/i.test(brief.characterDescription ?? "")
    ? "native-rig"
    : "storyboard-fallback";
  const identity = brief.characterName || "host-character";
  let llmPass: "full" | "skipped" = "skipped";
  let note = "deterministic scene split (declared)";
  let drafts: SceneDraft[] | null = null;

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
        `You are the character-lane planner for Ibismuh Studio.`,
        `Draft ${MIN_SCENES}-${MAX_SCENES} scenes performed by the host character.`,
        `Reply with ONLY JSON (no prose, no fences):`,
        `{"scenes":[{"narration":"...","visualIntent":"..."}]}`,
        `visualIntent describes the frame: what the character does, the setting, the mood.`,
      ].join(" ");
      const user = [
        brief.topic ? `Topic: ${brief.topic}` : "",
        input.tone ? `Tone: ${input.tone}` : "",
        `Character: ${identity}`,
        brief.characterDescription ? `Character description: ${brief.characterDescription}` : "",
        `Script: ${script}`,
      ]
        .filter(Boolean)
        .join("\n");
      const raw = await chatJson<unknown>(system, user, { maxItems: MAX_SCENES });
      drafts = validateScenes(raw);
      if (drafts !== null) {
        llmPass = "full";
        note = `llm scene plan accepted (${drafts.length} scenes)`;
      }
    }
    if (drafts === null) {
      drafts = deterministicScenes(script);
    }
  }

  const scenes: LaneScene[] = drafts.map((d, i) => {
    const shell = sceneShell(i, d.narration, d.visualIntent || visualIntentFor(rigMode, d.narration));
    return {
      ...shell,
      // Ken Burns carries fallback scenes; native-rig scenes need no board.
      camera: rigMode === "storyboard-fallback" ? kenburnsPose(i) : undefined,
      pose: buildPosePlan(`s${i + 1}`, rigMode, identity, shell.estimatedDurationMs, d.narration.length > 0),
      mode: rigMode,
    };
  });

  return {
    lane: "character",
    scenes,
    fallback: {
      mode: rigMode,
      reason:
        rigMode === "native-rig"
          ? "brief declares a rigged character — the native rig channel performs poses scene-by-scene"
          : "no rig doc ships with the sandbox brief — storyboard art carries every scene (declared per scene)",
      perScene: scenes.map((s) => ({
        sceneRef: s.id,
        mode: rigMode,
        reason:
          rigMode === "native-rig"
            ? "native rig granted by the brief capability gate"
            : "no rig for this scene — storyboard fallback (declared)",
      })),
    },
    plannerMeta: { planner: LANE.planner, llmPass, note },
  };
}

function buildPosePlan(
  sceneId: string,
  rigMode: PosePlan["rigMode"],
  identity: string,
  durationMs: number,
  narrated: boolean,
): PosePlan {
  const poses: PosePlan["poses"] = [
    { id: `${sceneId}-p1`, at: 0, pose: "neutral" },
    {
      id: `${sceneId}-p2`,
      at: Math.round(durationMs * 0.4),
      pose: "gesture-emphasis",
      ...(narrated ? { viseme: "aa" as const } : {}),
    },
    { id: `${sceneId}-p3`, at: Math.round(durationMs * 0.7), pose: "idle", hold: true },
  ];
  return {
    rigMode,
    poses,
    lipSync: rigMode === "native-rig" ? "validated" : "disabled",
    identityAnchor: identity,
  };
}

function visualIntentFor(rigMode: PosePlan["rigMode"], narration: string): string {
  const gist = firstWords(narration, 12) || "host frame";
  return rigMode === "native-rig" ? `character performance: ${gist}` : `storyboard art: ${gist}`;
}

function validateScenes(raw: unknown): SceneDraft[] | null {
  // Tolerate both `{"scenes":[...]}` and a bare `[...]` answer.
  const doc = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>).scenes : raw;
  const rows = asRecordArray(doc, MAX_SCENES);
  if (rows.length < MIN_SCENES) return null;
  const drafts: SceneDraft[] = [];
  for (const row of rows) {
    const narration = asString(row.narration);
    if (narration === null) return null;
    drafts.push({
      narration: collapse(narration),
      visualIntent: collapse(asString(row.visualIntent) ?? ""),
    });
  }
  return drafts;
}

function deterministicScenes(script: string): SceneDraft[] {
  const chunks = splitSentences(script);
  if (chunks.length === 0) {
    return [{ narration: "", visualIntent: "" }];
  }
  const grouped = chunks.length > MAX_SCENES ? groupEven(chunks, MAX_SCENES) : chunks;
  return grouped.map((narration) => ({ narration, visualIntent: "" }));
}

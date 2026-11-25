// whiteboard.ts — the whiteboard-lane planner (deterministic drawable IR).
//
// Every scene becomes a hand-drawn composition in 1280x720 board space: a
// frame rectangle, a title underline, 1-3 concept shapes rotated by the
// narration hash, and an optional emphasis glyph — each with a calibrated
// strokeMs (900ms base + roughness, clamped 600..2500) and a deterministic
// draw order (frame 0, underline 1, shapes 2+, glyph last). The LLM pass
// only seeds narration/title/concept; stroke IR is always deterministic.

import type { DrawablePath, LaneScene, PlannerOutput } from "../planner-types";
import { LANE_REGISTRY } from "../studio-lanes";
import { chatJson } from "../providers/llm";
import {
  asRecordArray,
  asString,
  clampInt,
  collapse,
  firstSentence,
  firstWords,
  groupEven,
  sceneShell,
  splitSentences,
  stableHash,
  truncate,
  type PlannerInput,
} from "./index";

const LANE = LANE_REGISTRY.whiteboard;
// Board space (viewBox): 1280x720 — paths are authored in these units.
const MIN_SCENES = 3;
const MAX_SCENES = 6;

interface BoardDraft {
  narration: string;
  title: string;
  concept: string;
}

export async function planWhiteboard(input: PlannerInput): Promise<PlannerOutput> {
  const brief = input.brief;
  let llmPass: "full" | "skipped" = "skipped";
  let note = "deterministic scene split — titles derived from narration (declared)";
  let drafts: BoardDraft[] | null = null;

  const creatorScenes = (brief.scenes ?? []).filter((s) => collapse(s.narration).length > 0);
  if (creatorScenes.length > 0) {
    drafts = creatorScenes.map((s) => {
      const narration = collapse(s.narration);
      return {
        narration,
        title: truncate(firstSentence(narration), 48),
        concept: collapse(s.visualIntent ?? "") || firstWords(narration, 8),
      };
    });
    note = `creator-authored scenes used as-is (${drafts.length} scenes); llm pass not required`;
  } else {
    const script = collapse(brief.script ?? brief.topic ?? "");
    if (script.length > 0) {
      const system = [
        `You are the whiteboard-lane planner for Ibismuh Studio.`,
        `Split the narration into ${MIN_SCENES}-${MAX_SCENES} board scenes.`,
        `Reply with ONLY JSON (no prose, no fences):`,
        `{"scenes":[{"narration":"...","title":"...","concept":"..."}]}`,
        `title: max 48 chars, written on the board; concept: 3-8 words naming the idea the hand will draw.`,
      ].join(" ");
      const user = [
        brief.topic ? `Topic: ${brief.topic}` : "",
        input.tone ? `Tone: ${input.tone}` : "",
        `Script: ${script}`,
      ]
        .filter(Boolean)
        .join("\n");
      const raw = await chatJson<unknown>(system, user, { maxItems: MAX_SCENES });
      drafts = validateBoardScenes(raw);
      if (drafts !== null) {
        llmPass = "full";
        note = `llm board plan accepted (${drafts.length} scenes)`;
      }
    }
    if (drafts === null) {
      drafts = deterministicBoards(script);
    }
  }

  const scenes: LaneScene[] = drafts.map((d, i) => ({
    ...sceneShell(i, d.narration, `hand-drawn whiteboard: ${d.title}`),
    // The board title doubles as the caption overlay (≤ 48 < 80 chars).
    caption: d.title,
    paths: buildBoardPaths(`s${i + 1}`, d.narration, d.concept),
  }));

  return {
    lane: "whiteboard",
    scenes,
    fallback: {
      mode: "hand-drawn",
      reason: "whiteboard renders as native hand-drawn strokes — image provider not involved",
    },
    plannerMeta: { planner: LANE.planner, llmPass, note },
  };
}

function validateBoardScenes(raw: unknown): BoardDraft[] | null {
  // Tolerate both `{"scenes":[...]}` and a bare `[...]` answer.
  const doc = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>).scenes : raw;
  const rows = asRecordArray(doc, MAX_SCENES);
  if (rows.length < MIN_SCENES) return null;
  const drafts: BoardDraft[] = [];
  for (const row of rows) {
    const narration = asString(row.narration);
    if (narration === null) return null;
    const text = collapse(narration);
    drafts.push({
      narration: text,
      title: truncate(asString(row.title) ?? "", 48) || truncate(firstSentence(text), 48),
      concept: collapse(asString(row.concept) ?? "") || firstWords(text, 8),
    });
  }
  return drafts;
}

function deterministicBoards(script: string): BoardDraft[] {
  const chunks = splitSentences(script);
  if (chunks.length === 0) {
    return [{ narration: "", title: "untitled board", concept: "concept" }];
  }
  const grouped = chunks.length > MAX_SCENES ? groupEven(chunks, MAX_SCENES) : chunks;
  return grouped.map((narration) => ({
    narration,
    title: truncate(firstSentence(narration), 48),
    concept: firstWords(narration, 8),
  }));
}

// ---------- the drawable IR (pure deterministic stroke composition) ----------

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function circlePath(cx: number, cy: number, r: number): string {
  return `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy}`;
}

function rectPath(x: number, y: number, w: number, h: number): string {
  // Absolute commands only — the Drawable IR is normalized (QC ink-fit
  // evaluates geometry against absolute coordinates; relative commands are
  // a measurement hazard, not a style choice).
  return `M ${x} ${y} H ${round1(x + w)} V ${round1(y + h)} H ${x} Z`;
}

function arrowPath(x1: number, y1: number, x2: number, y2: number): string {
  return `M ${x1} ${y1} L ${x2} ${y2} M ${x2 - 18} ${y2 - 12} L ${x2} ${y2} L ${x2 - 18} ${y2 + 12}`;
}

function zigzagPath(x: number, y: number, w: number): string {
  const step = round1(w / 4);
  // Absolute points: up-down-up-down zigzag resolved to real coordinates.
  const p1 = `${round1(x + step)} ${round1(y - 14)}`;
  const p2 = `${round1(x + 2 * step)} ${y}`;
  const p3 = `${round1(x + 3 * step)} ${round1(y - 14)}`;
  const p4 = `${round1(x + 4 * step)} ${y}`;
  return `M ${x} ${y} L ${p1} L ${p2} L ${p3} L ${p4}`;
}

function starPath(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${i === 0 ? "M" : "L"} ${round1(cx + rad * Math.cos(angle))} ${round1(cy + rad * Math.sin(angle))}`);
  }
  return `${pts.join(" ")} Z`;
}

/** Base 900ms + roughness (path length / 8), clamped 600..2500. */
function strokeMsFor(d: string): number {
  return clampInt(900 + d.length / 8, 600, 2500);
}

function semanticGroupFor(concept: string): string {
  const words = concept.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(Boolean);
  return words.length > 0 ? words.slice(0, 3).join(" ") : "scene";
}

interface PathSlot {
  cx: number;
  cy: number;
}

/** Non-overlapping content slots (content area 160..1120 x 240..580). */
function slotFor(count: number, k: number): PathSlot {
  if (count === 1) return { cx: 640, cy: 400 };
  if (count === 2) return k === 0 ? { cx: 430, cy: 400 } : { cx: 850, cy: 400 };
  return k === 0 ? { cx: 340, cy: 380 } : k === 1 ? { cx: 640, cy: 420 } : { cx: 940, cy: 380 };
}

function buildBoardPaths(sceneId: string, narration: string, concept: string): DrawablePath[] {
  const semantic = semanticGroupFor(concept);
  const paths: DrawablePath[] = [];
  const push = (d: string, role: DrawablePath["role"], group: string): void => {
    paths.push({
      id: `${sceneId}-path-${paths.length}`,
      d,
      role,
      semanticGroup: group,
      strokeMs: strokeMsFor(d),
      order: paths.length, // deterministic draw sequence
    });
  };

  // 0 — the board frame
  push("M 100 100 H 1180 V 620 H 100 Z", "frame", "board");
  // 1 — the title underline
  push("M 140 200 H 700", "underline", "title");

  // 2..n — 1-3 concept shapes, rotated by narration hash
  const hash = stableHash(`${narration}|${concept}`);
  const shapeCount = 1 + (hash % 3);
  const vocabulary: Array<"circle" | "rectangle" | "arrow"> = ["circle", "rectangle", "arrow"];
  const startIdx = (hash >>> 8) % vocabulary.length;
  for (let k = 0; k < shapeCount; k++) {
    const kind = vocabulary[(startIdx + k) % vocabulary.length];
    const slot = slotFor(shapeCount, k);
    const scale = shapeCount === 1 ? 1.25 : 1;
    if (kind === "circle") {
      const r = Math.round(90 * scale);
      push(circlePath(slot.cx, slot.cy, r), "shape", semantic);
    } else if (kind === "rectangle") {
      const w = Math.round(240 * scale);
      const hh = Math.round(150 * scale);
      push(rectPath(slot.cx - w / 2, slot.cy - hh / 2, w, hh), "shape", semantic);
    } else {
      const span = Math.round(150 * scale);
      push(arrowPath(slot.cx - span, slot.cy, slot.cx + span, slot.cy), "arrow", semantic);
    }
  }

  // last — optional emphasis glyph (deterministic "option")
  if (((hash >>> 5) & 1) === 0) {
    const d = ((hash >>> 9) & 1) === 0 ? zigzagPath(760, 200, 160) : starPath(1010, 170, 30);
    push(d, "glyph", semantic);
  }
  return paths;
}

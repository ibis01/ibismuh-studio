// graphics.ts — the graphics2d-lane planner (declarative component doc).
//
// Every scene compiles to GraphicComponents: a headline always, one main
// component by index rotation (statistic / chart / quote / cta), and a
// lower-third citation only when REAL numbers were extracted from the
// narration (pseudo-stats never cite). Layout rects stack vertically and
// never overlap. Image-free lane — no camera, no assets.

import type { GraphicComponent, GraphicComponentKind, LaneScene, PlannerOutput, PlannerBeatRow } from "../planner-types";
import { LANE_REGISTRY } from "../studio-lanes";
import { chatJson } from "../providers/llm";
import {
  classifyVisualIntent,
  contentWords,
  declareVisualBeatRow,
} from "./visual-beats";
import {
  asRecordArray,
  asString,
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

const LANE = LANE_REGISTRY.graphics2d;
const MIN_SCENES = 3;
const MAX_SCENES = 6;
const MAIN_ROTATION: readonly GraphicComponentKind[] = ["statistic", "chart", "quote", "cta"];

interface ChartBar {
  label: string;
  value: number;
}

type MainDraft =
  | { kind: "statistic"; value: string; label: string }
  | { kind: "chart"; bars: ChartBar[] }
  | { kind: "quote"; text: string; attribution: string }
  | { kind: "cta"; text: string };

interface DocDraft {
  narration: string;
  headline: string;
  main: MainDraft;
  hasRealNumbers: boolean;
}

export async function planGraphics(input: PlannerInput): Promise<PlannerOutput> {
  const brief = input.brief;
  let llmPass: "full" | "partial" | "skipped" = "skipped";
  let note = "deterministic component doc (declared)";
  let drafts: DocDraft[] | null = null;

  const creatorScenes = (brief.scenes ?? []).filter((s) => collapse(s.narration).length > 0);
  if (creatorScenes.length > 0) {
    drafts = creatorScenes.map((s, i) => {
      const narration = collapse(s.narration);
      const built = deterministicMain(i, narration, brief.topic);
      return {
        narration,
        headline: truncate(collapse(s.visualIntent ?? "") || firstSentence(narration), 80),
        main: built.main,
        hasRealNumbers: built.real,
      };
    });
    note = `creator-authored scenes used as-is (${drafts.length} scenes); llm pass not required`;
  } else {
    const script = collapse(brief.script ?? brief.topic ?? "");
    if (script.length > 0) {
      const system = [
        `You are the graphics2d-lane planner for Ibismuh Studio.`,
        `Build ${MIN_SCENES}-${MAX_SCENES} scenes of a declarative motion-graphics doc.`,
        `Reply with ONLY JSON (no prose, no fences):`,
        `{"scenes":[{"narration":"...","headline":"...","kind":"statistic|chart|quote|cta","value":"42%","label":"...","bars":[{"label":"...","value":0}],"quote":"...","attribution":"...","cta":"..."}]}`,
        `kind rotates statistic → chart → quote → cta per scene; use REAL numbers from the narration when present.`,
      ].join(" ");
      const user = [
        brief.topic ? `Topic: ${brief.topic}` : "",
        input.tone ? `Tone: ${input.tone}` : "",
        `Script: ${script}`,
      ]
        .filter(Boolean)
        .join("\n");
      const raw = await chatJson<unknown>(system, user, { maxItems: MAX_SCENES });
      const merged = mergeLlmDoc(raw, script);
      if (merged !== null) {
        drafts = merged.drafts;
        llmPass = merged.llmPass;
        note = merged.note;
      }
    }
    if (drafts === null) {
      drafts = deterministicDoc(script);
    }
  }

  const scenes: LaneScene[] = drafts.map((d, i) => ({
    ...sceneShell(i, d.narration, `kinetic doc: ${d.headline}`),
    components: buildComponents(`s${i + 1}`, d),
  }));

  // WS7 — the beat receipts ride plannerMeta (additive; the doc bytes are
  // untouched). The rotation IS the selection rule, so the receipt names
  // it: index rotation over the main-component vocabulary, with the
  // narration's classified intent and the data-realness confidence.
  const beats: PlannerBeatRow[] = drafts.map((d, i) => {
    const concept = contentWords(d.narration).slice(0, 2).join(" ") || d.headline.toLowerCase();
    return declareVisualBeatRow({
      sceneId: `s${i + 1}`,
      concept,
      visualIntent: classifyVisualIntent(d.narration, i === 0),
      candidateIds: ["headline", ...MAIN_ROTATION, "lower-third"],
      selectedIds:
        d.main.kind === "statistic" || d.main.kind === "chart" || d.main.kind === "quote" || d.main.kind === "cta"
          ? ["headline", d.main.kind]
          : ["headline"],
      confidence: d.hasRealNumbers ? 0.9 : 0.5,
      reason: `rule: index rotation ${i} over [statistic, chart, quote, cta] chose ${d.main.kind}${d.hasRealNumbers ? " (real data cited)" : " (pseudo-data — no citation)"}`,
      ...(d.main.kind === "statistic" && !d.hasRealNumbers ? { fallback: "pseudo-stat declared" } : {}),
    });
  });

  return {
    lane: "graphics2d",
    scenes,
    fallback: {
      mode: "kinetic-doc",
      reason: "declarative component doc renders natively — image-free lane, no assets or camera involved",
    },
    plannerMeta: { planner: LANE.planner, llmPass, note, beats },
  };
}

// ---------- number extraction (real data vs deterministic pseudo-stat) ----------

function extractNumberValue(narration: string): string | null {
  const pct = narration.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pct) return `${pct[1]}%`;
  const mult = narration.match(/(\d+(?:\.\d+)?)\s*x\b/i);
  if (mult) return `${mult[1]}x`;
  const num = narration.match(/\d+(?:\.\d+)?/);
  return num ? num[0] : null;
}

function extractBars(narration: string): ChartBar[] | null {
  const nums = (narration.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter((n) => Number.isFinite(n));
  if (nums.length < 2) return null;
  return nums.slice(0, 4).map((n, i) => ({ label: `metric ${i + 1}`, value: n }));
}

function pseudoStat(narration: string): string {
  return `${8 + (stableHash(narration) % 84)}%`;
}

function pseudoBars(narration: string): ChartBar[] {
  const h = stableHash(narration);
  return [0, 1, 2].map((i) => ({ label: `metric ${i + 1}`, value: 25 + ((h >>> (i * 4)) % 60) }));
}

/** The deterministic main component for scene index `index`. */
function deterministicMain(index: number, narration: string, topic: string): { main: MainDraft; real: boolean } {
  const kind = MAIN_ROTATION[index % MAIN_ROTATION.length];
  const label = truncate(firstWords(narration, 6), 40);
  if (kind === "statistic") {
    const value = extractNumberValue(narration);
    return value !== null
      ? { main: { kind: "statistic", value, label }, real: true }
      : { main: { kind: "statistic", value: pseudoStat(narration), label }, real: false };
  }
  if (kind === "chart") {
    const bars = extractBars(narration);
    return bars !== null
      ? { main: { kind: "chart", bars }, real: true }
      : { main: { kind: "chart", bars: pseudoBars(narration) }, real: false };
  }
  if (kind === "quote") {
    return { main: { kind: "quote", text: truncate(firstSentence(narration), 120), attribution: "creator brief" }, real: false };
  }
  const ctaText = topic.length > 0 ? `Explore: ${truncate(topic, 56)}` : truncate(firstSentence(narration), 80) || "act now";
  return { main: { kind: "cta", text: ctaText }, real: false };
}

// ---------- LLM merge (per-scene fallback keeps the doc valid) ----------

function parseLlmBars(v: unknown): ChartBar[] | null {
  if (!Array.isArray(v) || v.length < 2) return null;
  const bars: ChartBar[] = [];
  for (const item of v.slice(0, 4)) {
    if (typeof item !== "object" || item === null) return null;
    const rec = item as Record<string, unknown>;
    const label = asString(rec.label);
    const value = rec.value;
    if (label === null || typeof value !== "number" || !Number.isFinite(value)) return null;
    bars.push({ label, value });
  }
  return bars;
}

function mergeLlmDoc(
  raw: unknown,
  script: string,
): { drafts: DocDraft[]; llmPass: "full" | "partial"; note: string } | null {
  // Tolerate both `{"scenes":[...]}` and a bare `[...]` answer.
  const doc = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>).scenes : raw;
  const rows = asRecordArray(doc, MAX_SCENES);
  if (rows.length < MIN_SCENES) return null;
  const chunks = splitSentences(script);
  const drafts: DocDraft[] = [];
  let degraded = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const narration = collapse(asString(row.narration) ?? chunks[i] ?? firstSentence(script));
    const headline = truncate(asString(row.headline) ?? "", 80) || truncate(firstSentence(narration), 80);
    const kind = asString(row.kind);
    let main: MainDraft;
    let real = false;
    if (kind === "statistic") {
      const value = asString(row.value);
      main = {
        kind: "statistic",
        value: value ?? pseudoStat(narration),
        label: asString(row.label) ?? truncate(firstWords(narration, 6), 40),
      };
      real = value !== null;
    } else if (kind === "chart") {
      const bars = parseLlmBars(row.bars);
      main = { kind: "chart", bars: bars ?? pseudoBars(narration) };
      real = bars !== null;
    } else if (kind === "quote") {
      main = {
        kind: "quote",
        text: truncate(asString(row.quote) ?? "", 120) || truncate(firstSentence(narration), 120),
        attribution: asString(row.attribution) ?? "creator brief",
      };
    } else if (kind === "cta") {
      main = { kind: "cta", text: truncate(asString(row.cta) ?? "", 80) || truncate(firstSentence(narration), 80) };
    } else {
      const built = deterministicMain(i, narration, "");
      main = built.main;
      real = built.real;
      degraded++;
    }
    drafts.push({ narration, headline, main, hasRealNumbers: real });
  }
  return {
    drafts,
    llmPass: degraded === 0 ? "full" : "partial",
    note:
      degraded === 0
        ? `llm component doc accepted (${drafts.length} scenes)`
        : `llm doc partially accepted — ${degraded} scene(s) fell back to deterministic components`,
  };
}

function deterministicDoc(script: string): DocDraft[] {
  let chunks = splitSentences(script);
  if (chunks.length === 0) chunks = [""];
  const grouped = chunks.length > MAX_SCENES ? groupEven(chunks, MAX_SCENES) : chunks;
  return grouped.map((narration, i) => {
    const built = deterministicMain(i, narration, "");
    return {
      narration,
      headline: truncate(firstSentence(narration), 80) || "untitled frame",
      main: built.main,
      hasRealNumbers: built.real,
    };
  });
}

// ---------- the component doc (stacked layout, no overlap) ----------

function buildComponents(sceneId: string, draft: DocDraft): GraphicComponent[] {
  const comps: GraphicComponent[] = [
    {
      id: `${sceneId}-headline`,
      kind: "headline",
      props: { text: draft.headline },
      layout: { x: 0.08, y: 0.08, w: 0.84, h: 0.18 },
    },
  ];
  const mainLayout = { x: 0.08, y: 0.3, w: 0.84, h: 0.52 };
  if (draft.main.kind === "statistic") {
    comps.push({
      id: `${sceneId}-main`,
      kind: "statistic",
      props: { value: draft.main.value, label: draft.main.label },
      layout: mainLayout,
    });
  } else if (draft.main.kind === "chart") {
    comps.push({
      id: `${sceneId}-main`,
      kind: "chart",
      props: { data: JSON.stringify(draft.main.bars) },
      layout: mainLayout,
    });
  } else if (draft.main.kind === "quote") {
    comps.push({
      id: `${sceneId}-main`,
      kind: "quote",
      props: { text: draft.main.text, attribution: draft.main.attribution },
      layout: mainLayout,
    });
  } else {
    comps.push({ id: `${sceneId}-main`, kind: "cta", props: { text: draft.main.text }, layout: mainLayout });
  }
  // Citation only for REAL data — a pseudo-stat never cites a source.
  const dataBacked = (draft.main.kind === "statistic" || draft.main.kind === "chart") && draft.hasRealNumbers;
  if (dataBacked) {
    comps.push({
      id: `${sceneId}-citation`,
      kind: "lower-third",
      props: { source: "creator brief" },
      layout: { x: 0.08, y: 0.86, w: 0.84, h: 0.07 },
      citation: "creator brief",
    });
  }
  return comps;
}

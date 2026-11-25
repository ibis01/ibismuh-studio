// slides.ts — the slides-lane planner (kinetic deck beats).
//
// 4-7 slides with a fixed template rotation (first = "title", last =
// "closing"); bodies are 2-4 bullets ≤ 64 chars; a stat or a quote is
// attached only when the narration actually carries a number or quotation,
// and the citation names its source. Image-free lane — no camera, no
// assets, no image generation anywhere in the pipeline.

import type { LaneScene, PlannerOutput, SlideBeat, SlideTemplate } from "../planner-types";
import { LANE_REGISTRY } from "../studio-lanes";
import { chatJson } from "../providers/llm";
import {
  asRecordArray,
  asString,
  collapse,
  firstSentence,
  firstWords,
  groupEven,
  sceneShell,
  splitSentences,
  truncate,
  type PlannerInput,
} from "./index";

const LANE = LANE_REGISTRY.slides;
const MIN_SLIDES = 4;
const MAX_SLIDES = 7;
// Rotation between the pinned first ("title") and last ("closing") slides.
const TEMPLATE_ROTATION: readonly SlideTemplate[] = ["title-body", "stat", "quote", "title-body", "section"];

interface SlideDraft {
  narration: string;
  title: string;
  bullets?: string[];
  stat?: { value: string; label: string };
  quote?: { text: string; attribution: string };
}

export async function planSlides(input: PlannerInput): Promise<PlannerOutput> {
  const brief = input.brief;
  let llmPass: "full" | "skipped" = "skipped";
  let note = "deterministic slide derivation from narration (declared)";
  let drafts: SlideDraft[] | null = null;

  const creatorScenes = (brief.scenes ?? []).filter((s) => collapse(s.narration).length > 0).slice(0, MAX_SLIDES);
  if (creatorScenes.length > 0) {
    drafts = creatorScenes.map((s) => deterministicSlide(collapse(s.narration)));
    note =
      creatorScenes.length < MIN_SLIDES
        ? `creator-authored scenes used as-is (${creatorScenes.length} slides, below the lane's ${MIN_SLIDES}-slide target, honored as authored); llm pass not required`
        : `creator-authored scenes used as-is (${drafts.length} slides); llm pass not required`;
  } else {
    const script = collapse(brief.script ?? brief.topic ?? "");
    if (script.length > 0) {
      const system = [
        `You are the slides-lane planner for Ibismuh Studio.`,
        `Build ${MIN_SLIDES}-${MAX_SLIDES} slides.`,
        `Reply with ONLY JSON (no prose, no fences):`,
        `{"slides":[{"narration":"...","title":"...","bullets":["..."],"statValue":"...","statLabel":"...","quoteText":"..."}]}`,
        `title ≤ 48 chars; bullets: 2-4 items ≤ 64 chars; statValue only when the narration carries a number; quoteText only when the narration quotes someone.`,
      ].join(" ");
      const user = [
        brief.topic ? `Topic: ${brief.topic}` : "",
        input.tone ? `Tone: ${input.tone}` : "",
        `Script: ${script}`,
      ]
        .filter(Boolean)
        .join("\n");
      const raw = await chatJson<unknown>(system, user, { maxItems: MAX_SLIDES });
      drafts = validateSlides(raw);
      if (drafts !== null) {
        llmPass = "full";
        note = `llm deck plan accepted (${drafts.length} slides)`;
      }
    }
    if (drafts === null) {
      drafts = deterministicDeck(script);
    }
  }

  const count = drafts.length;
  const scenes: LaneScene[] = drafts.map((d, i) => ({
    ...sceneShell(i, d.narration, `slide (${templateFor(i, count)}): ${d.title}`),
    slide: buildSlide(d, i, count),
  }));

  return {
    lane: "slides",
    scenes,
    fallback: {
      mode: "kinetic-deck",
      reason: "kinetic typography deck renders natively — image-free lane, no assets or camera involved",
    },
    plannerMeta: { planner: LANE.planner, llmPass, note },
  };
}

function templateFor(index: number, count: number): SlideTemplate {
  if (index === 0) return "title";
  if (index === count - 1) return "closing";
  return TEMPLATE_ROTATION[(index - 1) % TEMPLATE_ROTATION.length];
}

function buildSlide(draft: SlideDraft, index: number, count: number): SlideBeat {
  const beat: SlideBeat = { template: templateFor(index, count), title: draft.title };
  if (draft.bullets && draft.bullets.length >= 2) beat.body = draft.bullets;
  if (draft.stat) {
    beat.stat = draft.stat;
    beat.citation = "creator brief";
  }
  if (draft.quote) {
    beat.quote = draft.quote;
    beat.citation = "creator brief";
  }
  return beat;
}

// ---------- deterministic derivation ----------

function extractStat(narration: string): { value: string; label: string } | null {
  const pct = narration.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pct) return { value: `${pct[1]}%`, label: truncate(firstWords(narration, 6), 40) };
  const mult = narration.match(/(\d+(?:\.\d+)?)\s*x\b/i);
  if (mult) return { value: `${mult[1]}x`, label: truncate(firstWords(narration, 6), 40) };
  const num = narration.match(/\d+(?:\.\d+)?/);
  return num ? { value: num[0], label: truncate(firstWords(narration, 6), 40) } : null;
}

function extractQuote(narration: string): { text: string; attribution: string } | null {
  const m = narration.match(/["“]([^"”]{10,})["”]/);
  if (!m) return null;
  return { text: truncate(m[1], 140), attribution: "creator brief" };
}

function bulletsFrom(narration: string, title: string): string[] | undefined {
  const sentences = splitSentences(narration).filter((s) => collapse(s) !== collapse(title));
  const pool = sentences.length >= 2 ? sentences : narration.split(/[,;]\s*/).map((p) => p.trim()).filter((p) => p.length >= 8);
  const bullets = pool.map((p) => truncate(p, 64)).filter((b) => b.length > 4).slice(0, 4);
  return bullets.length >= 2 ? bullets : undefined;
}

function deterministicSlide(narration: string): SlideDraft {
  const title = truncate(firstSentence(narration), 48) || "untitled slide";
  const draft: SlideDraft = { narration, title };
  const bullets = bulletsFrom(narration, title);
  if (bullets) draft.bullets = bullets;
  const stat = extractStat(narration);
  if (stat) draft.stat = stat;
  const quote = extractQuote(narration);
  if (quote) draft.quote = quote;
  return draft;
}

function deterministicDeck(script: string): SlideDraft[] {
  let chunks = splitSentences(script);
  if (chunks.length === 0) return [{ narration: "", title: "untitled slide" }];
  if (chunks.length < MIN_SLIDES) {
    chunks = chunks
      .flatMap((s) => s.split(/[,;:]\s*/))
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  if (chunks.length < MIN_SLIDES && chunks.length > 0) {
    // Punctuation exhausted — group WORDS into phrase chunks so a short
    // one-line topic still builds a viable deck (deterministic, honest:
    // the planner note already declares the derivation).
    const words = chunks.join(" ").split(/\s+/).filter(Boolean);
    const perGroup = Math.max(2, Math.ceil(words.length / MIN_SLIDES));
    const groups: string[] = [];
    for (let i = 0; i < words.length && groups.length < MIN_SLIDES; i += perGroup) {
      groups.push(words.slice(i, i + perGroup).join(" "));
    }
    // A final group absorbs leftovers so the tail words are never dropped.
    if (words.length > groups.reduce((n, g) => n + g.split(" ").length, 0)) {
      groups[groups.length - 1] = words.slice((groups.length - 1) * perGroup).join(" ");
    }
    chunks = groups;
  }
  if (chunks.length === 0) return [{ narration: "", title: "untitled slide" }];
  const grouped = chunks.length > MAX_SLIDES ? groupEven(chunks, MAX_SLIDES) : chunks;
  return grouped.map(deterministicSlide);
}

// ---------- LLM validation ----------

function validateSlides(raw: unknown): SlideDraft[] | null {
  // Tolerate both `{"slides":[...]}` and a bare `[...]` answer.
  const doc = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>).slides : raw;
  const rows = asRecordArray(doc, MAX_SLIDES);
  if (rows.length < MIN_SLIDES) return null;
  const drafts: SlideDraft[] = [];
  for (const row of rows) {
    const narration = asString(row.narration);
    if (narration === null) return null;
    const text = collapse(narration);
    const title = truncate(asString(row.title) ?? "", 48) || truncate(firstSentence(text), 48) || "untitled slide";
    const draft: SlideDraft = { narration: text, title };
    const bulletsRaw = Array.isArray(row.bullets) ? row.bullets : [];
    const bullets = bulletsRaw
      .map((b) => truncate(asString(b) ?? "", 64))
      .filter((b) => b.length > 0)
      .slice(0, 4);
    if (bullets.length >= 2) draft.bullets = bullets;
    // Stats/quotes: the LLM's value wins, else derive honestly from the narration.
    const statValue = asString(row.statValue) ?? extractStat(text)?.value ?? null;
    if (statValue) {
      draft.stat = { value: truncate(statValue, 16), label: truncate(asString(row.statLabel) ?? "", 40) || truncate(firstWords(text, 6), 40) };
    }
    const quoteText = asString(row.quoteText) ?? extractQuote(text)?.text ?? null;
    if (quoteText) {
      draft.quote = { text: truncate(quoteText, 140), attribution: asString(row.attribution) ?? "creator brief" };
    }
    drafts.push(draft);
  }
  return drafts;
}

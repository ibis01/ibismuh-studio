#!/usr/bin/env node
// visual-beats suite — the shared visual-beat contract + deterministic
// resolver (the engineering master plan's WS7: "semantic planner and
// visual beats").
//
// The module (src/lib/ibismuh/planners/visual-beats.ts) is the narration→
// beat contract for BOTH planning families. This suite pins the laws so
// the receipts can never silently rot:
//
//   1. CONTRACT     — the closed intent/timing vocabularies; every
//                     constructor refuses an outside value BY NAME; the
//                     honest constructor refuses an unexplainable reason,
//                     a selection outside the declared candidates (the
//                     dead-end law), and a confidence outside [0, 1].
//   2. INTENT       — the cue tables fire in priority order (warn >
//                     conclude > compare > transform > emphasize); the
//                     first content beat introduces; the default explains.
//   3. RESOLVER     — concept hits outrank alias hits outrank tag hits;
//                     multi-hit sums outrank single-hit; ties break by id;
//                     the per-beat cap holds; candidate ORDER is
//                     irrelevant (shuffle → the same receipt); the
//                     anti-repeat law skips only with a fresh alternative
//                     and reports every exclusion.
//   4. RECEIPT      — every selection carries a reason naming the matched
//                     terms and the score; discards carry reasons; the
//                     emphasize intent pins emphasisIds; low confidence is
//                     surfaced; the fingerprint is stable across runs and
//                     candidate order.
//   5. FALLBACK     — a no-result narration produces ONE declared
//                     fallback beat (confidence 0.25, fallback named,
//                     low-confidence surfaced, discard explained); empty
//                     narration yields zero beats and zero discards.
//   6. ADOPTION     — the lane planners ride the contract: the graphics
//                     rotation and the whiteboard board-cast emit
//                     plannerMeta.beats rows through the honest
//                     constructor — closed-vocabulary intents, the
//                     rotation/cast rule NAMED in every reason, and the
//                     SCENE BYTES untouched (the components/stroke IR are
//                     byte-identical to the pre-receipt planner outputs).
//
// Run: node --import tsx scripts/test-visual-beats.mts   (pure — no DB,
// no DOM, no network; CI step)

import {
  VISUAL_BEAT_FALLBACK_CONFIDENCE,
  VISUAL_BEAT_LOW_CONFIDENCE_AT,
  VISUAL_BEAT_MAX_SELECTED,
  VISUAL_INTENTS,
  VISUAL_TIMING_SOURCES,
  classifyVisualIntent,
  contentWords,
  declareVisualBeatRow,
  deriveVisualBeats,
  type VisualBeatCandidate,
} from "../src/lib/ibismuh/planners/visual-beats";
import { planGraphics } from "../src/lib/ibismuh/planners/graphics";
import { planWhiteboard } from "../src/lib/ibismuh/planners/whiteboard";

let passed = 0;
let failed = 0;
const failures: string[] = [];
let suite = "";

function suiteStart(name: string) {
  suite = name;
  console.log(`\n◆ ${name}`);
}

function ok(cond: unknown, msg?: string) {
  if (cond) return;
  throw new Error(msg ?? `assertion failed in "${suite}"`);
}

function eq(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) return;
  throw new Error(msg ?? `expected ${b}, got ${a} (in "${suite}")`);
}

function throws(fn: () => unknown, needle: string, msg?: string) {
  try {
    fn();
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    if (text.includes(needle)) return;
    throw new Error(
      msg ?? `expected a refusal containing "${needle}", got: ${text} (in "${suite}")`,
    );
  }
  throw new Error(msg ?? `expected a throw containing "${needle}", got success (in "${suite}")`);
}

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    failures.push(`${suite} — ${name}: ${err instanceof Error ? err.message : String(err)}`);
    console.log(`  ✗ ${name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CANDIDATES: VisualBeatCandidate[] = [
  { id: "cattle-wb", concepts: ["cattle", "herd"], aliases: ["cow", "cows", "livestock"], tags: ["farm", "animal"] },
  { id: "sensor-node", concepts: ["sensor", "ai detection"], aliases: ["detector"], tags: ["ai", "device"] },
  { id: "warning-tri", concepts: ["warning", "alert"], aliases: ["hazard"], tags: ["safety"] },
  { id: "growth-arrow", concepts: ["growth", "increase"], aliases: ["rise"], tags: ["chart", "finance"] },
  { id: "hospital-cross", concepts: ["hospital", "emergency"], aliases: ["clinic"], tags: ["health"] },
  { id: "padlock", concepts: ["lock", "cybersecurity"], aliases: ["password"], tags: ["security"] },
];

const PLAIN = "The sensor watches the field at night.";

// ---------------------------------------------------------------------------
// 1. CONTRACT — the closed vocabularies, fail-closed constructors
// ---------------------------------------------------------------------------

suiteStart("CONTRACT — closed vocabularies, fail-closed constructors");

await test("the intent vocabulary is the plan's §12 closed set", () => {
  eq([...VISUAL_INTENTS], ["introduce", "explain", "compare", "transform", "emphasize", "warn", "conclude"]);
});

await test("the timing-source vocabulary is word|sentence|estimated", () => {
  eq([...VISUAL_TIMING_SOURCES], ["word", "sentence", "estimated"]);
});

await test("declareVisualBeatRow refuses an unknown intent BY NAME", () => {
  throws(
    () =>
      declareVisualBeatRow({
        sceneId: "s1",
        concept: "x",
        visualIntent: "dance" as never,
        candidateIds: ["a"],
        selectedIds: ["a"],
        confidence: 0.9,
        reason: "rule: index rotation 0",
      }),
    "unknown visual intent",
  );
});

await test("declareVisualBeatRow refuses an unknown timing source BY NAME", () => {
  throws(
    () =>
      declareVisualBeatRow({
        sceneId: "s1",
        concept: "x",
        visualIntent: "explain",
        candidateIds: ["a"],
        selectedIds: ["a"],
        confidence: 0.9,
        timingSource: "guessed" as never,
        reason: "rule: index rotation 0",
      }),
    "unknown timing source",
  );
});

await test("the honest constructor refuses a reason that names no rule", () => {
  throws(
    () =>
      declareVisualBeatRow({
        sceneId: "s1",
        concept: "x",
        visualIntent: "explain",
        candidateIds: ["a"],
        selectedIds: ["a"],
        confidence: 0.9,
        reason: "it felt right",
      }),
    "must NAME the rule",
  );
});

await test("the dead-end law: a selection outside the declared candidates refuses", () => {
  throws(
    () =>
      declareVisualBeatRow({
        sceneId: "s1",
        concept: "x",
        visualIntent: "explain",
        candidateIds: ["a"],
        selectedIds: ["ghost"],
        confidence: 0.9,
        reason: "rule: index rotation 0",
      }),
    "not among the declared candidates",
  );
});

await test("confidence outside [0, 1] refuses", () => {
  throws(
    () =>
      declareVisualBeatRow({
        sceneId: "s1",
        concept: "x",
        visualIntent: "explain",
        candidateIds: ["a"],
        selectedIds: ["a"],
        confidence: 1.5,
        reason: "rule: index rotation 0",
      }),
    "confidence",
  );
});

await test("the rotation law names accept cycle/index/parity/hash/cue/fallback reasons", () => {
  for (const reason of [
    "rule: index rotation 1",
    "hash parity drew the glyph",
    "fallback cycle position 2",
    "cue matched the count",
    "fallback: pseudo-stat declared",
  ]) {
    const row = declareVisualBeatRow({
      sceneId: "s1",
      concept: "x",
      visualIntent: "explain",
      candidateIds: ["a"],
      selectedIds: ["a"],
      confidence: 0.5,
      reason,
    });
    eq(row.reason, reason);
  }
});

// ---------------------------------------------------------------------------
// 2. INTENT — the cue tables, priority order
// ---------------------------------------------------------------------------

suiteStart("INTENT — cue tables in priority order");

await test("warn outranks every other cue", () => {
  eq(classifyVisualIntent("The risk grows, so remember the danger and compare both sides.", false), "warn");
});

await test("conclude outranks compare/transform/emphasize", () => {
  eq(classifyVisualIntent("In conclusion the key difference becomes clear.", false), "conclude");
});

await test("compare outranks transform/emphasize", () => {
  eq(classifyVisualIntent("More than half of it becomes critical.", false), "compare");
});

await test("transform outranks emphasize", () => {
  eq(classifyVisualIntent("The seed becomes a key plant.", false), "transform");
});

await test("emphasize is the last explicit cue", () => {
  eq(classifyVisualIntent("The most important part.", false), "emphasize");
});

await test("the first content beat introduces; the rest explain", () => {
  eq(classifyVisualIntent(PLAIN, true), "introduce");
  eq(classifyVisualIntent(PLAIN, false), "explain");
});

// ---------------------------------------------------------------------------
// 3. RESOLVER — retrieval, ranking, caps, anti-repeat
// ---------------------------------------------------------------------------

suiteStart("RESOLVER — retrieval, ranking, caps, anti-repeat");

await test("multi-hit sums outrank single-hit and concepts outrank tags", () => {
  const r = deriveVisualBeats({
    sceneId: "s1",
    narration: "The cattle herd grazes; the sensor watches.",
    candidates: CANDIDATES,
    sceneDurationMs: 8000,
  });
  const beat = r.beats[0];
  ok(beat, "expected a beat");
  eq(beat.selectedIds[0], "cattle-wb", "the double hit (cattle 3 + herd alias 2 = 5) outranks the sensor's single concept 3");
  ok(beat.confidence > 0.5, "multi-hit sums push confidence past the single-hit band");
});

await test("ties break by id (lex asc)", () => {
  const r = deriveVisualBeats({
    sceneId: "s1",
    narration: "Growth and warning rise together.",
    candidates: [
      { id: "zzz-growth", concepts: ["growth"] },
      { id: "aaa-growth", concepts: ["growth"] },
    ],
    sceneDurationMs: 4000,
  });
  eq(r.beats[0]?.selectedIds, ["aaa-growth", "zzz-growth"]);
});

await test("the per-beat cap holds", () => {
  const r = deriveVisualBeats({
    sceneId: "s1",
    narration: "The cattle herd sensor detector warning hazard growth rise hospital clinic lock password.",
    candidates: CANDIDATES,
    sceneDurationMs: 9000,
  });
  ok(r.beats[0], "expected a beat");
  ok(r.beats[0].selectedIds.length <= VISUAL_BEAT_MAX_SELECTED, `cap is ${VISUAL_BEAT_MAX_SELECTED}`);
  eq(r.beats[0].selectedIds.length, VISUAL_BEAT_MAX_SELECTED);
});

await test("candidate order is irrelevant — shuffle produces the same receipt", () => {
  const narration = "The cattle herd wears a sensor; the warning alert matters; growth rises.";
  const a = deriveVisualBeats({ sceneId: "s1", narration, candidates: CANDIDATES, sceneDurationMs: 9000 });
  const shuffled = [...CANDIDATES].reverse();
  const b = deriveVisualBeats({ sceneId: "s1", narration, candidates: shuffled, sceneDurationMs: 9000 });
  eq(a.fingerprint, b.fingerprint);
  eq(a.beats.map((x) => x.selectedIds), b.beats.map((x) => x.selectedIds));
});

await test("the anti-repeat law prefers fresh candidates and reports every exclusion", () => {
  const r = deriveVisualBeats({
    sceneId: "s1",
    narration: "The cattle herd grazes; the cattle herd again.",
    candidates: [
      { id: "cattle-wb", concepts: ["cattle"] },
      { id: "barn-wb", concepts: ["grazes", "barn"] },
    ],
    sceneDurationMs: 8000,
    previouslySelectedIds: new Set(["cattle-wb"]),
  });
  ok(r.discarded.some((d) => d.reason.includes("excluded — already selected")), "the exclusion is reported");
  eq(r.beats[0].selectedIds, ["barn-wb"], "the fresh alternative wins the band");
});

await test("an exhausted vocabulary fills from the used pool rather than emptying the board", () => {
  const r = deriveVisualBeats({
    sceneId: "s1",
    narration: "The cattle herd grazes.",
    candidates: [{ id: "cattle-wb", concepts: ["cattle"] }],
    sceneDurationMs: 4000,
    previouslySelectedIds: new Set(["cattle-wb"]),
  });
  eq(r.beats[0].selectedIds, ["cattle-wb"], "nothing fresh exists — the used candidate still serves");
});

await test("spans partition the scene clock with no lost milliseconds", () => {
  const narration = "First sentence is here. Second sentence follows. Third sentence concludes.";
  const r = deriveVisualBeats({ sceneId: "s1", narration, candidates: CANDIDATES, sceneDurationMs: 12000 });
  eq(r.beats[0].narrationSpan.startMs, 0);
  eq(r.beats[r.beats.length - 1].narrationSpan.endMs, 12000);
  for (let i = 1; i < r.beats.length; i++) {
    eq(r.beats[i].narrationSpan.startMs, r.beats[i - 1].narrationSpan.endMs, "spans are contiguous");
  }
});

await test("non-finite sceneDurationMs refuses", () => {
  throws(
    () => deriveVisualBeats({ sceneId: "s1", narration: PLAIN, candidates: CANDIDATES, sceneDurationMs: Number.NaN }),
    "sceneDurationMs",
  );
});

await test("contentWords strips stopwords and punctuation deterministically", () => {
  eq(contentWords("The cattle-herd, and the SENSOR device!"), ["cattle", "herd", "sensor", "device"]);
});

// ---------------------------------------------------------------------------
// 4. RECEIPT — explainability, emphasis, low confidence, fingerprint
// ---------------------------------------------------------------------------

suiteStart("RECEIPT — explainability, emphasis, low confidence, fingerprint");

await test("every selection carries a reason naming the matched terms and score", () => {
  const r = deriveVisualBeats({
    sceneId: "s1",
    narration: "The cattle herd grows.",
    candidates: CANDIDATES,
    sceneDurationMs: 6000,
  });
  ok(r.reasons.length >= r.beats[0].selectedIds.length, "at least one reason per selection");
  for (const reason of r.reasons) {
    ok(reason.why.includes("matched") && reason.why.includes("score"), `reason explains: ${reason.why}`);
    ok(reason.weight > 0);
  }
});

await test("the emphasize intent pins emphasisIds to the top selection", () => {
  const r = deriveVisualBeats({
    sceneId: "s1",
    narration: "The key cattle herd matters most.",
    candidates: CANDIDATES,
    sceneDurationMs: 6000,
  });
  eq(r.beats[0].visualIntent, "emphasize");
  eq(r.beats[0].emphasisIds, [r.beats[0].selectedIds[0]]);
});

await test("the fingerprint is stable across repeated runs", () => {
  const a = deriveVisualBeats({ sceneId: "s1", narration: PLAIN, candidates: CANDIDATES, sceneDurationMs: 5000 });
  const b = deriveVisualBeats({ sceneId: "s1", narration: PLAIN, candidates: CANDIDATES, sceneDurationMs: 5000 });
  eq(a.fingerprint, b.fingerprint);
  ok(a.fingerprint.startsWith("wb-beats-"), "the fingerprint carries the wb-beats family");
});

// ---------------------------------------------------------------------------
// 5. FALLBACK — the no-result law
// ---------------------------------------------------------------------------

suiteStart("FALLBACK — the no-result law");

await test("no matched candidate anywhere → ONE declared fallback beat", () => {
  const r = deriveVisualBeats({
    sceneId: "s1",
    narration: "Something happens somewhere somehow.",
    candidates: CANDIDATES,
    sceneDurationMs: 5000,
    fallbackId: "board-cast",
  });
  eq(r.beats.length, 1);
  eq(r.beats[0].selectedIds, []);
  eq(r.beats[0].fallback, "board-cast");
  eq(r.beats[0].confidence, VISUAL_BEAT_FALLBACK_CONFIDENCE);
  ok(r.beats[0].confidence < VISUAL_BEAT_LOW_CONFIDENCE_AT, "the fallback band sits below the low-confidence gate");
  ok(r.lowConfidenceIds.includes("board-cast"), "the fallback is surfaced low-confidence");
  ok(r.discarded.some((d) => d.reason.includes("declared fallback")), "the discard explains the fallback");
});

await test("an empty narration yields zero beats and zero discards", () => {
  const r = deriveVisualBeats({ sceneId: "s1", narration: "", candidates: CANDIDATES, sceneDurationMs: 5000 });
  eq(r.beats, []);
  eq(r.discarded, []);
});

await test("stopword-only sentences are discarded with their reason", () => {
  const r = deriveVisualBeats({
    sceneId: "s1",
    narration: "And so. The cattle herd grazes.",
    candidates: CANDIDATES,
    sceneDurationMs: 6000,
  });
  ok(r.discarded.some((d) => d.reason.includes("no content terms")), "connective tissue named");
  ok(r.beats.length === 1, "the content sentence still beats");
});

// ---------------------------------------------------------------------------
// 6. ADOPTION — the lane planners ride the contract, scene bytes untouched
// ---------------------------------------------------------------------------

suiteStart("ADOPTION — the lane planners ride the contract");

const GRAPHICS_BRIEF = {
  topic: "Urban foxes",
  scenes: [
    { id: "s1", narration: "City foxes are the most adaptable carnivores around.", visualIntent: "headline" },
    { id: "s2", narration: "Their population grew 42% versus 30 a decade ago.", visualIntent: "chart" },
    { id: "s3", narration: "In conclusion, foxes own the night.", visualIntent: "quote" },
  ],
};

await test("the graphics rotation emits honest plannerMeta.beats rows", async () => {
  const out = await planGraphics({ brief: GRAPHICS_BRIEF, tone: "neutral" });
  const beats = out.plannerMeta.beats;
  ok(Array.isArray(beats) && beats.length === GRAPHICS_BRIEF.scenes.length, "one beat row per scene");
  const s1 = beats[0];
  const s2 = beats[1];
  ok(s1 && s2, "rows exist");
  eq(s1.visualIntent, "emphasize", "the most-adaptable cue classifies the opener (explicit cue outranks introduce)");
  eq(s2.selectedIds, ["headline", "chart"], "rotation index 1 is the chart seat");
  ok(s2.reason.includes("rotation"), "the rotation rule is named");
  eq(s2.confidence, 0.9, "real data rides high confidence");
  ok(s2.fallback === undefined, "a real chart needs no fallback");
  eq(s2.visualIntent, "compare", "the versus cue classifies the data scene");
  const s3 = beats[2];
  eq(s3.visualIntent, "conclude", "the in-conclusion cue classifies the quote scene");
});

await test("a pseudo-stat scene declares its fallback and rides lower confidence", async () => {
  const out = await planGraphics({
    brief: {
      topic: "Compost",
      scenes: [{ id: "s1", narration: "Compost feeds the soil web quietly.", visualIntent: "statistic" }],
    },
    tone: "neutral",
  });
  const row = out.plannerMeta.beats?.[0];
  ok(row, "row exists");
  eq(row.confidence, 0.5, "pseudo-data rides the lower band");
  eq(row.fallback, "pseudo-stat declared");
  ok(row.reason.includes("no citation"), "the receipt says the citation is absent");
});

await test("the graphics SCENE BYTES are untouched — components identical to the pre-receipt planner", async () => {
  const out = await planGraphics({ brief: GRAPHICS_BRIEF, tone: "neutral" });
  // The components' canonical form is pinned STRUCTURALLY: the receipt is
  // plannerMeta-side only, so the scenes must serialize to exactly the
  // pre-receipt shape (headline + main [+ citation]).
  const s2 = out.scenes[1];
  eq(
    s2.components.map((c) => `${c.kind}:${c.id}`),
    ["headline:s2-headline", "chart:s2-main", "lower-third:s2-citation"],
    "real-data scene carries the citation",
  );
  const s1 = out.scenes[0];
  eq(s1.components.map((c) => `${c.kind}:${c.id}`), ["headline:s1-headline", "statistic:s1-main"], "pseudo scene cites nothing");
});

await test("the whiteboard board cast emits honest beat rows with the rule named", async () => {
  const out = await planWhiteboard({
    brief: {
      topic: "Water cycle",
      scenes: [
        { id: "s1", narration: "Rain falls on the hills and gathers into streams.", visualIntent: "rain" },
        { id: "s2", narration: "The water finally returns to the sea, in conclusion.", visualIntent: "sea" },
      ],
    },
    tone: "neutral",
  });
  const beats = out.plannerMeta.beats;
  ok(Array.isArray(beats) && beats.length === 2, "one beat row per board");
  const cast = beats[0];
  ok(cast.selectedIds.includes("frame") && cast.selectedIds.includes("underline"), "the board cast is listed");
  ok(cast.reason.includes("rule") && cast.reason.includes("recipe"), "the deterministic rule + recipe are named");
  ok(cast.selectedIds.every((id) => cast.candidateIds.includes(id)), "the dead-end law holds at the adoption seam");
  eq(beats[1].visualIntent, "conclude", "the conclude cue classifies the closing board");
});

await test("the whiteboard SCENE BYTES are untouched — stroke IR identical to the pre-receipt planner", async () => {
  const out = await planWhiteboard({
    brief: {
      topic: "Water cycle",
      scenes: [{ id: "s1", narration: "Rain falls on the hills.", visualIntent: "rain" }],
    },
    tone: "neutral",
  });
  const scene = out.scenes[0];
  // The stroke IR opens with the board frame and the title underline — the
  // same two opening strokes the planner has drawn since the S137 era.
  eq(scene.paths[0].role, "frame");
  eq(scene.paths[0].d, "M 100 100 H 1180 V 620 H 100 Z");
  eq(scene.paths[1].role, "underline");
  eq(scene.paths[1].d, "M 140 200 H 700");
  ok(scene.paths.length >= 3, "the concept shapes ride after the furniture");
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== visual-beats: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}

// visual-beats.ts — THE SHARED VISUAL-BEAT CONTRACT + DETERMINISTIC
// RESOLVER (the engineering master plan's WS7: "semantic planner and
// visual beats").
//
// The plan's insight: narration reaches the screen through BEATS —
// sentence-sized spans, each carrying a concept, a visual intent, ranked
// candidates, the selected cast, and a CONFIDENCE — and every selection
// must be EXPLAINABLE ("planner receipts explain why assets were
// selected"). This module is that contract for BOTH planning families:
//
//   · matcher-driven lanes — the resolver (deriveVisualBeats) retrieves
//     candidates by term weight (concepts 3 / aliases 2 / tags 1), ranks
//     deterministically (score desc, id asc), selects the top band, and
//     writes a receipt row for every selection AND every discard.
//   · rotation-driven lanes — the honest constructor
//     (declareVisualBeatRow) records what the lane's own deterministic
//     rule (an index rotation, a hash parity) chose and NAMES the rule in
//     the reason — a receipt that invents a semantic match the selector
//     never made would be a lie, and the battery pins the difference.
//
// Laws this module keeps (pinned by scripts/test-visual-beats.mts):
//   · CLOSED VOCABULARIES — visualIntent and timingSource ride closed
//     tables; the classifier and every constructor refuse outside them.
//   · CATALOG VALIDITY — the resolver selects only ids the caller's
//     candidate table declared (the dead-end law at the beat layer).
//   · EVERY BEAT HAS AN ACTION OR IS DISCARDED WITH A REASON — a sentence
//     with no content terms never becomes an empty beat; it lands in
//     `discarded` with its reason.
//   · LOW CONFIDENCE IS SURFACED — any selection below
//     VISUAL_BEAT_LOW_CONFIDENCE_AT lands in the receipt's
//     lowConfidenceIds; a no-result beat carries a DECLARED fallback
//     (never silent).
//   · DETERMINISM — same narration + candidates → the same receipt, byte
//     for byte (candidate ORDER is irrelevant: the rank is the law, the
//     tiebreak is the id). The fingerprint is the pure FNV-1a roll over
//     the canonical receipt form — the planner-hash pattern, no crypto.
//   · PLANNING ARTIFACT (the W2 compile-only law's cousin): beats ride
//     plannerMeta, never the scene grammar. The doc never carries a beat.
//
// Pure and client-safe: no fs, no clock, no network, no randomness, no
// node: imports (the palette may reuse the vocabulary later).
//
// THE SEAM LAW (the native-defaults precedent): this module is LEAF-CLEAN
// — it imports nothing from ./index because planners/index imports the
// lane planners that adopt this module (a cycle the seam forbids). The
// fingerprint rolls the planner-hash pattern (FNV-1a 32-bit) as a local
// copy — one hash pattern, two homes, the cycle is the reason.

// ---------------------------------------------------------------------------
// The closed vocabularies (the plan's §12 contract, verbatim names)
// ---------------------------------------------------------------------------

export const VISUAL_INTENTS = [
  "introduce",
  "explain",
  "compare",
  "transform",
  "emphasize",
  "warn",
  "conclude",
] as const;
export type VisualIntent = (typeof VISUAL_INTENTS)[number];

export const VISUAL_TIMING_SOURCES = ["word", "sentence", "estimated"] as const;
export type VisualTimingSource = (typeof VISUAL_TIMING_SOURCES)[number];

/** Below this confidence a selection is SURFACED as low-confidence (the
 *  receipt's lowConfidenceIds) — the plan's observability ask. */
export const VISUAL_BEAT_LOW_CONFIDENCE_AT = 0.4;

/** The matcher-driven selection band: at most this many candidates ride a
 *  single beat (the plan's per-beat cap). */
export const VISUAL_BEAT_MAX_SELECTED = 3;

/** A no-result beat's declared confidence — honest: the resolver matched
 *  nothing, and the receipt must say so. */
export const VISUAL_BEAT_FALLBACK_CONFIDENCE = 0.25;

// ---------------------------------------------------------------------------
// The contract shapes
// ---------------------------------------------------------------------------

/** One candidate the resolver may select — an id the caller vouches for
 *  (a catalog row, a registry member, a lane's own closed cast) plus its
 *  match vocabulary. Weight bands: concepts 3, aliases 2, tags 1. */
export interface VisualBeatCandidate {
  id: string;
  concepts?: readonly string[];
  aliases?: readonly string[];
  tags?: readonly string[];
}

/** The plan's VisualBeat, verbatim fields. `order` is the selection order
 *  (rank order — the draw/enter order the lane should read). */
export interface VisualBeat {
  id: string;
  sentenceId: string;
  narrationSpan: { startMs: number; endMs: number };
  concept: string;
  visualIntent: VisualIntent;
  candidateIds: string[];
  selectedIds: string[];
  order: string[];
  emphasisIds?: string[];
  confidence: number;
  timingSource: VisualTimingSource;
  fallback?: string;
}

/** Why a selection happened (the receipt's explain surface). */
export interface VisualBeatReason {
  id: string;
  why: string;
  weight: number;
}

/** Why a sentence never became a beat (or a candidate never got picked). */
export interface VisualBeatDiscard {
  sentenceId: string;
  reason: string;
}

/** The explainable receipt for one scene's narration. */
export interface VisualBeatReceipt {
  sceneId: string;
  beats: VisualBeat[];
  reasons: VisualBeatReason[];
  discarded: VisualBeatDiscard[];
  lowConfidenceIds: string[];
  fingerprint: string;
}

/** The additive plannerMeta row (planner-types re-exports the shape) — the
 *  serialized receipt surface a lane plan may carry. */
export interface VisualBeatRow {
  sceneId: string;
  concept: string;
  visualIntent: VisualIntent;
  candidateIds: string[];
  selectedIds: string[];
  order: string[];
  confidence: number;
  timingSource: VisualTimingSource;
  fallback?: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// The intent classifier — cue tables, first hit wins, the order IS the law
// ---------------------------------------------------------------------------

/** Explicit intent cues, priority order: warn > conclude > compare >
 *  transform > emphasize. A sentence with none of these is "explain" —
 *  except the FIRST content beat of a scene, which is "introduce" (the
 *  scene opens by naming its subject). */
const INTENT_CUES: readonly { intent: VisualIntent; re: RegExp }[] = [
  {
    intent: "warn",
    re: /\b(warning|warns|danger|dangerous|risk|risks|alert|alerts|caution|emergency|unsafe|hazard)\b/i,
  },
  {
    intent: "conclude",
    re: /\b(in summary|to summarize|in conclusion|conclusion|conclude|finally|to wrap up|the takeaway|so remember|bottom line)\b/i,
  },
  {
    intent: "compare",
    re: /\b(compared?|comparing|versus|vs\.?|whereas|instead|difference|differences|more than|less than|fewer|outperforms?|against)\b/i,
  },
  {
    intent: "transform",
    re: /\b(becomes?|became|turns? into|turned into|grows? into|grew into|transforms?|transforms into|evolves? into|changes? into|then|after that)\b/i,
  },
  {
    intent: "emphasize",
    re: /\b(key|crucial|critical|important|importance|essential|vital|significant|notably|remarkably|biggest|largest|highest|most)\b/i,
  },
] as const;

/** Classify one sentence's intent. `isFirstContentBeat` pins the
 *  introduce law. Pure and deterministic. */
export function classifyVisualIntent(sentence: string, isFirstContentBeat: boolean): VisualIntent {
  for (const cue of INTENT_CUES) {
    if (cue.re.test(sentence)) return cue.intent;
  }
  return isFirstContentBeat ? "introduce" : "explain";
}

// ---------------------------------------------------------------------------
// Tokenization + term matching (pure, deterministic)
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  "the", "and", "but", "for", "with", "from", "that", "this", "these", "those",
  "are", "was", "were", "been", "being", "have", "has", "had", "will", "would",
  "could", "should", "shall", "may", "might", "must", "can", "cannot", "into",
  "onto", "about", "after", "before", "between", "through", "during", "under",
  "over", "again", "then", "than", "when", "where", "which", "while", "who",
  "whom", "whose", "why", "how", "what", "its", "their", "there", "here",
  "they", "them", "she", "her", "his", "him", "our", "your", "you", "not",
  "nor", "also", "just", "only", "very", "some", "any", "each", "every",
  "all", "both", "few", "more", "most", "other", "such", "own", "same", "so",
  "too", "does", "did", "doing", "done", "get", "gets", "got", "because",
  "even", "ever", "like", "make", "made", "makes", "much", "many", "now",
  "one", "two", "three", "per", "via", "off", "out", "up", "down", "yet",
]);

/** Content words of a sentence: lowercased, punctuation stripped, length
 *  ≥ 3, stopword-free. Deterministic order (first occurrence). */
export function contentWords(sentence: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of sentence.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)) {
    if (w.length < 3 || STOPWORDS.has(w) || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface TermHit {
  candidateId: string;
  term: string;
  weight: number;
  band: "concept" | "alias" | "tag";
}

/** Every (candidate, term) hit in the sentence — deterministic: sorted by
 *  weight desc, then band rank (concept < alias < tag), then term, then
 *  candidateId. */
function termHits(sentence: string, candidates: readonly VisualBeatCandidate[]): TermHit[] {
  const hits: TermHit[] = [];
  for (const cand of candidates) {
    const bands: readonly { band: TermHit["band"]; terms?: readonly string[]; weight: number }[] = [
      { band: "concept", terms: cand.concepts, weight: 3 },
      { band: "alias", terms: cand.aliases, weight: 2 },
      { band: "tag", terms: cand.tags, weight: 1 },
    ];
    for (const { band, terms, weight } of bands) {
      if (terms === undefined) continue;
      for (const term of terms) {
        if (term.trim() === "") continue;
        if (new RegExp(`\\b${escapeRe(term.toLowerCase())}\\b`, "i").test(sentence)) {
          hits.push({ candidateId: cand.id, term, weight, band });
        }
      }
    }
  }
  return hits.sort((a, b) => {
    if (a.weight !== b.weight) return b.weight - a.weight;
    const bandRank = (x: TermHit["band"]) => (x === "concept" ? 0 : x === "alias" ? 1 : 2);
    if (bandRank(a.band) !== bandRank(b.band)) return bandRank(a.band) - bandRank(b.band);
    if (a.term !== b.term) return a.term < b.term ? -1 : 1;
    if (a.candidateId !== b.candidateId) return a.candidateId < b.candidateId ? -1 : 1;
    return 0;
  });
}

// ---------------------------------------------------------------------------
// The rotation-driven honest constructor
// ---------------------------------------------------------------------------

/** Declare ONE beat row for a rotation-driven selection. This constructor
 *  INVENTS NOTHING: the concept and intent ride the caller's extraction
 *  (or the shared classifier), the selection rides the lane's own
 *  deterministic rule, and `reason` must NAME the rule (a receipt that
 *  claims a semantic match the selector never made would be a lie — the
 *  battery pins that a rotation reason names "rotation"/"hash"/"rule").
 *  Unknown intent/timingSource THROW (closed tables, fail-closed). */
export function declareVisualBeatRow(input: {
  sceneId: string;
  concept: string;
  visualIntent: VisualIntent;
  candidateIds: readonly string[];
  selectedIds: readonly string[];
  confidence: number;
  timingSource?: VisualTimingSource;
  fallback?: string;
  reason: string;
}): VisualBeatRow {
  if (!VISUAL_INTENTS.includes(input.visualIntent)) {
    throw new Error(
      `visual-beats: unknown visual intent "${input.visualIntent}" — the closed vocabulary is [${VISUAL_INTENTS.join(", ")}]`,
    );
  }
  const timingSource = input.timingSource ?? "estimated";
  if (!VISUAL_TIMING_SOURCES.includes(timingSource)) {
    throw new Error(
      `visual-beats: unknown timing source "${timingSource}" — the closed vocabulary is [${VISUAL_TIMING_SOURCES.join(", ")}]`,
    );
  }
  if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) {
    throw new Error(`visual-beats: confidence must be a finite number in [0, 1] (got ${String(input.confidence)})`);
  }
  const reason = input.reason.trim();
  if (reason === "") {
    throw new Error("visual-beats: a beat row's reason must not be empty — every selection is explainable");
  }
  if (!/\b(rotation|hash|rule|cycle|cue|index|parity|fallback)\b/i.test(reason)) {
    throw new Error(
      `visual-beats: a rotation-driven beat row's reason must NAME the rule that fired ("${reason}" names none of rotation|hash|rule|cycle|cue|index|parity|fallback)`,
    );
  }
  const selectedIds = [...input.selectedIds];
  const candidateSet = new Set(input.candidateIds);
  for (const id of selectedIds) {
    if (!candidateSet.has(id)) {
      throw new Error(
        `visual-beats: the selection "${id}" is not among the declared candidates — a receipt may only name ids the caller vouched for (the dead-end law)`,
      );
    }
  }
  return {
    sceneId: input.sceneId,
    concept: input.concept,
    visualIntent: input.visualIntent,
    candidateIds: [...input.candidateIds],
    selectedIds,
    order: [...selectedIds],
    confidence: Math.round(input.confidence * 100) / 100,
    timingSource,
    ...(input.fallback !== undefined ? { fallback: input.fallback } : {}),
    reason,
  };
}

// ---------------------------------------------------------------------------
// The matcher-driven resolver
// ---------------------------------------------------------------------------

export interface DeriveVisualBeatsInput {
  sceneId: string;
  narration: string;
  candidates: readonly VisualBeatCandidate[];
  /** The scene's declared clock (ms) — the span math divides it across
   *  the sentences by character share. Positive finite; required. */
  sceneDurationMs: number;
  /** The declared fallback id for no-result beats (the plan's "no-result
   *  behavior produces a declared fallback"). Absent → "none". */
  fallbackId?: string;
  /** Candidates a PREVIOUS beat/scene already used — they stay visible in
   *  candidateIds (observability) but the selection skips them when a
   *  fresh alternative exists. */
  previouslySelectedIds?: ReadonlySet<string>;
  /** The timing source declaration (word anchors measured? sentence
   *  spans?). Default "estimated" (the honest planner default). */
  timingSource?: VisualTimingSource;
  maxSelectedPerBeat?: number;
}

/** The matcher-driven resolver: sentence segmentation → per-sentence term
 *  retrieval → deterministic ranking → the top band → the receipt. Same
 *  inputs → the same receipt, byte for byte; candidate order is
 *  irrelevant (the rank is the law, the tiebreak is the id). */
export function deriveVisualBeats(input: DeriveVisualBeatsInput): VisualBeatReceipt {
  const { sceneId, narration, candidates, sceneDurationMs } = input;
  if (!Number.isFinite(sceneDurationMs) || sceneDurationMs <= 0) {
    throw new Error(`visual-beats: ${sceneId} needs a positive finite sceneDurationMs for the span math (got ${String(sceneDurationMs)})`);
  }
  const maxSelected = input.maxSelectedPerBeat ?? VISUAL_BEAT_MAX_SELECTED;
  if (!(maxSelected >= 1)) {
    throw new Error(`visual-beats: maxSelectedPerBeat must be >= 1 (got ${String(maxSelected)})`);
  }
  const sentences = narration
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
  const beats: VisualBeat[] = [];
  const reasons: VisualBeatReason[] = [];
  const discarded: VisualBeatDiscard[] = [];
  const lowConfidenceIds: string[] = [];

  // The span math: proportional by character share, floor-accumulate, the
  // last sentence takes the remainder (the groupEven pattern — no lost
  // milliseconds, no float drift).
  const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);
  let cursor = 0;
  let contentBeatIndex = 0;
  const previouslySelected = input.previouslySelectedIds;

  for (const [i, sentence] of sentences.entries()) {
    const sentenceId = `${sceneId}-sentence-${i + 1}`;
    const startMs = totalChars > 0 ? Math.floor((sceneDurationMs * cursor) / totalChars) : 0;
    cursor += sentence.length;
    const endMs = totalChars > 0 && i === sentences.length - 1
      ? sceneDurationMs
      : totalChars > 0
        ? Math.floor((sceneDurationMs * cursor) / totalChars)
        : 0;
    if (startMs > endMs) {
      // Degenerate (zero-length sentence) — discard with reason, never a
      // negative span.
      discarded.push({ sentenceId, reason: "degenerate span — the sentence carries no measurable narration" });
      continue;
    }

    const words = contentWords(sentence);
    if (words.length === 0) {
      discarded.push({ sentenceId, reason: "no content terms — the sentence is pure connective tissue" });
      continue;
    }

    const hits = termHits(sentence, candidates);
    if (hits.length === 0) {
      discarded.push({
        sentenceId,
        reason: "no candidate matched — the sentence's terms are outside the declared candidate vocabulary",
      });
      continue;
    }

    // Aggregate scores per candidate (multi-hit sums outrank single-hit),
    // rank score desc then id asc. THE ANTI-REPEAT LAW: fresh candidates
    // outrank previously-used ones at the SAME rank band — the selection
    // draws from the fresh pool when one exists (the board prefers a
    // genuinely different cast), fills from the full pool only when the
    // vocabulary is exhausted, and reports EVERY scored-but-unselected
    // candidate with its reason.
    const scores = new Map<string, number>();
    const whyTerms = new Map<string, string[]>();
    for (const hit of hits) {
      scores.set(hit.candidateId, (scores.get(hit.candidateId) ?? 0) + hit.weight);
      const list = whyTerms.get(hit.candidateId) ?? [];
      if (!list.includes(hit.term)) list.push(hit.term);
      whyTerms.set(hit.candidateId, list);
    }
    const ranked = [...scores.entries()].sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0] < b[0] ? -1 : 1;
    });
    const fresh = ranked.filter(([id]) => !previouslySelected?.has(id));
    const pool = fresh.length > 0 ? fresh : ranked;
    const selected = pool.slice(0, maxSelected).map(([id]) => id);
    for (const [id, score] of ranked) {
      if (selected.includes(id)) {
        reasons.push({
          id,
          why: `matched ${whyTerms.get(id)?.join(", ")} (score ${score}) in ${sentenceId}`,
          weight: score,
        });
      } else if (previouslySelected?.has(id)) {
        discarded.push({ sentenceId, reason: `candidate "${id}" excluded — already selected in a previous beat` });
      } else {
        discarded.push({ sentenceId, reason: `candidate "${id}" ranked below the selection band` });
      }
    }

    const totalScore = scores.get(selected[0]) ?? 0;
    const confidence = Math.min(0.95, Math.round((1 - 1 / (1 + totalScore)) * 100) / 100);
    const intent = classifyVisualIntent(sentence, contentBeatIndex === 0);
    contentBeatIndex++;
    const beat: VisualBeat = {
      id: `${sceneId}-beat-${beats.length + 1}`,
      sentenceId,
      narrationSpan: { startMs, endMs },
      concept: whyTerms.get(selected[0])?.[0] ?? words.slice(0, 2).join(" "),
      visualIntent: intent,
      candidateIds: ranked.map(([id]) => id),
      selectedIds: selected,
      order: [...selected],
      confidence,
      timingSource: input.timingSource ?? "estimated",
    };
    if (intent === "emphasize" && selected.length > 0) {
      beat.emphasisIds = [selected[0]];
    }
    if (confidence < VISUAL_BEAT_LOW_CONFIDENCE_AT) {
      lowConfidenceIds.push(...selected);
    }
    beats.push(beat);
  }

  if (beats.length === 0 && sentences.length > 0) {
    // The no-result law: a declared fallback beat (never silent) — the
    // scene still gets ONE beat row naming the declared fallback.
    const words = contentWords(narration);
    const fallbackId = input.fallbackId ?? "none";
    const beat: VisualBeat = {
      id: `${sceneId}-beat-1`,
      sentenceId: `${sceneId}-sentence-1`,
      narrationSpan: { startMs: 0, endMs: sceneDurationMs },
      concept: words.slice(0, 2).join(" ") || "untitled",
      visualIntent: "introduce",
      candidateIds: candidates.map((c) => c.id),
      selectedIds: [],
      order: [],
      confidence: VISUAL_BEAT_FALLBACK_CONFIDENCE,
      timingSource: input.timingSource ?? "estimated",
      fallback: fallbackId,
    };
    lowConfidenceIds.push(fallbackId);
    discarded.push({
      sentenceId: `${sceneId}-sentence-1`,
      reason: `no candidate matched any sentence — declared fallback "${fallbackId}"`,
    });
    beats.push(beat);
  }

  return {
    sceneId,
    beats,
    reasons,
    discarded,
    lowConfidenceIds,
    fingerprint: beatFingerprint({ sceneId, beats, reasons, discarded, lowConfidenceIds }),
  };
}

// ---------------------------------------------------------------------------
// The fingerprint — pure FNV-1a over the canonical receipt form (the
// planner-hash pattern: deterministic, dependency-free, client-safe)
// ---------------------------------------------------------------------------

/** FNV-1a 32-bit — the planner-hash pattern (planners/index's stableHash),
 *  local by the seam law (see the header). */
function stableHash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function beatFingerprint(receipt: {
  sceneId: string;
  beats: VisualBeat[];
  reasons: VisualBeatReason[];
  discarded: VisualBeatDiscard[];
  lowConfidenceIds: string[];
}): string {
  const canonical = JSON.stringify([
    receipt.sceneId,
    receipt.beats.map((b) => [
      b.id,
      b.sentenceId,
      b.narrationSpan.startMs,
      b.narrationSpan.endMs,
      b.concept,
      b.visualIntent,
      b.candidateIds,
      b.selectedIds,
      b.order,
      b.emphasisIds ?? null,
      b.confidence,
      b.timingSource,
      b.fallback ?? null,
    ]),
    receipt.reasons.map((r) => [r.id, r.why, r.weight]),
    receipt.discarded.map((d) => [d.sentenceId, d.reason]),
    receipt.lowConfidenceIds,
  ]);
  return `wb-beats-${stableHash(canonical).toString(16)}`;
}

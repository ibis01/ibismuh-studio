# Visual-beat receipts — the shared WS7 contract lands

Date: 2026-11-26
Scope: the engineering master plan's WS7 ("semantic planner and visual
beats") — the shared VisualBeat contract, the deterministic resolver, and
the explainable receipt surface, adopted additively by both lane planners.
Status: IMPLEMENTED — visual-beats battery green (34 laws, six suites),
unit suite green (1064/0, byte-stable), plan-contracts green, catalog
green, design-system green, stage-cache green, video-lanes green,
ui-events green, typecheck clean, lint clean.

## The deficiency this slice removes

The planners KNEW what they chose but could not SAY why. A lane plan
carried `plannerMeta.note` ("llm deck plan accepted (5 scenes)") — one
line for the whole plan. The master plan's ask is per-beat observability:
which concept each scene boarded, the classified visual intent, the ranked
candidates, the selection with its reasons, the confidence, and the
declared fallback — "planner receipts explain why assets were selected".

## The design: one contract, two honest constructors

**The contract** (`planners/visual-beats.ts`) carries the plan's §12
shapes verbatim: `VisualBeat` (id, sentenceId, narrationSpan, concept,
visualIntent, candidateIds, selectedIds, order, emphasisIds, confidence,
timingSource, fallback), closed vocabularies for intent (introduce /
explain / compare / transform / emphasize / warn / conclude) and timing
source (word / sentence / estimated), and the receipt
(reasons / discarded / lowConfidenceIds / fingerprint).

**Two constructors, because honesty demands both:**

- `deriveVisualBeats` — the MATCHER-DRIVEN resolver: sentence
  segmentation, per-sentence term retrieval over the caller's candidate
  table (concepts weight 3 / aliases 2 / tags 1), deterministic ranking
  (score desc, id asc — candidate order is irrelevant, pinned by the
  shuffle law), the top-band selection (cap 3), the anti-repeat law
  (fresh candidates outrank used ones; every scored-but-unselected
  candidate is reported), proportional span math (floor-accumulate, no
  lost milliseconds), and the no-result law (ONE declared fallback beat
  at confidence 0.25, surfaced low-confidence).
- `declareVisualBeatRow` — the ROTATION-DRIVEN honest constructor: a
  lane whose selection is an index rotation or a hash parity records what
  it chose and NAMES THE RULE (a receipt claiming a semantic match the
  selector never made would be a lie — the reason law refuses any row
  whose reason names none of rotation|hash|rule|cycle|cue|index|parity|
  fallback), and the dead-end law holds at the beat layer too (a
  selection outside the declared candidates refuses BY NAME).

**The intent classifier** rides cue tables in priority order (warn >
conclude > compare > transform > emphasize), the first content beat
introduces, the default explains. The fingerprint is the planner-hash
pattern (FNV-1a 32-bit) over the canonical receipt form — pure, no
crypto, client-safe.

**The seam law**: the module is leaf-clean — it imports nothing from
planners/index (which imports the lane planners that adopt it; a cycle
the native-defaults precedent forbids). The FNV copy lives locally with
the reason in the header.

## The adoption — additive, byte-stable

`plannerMeta` gains the OPTIONAL `beats?: PlannerBeatRow[]` (typed in
planner-types, redeclared there import-cycle-free). Both lane planners
emit the rows:

- **graphics** (`planners/graphics.ts`): one row per scene — the
  rotation rule named, the classified intent (the versus cue reads the
  data scene as "compare", the in-conclusion cue as "conclude"), the
  real-data confidence 0.9 / pseudo 0.5, and the pseudo-stat's DECLARED
  fallback ("pseudo-stat declared").
- **whiteboard** (`planners/whiteboard.ts`): one row per board — the
  deterministic board cast named, the drawn roles listed (frame,
  underline, the hash-rotated shapes, the parity glyph), confidence 0.6.

The DTO mapper passes the rows through additively (typed rows only — a
malformed row never blocks the DTO; the receipt is observability, not
load-bearing data). The SCENE BYTES are untouched: the battery pins the
graphics components' canonical form and the whiteboard stroke IR's
opening strokes byte-identically.

## The battery (34 laws, six suites)

CONTRACT (closed vocabularies, fail-closed constructors, the dead-end
law, the reason law) / INTENT (cue priority pinned) / RESOLVER (weight
bands, multi-hit sums, tie-breaks, the cap, order-independence, the
anti-repeat laws, the span partition) / RECEIPT (explainability,
emphasis, the fingerprint) / FALLBACK (the no-result law, empty
narration, connective tissue) / ADOPTION (both lane planners honest,
scene bytes pinned).

## Deliberately not here

- Word-anchor timing (`timingSource: "word"`) — the capability-truth
  surface reports ASR word timestamps as unavailable; the resolver takes
  the source as a DECLARED input and the vocabulary rides, but no lane
  claims "word" yet.
- Per-beat EVENT compilation — the whiteboard engine's own W2 beat
  compiler already compiles beats to events at the scheduling seam; this
  contract is the receipt layer above it, not a second compiler.

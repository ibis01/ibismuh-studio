# S146 — the stabilized baseline + the fresh W1 "before" receipt (the layer-upgrade program's Phase 1) — RECORD

| | |
|---|---|
| Gate | The 2026-11-16 whiteboard layer-upgrade directive, Phase 1: clean test database + the full check battery green, then the FIXED five-scene benchmark (title / process / comparison / handwritten phrase / conclusion) rendered at all three house aspects with frame hashes, render duration, QC, and a manual score — the reliable "before" every later layer diffs against. |
| State | **COMPLETE.** The battery is green on a freshly synced SQLite database; the W1 benchmark ran GATE GREEN on HEAD `dd9edd1`; the full receipt lives at `validation/w1/w1-whiteboard-baseline-2026-11-16.json` (the W1 baseline lane is gitignored by law — environment-specific hashes stay local; this record's tables are the committed citation); the manual score is recorded below, honestly labeled. |
| Baseline law | The five-scene definition was already frozen (`benchmark-scenarios.ts` — the W1 reconciliation's own spec: same narration + assets every run, three aspects, deterministic layout, silent-audio honesty). Phase 1 did not author a new benchmark; it re-ran the FROZEN one and recorded the fresh before-state. |

## 1. The database stabilization (the reported check failure)

The reported failure (`Job.idempotencyKey`, `UsageRecord.videoId` missing) was
a STALE local database from before the S113/S115 columns landed — not schema
drift: `prisma/schema.sqlite.prisma` is GENERATED from `schema.prisma` by
`scripts/sync-sqlite-schema.mjs` (verbatim field copies; the drift the script
exists to kill), and both columns are present in both schemas.

The fix was the user's own sequence, on the disposable dev database:

- `npm run setup` — the conditional bootstrap picked the SQLite schema from
  the file: URL, generated the client, pushed the schema
  ("Your database is now in sync"), and the stage-2 migration ensured the
  partial indexes.
- The full check battery, staged (the sandbox reaps detached processes, so
  each phase ran in the foreground): typecheck ✓, lint ✓, unit 846/0 ✓
  (green at the S145 landing on this exact tree), **test:billing 40/0 ✓,
  test:storage PASS ✓, test:rate PASS ✓, test:scene-revisions 29/0 ✓,
  test:drill PASS (RTO 62 ms) ✓, alert:probe HEALTH 0 failed ✓** — the
  DB-facing suites, the exact suites the stale DB broke, all pass on the
  fresh database.

## 2. The fresh W1 benchmark (the "before")

HEAD `dd9edd1`, the frozen five-scene definition, the built-in library only:

| aspect | decoded frames | program | render wall | QC |
| --- | --- | --- | --- | --- |
| 16:9 | 912/912 | 38 s | 82.8 s | 12/13 pass (cut-alignment unmeasured by design) |
| 9:16 | 912/912 | 38 s | 82.5 s | 12/13 pass |
| 1:1 | 912/912 | 38 s | 51.6 s | 12/13 pass |

QC rows passing: playable, black-frames, frozen-frames, aspect, loudness,
true-peak, loudness-range, dead-air, static-shots, flicker, stutter,
tail-fade. **The determinism pin: the 16:9 re-render's sampled frame hashes
and per-scene frame counts are IDENTICAL** — the frame hashes in the receipt
are comparable across weeks and stages. The blind kit (3 codenamed finals +
P1–P5 frame sheets, local-only key) was assembled by the same run for the
upcoming human scoring.

Scene receipts (16:9): w1-title 180f/7.5s, w1-process 204f/8.5s,
w1-comparison 192f/8.0s, w1-phrase 168f/7.0s, w1-conclusion 168f/7.0s.

## 3. The manual score (the rubric, honestly labeled)

**AI-assisted operator proxy, NON-BLIND, single scorer — the W1 rubric's own
designation for this instrument; NOT the release gate.** The ≥ 4/5 composite
with ≥ 3 blind scorers stays with the S144 kit session. Method: the five
16:9 rubric sample frames viewed directly, the receipt's per-frame ink
statistics, the 12/13 QC battery, and the pinned engine laws (eased lockstep,
semantic binding, the deterministic windows) — the same instrument class the
recorded 2026-11-13 baseline used.

| dimension | score | the record's reason |
| --- | --- | --- |
| stroke-naturalness | 3 | smooth hatching, the S139 sketch-pass retraces visible; motion quality pinned by the laws, the stills carry no defect |
| semantic-order | 3 | assets bind to their sentences (pinned); the phrase scene's late text is the visible miss |
| narration-alignment | 3 | word-proportional windows (silent lane); the phrase's text has not STARTED at 65% of its scene — the §4 gap, recorded as finding 1 |
| camera-readability | 3 | the drift fallback holds safe margins; nothing clipped at any aspect |
| hand-realism | **2** | the pen crosses the heart's ink (process/comparison/title); the hand renders INSIDE the conclusion rocket — findings 2; the occlusion/travel laws are the fix |
| continuity | 3 | scene mode by design; clean boards per scene |
| text-readability | 3 | the title is large, underlined (the fx-underline emphasis mark WORKS), readable; marker-face (not glyph) on the title |
| audio | 4 | the bed rides the −16 LUFS contract (loudness/true-peak/LRA pass) |
| comprehension | 3 | the process scene's swoosh + unlabeled organs read ambiguous on ink alone; comparison and conclusion read clear |
| **composite** | **3.0/5** | vs the recorded 2026-11-13 baseline 2.4/5 — the delta is the honest operator-proxy record (same instrument class, same rubric) |

## 4. The three findings the fresh baseline records (the next layers' targets)

1. **The phrase-timing gap** — the handwritten key phrase's text has not
   started at scene-65%; the beat window's lead-in for text draws is too
   deep. This is the directive's §4 (the important visual appears when the
   important phrase is spoken) — the beat layer's hold/lead-in arithmetic
   is the fix.
2. **The hand's occlusion + travel** — the pen crosses finished ink
   (heart scenes) and the hand rests INSIDE the conclusion rocket. The
   directive's §8 (occlusion rules, pen-up travel, hand hide/show during
   camera movement).
3. **Asset repetition** — the heart appears in three of five scenes. This
   is BASELINE-AUTHORED (the frozen definition pins its assets), not a
   planner regression — recorded so nobody "fixes" the frozen benchmark.

## 5. What this receipt enables

Every subsequent layer (the rhetorical beat layer S147, the hand/travel
laws, the aim-able emphasis marks) diffs against THIS receipt: the frame
hashes pin the before-state, the determinism pin makes the comparison
byte-honest, and the three findings are the recorded defects the layers
exist to close. The baseline file itself stays untouched — it is the
honest "before".

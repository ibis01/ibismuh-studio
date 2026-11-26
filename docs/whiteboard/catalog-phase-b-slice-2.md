# Phase B slice 2 — multi-pick layouts: the planner lanes emit the count

Date: 2026-11-25
Scope: the re-audit's Phase B second slice — "planner lanes emitting repeats",
the honest remainder's first item after slice 1 (placement identity) unblocked
it. Status: IMPLEMENTED — multipick battery green (16 laws, five suites), unit
suite green (fixture updated to the new contract), typecheck clean, lint
clean, full check chain green.

## The defect this slice removes

Slice 1 made repeated placement SAFE everywhere below the planner: two
placements of one asset schedule, render, carry, beat and round-trip under
placement identity. But the PLANNER LANES still refused to produce one — the
native scaffold kept one placement per concept (its anti-repeat exclusions),
and the LLM lane DROPPED the model's repeat ("the engine supports repeated
instances via placementIds — the LLM lane plans one placement per concept for
now"). A narration that literally numbered its concept ("two coins", "revenue
doubled") still boarded ONE coin. The engine could host the count; nobody
wrote it.

## The design: the count lane

### The native scaffold (the rule-table lane)

`whiteboard-planner.ts` resolves each rich-path scene's primary pick through
`resolvePick` — the old `pickForScene` PLUS the rule that fired (a
fallback-cycle pick carries `rule: null`). The new `multiPickCue(narration,
rule)` asks one question: does the SAME SENTENCE that matched the rule also
name a small plural count? The vocabulary is words only —
`two|three|both|pair|couple|twin|double|doubled|twice` — deliberately NOT
bare numerals (a fixture titled "Beat 2" twin-boarded its concept in the
sandbox receipt; "2"/"3" number anything), not "one" (singular), not
"several"/"many" (vague — no honest instance count).

On a cue, the middle scene boards the pick TWICE under explicit placement
ids — first instance named with the bare assetId (`coin`), second derived
through the editor's own law (`derivePlacementId` → `coin-2`), one derivation
everywhere. Both are named because the engine's ambiguity law refuses
unaddressed events in a multi-instance scene: a named pair keeps the scaffold
editable and the fail-closed law can never bite a blind edit. The twin rides
the scene's parity support slot (proven geometry, no new constants), and the
support pick steps aside — the count IS the scene's second concept.

The laws that keep it additive:

- **sentence-scoped**: the cue must share the sentence with the rule hit —
  "The cost rose. Two years later the market calmed." never twins;
- **rule-scoped**: fallback picks never repeat (no narration evidence);
- **card-scoped**: opener/closer scenes never repeat (the cards own those
  boards);
- **legacy-frozen**: the legacy path (no generated cards) never repeats —
  the S137 additive law holds byte-for-byte;
- **cue-less-frozen**: a rich scene without a cue emits NO placementId field
  anywhere — byte-identical to slice 1's output;
- **deterministic**: same scenes → the same project bytes, twin lane
  included.

The known looseness, stated honestly: the cue is SENTENCE-scoped, not
noun-attached — "The cost of two tickets at the fair" twins whatever concept
the sentence's pick resolved to. The failure mode is mild (one extra repeated
concept on a board the planner already guessed at), never a broken board
(keys unique, validator green). A tightened window around the rule's match
position is a deliberate follow-up if boards earn it.

### The LLM lane

`normalizeLlmScenePlans` replaces the hard one-per-asset dedupe with a
repeat-cap law: `WB_PLANNER_MAX_REPEATS_PER_ASSET = 2` ("two coins" is the
teachable count; a third instance is clutter). The FIRST repeat retroactively
names the pair via the editor's derivation; every instance of a repeated
asset carries an explicit placementId; a single-instance pick carries NONE —
the wire stays byte-shaped for every scene served without a repeat. The
system prompt's "Never repeat an asset within one scene" became the counted-
repeat law (repeat ONLY on an explicit count, at most two instances, the
engine names them); the prompt is now exported so the battery pins the
wording.

### The repair lane

`repairWhiteboardSceneDoc` treats a twin pair as ONE concept: both instances
swap to the same new asset (a `swapFor` memo keyed by assetId), and the
placement ids survive untouched — they are ADDRESSES, not labels; renaming
would orphan every event that targets them. A repair changes WHAT is drawn,
never HOW MANY.

### The accounting law (a latent bug the repeat exposed)

Two more honesty upgrades rode the same normalize loop:

1. The over-cap tail accounting indexed raws from `maxPicks` positionally —
   drops inside the loop shifted the index, so a dropped pick could be
   double-accounted and a valid tail pick mislabeled. The loop now runs over
   EVERY raw pick with no early break: each gets exactly one verdict with
   its MOST SPECIFIC reason (an over-cap repeat names the repeat cap, not
   the positional one).
2. `composeLlmScaffold`'s beat-ordering comparator returned -1 whenever a
   rank existed — self-contradictory for two picks of EQUAL rank, which
   repeats made reachable (a pair shares one beat sentence). V8's sort
   ordered the pair non-deterministically. The tiebreak is now the model's
   own order (the pick's index).

## What landed (files)

- `src/lib/ibismuh/whiteboard/whiteboard-planner.ts` — `resolvePick` +
  `ResolvedPick`, `multiPickCue` + `MULTI_PICK_CUE_RE`, the count lane in the
  rich middle scenes, the repair lane's pair memo.
- `src/lib/ibismuh/whiteboard/llm-planner.ts` — `WB_PLANNER_MAX_REPEATS_PER_ASSET`,
  `NormalizedConceptPick.placementId`, the inline-accounting normalize loop
  (repeat-cap + named pairs), the compose pass-through (ids only when
  present) + comparator fix, the exported prompt's counted-repeat law.
- `scripts/test-whiteboard-multipick.mts` — 16 laws across five suites
  (count lane, wire, LLM lane, repair, accounting). Joins `npm run check`
  and the CI check job (`test:whiteboard-multipick` after
  `test:whiteboard-placement`).
- `scripts/test-unit.mts` — the S73 normalize fixture updated to the new
  contract (a repeated pick survives as a named pair; a third instance dies
  with the cap named; a single pick stays field-free). The other S73 pins
  (clamp bands, positional cap, compose pass-through) hold unchanged.
- `package.json` / `.github/workflows/ci.yml` — the battery wired after the
  placement battery.

## What deliberately did NOT land (the honest remainder)

- **The cue-window tightening** — sentence-scoped is the honest simple law;
  a match-adjacent window is a follow-up if boards earn it.
- **Three-plus instances** — the LLM cap is 2; the native lane twins only.
  The ENGINE supports more (validator law); the planners teach with a
  readable pair.
- **Compound asset graphs** — Phase B, next (the audit's order after
  placement identity + multi-pick).
- **The catalog browser UI** — the Phase A search engine still needs its
  palette surface.

## Verification receipts (this slice)

- `npm run test:whiteboard-multipick` — 16/16.
- `npm run test` — unit suite green (one fixture updated, its assertions
  restated to the new contract; no assertion weakened).
- `test:whiteboard-placement` 27/0 · `test:whiteboard-trace` 25/0 ·
  `test:whiteboard-profiles` 22/0 · `test:catalog` 24/0 · the full check
  chain green.
- `npx tsc --noEmit` clean; eslint clean on every touched file.

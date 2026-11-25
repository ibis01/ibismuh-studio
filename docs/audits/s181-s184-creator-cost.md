# S181–S184 — Programmes G + H (Creator Experience + Cost and Performance)

| | |
|---|---|
| Milestones | S181 — Professional Timeline Editor (the pure op layer); S182 — Creative Director Controls; S183 — Production Cost Intelligence; S184 — Affordable Production Mode. |
| Modules | `creator-experience.ts`, `cost-intelligence.ts` — pure, deterministic. |
| Status | **CLOSED (code)** — battery 997/997 (4 new pins), typecheck + lint clean. This closes the S162–S184 programme ladder. |

## S181 — the timeline editor's op layer

The closed six-op set (`resize-scene / move-scene /
replace-background-asset / set-narration / set-transition /
delete-scene`), each returning a NEW project — **edits are data, undo
is the previous project, nothing mutates in place** (pinned). Every op
re-validates the WHOLE project after application: the schema walls, the
provenance closure, the directive gate — an edit cannot edit around
them (a resize below 250 ms refuses; an invented transition refuses
through the S168 validator; a deletion that empties the project
refuses).

## S182 — the beginner drives one knob, the advanced drives all

Three closed presets (`professional / energetic / calm`), each carrying
measured defaults; any knob may be overridden (intensity 0–1, pacing
0.75–1.33, camera style, the S174 narration profile) — always inside
the walls. The camera style compiles into S168 directives, pinned to
survive the validator — **the controls never bypass the vocabulary**.
`applyPacing` scales scene durations within the schema walls and
re-validates.

## S183 — the estimate rides the plan BEFORE generation

`estimateProductionCost` reads the compiled plan's own data: per-line
(script/voice/images/music/rendering/storage), the voice line priced by
the S176 router's cost class (the zero tier books 0 — the estimate
shows the tier's price, and a paid tier's estimate is visibly higher).
`gateBudget` refuses an over-budget plan BEFORE any spend.
`planHashOf` is the content address (stable stringify → sha256, key-
order-independent — pinned); `dedupeCheck` turns the second sighting of
the same hash into REUSE with zero spend — **duplicate-generation
prevention as data** (the render is deterministic, so the same plan's
artifacts are the artifacts).

## S184 — the three modes, the anti-cripple law structural

`MODE_CONTRACTS`: free (zero-cost voice only, asset ceiling at
native+reuse) → standard (freetier allowed, stock ceiling) → premium
(paid allowed, full ladder). `enforceModeCapabilities` hard-refuses
anything above the tier (a paid voice in free mode; a generated asset
in free mode) and asserts `completeVideoPossible: true` — **the free
tier produces COMPLETE videos at every tier because all six engines
render locally; it is never an artificially crippled demonstration**
(the roadmap's own sentence, as a pinned field).

## Acceptance evidence

Battery 997/997 — pins: immutable edits that re-validate (source
untouched, wall refusals, S168-gated transitions); preset resolution +
advanced overrides + pacing inside the walls; the estimate's per-line
honesty (zero-cost voice books 0, compute/storage still book, the paid
tier prices higher), the budget gate firing before generation, the
key-order-independent plan hash, dedupe reuse at zero spend; the mode
ladder's ceilings climbing with tiers, free-mode refusals in both
directions, and the completeness field.

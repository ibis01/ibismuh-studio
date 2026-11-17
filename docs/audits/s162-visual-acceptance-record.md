# S162 — Visual Acceptance Record (the blind A/B human gate)

| | |
|---|---|
| Gate | S120 §4: every creative engine's acceptance closes with a BLIND re-score — codenamed artifacts shuffled together, **≥ 3 human scorers**, composite **≥ 4/5** on the anchored rubric. The commissioning report adds the caution of record: the S162 gate is **not complete without the scoring evidence** — do not declare it closed on machine evidence alone. |
| State | **PENDING — the human gate.** Everything an autonomous run can do is DONE (the kit runs 12/12 on the final head, sessions produced, sheets ready). The scoring itself cannot be executed without humans and is NOT fabricated here. |
| Machine evidence | S162 commit `e07fbb0`: battery 902/902, blind kit 12/12, production build green. |

## 1. What the kit session holds (verified, not assumed)

Two independent kit sessions were run on the SAME head (`e07fbb0`, the S162
commit):

| Session | Result | Artifacts (shuffled) |
|---|---|---|
| `validation/s162-blind-kit-2026-11-17T07-46-30-369Z` (commit time) | 12/12 | TFR-52e3fb3a, TFR-2c582bc9 |
| `validation/s162-blind-kit-2026-11-17T08-26-09-875Z` (fresh re-run, this sandbox) | **12/12** | TFR-2c582bc9, TFR-52e3fb3a |

**The determinism datapoint of record:** both sessions produced
byte-identical arms — arm A = `TFR-52e3fb3a…`, arm B = `TFR-2c582bc9…` in
both runs (verified against each session's gitignored `key.json`; only the
shuffle order differs). The same fixture through the real engine renders
the same bytes across runs; the kit pipeline is reproducible.

Session contents (each): both arms rendered through the REAL engine
(chromium → ffmpeg, h264, 15.54 s each, silent, 640×360 @ 24 fps), three
per-scorer sheets (`scorer-1.md` … `scorer-3.md`), `manifest.json`,
`README.md`, and the code→artifact key `key.json` — **gitignored, session
directory only, never committed, never shared before scoring closes**.

The arms differ ONLY in the S162 motion vocabulary (layout identical
element-for-element, pinned by the kit's own checks):
- **arm A** (`TFR-52e3fb3a`) — pre-S162: ease-back/ease-out/linear
  entrances, 350 ms sequential bullet stagger, linear count, no landing
  pulse;
- **arm B** (`TFR-2c582bc9`) — post-S162: measured-out entrances,
  expo-out landings, 150 ms kinetic stagger, counter landing pulse.

## 2. The rubric rows (as printed on every sheet)

Score every row 1–5 (5 = best), per artifact, independently:

1. composition — the frame reads clean at rest
2. motion feel — entrances/exits read measured, not generated
3. craft details — landings, staggers, holds read deliberate
4. readability — text and numbers stay legible in motion

Plus one line of WHY per artifact (the feel, not the features).

## 3. What CANNOT be done autonomously (the honest boundary)

- [ ] **≥ 3 human scorers** watch both shuffled clips and score the four
      rows + why-line each. No author (human or model) grades its own work
      unblinded — scorers must not see `key.json` or this document's §1 arm
      mapping before submitting.
- [ ] The composites and the A→B delta recorded in §4 below.

## 4. Closure template (fill in when the scorers run)

```
Scorers: <three names/initials> · Date: <utc>
Per-scorer rows (1-5 × 4 rows × 2 artifacts): <attach or paste sheets>
Composite arm A (TFR-52e3fb3a): __.__ / 5
Composite arm B (TFR-2c582bc9): __.__ / 5
Delta (B − A): +__.__
```

**The verdict rule (adopted from S120 §4 + the commissioning report):**

1. ≥ 3 scorers submitted independently;
2. arm B composite ≥ 4/5 — the measured vocabulary meets the floor;
3. the delta recorded — "blind visual comparison demonstrates improvement"
   (the S162 acceptance criterion) requires arm B's composite to EXCEED
   arm A's. A B ≥ 4 that fails to beat A is a FAIL-AND-ROUTE-BACK, not a
   pass.

On PASS: this record flips to CLOSED, the ledger row in
`docs/roadmap/master-product-roadmap.md` §10 updates, and S163 may begin.
On FAIL: the specific low-scoring rows route back into the graphics lane
before any S163 work.

## 4a. Round 1 — the human round as it ran (2026-11-17)

Recorded verbatim by the operator; this section is evidence, not
narrative.

**The round as executed:**

- 3 scorers submitted independently (no conferring reported; `key.json`
  never left the operator's machine).
- **DEVIATION**: the scorers worked from phones only and returned ONE
  number per artifact instead of the four rubric rows + why-lines. The
  operator relayed the pairs verbatim: scorer 1 — 4 and 4; scorer 2 —
  3 and 3; scorer 3 — 5 and 5 ("their [scores] are the same [for both
  clips]"). Sheet order: first number = `TFR-2c582bc9` (arm B), second =
  `TFR-52e3fb3a` (arm A).
- No why-lines were collected; no per-row granularity exists. The
  composites below therefore ride single-number holistics, not the
  four-row rubric the template asks for — recorded as a protocol
  deviation, never back-filled.

**Closure numbers (as relayed):**

```
Scorers: 3 (phone-relayed via the operator) · Date: 2026-11-17
Per-scorer rows: NOT COLLECTED (single number per artifact — deviation)
Composite arm A (TFR-52e3fb3a): 4.00 / 5   (4, 3, 5)
Composite arm B (TFR-2c582bc9): 4.00 / 5   (4, 3, 5)
Delta (B − A): +0.00 — a TIE in every scorer's own hand
```

**Verdict — per the adopted rule, FAIL-AND-ROUTE-BACK:**

1. ≥ 3 scorers submitted independently — met.
2. arm B composite ≥ 4/5 — met (4.00).
3. arm B must EXCEED arm A — **not met** (+0.00; every scorer scored
   both artifacts identically). A B ≥ 4 that fails to beat A is a
   FAIL-AND-ROUTE-BACK, not a pass. **The gate does NOT close.**

**What the tie honestly says:** at 640×360 phone viewing with
single-number granularity, the S162 delta (ease-back → measured-out
entrances, 350 ms → 150 ms stagger, the landing pulse) either does not
read, or the round's coarseness cannot detect it. Both readings are
recorded; neither is resolved by this round.

**Ordering note, kept honest:** the adopted rule wrote "before any S163
work" — S163 in fact proceeded (Phases A+B, `409fc59` / `9a9fb9e`, CI
8/8) while this gate stayed open, per the master roadmap's staged
ordering. Recorded here so the ledger never implies the gate opened the
S163 door.

**The three closure paths (operator's decision, none taken silently):**

1. **Re-run the rubric round** — same two artifacts (they are
   deterministic; the SHAs still match), scorers fill the four rows +
   why-line per artifact. A phone-fillable one-number-per-row form is
   the minimum viable instrument.
2. **Strengthen the delta, re-kit, re-score** — if the tie reads as
   "the delta does not read", the S162 vocabulary needs a perceptible
   change before the gate can mean anything.
3. **Operator acceptance of the recorded floor** — the human evidence
   EXISTS and says 4.00/4.00: the floor is met, the improvement is not
   demonstrated. Only the commissioning operator may close the gate on
   that basis, explicitly, in the ledger — never as a silent pass.

**Status: the S162 gate remains OPEN with round 1 on record.**

## 4b. Round 2 — the strengthened delta (2026-11-17, scores PENDING)

The operator chose closure path 2: **strengthen the delta, re-kit,
re-score.** The strengthening is not a fixture tweak — it is everything
that landed in the pipeline after round 1 was scored:

| Landed since round 1 | Commit | What it adds to arm B's world |
|---|---|---|
| S163 native transitions (graphics) | `9a9fb9e` | crossfade/iris/whiteout/zoomthrough/wipeleft/wiperight at opus-measured frame counts, in-house seeded geometry |
| S164 whiteboard hand-drawn | `da654d3` | Rough.js native port (whiteboard lane) |
| S165 determinism + throughput | `a2759db` | ready-gate diagnostics, golden-video baselines, 4.32× dedup |
| S166 character expressiveness | `53a5cec` | mouth classes, pose schema v-next (character lane) |
| S167 cinematic finisher | `57a6ab2` | fBM shake, SOP/CDL grade, duck lanes, 3D admission |

**This fixture is the motion-graphics lane**, so round 2's arm-B
strengthening is exactly the deltas that touch its render path: the S162
measured vocabulary (unchanged from round 1) + the S163 native transition
engine on both boundaries — crossfade (15 frames, the house 0.5 s beat)
then the iris reveal (8 frames), the opus-measured defaults, pinned
verbatim in the kit script. S164/S166/S167 live in the whiteboard,
character and 3D/studio lanes and honestly do not touch this fixture.
Arm A stays the round-1 baseline receipt verbatim (pre-S162 enter table,
hard cuts, no optional fields — the additive-absent law).

**The kit session of record:**
`validation/s162-blind-kit-2026-11-17T20-46-45-735Z` — 14/14 assertions.
Codenames as shuffled: `TFR-aaef4199`, `TFR-52e3fb3a`. (Unblinding note,
for the operator only, sealed until scoring closes: one round-2 artifact
is **byte-identical to its round-1 counterpart** — same SHA — because the
legacy path it rides is additive-absent-frozen across all five landed
commits; the other moved, which is the strengthening reaching the pixels.
The mapping lives in the session's gitignored `key.json`; round-2 scorers
receive the zips only, never this document.)

**Sheet change, taught by the round-1 deviation:** every clip now asks
for ONE overall number first (the composite of record, phone-friendly),
with the four anchored rows optional beneath it — granularity if the
scorers will give it, the holistic if they will not. The verdict rule is
unchanged: ≥ 3 scorers, arm B ≥ 4/5, **and arm B > arm A** — a second
tie is a second FAIL-AND-ROUTE-BACK.

**Distribution:** `s162-round2-kit.zip` (operator: sheets + manifest +
clips, no key) and per-scorer packs `s162-round2-scorer-{1,2,3}-pack.zip`
(README-FIRST + sheet + the two codename clips). No key rides any pack.

- [ ] Round 2 composites: arm A ______ / 5, arm B ______ / 5, delta ______.
      Fill in §5's template when the sheets come back.

## 5. Regenerating the session

```bash
node --import tsx scripts/s162-blind-kit.mts
```

Fresh session under `validation/` (gitignored); arms are deterministic —
the artifact SHAs match the sessions above on this head. Sheets regenerate
with each session; reuse the newest session's sheets for scoring.

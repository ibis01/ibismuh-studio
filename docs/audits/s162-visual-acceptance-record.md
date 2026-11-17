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

## 5. Regenerating the session

```bash
node --import tsx scripts/s162-blind-kit.mts
```

Fresh session under `validation/` (gitignored); arms are deterministic —
the artifact SHAs match the sessions above on this head. Sheets regenerate
with each session; reuse the newest session's sheets for scoring.

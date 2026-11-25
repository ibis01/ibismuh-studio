# S125 (K1) — the Character Rig Blind Re-Score (S120 §4 gate) — RECORD

| | |
|---|---|
| Gate | S120 §4: every creative engine's acceptance closes with a BLIND re-score — codenamed artifacts shuffled together, ≥ 3 human scorers, composite **≥ 4/5** on the anchored rubric |
| State | **PENDING — the human gate.** Everything an autonomous run can do is DONE (the kit protocol is mapped, the artifact emitter is the committed smoke pipeline `scripts/k1-rig-smoke.mts`); the scoring itself cannot be executed without humans and is NOT fabricated here. |
| Precedent | The W1 rubric protocol; the S123 blind rescore (PENDING, same reason). K1's rubric rides the same kit session when the scorers are gathered. |

## 1. The kit protocol (the Stickman lesson: structure adapted, rows authored)

- **Anchored dimensions** (whole numbers 1–5, N/A restricted to mouthless rigs
  — a mouthless rig cannot speak and the sheet must say so honestly):
  1. pose-naturalness (FK gestures read as intent, not mechanical rotation; tweens land at explainer tempo)
  2. identity-floor (the rendered rig reads as the character — the anchor's traits recognizable; **VCE ≥ 80 on rig frames is the machine pre-gate**, the human row judges the READ)
  3. mouth-beat-sync (open/close beats land inside the spoken words; gaps close; no dead-open mouths)
  4. gesture-narration-alignment (setup welcomes, action points, emphasis punctuates — the W2 classifier's intent is VISIBLE)
  5. art-decomposition-quality (parts join at pivots without gaps/overlaps; the mouth swap is invisible)
  6. staging-legibility (the character reads at 1080p contain-fit; background is set dressing, not noise)
  7. comprehension (the scene's message survives one viewing)
  8. honesty (nothing claims phoneme lip-sync, IK, or skinning — the motion is what it is, labeled beat-sync)
- **The kit:** codenamed MP4s (`K1-XXXXXXXX.mp4`) + per-scene frames, emitted
  by `scripts/k1-rig-smoke.mts` through the REAL engine (chromium + ffmpeg,
  network-aborted, sanitize-first); the S93 breath baseline (still portrait +
  zoompan) rendered over the same narration, shuffled in as the control arm;
  the code→artifact key **gitignored** (`validation/s125/`).
- **Baseline comparability:** the smoke receipt pins the input hash (the
  rigClipHash sidecar) — artifacts are byte-comparable forever.
- **The verdict rule:** composite ≥ 4/5 with ≥ 3 scorers; a failing gate
  routes back before Stage R's character option and Stage X's mixed lane.

## 2. What is ready (checked)

- [x] The artifact emitter runs (the smoke rendered the 8.00s proof clip at
      30 fps; 23/23 receipts green; the receipt JSON lands in
      `validation/s125/smoke-receipt.json`).
- [x] The control arm is defined (S93 breath over the same narration — the
      "before" every scorer should feel without being told which is which).
- [x] The dimension sheet is drafted (§1 — rows authored for the format).
- [x] The machine pre-gate is defined (identity VCE ≥ 80 — runs when a VLM
      provider is configured; the smoke records SKIP honestly today).

## 3. What CANNOT be done autonomously (the honest boundary)

- [ ] **≥ 3 human scorers** watch the shuffled artifacts and score the sheet
      — no author grades its own work unblinded.
- [ ] The identity VCE run on rendered rig frames (needs the provider; SKIP
      is recorded, never a fake pass).
- [ ] The composite + per-dimension deltas recorded here.

## 4. The kit session is now ONE command (S128)

`scripts/blind-rescore-kit.mts` (S128, the 2026-11-15 external audit's
action 3) assembles the whole session mechanically:

- renders the compiled-gesture arm through the committed smoke pipeline,
  renders the G1 proof arm, and renders IN-PROCESS the rest-only control:
  the SAME fixture — same art, same narration, same 8.00s clock, the same
  mouth schedule — with the pose sheet stripped to rests, so the A/B's
  only variable is the compiled gesture layer. A kit assertion fails the
  run if any gesture row leaks into the control or the control stops
  speaking.
- codenames + shuffles (`TFR-<8hex>.mp4`), writes three per-scorer sheets
  with the §1 rows verbatim, the gitignored key, the manifest (sha256),
  and a README that states the scoring is NOT the kit's to do.

**Protocol deviation, recorded not hidden:** the original control arm was
"the S93 breath baseline (still portrait + zoompan)". The shipped kit uses
the rest-only arm instead — a strictly better-controlled A/B for the
gesture rows (it keeps art, narration, clock, and audio identical), with
the S93 portrait render still available via `scripts/s93-rig-smoke.mts`.

**This record stays PENDING until the scorers run** — the same standing item
as S123's blind rescore. S125's machine evidence (unit battery 734 green, the
smoke 23/23 green with the real render, the lane pins, the cache receipts)
is complete and machine-verified.

## 5. The session on the final head (S144)

The K1 arms (compiled gestures + the rest-only control) ride the session
assembled 2026-11-16 on HEAD `a159f4b` (post-S143): `validation/rescore/
2026-11-16T04-34-12` — both arms re-rendered green through the final engines
before assembly, the smoke 31/31 on the current head (the record:
`docs/audits/s144-blind-rescore-session.md`). This record stays PENDING
until the scorers run.

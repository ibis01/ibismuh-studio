# S123 — the Motion Graphics Blind Re-Score (S120 §4 gate) — RECORD

| | |
|---|---|
| Gate | S120 §4: every creative engine's acceptance closes with a BLIND re-score — codenamed artifacts shuffled together, ≥ 3 human scorers, composite **≥ 4/5** on the anchored rubric |
| State | **PENDING — the human gate.** Everything an autonomous run can do is DONE (the kit protocol is mapped, the artifact emitter is the committed proof pipeline); the scoring itself cannot be executed without humans and is NOT fabricated here. |
| Precedent | The W1 baseline composite was **2.4/5** (non-blind operator proxy, honestly recorded in `docs/audits/w1-blind-rubric.md`); the post-W7 consolidated re-score runs under the same protocol. |

## 1. The kit protocol (mapped from the house protocol, verbatim facts)

- **Anchored dimensions:** S120 §4 fixes nine whole-number dimensions (1–5, N/A restricted to the silent-audio lane) for the WHITEBOARD track. The Stickman lesson (adapt the structure, author new rows) applies: S123 authors a GRAPHICS-SPECIFIC sheet — proposed rows:
  1. motion-naturalness (eases, staggers, holds read as designed, not mechanical)
  2. semantic-order (elements enter in the narration's order)
  3. narration-alignment (beats land where the voice is)
  4. chart/diagram-readability (bars/counters legible, honest scales)
  5. text-readability (sizes, weights, contrast against the background)
  6. transition-quality (scene boundaries read as intentional cuts)
  7. audio (VO slots + bed balance under the −16 LUFS contract)
  8. comprehension (the scene's message survives one viewing)
- **The kit:** codenamed MP4s (`G1-XXXXXXXX.mp4`) + per-scene frames, emitted by the COMMITTED proof pipeline (`scripts/s123-graphics-proof.mts` renders the proof doc through the REAL engine at both rates); old + new artifacts shuffled together; the code→artifact key **gitignored** (`validation/s123/`).
- **Baseline comparability:** the proof receipt pins the golden hashes per fps — artifacts are byte-comparable forever against the committed pins.
- **The verdict rule:** composite ≥ 4/5 with ≥ 3 scorers; a failing gate routes back before Stage X (mixed-engine composition).

## 2. What is ready (checked)

- [x] The artifact emitter runs (the proof rendered the kit's source renders; the receipts are deterministic).
- [x] The codename/shuffle step is mechanical (a scorer with the gitignored key shuffles `validation/s123/` renders into codenamed files).
- [x] The dimension sheet is drafted (§1 — rows authored for the format, structure adapted from the W1 rubric per the Stickman lesson).
- [x] The D3 golden hashes make the artifacts byte-comparable against the committed pins.

## 3. What CANNOT be done autonomously (the honest boundary)

- [ ] **≥ 3 human scorers** watch the shuffled artifacts and score the sheet — the whole point of the gate is that no author (human or model) grades its own work unblinded.
- [ ] The composite + per-dimension deltas recorded here.

## 4. The kit session is now ONE command (S128)

`scripts/blind-rescore-kit.mts` (S128, the 2026-11-15 external audit's
action 3) spawns the committed proof pipeline fresh (or `--skip-g1` reuses
its artifacts), codenames + shuffles the render into the session's `kit/`,
and writes the per-scorer sheets with the §1 rows verbatim, the gitignored
key, and the sha256 manifest. The K1 character artifacts ride the same
session (one command, two rubric sheets) — see `k1-blind-rubric.md` §4.

**This record stays PENDING until the scorers run.** It is listed as the one open item of S123's close in `docs/audits/s123-motion-graphics.md` §8 — the stage's other evidence (unit battery 685 green, the proof GATE GREEN, the lane pins, the draft-speed receipt, the QC calibrations) is complete and machine-verified.

## 5. The session on the final head (S144)

Assembled 2026-11-16 on HEAD `a159f4b` (post-S143 — the audit's P5, the last
product finding): `validation/rescore/2026-11-16T04-34-12`, every arm green
through the REAL final engines (both source renders re-rendered fresh before
assembly; the record: `docs/audits/s144-blind-rescore-session.md`). The
graphics artifact the scorers will score descends from the committed proof
pipeline as it stands TODAY, not as it stood when this record was drafted.
This record stays PENDING until the scorers run.

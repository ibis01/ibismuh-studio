# S123 — Blind Re-Score Record (S120 §4's gate, applied to G1)

| | |
|---|---|
| Purpose | S120 §4's blind re-score gate: every engine expansion is judged by human scorers on a calibrated rubric before the next stage routes forward. G1's gate runs on the SHIPPED graphics renders. |
| Status | **AWAITING SCORERS** — the protocol is mapped, the kit is runnable, the score cannot be executed autonomously (≥ 3 human scorers, composite ≥ 4/5). A failing composite routes G1 back before Stage X. |
| Spec | `docs/design/s123-motion-graphics.md` §9.8 + §12 (P5 row); the S120 §4 protocol |

## 1. What the scorers receive

Each scorer renders the SAME fixture doc through their own run of the shipped lane and judges the outputs blind (no engine labels, no code access during scoring):

1. **The kit**: `scripts/s123-graphics-proof.mts` renders the pin fixture end-to-end (chromium + ffmpeg); its artifacts land under `validation/s123/render/` — the per-scene MP4s and the assembled `final.mp4`. A scorer runs `node --import tsx scripts/s123-graphics-proof.mts` and scores the files.
2. **The rubric dimensions** (S120 §4's W1 structure, re-anchored for motion graphics):
   - kinetic typography legibility (headline/subhead motion readability at 1× speed),
   - choreography timing (staggered entrances against narration rhythm),
   - data honesty (counters land on their declared values; bars reveal their data),
   - reveal mechanisms (wipe/grow/draw read as designed, not as glitches),
   - scene-boundary craft (hard cuts read as cuts — no half-blends),
   - draft fidelity (the 0.5×/12 fps draft previews the same choreography).
3. **The scale**: 1–5 per dimension; N/A is restricted (a dimension may not be skipped without a written reason — the Stickman structure's restricted-N/A law).
4. **The gate**: composite ≥ 4/5 across ≥ 3 scorers, blind (the scorers see randomized file names; the fixture map stays with the operator).

## 2. What is already in place

| Piece | Status |
|---|---|
| The fixture renders end-to-end | DONE — the proof is GREEN (`validation/s123/s123-proof.json`) |
| The QC battery judges the artifacts | DONE — playable/duration/loudness/true-peak/black/frozen/cut all pass; the graphics g-* group passes |
| The blind randomization step | OPERATOR-SIDE (file renames at scoring time) |
| ≥ 3 human scorers + the composite | **PENDING — cannot be autonomous** |

## 3. The route

1. The operator runs the proof, randomizes the artifact names, and distributes them with the rubric.
2. The scorers return per-dimension scores + written reasons.
3. The composite records here (the table below) — a failing gate routes G1 back before Stage X per S120 §4.
4. The QC battery's own verdict (§2) ships WITH the kit as the objective floor — the human composite judges what the battery cannot.

## 4. The result (to be recorded)

| Scorer | Typography | Choreography | Data honesty | Reveals | Boundaries | Draft fidelity | Notes |
|---|---|---|---|---|---|---|---|
| _awaiting_ | | | | | | | |
| _awaiting_ | | | | | | | |
| _awaiting_ | | | | | | | |
| **Composite** | | | | | | | **gate: ≥ 4/5** |

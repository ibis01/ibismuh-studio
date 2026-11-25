# S144 — the Blind Re-Score Kit Session on the Final Head (S120 §4 / the audit's P3, machine-side) — RECORD

| | |
|---|---|
| Gate | The 2026-11-15 external audit's **P3**: the G1/K1 blind re-evaluation. Machine-side closure = a kit session ASSEMBLED on the final head; the verdict itself stays the humans' (≥ 3 scorers, composite ≥ 4.0/5 on the anchored rubric). |
| State | **PENDING — the human gate (unchanged).** The kit session `validation/rescore/2026-11-16T04-34-12` is assembled on HEAD `a159f4b` with all three arms rendered through the REAL, final engines (post-S139…S143). The scoring is NOT fabricated; no composite is pre-filled anywhere. |
| Session | `validation/rescore/2026-11-16T04-34-12` (gitignored — the codename key never rides git) |
| Head | `a159f4b` (S143 — "the last P"): the arms render the engines as LANDED, not as they were when the two rubric records were drafted |

## 1. Why a fresh session (the stale-session law)

A kit session existed (`2026-11-16T03-50-18`) but was assembled MID-QUEUE —
between S141 (03:48) and S142 (03:59) — so its artifacts predate the final
two stages. The audit's P3 ordered the re-evaluation AFTER the queue landed;
the artifacts the scorers will score must carry the final engines' output.
The session was re-assembled on the final head.

## 2. What ran (all green, in order)

| step | result |
| --- | --- |
| typecheck + lint | clean |
| unit battery | **845 passed, 0 failed** (the S140/S141/S142/S143 stage pins ride it) |
| S140 import-wall drill (the audit's F1+F2) | **16 passed, 0 failed** — 2 of 6 concurrent racers win the cap slots, 4 refuse via `ImportCountRefusal` (the wall, never an accident), every loser's storage prefix swept (compensation under contention), winners' bytes land and resolve through the sprite seam |
| K1 rig smoke (the compiled-gesture arm) | **31 passed, 0 failed** — 240 frames through the real rig renderer (`validation/s125/render/rig-scene.mp4`) |
| S123 graphics proof (the G1 arm) | **21 passed, 0 failed** — 576 frames @ 24 fps through the real engine, QC 12 lenses green on the mixed VO+bed program (−18.5 LUFS, all 5 cuts frame-aligned; `validation/s123/render/final.mp4`) |
| rest-only control arm | in-process render, 240 frames; the gesture-leak guard held (0 gesture rows) and the control still SPEAKS on the shared mouth schedule |
| kit assembly | **4 assertions passed** — three codenamed artifacts crypto-shuffled, sha256 manifest, three per-scorer sheets, gitignored key |

## 3. The session the scorers will receive

- `kit/TFR-*.mp4` — three codenamed artifacts: two CHARACTER-lane arms
  (compiled gestures vs the rest-only control — same art, same narration,
  same 8.00s clock, the same mouth schedule; the A/B's only variable is the
  compiled gesture layer) and one GRAPHICS-lane arm, shuffled with crypto
  randomness.
- `scorer-{1,2,3}.md` — the anchored rows verbatim (the S123 graphics sheet;
  the K1 character sheet incl. the honesty row).
- `manifest.json` — sha256-frozen artifacts; the session is repeatable at
  any time against the hashes.
- `key.json` — **gitignored**; unblinds ONLY after all three sheets are in.
- `README.md` — states the kit does NOT score; the ≥ 3-human composite is
  the gate.

## 4. The recovery receipt (recorded, not hidden)

The first full-kit run was reaped by the sandbox mid-G1-render (the
backgrounded nohup died with its launching shell; the K1 arm had already
landed green, the G1 render died at scene 1). Recovery used the kit's
DESIGNED path: both arms were re-rendered green in the FOREGROUND, then
`--skip-g1 --skip-k1` rebuilt the session reusing only artifacts from
green runs. No artifact in the session descends from a failed render.

## 5. What CANNOT be done autonomously (the honest boundary, unchanged)

- [ ] ≥ 3 human scorers watch `kit/` and fill the sheets, alone.
- [ ] Composite + per-dimension deltas recorded in the two rubric records
      (`docs/audits/s123-blind-rescore.md`, `docs/audits/k1-blind-rubric.md`).
- [ ] Unblind with `key.json` only after all sheets are in.

## 6. The external audit's queue accounting (close-out state)

| item | finding | closure |
| --- | --- | --- |
| P1 | F1 storage non-atomic, F2 quota race | **S140** — the admission wall + the drill (16/16) |
| P2 | F3 BVH parser unbounded | **S141** — the admission wall (text/joints/columns/frames) |
| P3 | G1/K1 blind re-eval | **S144 — this session** (machine-side done; verdict pending the humans' gate) |
| P4 | effects asset library | **S142** — the emphasis vocabulary, registration 8/8 |
| P5 | F5 Stage X mixed dispatch | **S143** — the per-scene engine verdict |

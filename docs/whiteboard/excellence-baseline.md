# Whiteboard Engine Excellence Program — Phase Zero Baseline

- **Date:** 2026-11-24 (sandbox session)
- **Audited main HEAD:** `facdd815f1e8825449f86779d5aa4fc64d2bec3d`
  (PR #14 merge, 2026-11-23; CI run 45273174950 — all eight jobs green on
  this exact head: Typecheck·Lint·Unit · Production build · Money-path
  coverage · PostgreSQL integration · Clean-clone bootstrap · Secret scan ·
  E2E · Docker production smoke)
- **Working branch:** `feat/whiteboard-excellence` (created from the verified
  main HEAD at `facdd81`; nothing lands on main directly)
- **Method:** read-only audit of the repository records (README,
  WHITEBOARD_ENGINE_DESIGN.md, WHITEBOARD_ENGINE_AUDIT.md,
  `docs/design/s120-2d-animation-roadmap.md`, worklog, the W1–W7 stage
  records, S146/S162 acceptance records, the external-repos audit), then a
  REAL-render verification pass on this machine: the frozen W1 benchmark
  rendered through the actual engine (chromium → ffmpeg) at all three house
  aspects, the determinism double-run pin, QC receipts, and frame-level
  visual inspection of the actual MP4s (contact sheets + timestamped
  close-ups). No quality claim below rests on source reading alone; each is
  receipted by a run on this machine.

---

## 1. What already exists (verified, not assumed)

The engine is far past the "does it draw" stage. The full E-matrix and the
W-track are LANDED with receipts (`docs/audits/w1…w7-*.md`,
`WHITEBOARD_ENGINE_DESIGN.md` §9):

| Subsystem | State | Receipt |
| --- | --- | --- |
| Deterministic frame plan (`timing.ts`) | LANDED | determinism pins (W1, S146, this session §3) |
| Semantic beat compiler (`beat-plan.ts`, W2) + rhetorical layer (S147) | LANDED | asset↔sentence binding pins; additive rhetorical fields |
| Stroke-authored asset validator (`asset-validate.ts`, W3) | LANDED | 6 checks; built-ins must pass; uploads gated |
| Word anchors → spoken schedule (`voice-anchors.ts`, W4 s3) | LANDED (wired, flag-gated `asrAnchors`) | `scripts/w4-anchors-proof.mts`; ±600 ms tolerance pinned |
| Glyph-outline handwriting (`glyphs.ts`, W4 s2) | LANDED, per-asset opt-in (`textMode:"glyph"`) | `scripts/w4-glyph-proof.mts` |
| Content-driven camera director (`camera-director.ts`, W5) | LANDED | drift demoted to fallback; QC GREEN at 3 aspects |
| Continuous canvas (`board` policy, W6) | LANDED | carried-state equality pins; clean mode byte-identical |
| Finishing layer: pen-up travel, poses, left/right, SFX (W7) | LANDED | travel pins; SFX OFF by default; loudness contract green |
| P5 production profiles + five-subject benchmark | LANDED | `scripts/test-whiteboard-profiles` 22/22 |
| Raster-to-stroke lane (P0, `trace.ts`) | LANDED | uploads become drawable strokes on the same clock |
| Renderer integration, editor, 5-route surface, upload gates | LANDED | E8/E9 records (S67–S69) |
| Shared `anim/` substrate, S87 timeline projection (`tracks.ts`) | LANDED | acceptance battery wired into CI |

**Verdict: the protected architecture is intact on main and every named seam
(single frame clock, one applier `wb-page.ts`, beat compiler, SVG
sanitization, budgets/preflight, job queue, audio loudness contract, QC/ship
gates) is present, pinned, and green. No second engine, no parallel
timeline, no new animation grammar. Do not regress any of it.**

## 2. Gates on this machine (2026-11-24, this sandbox)

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS (exit 0) |
| `npm run lint` | PASS (0 findings) |
| `npm run test` (unit + regression battery) | **1039 passed, 0 failed** |
| `npm run test:whiteboard-trace` | 25 passed, 0 failed |
| `npm run test:whiteboard-profiles` | 22 passed, 0 failed |
| Full W1 benchmark (3 aspects + determinism pin) | **GATE GREEN** |

Frozen-definition integrity: the fresh project hashes match
`docs/baselines/w1-whiteboard-baseline-2026-11-13.json` **byte-for-byte on
all three aspects** (16:9 `48823755…`, 9:16 `674ea3db…`, 1:1 `c745ea60…`) —
the benchmark authoring builds identically on HEAD. The five sampled 16:9
frames' raw hashes differ from the committed baseline (W7's pen-travel
frames move by design, as that stage's record declares) while ink
statistics sit in the same band (title darkRatio 0.0259 → 0.0265, process
0.0086 → 0.0093, comparison 0.0112 → 0.0103).

## 3. Real-render evidence (the actual MP4s, not previews)

Run: `node --import tsx scripts/w1-whiteboard-benchmark.mts` (full: 3 aspects
+ determinism re-render + blind kit). Receipt:
`validation/w1/w1-whiteboard-baseline-2026-11-24.json` (gitignored per the
535c90e law); the tables below are the committed citation.

| Aspect | Decoded frames | Program | Render wall (2 cores) | QC (12 measurable lenses) |
| --- | --- | --- | --- | --- |
| 16:9 (1920×1080) | 912/912 | 38.0 s | ~83 s | 12 pass + cut-alignment unmeasured |
| 9:16 (1080×1920) | 912/912 | 38.0 s | 80.4 s | 12 pass + cut-alignment unmeasured |
| 1:1 (1080×1080) | 912/912 | 38.0 s | 51.5 s | 12 pass + cut-alignment unmeasured |

- **Determinism pin: IDENTICAL** — the 16:9 re-render's sampled raw-frame
  SHA-256s and per-scene frame counts match run 1 exactly on this machine.
- The report-level `qc.passed` reads `false` while every measurable lens
  passes: `cut-alignment` reports `unmeasured` (no timeline doc on a
  doc-less whiteboard render) and `qc.ts` keeps the overall badge red when
  ANY check is not `pass` — by design ("an unmeasured check keeps the
  overall badge red/amber for a human"). The harness's own zero-fail gate is
  GREEN. Recorded so nobody mistakes the red badge for a regression.
- The blind kit (3 codenamed finals + per-scene-type frame sheets) was
  regenerated — `validation/w1/blind/`, key local-only — ready for the
  human gate.

### Visual inspection findings (frame-by-frame, contact sheets + stills)

What already works, seen in pixels: the title written stroke-by-stroke with
the hand on the glyph line; the heart drawn outline-first then hatched; the
process scene drawing heart → lungs → arrows in narration order; the bar
chart built axis → bars; clean seams between scenes (outgoing ink present,
incoming stroke-free); no flicker/stutter/frozen frames; loudness inside the
contract; readability at every aspect.

Defects confirmed in rendered output (each traced to its module in §5):

| # | Observation (timestamp, aspect) | Root cause |
| --- | --- | --- |
| D1 | **The hand parks ON TOP of the finished artwork at the scene tail.** At t≈36.5–38 s (16:9 conclusion) the open hand rests ON the rocket's ink and holds there through the final frame — the video's longest-lived composition carries a hand clobbering the drawing. | `timing.ts handAt` tail branch: `return tail ? { ...tail, pose: "rest" } : hidden` — the rest pose holds at `strokePoint(last, 1)`, exactly the final stroke's endpoint (on the ink). No park-away law exists. This is S146 finding 2's second half, still open after W7 shipped the travel half. |
| D2 | **The key-phrase text starts at 66 % of its scene.** Engine schedule receipt (the exact `beatSceneEvents` output for `w1-phrase`, 7000 ms): `cc-box` 400+1984, `cc-box-od` 2514+1969, `write_text cc-big` **4613**+455, `write_text cc-small` 5198+902. The container strokes eat 58 % of the window before the first word; the narration speaks "sixty to one hundred" at ~50 %–65 %. | The uniform fill law (`timing.ts scheduleScene`): `f = avail/rawSum` scales ALL items to end at the window's right edge; texts ride the same sequential queue after paths (weight 40/char vs length-based paths). S146 finding 1, still open — S147 added the rhetorical metadata but did not touch the lead-in arithmetic. |
| D3 | **Production text is typeset (marker-wipe), not handwriting.** The title and the phrase render in a sans face revealed by a left-to-right wipe; the pen rides a character-count width model. | W4 slice-2's glyph mode is per-asset opt-in (`textMode:"glyph"`); `close-card`, `title-hero` and the other benchmark/planner assets never opt in. The W1 rubric's text-readability row stays at 3 ("wiped, not written"). |
| D4 | **Portrait dead margins.** On 9:16 the title/heart cluster sits high with the lower ~50 % of the frame empty; the phrase card lands low with the top empty. | Per-aspect authored placements + the cameraless drift fallback; the W5 director honestly returns [] for ≤1-beat scenes (most of the benchmark), so nothing re-frames. The W1 rubric's camera row recorded the same. |
| D5 | **Uniform stroke urgency / fill-to-window pacing.** The phrase card's box takes ~4 s to draw (two passes: main + S139 retrace) because the fill law stretches every stroke to the window's right edge; a human draws a box in ~1.5 s and holds. | The same fill-law arithmetic as D2 — the QC lenses (frozen-frames/static-shots) punish early finishes, so the law paces work to the window, not to natural speed. The rubric's stroke-naturalness 3/5 root cause. |
| D6 | **The hand crosses finished ink mid-scene** (heart scenes) — acceptable while drawing (a human does too), but there are no occlusion/hide rules during camera moves. | W7 shipped travel between strokes; the occlusion/hide rules were recorded future work. |
| — | Asset repetition (the heart in three of five scenes) | BASELINE-AUTHORED (the frozen definition pins its assets) — recorded so nobody "fixes" the frozen benchmark. |

## 4. Editor preview vs final render

The one-source law (`wb-page.ts` `APPLY_FRAME_FN` shared by the canvas and
the renderer) is pinned by unit contracts, and W4's page-seam catch showed
the class of drift pixel inspection is for. What is still missing: a
systematic pixel-diff harness that renders the SAME scene through the editor
canvas and the MP4 and compares them — the equivalence is pinned
structurally, not measured per render. NOT VERIFIED as a per-render
property.

## 5. Human evaluation status

- **The release gate ("Blind review ≥ 4/5 with ≥ 3 human scorers") is NOT
  met.** S162's gate is OPEN (round 1: a protocol-deviation tie 4.00/4.00;
  round 2's kit is re-based on current main and scores remain PENDING). The
  W1 rubric's per-stage blind re-scores are scheduled, not executed.
- Recorded operator-proxy trajectory: W1 baseline 2.4/5 (2026-11-13,
  NON-blind) → S146 re-baseline 3.0/5 (2026-11-16).
- The blind kit artifacts for a fresh session exist on this machine.

**This deliverable does not fabricate human scores. The gate stays with
humans.**

## 6. Known limitations carried forward (already receipted upstream)

1. Carry depth is ONE scene (no keep-chain propagation) — W6 honest edge.
2. SFX are event accents; long strokes draw silently after touchdown — W7.
3. Per-word anchor spans are even slices of their chunk window — W4 s3.
4. The ASR arm's tolerance pin rides the narration-proportional arm —
   real-TTS/ASR alignment quality awaits a staging receipt (E6's
   gateway-blocked verification).
5. x264 is not bit-deterministic across machines — the determinism law pins
   FRAMES (raw-RGB), not file bytes.
6. The `text-artifacts` lens is opt-in and was not part of the 12 measured.

## 7. Missing evidence (what this program must produce)

- Real-VO end-to-end render receipt (the `asrAnchors` lane is wired; E6's
  verification was gateway-blocked historically).
- A preview-vs-final pixel-diff receipt (§4).
- The five-subject suites re-rendered on THIS machine (previous receipts are
  sandbox-local; the profile pins hold in the unit battery).
- Human blind scores (≥3 scorers, ≥4/5) — the standing release gate.

## 8. Performance snapshot

| Metric | Value (this machine, 2 cores, 4 GB) |
| --- | --- |
| Render wall, 38 s @ 1080p 16:9 | ~83 s (≈0.46× realtime) |
| Render wall 9:16 / 1:1 | 80.4 s / 51.5 s |
| Frame budget pre-flight | in place (`WB_RENDER_FRAME_BUDGET = 25 920`) |
| Per-render AI API calls | 0 (native law holds) |
| Unit suite wall | within the CI budget |

## 9. Phase Zero exit verdict

- Architecture: **PASS** (protected seams verified intact; all batteries
  green on this machine).
- Real-render evidence: **PASS** (3 aspects GATE GREEN; determinism
  IDENTICAL; frozen definition byte-identical).
- Perceptual quality: **PARTIAL** — six defect classes confirmed in pixels
  (D1–D6); two were recorded upstream (S146 findings 1–2) and remain open.
- Human evaluation gate: **NOT MET / PENDING** (S162 open; kits ready).
- Production-ready claim: **NOT YET** — the engine is reliable and QC-green,
  but the perceptual defects above and the unmet human gate keep the honest
  verdict at PARTIAL.

Every defect above has a reproducible artifact on this machine (timestamps
into `validation/w1/aspect-*/final.mp4`). The gap analysis and the
implementation sequence follow in `excellence-gap-analysis.md`.

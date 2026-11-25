# External repos audit — the VideoScribe pipeline reception (Stage R0)

**Status:** READ-ONLY architecture audit of three external reference repositories
against the live whiteboard engine, per the operator's directive ("start by
studying repositories 1, 2 and 3 … producing a file-by-file integration plan
before any code changes"). No product code was changed by this stage.
Companion to `docs/design/whiteboard-videoscribe-reconciliation.md` (the
Stage-0 read-only reconciliation of the W1–W7 plan) — that document remains
the source of truth for what the engine already is.

**Method.** Shallow clones of all three repos at HEAD
(`/home/z/audit-repos/`, receipts §11); three independent capability studies
(file-referenced) reconciled against full reads of the live engine's core
(`timing.ts`, `storyboard.ts`, `svg.ts`, `wb-page.ts`, `render.ts`,
`beat-plan.ts`, `voice-anchors.ts`, `camera-director.ts`, `text-draw.ts`,
`glyphs.ts`, `whiteboard-planner.ts`, `llm-planner.ts`, `asset-store.ts`,
`upload.ts`, `sfx-plan.ts`). Every claim carries a file reference on one side
or the other.

**Landed between the plan and this audit (S137, same branch):** the scaffold
now synthesizes per-video title/close cards from the video's OWN topic
(`whiteboard-planner.ts` `buildGeneratedCards` — the built-in benchmark cards
wrote "How Your Heart Works" onto every video) and the rich layout gives
every scene a large primary + a supporting concept with alternating paper
tone (`scaffoldWhiteboardProject`'s generated-assets path; the legacy path is
byte-identical and pinned). Unit suite: 836 green, typecheck + lint green,
receipted live on video `cmwi2xgbm…` (the opener hand-writes the topic title
then draws the concept pair).

---

## 1. The architecture law (the operator's decision, binding)

1. **No second renderer.** No Remotion, no parallel pipeline. The existing
   chromium-frames + ffmpeg seam (`render.ts`) stays the ONLY path to
   pixels. All three reference repos reinforce this: Remotion itself is
   source-available with company-size-gated terms (HandDraw lockfile fields
   `license: "Remotion License"`; explainer README:88) — adopting it would
   import those terms AND fork the frame clock.
2. **Extend the shared animation schema** (`storyboard.ts`), don't grow a
   rival grammar. New capability compiles INTO `AnimationEvent[]` /
   `CameraEvent[]` (the reconciliation's §5.1 compile law; S87's tracks
   projection stays frozen).
3. **One compositor, one frame clock** (`timing.ts` + `framePlanClock`).
4. **Preview ≡ export** — the one-source law already holds (`wb-page.ts`
   shared by editor + render); every new event type must project onto the
   S87 tracks or it does not land.
5. **E2E multi-scene MP4 proof** — every stage lands with playable-output
   receipts (the S68 e2e pattern already asserts a served video/mp4 byte
   stream; stages extend it to multi-scene full renders).

## 2. Verdict, in one paragraph

The repos' three hardest problems — animation instructions, narration-aware
composition, realistic drawing — are precisely the three the engine already
solved on its own law: the frozen event grammar IS the animation DSL (and is
validated, projected onto tracks, and rendered by one clock), the
word-anchor + beat layers already bind narration to strokes (per WORD, which
is finer than any of the three repos achieve), and the hand/pen lane already
follows real geometry with tangent rotation and glyph-outline text. What the
repos genuinely add falls into four buckets: (1) **planning-layer
intelligence** — object BLOCKING and stroke ORDERING for complex art
(`whiteboard-video-engine preprocess.py`, the single most borrowable
algorithm set), compact phrase-anchor authoring for LLM planners
(`whiteboard-explainer-engine khoi.py/moc.py`), and free PRE-RENDER QC gates
that stop bad renders before chromium launches; (2) a **raster lane** —
photo→line-art→ordered strokes so AI-generated illustrations can be DRAWN
like SVG art (the engine's biggest honest gap: its uploads must already be
stroke-authored SVG); (3) **finish-layer polish** — highlight/attention
verbs, shape primitives, contour-aware fill, per-stroke pressure, hand
dwell/pauses; (4) **render-infrastructure receipts** — canonical-JSON
fingerprints for cache/resume, hand-sequencing normalization, iterative
music-duck solving. None of it justifies a second renderer; all of it lands
as planning layers, pre-processing, and additive schema edges riding the
existing seams.

## 3. Capability map — repo item → live code

### 3.1 HandDraw-Skill (MIT; Remotion renderer)

| Repo capability | Repo ref | Live verdict |
| --- | --- | --- |
| JSON animation DSL (draw/write/move/rotate/scale/fade/highlight) | `packages/core/src/index.ts:1-8`, `references/dsl.md` | **ALREADY COVERED, stricter** — `storyboard.ts:28-59` `draw_path/write_text/reveal_color/move_object` + `CameraEvent`; validated, track-projected, one clock. The DSL itself is NOT borrowed (grammar growth is governed by §5.1). |
| Dash-offset stroke reveal (fixed 1000, all subpaths parallel) | `packages/renderer/src/Root.tsx:70` | **COVERED, better** — per-stroke measured timing (`timing.ts` fill law, `svg.ts` segments). Their fixed-1000 trick glitches >1000u paths. |
| Hand that follows strokes | `Root.tsx:11-19` (parametric bbox sweep — does NOT follow geometry) | **COVERED, better** — `timing.ts handAt` follows the ACTIVE stroke with tangent rotation. Borrow only the hide-at-0/1 detail (already masked) — skip. |
| Narration-anchored retiming (synthesize → measure → retime → render) | `core/index.ts:50-64` `synchronizeNarration` | **COVERED at word granularity** (`voice-anchors.ts` + `asrAnchors` in `render.ts:362-383`). Their clamp formula is a decent no-anchors fallback; ours already clamps. Skip. |
| `highlight` attention verb (sticky glow latch) | `Root.tsx:33-34` | **GAP** — no attention verb. Compilable as a `reveal_color` on a synthesized emphasis ring path (NO grammar growth — the beat planner emits ordinary events), or a 6th event type with tracks projection. → R3. |
| Shape primitives (card/pill/circle/line/bar + label) | `core/index.ts:3` | **GAP (planner convenience)** — ordinary SVG assets can express all of these; the borrow is PLANNER-side: synthesize primitive assets at scaffold time (like S137's cards) instead of new schema. → R2. |
| Scene crossfade (prev-frame frozen, ≤25% clamp) | `Root.tsx:64-73` | **GAP** — scenes are hard cuts today. W6's board-exit `fade` exists inside the frame plan (`storyboard.ts BoardPolicy`); a scene-tail crossfade can compile to board-exit events. → R4 (decision point §7.2). |
| Audio mux (`adelay`/`amix normalize=0`/`apad` + `-c:v copy`) | `packages/audio/src/index.ts:34-42` | **COVERED** — `render.ts` mixes VO + bed under the −16 LUFS window (`audiomix.ts`). Their `-c:v copy` concat trick is already our per-scene-encode + concat pattern. Skip. |
| Path-addressable validation errors + "animation fits scene" containment | `core/index.ts:12-46` | **PARTIAL** — `validateWhiteboardProject` errors are scene-addressed; the containment rule (event window inside the scene clock) is a cheap pre-render add. → R1. |
| Determinism / CSS dot-grid paper | `Root.tsx:68` | **COVERED** (`wb-page.ts` paper). Skip. |
| Remotion render path / asset inlining | `render.ts:9-16` | **SKIP by law** (§1.1) — note their asset-inlining idea matches our page-embedding (`wb-page.ts:44`), already done. |

### 3.2 whiteboard-explainer-engine (MIT engine; Remotion studio = reference-only)

| Repo capability | Repo ref | Live verdict |
| --- | --- | --- |
| Compact one-line item DSL (`"text @ phrase -0.5"`, `#role` colors) | `engine/khuon/khoi.py:61-96` (`_chu`) | **GAP (planner ergonomics)** — our planners emit full placements; a phrase-binding shorthand makes LLM planner output ~5× more token-efficient and re-record-safe. Lands as a PLANNER OUTPUT format that compiles to placements + beat events — the doc grammar does NOT grow. → R5. |
| `Moc` order-independent phrase anchoring (per-scene forward search, nth occurrence, question masking, missing-phrase lint) | `engine/khuon/moc.py:18-48` | **PARTIAL — the borrow is the binding API.** `voice-anchors.ts` has per-word anchors but no scene-scoped phrase RESOLVER. Add `bindPhrase(anchors, sceneOrigin, phrase, nth)` with the missing-phrase lint wired to scaffold validation. → R5. |
| Pre-render narration-gap gate (no new visual > 4s = ERROR, with the spoken span named) | `engine/khuon/kiem_tra.py:30-42` (`kiem_nhip`) | **GAP, high value** — our QC probes are POST-render; this gate is free and stops chromium launches. Lands in the render pre-flight (`render.ts` before launch / the route's validate step). → R1. |
| Spoken-number cross-check (on-screen figures must be spoken; EN variant generator) | `kiem_tra.py:105-140` + `doc_so.py` | **GAP** — strong wrong-figure catcher; needs an English digit/decimal-to-spoken-variants set (~80 LOC). → R1. |
| Text/image overlap estimator (co-visibility window, >15% warn) | `su_kien.py:350-408` (`kiem_chong`) | **GAP** — `camera-director.ts` frames content but never checks collisions. Estimated-box overlap pre-check feeds both the planner (layout repair) and the director. → R1/R3. |
| Hand sequencing (one-hand rule: shrink durations to floor, then push starts) | `engine/whiteboard.py:307-315` (`Board.finish().seq`) | **PARTIAL** — our fill law schedules within a scene window and the hand masks gaps; what's missing is the CROSS-PLACEMENT guarantee that overlapping draw windows compress/push so the pen never draws two things at once. ~40 LOC in the schedule normalizer. → R1. |
| Anti-idle auto-camera (≥4.5s no-visual-change → zoom onto last-drawn element) + scene drift push | `whiteboard.py:334-353` | **GAP** — `camera-director.ts` plans from focus rects; the gap-triggered idle zoom + drift re-stamp is a cheap policy add. → R3. |
| Trace-map raster draw-in (outline→fill draw order, ≤800pt pen path, deterministic) | `engine/trace_map.py:51-79` | **GAP — the raster lane enabler** (see §3.3's tracing). For "drawing" an AI image: outline strokes consume 0–60% of the window, fills as zig-zag bands after their outline. Pairs with `whiteboard-video-engine`'s skeleton tracing; our `upload.ts` lane is the seam. → R6. |
| Iterative music-duck solver (VAD envelope, measured-target iteration ×4) | `engine/tron_nhac.py:106-131` | **PARTIAL** — `audiomix.ts` mixes under the loudness contract; the ITERATIVE duck-depth solve matched to a measurement spec is a quality upgrade (~60 LOC). → R4. |
| AI-image tier budget (`mode`/`realism` gating vs a library of existing sketches) | `whiteboard.py:79-89` (`allowed()`) | **GAP (spirit borrow)** — before spending on image-gen, reuse a library sketch. Pairs with the planner's asset selection. → R6 (decision point). |
| Fit-text shrink-to-floor (16 steps, 60% floor) + greedy wrap | `studio/src/lib/fit-text.ts:8-80` | **GAP** — our readability check (`text-draw.ts checkReadability`) REJECTS unreadable text; it doesn't REPAIR. A shrink-to-floor repair pass in the planner (before validation) turns rejections into readable boards. → R2. |
| Karaoke captions chunked ≤5 words / silence-gapped | `whiteboard.py:200-210, 381-392` | **OPTIONAL** — `captions.ts` has word timing already; chunking is a Shorts-lane nicety. Defer. |
| Segmented music (loop+crossfade, per-chapter cues) | `tron_nhac.py` | **OPTIONAL** — `music.ts` resolves tracks; per-chapter segmentation is a feature, not an engine gap. Defer. |
| Rough.js / studio renderer | `studio/src/lib/rough.ts` | **SKIP by law** — Remotion-bound; the multi-stroke pairing idea (hand follows stroke A, overlay reveals with it) is already our `handAt` behavior. |

### 3.3 whiteboard-video-engine (MIT; pure-NumPy batch pipeline)

| Repo capability | Repo ref | Live verdict |
| --- | --- | --- |
| **Raster→line-art skeleton tracing** (binarize → border suppression → Zhang-Suen thinning → junction-steered 8-neighbor tracing → merge → Chaikin smooth → order) | `src/whiteboard_skill/preprocess.py:99-557` | **THE GAP** — the engine cannot draw an uploaded PNG/JPG/AI-illustration; uploads must be stroke-authored SVG. This suite is pure geometry (no torch), portable to TS with the same guarantees. Lands as an upload-lane preprocessing step producing `Stroke[]` → compiled to `draw_path` events (grammar unchanged). → R6. |
| **Stroke ordering** (greedy nearest-tip + row bucketing + endpoint reversal + backtracking penalties) | `preprocess.py:931-986` (`order_strokes`) | **GAP** — our scheduler draws in placement×document order (length-weighted timing, `timing.ts:82-97`); ordering is a PLANNING layer that re-orders strokes for pen-travel minimization before the fill law sees them. → R6 (also benefits dense SVG art). |
| **Object blocks** (union-find on proximity, connector-bridge exclusion, ≥82% containment absorption, column/row reading order) | `preprocess.py:617-928` | **GAP — the most valuable algorithm in the repo**: "draw the face, THEN move to the next person." Blocks compile to placement draw-order + beat windows. Feeds `timing.ts` as an ordering layer; never a second scheduler. → R6. |
| Coarse/detail split (68% ink) + per-block phase windows (coarse 0→.58, detail .36→.74, fill .68→.94) | `whiteboard.py:1094-1126, 1994-2011` | **GAP (schedule shape)** — our beat plan orders by sentence; block-phase windows order by ink importance within a placement. Additive beat-plan policy. → R6 (decision point). |
| Contour-wipe fill (dilated-ink resistance field, downward decay, wave boundary) | `whiteboard.py:1185-1258` | **GAP (fill upgrade)** — our `reveal_color` fill law is uniform; the contour-resistance field makes color "catch on outlines". Chromium CAN compose this (canvas filter/mask per frame). → R4 (decision point — cost vs look). |
| Line-art snap reveal (guide strokes cut masks; REAL ink revealed through them) | `whiteboard.py:329-355` | **STUDY** — a different philosophy: don't redraw the raster, reveal it through a moving mask. More faithful for neural line-art. Pairs with R6's raster lane as the reveal backend for traced uploads. → R6 decision. |
| Per-stroke pressure model (width = base·(0.68 + 0.42·sin(π·progress))) + adaptive ink-width estimate | `whiteboard.py:1015-1017, 268-281` | **GAP (cosmetic, cheap)** — a stroke-width wobble in `wb-page.ts`'s applier (the dash law animates offset; width modulation rides the same per-frame state). → R4. |
| Hand dwell/pause spreading between strokes | `whiteboard.py:939-978` | **PARTIAL** — our `handAt` masks gaps (pen hidden); dwell pauses (hand rests at stroke end) are a nicer pen-lift. `timing.ts`-local. → R4. |
| Narration-paced drawing with hold-on-gap | `whiteboard.py:1601-1634` | **COVERED** — `voice-anchors.ts` + the anchors-window fill (`timing.ts anchorEnvelope`) already hold the clock to the spoken window. Skip. |
| Canonical-JSON SHA-256 fingerprints (planning + render, incl. asset SHA-256s) → per-stage resume | `fingerprints.py:21-25`, `pipeline.py:674-740` | **GAP (infra)** — our renders re-derive everything; a fingerprinted plan cache enables resume + cheap re-renders (S117's manifest records assembly but nothing caches frame plans across renders). → R1 (small) / R6 (full). |
| Rawvideo→ffmpeg stdin streaming | `whiteboard.py:1055-1085` | **STUDY** — we write per-frame captures through chromium; a CDP screencast/raw-RGB pipe could cut IO. Perf-only, not correctness. Defer. |
| Style-as-recipe (frozen render params + prompts + fingerprint coupling) | `styles.py:65-114, 48-62` | **PARTIAL** — `production-profiles.ts` exists on the story lane; a whiteboard `RenderStyle` block (fill style, detail, block caps) rides `WhiteboardProject` additively. → R6 decision. |
| Neural photo→line-art (Informative Drawings / Anime2Sketch) | `providers/lineart.py:34-81, 328-410` | **OUT OF SCOPE for the app process** (torch + weights); borrow the PROVIDER CONTRACT (fail-fast, cache fingerprint, cleanup presets) for a future external service or ONNX lane. → R6 decision point. |

## 4. What the engine already does better (the honest list)

- **Word-level anchors** (`voice-anchors.ts`): all three repos bind at
  phrase/clip level at best; ours binds per word with ASR + silence
  alignment and degrades honestly.
- **Stroke-faithful hand** (`timing.ts handAt`): HandDraw's hand sweeps a
  bounding-box diagonal; whiteboard-video-engine never rotates its PNG
  hands; ours follows the active stroke with tangent rotation, entry ease,
  gap masking, and W7 pose variants.
- **Text**: HandDraw = typewriter prefix, system fonts; explainer = rough.js
  wobble; ours has committed Caveat glyph outlines (`glyphs.ts`, 95-char
  coverage) + marker wipe + a readability wall.
- **One validated grammar** (`storyboard.ts` + the S87 tracks projection +
  advisory-rev concurrency): none of the repos has a projected editor
  contract at all.
- **QC + ship gates** (post-render battery, loudness contract, S136 probe
  wall): the repos have pre-render lints only.
- **The S87 universal timeline / revision / artifact / manifest
  infrastructure** — no repo equivalent.

## 5. Tensions the plan must resolve

1. **Grammar growth vs the compile law.** `highlight`, scene-crossfade, and
   fill-policy knobs could enter `storyboard.ts` as new event kinds — but
   §5.1 of the reconciliation froze the grammar: new layers COMPILE into
   events. The plan therefore prefers (a) planner-synthesized assets (S137
   pattern) for shapes/emphasis rings, (b) BoardPolicy/board-exit compiles
   for crossfade, (c) additive `WhiteboardProject` policy fields for fill
   style. A new event type lands ONLY with its tracks projection (§1.4).
2. **Raster lane vs SVG-first.** The engine's law is stroke-authored SVG;
   the raster lane does not violate it — tracing CONVERTS raster INTO
   strokes (the same geometry the engine already consumes), and the
   line-art-snap variant keeps the original ink as the revealed pixels.
   The upload gate stays the quality boundary (traced assets must pass
   `asset-validate.ts` like everything else).
3. **Python algorithms → TypeScript.** The borrowable algorithms
   (skeletonization, union-find blocking, 2-opt/nearest-tip ordering) are
   pure and deterministic — they port to TS with byte-stable outputs
   required (the determinism law). Heavy per-pixel work runs inside the
   existing per-scene chromium budget or as pure JS on small canvases
   (uploads are ≤256KB and size-capped — the frame budget wall is
   untouched).
4. **Numbering.** The reconciliation's W1–W7 are landed/landed-as-built;
   this plan's stages take the R-series (Reception) to avoid collision.
   The operator may renumber into the S-ledger.

## 6. File-by-file stage plan (R1–R6; each stage lands with unit pins, e2e MP4 receipts, CI-green)

**R1 — the pre-render gate set** (exit: bad boards never reach chromium)
- `render.ts` pre-flight (before `chromium.launch`, beside the frame-budget
  wall): narration-gap gate (any span > 4s with no new visual event = the
  render refuses, naming the spoken span — the explainer's `kiem_nhip`
  semantics, ours reads the compiled events + anchors), event-containment
  gate (every event window inside its scene clock), overlap gate
  (estimated text/image boxes co-visible >15% = refuse with a repair hint).
- `storyboard.ts`: the same checks exposed pure (`lintProject(project,
  geometry, anchors?)`) so the scaffold route and the Studio save path call
  ONE implementation (the one-gate law).
- Pins: each gate fires on a crafted-bad fixture; clean scaffolds pass
  byte-identically; S68 e2e still green (its hand-authored board passes).

**R2 — planner ergonomics: phrase bindings + shape primitives + fit-text repair**
- `voice-anchors.ts`: `bindPhrase(anchors, sceneOrigin, phrase, nth)` —
  scene-scoped forward resolution (the `Moc` law: origin never moves
  backward, missing phrase = a validation ERROR, not a silent 1e6).
- `whiteboard-planner.ts` / `llm-planner.ts`: the LLM planner MAY return
  compact phrase-bound items (`"label @ phrase −0.5"` semantics) — compiled
  to placements + beat events at scaffold time; the DOC stays events-only
  (§5.1). Shape primitives (card/pill/bar/circle) become synthesized SVG
  assets at scaffold time (the S137 card seam — no schema growth).
- `whiteboard-planner.ts`: fit-text repair (shrink-to-60%-floor before the
  readability wall rejects; `text-draw.ts` stays the judge).
- Pins: bindPhrase determinism/nth/masked-paragraph; compact-item compile;
  repair keeps the wall honest (a shrunk-to-floor label that STILL fails
  readability is refused).

**R3 — the finishing verbs + camera policies** (grammar-checked)
- `beat-plan.ts`: emphasis compiles — an emphasis ring asset synthesized per
  emphasized placement (the `highlight` look with ZERO new event kinds), the
  pen circles it after the claim lands (the W4 emphasis law already exists —
  this gives it the ring primitive).
- `camera-director.ts`: the anti-idle policy (≥4.5s no-visual-change →
  eased zoom onto the last-drawn element and back) + drift demotion already
  in place rides unchanged; the overlap estimate from R1 feeds focus-rect
  repair (nudge, not reject, when the planner can fix it).
- `wb-page.ts`/`timing.ts`: per-stroke pressure wobble (width modulation on
  the active stroke; pure function of stroke progress) + hand dwell pauses
  (the hand rests at stroke ends for the spread pause unit).
- Pins: ring compile determinism; camera policy bounds; pressure/dwell
  byte-stability of the frame plan hash (the S64 law — plan MUST stay
  frame-identical: pressure/dwell change ink, not the plan clock; if any
  frame-hash pin breaks, the change is re-cut as plan-affecting and re-evaluated).

**R4 — scene joins + audio polish** (decision-gated, see §7)
- Scene-tail crossfade: compile the `board.exit: "fade"` policy into a
  frozen-previous-frame overlay in `render.ts`'s concat path (≤25% of the
  scene, the HandDraw clamp) — no grammar growth (W6's exit vocabulary
  already carries `fade`).
- `audiomix.ts`: the iterative duck-depth solve (measure → adjust ×N until
  the measured duck equals target, the explainer's `tron_nhac` law) under
  the existing −16 LUFS contract.
- Pins: crossfade determinism (frozen tail == scene final frame hash);
  duck solve converges; loudness window unchanged.

**R5 — the phrase-binding planner contract** (the compact DSL, if R2's
planner ergonomics prove out in production scaffolds)
- `llm-planner.ts`: the model MAY emit `"text @ phrase"` rows; the compile
  layer resolves them against `bindPhrase` + the merged catalog; unresolved
  phrases DEGRADE per-scene to the native rule table (the honest-degradation
  law) with the reason in `plannerReport`.
- Pins: compile table; degradation labels; token-count receipt (the point
  of the stage: measurable prompt savings).

**R6 — the raster lane** (the largest stage; decision-gated)
- New `whiteboard/trace.ts` (pure TS): binarize → border suppression →
  Zhang-Suen thinning → junction-steered 8-neighbor trace → merge/smooth →
  `order_strokes` (nearest-tip + reversal) → union-find object blocks with
  connector-bridge + containment absorption → reading order. Ports
  `whiteboard-video-engine preprocess.py` semantics with byte-stable TS
  outputs; golden fixtures pin the algorithms (their `tests/test_preprocess.py`
  is the executable spec).
- `upload.ts` / `asset-store.ts`: raster uploads (PNG/JPG ≤ the existing
  caps) route through tracing → a synthesized stroke-asset manifest (the
  traced `Stroke[]` stored beside the sanitized SVG — the S69 store gains a
  `kind: "traced"` row); the W3 validator judges the TRACE output like any
  authored asset; palette entries carry both the raster and the strokes.
- `render.ts`: two reveal backends behind the SAME `draw_path` events —
  (a) synthetic strokes (today's engine, default), (b) line-art snap (the
  guide strokes cut the reveal mask; the ORIGINAL ink shows through — the
  faithful mode for neural line-art). Policy field on the asset
  (`reveal: "strokes" | "snap"`), additive.
- The trace-map fill plan (outline 0–60%, zig-zag bands after) compiles
  into the existing `reveal_color` law.
- Optional operator door (OFF by default): a fail-fast external line-art
  provider contract (`providers/lineart`-style, subprocess or HTTP, cache
  fingerprinted) for photo→line-art BEFORE tracing — without it, tracing
  serves line-art/illustration inputs only.
- Pins: algorithm golden frames; determinism (two traces byte-identical);
  traced-upload renders land a playable multi-scene MP4 (the §1.5 law);
  the frame budget wall holds (a traced asset's stroke count is capped
  before scheduling).

## 7. Decision points for the operator (before R1 code moves)

1. **Stage order.** R1–R2 are pure quality-at-zero-risk (gates + planner
   ergonomics); R6 is the strategic unlock (raster lane) at the largest
   cost. Recommended: R1 → R2 → R3 → R4 → R5 → R6, one stacked PR each,
   exactly like the G1/S121 pattern — or pull R6 forward if "draw my AI
   images" is the operator's priority.
2. **Scene crossfade** (R4): hard cuts are videoscribe-classic; the fade is
   polish. Default OFF (scenes keep `clean` boards) until the W1 blind
   rubric scores a fade variant higher.
3. **Contour-wipe fill** (R4/R6): the resistance-field fill is the flagship
   look in whiteboard-video-engine but costs per-frame composition work.
   Defer behind R6's snap/strokes decision; ship the uniform fill law until
   a blind-score gap justifies it.
4. **Raster upload policy**: traced uploads (no external model, CPU-only,
   deterministic) vs the external line-art provider door (better photos,
   new ops surface). Recommended: traced-only first; the provider door is a
   separate operator feature flag.
5. **Renumbering**: keep R-series vs fold into the S-ledger.

## 8. What will NOT be built (confirmed against the live tree + the law)

- No Remotion, no second renderer, no second frame clock (§1).
- No rival doc grammar — every borrow compiles INTO the frozen event
  grammar; additive policy fields only (§5.1).
- No replacement of the fill law, the beat compiler, or `voice-anchors` —
  the repos' timing layers are coarser than ours and land only as policy
  inputs.
- No torch/neural weights in the app process; the provider door (if ever)
  is fail-fast external.
- No growth of the frame budget wall or per-scene chromium recycling (the
  S75 OOM receipt stands).

## 9. Receipts

- Clones at HEAD: `HandDraw-Skill` `d9f137b` (2026-08-26),
  `whiteboard-explainer-engine` `acf5966` (2026-11-07),
  `whiteboard-video-engine` `86848ea` (2026-09-03); all MIT.
- Capability studies: three file-referenced reports (HandDraw DSL spec +
  Remotion license fields; explainer pipeline + gates + `Moc`/`trace_map`
  mechanics; video-engine tracing/blocking/ordering + fill modes) —
  reconciled against the live tree by full reads of the files listed in the
  header.
- Live receipts for the S137 landed work: unit suite 836 green (typecheck +
  lint green); video `cmwi2xgbm…` re-scaffolded with the generated cards
  (`wb-title-…` carries "Why tiny daily habits / beat big resolutions") and
  a full re-render receipted (preview frames show the hand writing the
  topic title and drawing the coin/globe pair).

## 10. R1 addendum — the first stage partially landed the same day (receipts)

The audit's own render receipts exposed a live defect that R1 was designed
to gate, and the engine-side half of R1 landed immediately:

- **The defect (receipted):** the QC battery's frozen-frames lens failed the
  first rich render with 3 frozen runs (scene-local 4.7s / 7.4s / 4.3s) —
  the beat compiler had bound every placement to a LATER sentence's spoken
  window, so the board sat empty while the narrator set up. One of the
  three (scene 9) rode the ESTIMATOR windows: an ASR word-count mismatch on
  spoken numbers ("96", "66") degraded the anchors, and the word-
  proportional windows pushed the first asset ~8.9s deep.
- **The fix:** `beat-plan.ts` gains the OPENING-STROKE GUARANTEE — when the
  earliest asset-carrying beat opens past its world's threshold
  (`OPENING_STROKE_MAX_MS` = 2200 in the anchors world, under the lens's
  ~2.3s run class; `OPENING_STROKE_ESTIMATOR_MAX_MS` = 4000 in the
  estimator world, deliberately lenient so the W2 semantic pins
  ("the coin WAITS for its sentence" at 3.75s) survive), its FIRST
  placement pulls forward to sentence 0's window. Closer-card-only scenes
  stay put. Both thresholds carry the receipts in-source; the estimator's
  leniency is an operator call recorded in §7 (a blind score can tighten it).
- **The QC progression on video `cmwi2xgbm…`:** 3 frozen runs → 1 frozen
  run (anchors-world fix) → 0 frozen runs (estimator-world fix). The final
  QC: 14 of 15 green; the only non-pass is `cut-alignment: UNMEASURED` —
  the documented S75 structural exemption (the whiteboard lane does not
  build a story-lane timeline doc; the QC card's audited accept path ships
  it). An R1 follow-up can make the whiteboard render write its EXACT cut
  manifest (the per-scene encode boundaries are known to the frame clock)
  so the check MEASURES instead of unmeasured-blocking.
- **Gates:** unit suite 837 green (the R1 pins added: the anchors-world
  pull-forward, the estimator-world pull-forward, determinism through the
  rewrite); typecheck + lint green.
- **Frame receipts:** 174.4s (the previously-frozen scene-9 opening) now
  shows the clock asset mid-draw; the closer card carries the topic-derived
  key phrase + narration-derived note.

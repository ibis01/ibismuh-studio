# Six-engine visual quality upgrade audit (the shortlist deep-dive)

Ground truth: verified against the working clone at origin HEAD `4e676db`
(feat s160, 2026-11-17). The third-party strategy report that commissioned
this audit was drafted at `6552073` (s159) and therefore PREDATES S160 — its
facts are corrected in Part 0. Six shortlisted repositories were shallow-
cloned and read directly (source-level, not docs-level); every borrowed item
below cites the file it was read from. No repository files outside
`docs/audits/` were modified by this audit.

The governing objective (from the commissioning report, adopted): every
TubeForge video type should produce polished, professional-looking videos —
not merely videos that render. Borrow proven TECHNIQUES; import no
applications; no new runtime dependencies.

---

## Part 0 — corrections of record

1. **The report's baseline is stale by one milestone.** It audits `6552073`
   (s159, battery 892). The tree now carries `4e676db` (s160): the measured
   GLIDE ease (smootherstep) in the shared substrate, the 3D lane's look
   seam (sky dome / horizon fog / real sun shadows / Neutral tone mapping),
   per-key destination eases on the 3D camera and object tracks, and the
   impact-kick camera shake on graphics `hit` events. Unit battery is
   **898/898**, CI run 44032289104 is 8/8 green. Several items the report
   lists as missing are now present (camera easing, the first finishing
   passes).
2. **"Six unrelated rendering engines" is already false in the best way.**
   The audit confirms the report's architecture instinct: TubeForge runs ONE
   chromium-screenshot → ffmpeg pipeline shared by four drawn engines
   (whiteboard, graphics, character rig, 3D), ONE universal timeline
   contract (S87 tracks[]), ONE frame-truth law (pure `frameAt`/`poseAt`
   modules), and one compositor + finishing pipeline. The work is depth,
   not architecture.
3. **The 3D lane is not compositor-wired** (PlanVisualKind lacks "3d";
   `scene-3d.mp4` is never assembled). S160 upgraded its LOOK; wiring it
   into the composition plan remains a recorded gap (Part 3, row 2).
4. **Half the Stage-S substrate is still dead code**: `anim/camera.ts`,
   `anim/gait.ts`, `anim/ik.ts`, `anim/contact.ts` have zero consumers.
   The character lane is deliberately FK-only (K1 §6 non-goals). The
   OpenToonz findings below give these primitives a real adoption path.

---

## Part 1 — the shortlist: repos, licenses, clean-room boundaries

| Repo (slug) | License (verified at source) | Role | Boundary |
| --- | --- | --- | --- |
| `motion-canvas/motion-canvas` | **MIT** (root LICENSE + package.json; core dep = chroma-js MIT) | animation primitives, transitions, determinism model | concepts + MIT constants only; do NOT ingest `ui`/`vite-plugin`/`2d` heavy deps (mathjax-full, codemirror, chroma-js) |
| `GovinduSasanka/opus-motion-library` | **MIT** (+ THIRD_PARTY_NOTICES: some files adapted from other MIT projects with header attributions) | measured easing vocabulary, 616-motion catalog schema, 97-transition DEFAULTS table, transition geometry kit | MIT math/constants portable with attribution where headers name third parties; the Remotion/React component bodies are NOT portable (framework-locked: 673/753 src files import remotion) |
| `rough-stuff/rough` | **MIT** (Preet Shihn; 4 same-author MIT deps) | hand-drawn geometry: roughening math, seeded PRNG, hachure fills | pure-math core (1,284 LOC) is clean; MUST fix its 4 determinism landmines on adoption (Part 4, S164) |
| `heygen-com/hyperframes` | **Apache-2.0** (HeyGen; CREDITS.md acknowledges Remotion as prior art, code independent) | determinism enforcement, capture pipeline, QA/self-healing loops, agent-facing craft docs | patterns + flag sets + prose craft tables; NOT the HTML data-attribute runtime (couples to their GSAP/WAAPI seek machinery), NOT GSAP, NOT their Studio |
| `opentoonz/opentoonz` | **BSD-3-Clause** (DWANGO + contributors; thirdparty/ has own notices) | cutout-rig pose model, keyframe interpolation math, xsheet cell model, Jacobian IK | core lib concepts + formulas; no C++ anywhere |
| `blender/blender` | **GPL-2.0-or-later** | camera-shake fBM, defocus CoC math, bloom chain, SOP/CDL grade | **reference-only, formulas and behavior only — zero code transcription, as with friction/synfig (the S-reception boundary)** |
| (carried from S160) `mromidev/claude-animated-shorts` | MIT (code/docs); reference frames style-study-only | the measured look bible already partially adopted | unchanged |

Clean-room extensions that now bind every stage below:

1. **No dependency from any shortlisted repo enters the tree, ever** —
   the no-new-dependencies law holds. Everything is re-derived natively.
2. **Blender = formulas only.** GPL math re-implemented from written
   formulas in our own modules; no file opened into the codebase.
3. **Opus attribution forwarding**: if a lifted constant table's source
   file header names a third MIT project, the attribution line rides into
   our header comment.
4. **Rough.js determinism landmines do not survive the port** (seed-0
   Math.random fallback, unseeded dots filler, `|| Math.random()` in the
   scan-line filler, shared mutable randomizer on options objects).
5. **HyperFrames prose craft tables** (motion.md measured defaults) are
   Apache-2.0 text — reusable with our own re-measurement; treat their
   numbers as priors, re-verify against our surfaces before pinning.

---

## Part 2 — what each repo actually teaches (the distilled inventory)

### 2.1 Motion Canvas (MIT) — the animation primitive school

- **Frame-quantized generator threads** (`packages/core/src/threading/`,
  `tweening/tween.ts`): a tween is a generator advanced once per frame
  against `thread.fixed` — the deterministic rendering proof: any frame can
  be rendered independently from scratch (`app/Renderer.ts renderFrame`).
  TubeForge's pure `frameAt(doc, tMs)` is the declarative equivalent; the
  borrowable idea is **per-frame quantized evaluation everywhere**, which
  we already hold.
- **Spring integrator** (`core/src/tweening/spring.ts`): Hooke's law at
  fixed sub-steps, settle tolerance 0.001, 7 tuned presets. Opus adds
  4 more (`pop {11,160,0.7}`, `snappy {18,260,0.6}`, `soft {20,90,1}`,
  `wobble {7,120,0.8}`).
- **The transition architecture** (`core/src/transitions/useTransition.ts`
  + `app/Stage.ts`): previous and current scenes render to separate
  buffers; a transition = two per-scene transform/alpha hooks; built-ins
  are 18–52 LOC each. This is the shape a TubeForge transition module
  should take.
- **Choreography flow** (`core/src/flow/sequence.ts`): stagger = constant
  START offset without waiting for completion, then join-to-max. The
  declarative translation is `{stagger, overlap}` groups on element sets.
- **Seeded RNG** (`core/src/scenes/Random.ts`): Mulberry32, re-created from
  `meta.seed` on every scene reset — their determinism guarantee.
- **deepLerp / textLerp / arcLerp / polarLerp** (`tweening/
  interpolationFunctions.ts`, `types/Vector.ts`): structured interpolation,
  typewriter morph, arc/orbit path interpolation, rotation-minimizing
  polygon morph (`2d/src/lib/curves/createCurveProfileLerp.ts`).

### 2.2 Opus Motion Library (MIT) — the measured-craft data set

- **`src/core/ease.ts` (68 LOC): the measured easing vocabulary** —
  `out cubic-bezier(0.16,1,0.3,1)` (default entrance), `inOut
  (0.65,0,0.35,1)` (camera/morph), `sine (0.37,0,0.63,1)` (drifts),
  `in (0.55,0,1,0.45)` (exits), `back (0.34,1.56,0.64,1)` (small
  overshoot), `expoOut (0.19,1,0.22,1)`, `expoInOut (0.87,0,0.13,1)`.
  Numbers, not code — instant perceptual upgrade.
- **Counter craft** (`src/motions/text/big-stat-slide.tsx`): counter sized
  from its FINAL string + `fontVariantNumeric: tabular-nums` (kills glyph
  jitter), ~15–20 frame overlap schedule (eyebrow 0–18, number 4–26, rule
  20–52 expoOut, label 34–64), landing pulse `1+0.025·sin(landed·π)`.
- **Kinetic type craft** (`kinetic-type-slam.tsx`): per-word masked slide
  in `overflow:hidden` masks (6-frame exit), alternating entry scales
  (even 1.25→1 spring, odd ≤0.6→1), landing shake with incommensurate
  frequencies (`sin(f·12.9)·k, cos(f·9.3)·k, k=5px·(1−age/5)`), linear
  camera push `1+0.06·(frame/duration)`.
- **Impact micro-keyframes** (`stamp-slam.tsx`): scale `[1.30, 1.008,
  0.98, 1]` at frames `[0,2,3,5]` — impact + undershoot settle in 5 frames;
  white flash 0.3 over 3f; 4-frame camera jolt.
- **The transition DEFAULTS table** (`src/transitions.tsx` lines 190–290):
  97 tuned ids — fade 15f, iris 8f, zoom 14f, whiteout 42f, bar 8f/0.036,
  blinds 18f/12 bands — plus the **SVG luminance-mask architecture**: every
  custom transition renders each scene ONCE and reveals via
  `mask: url(#id)` (only glitch duplicates layers). The geometry kit
  (`src/transitions/kit.tsx`): `axisFor(angle,w,h)`, `cornerR()` (radius to
  farthest corner), `bandPoly/ahead/region` front-wipe polygons, seeded
  `hash01 = frac(sin(n·127.1+311.7)·43758.5453)`.
- **Zoom-through numbers**: exiting side `scale 1+2.6·p^2.2`, blur
  `p·10px`, opacity `1−sstep(0.75,1,p)`; entering `0.74+0.26·outCubic(q)`,
  `q=clamp01((p−0.3)/0.7)`, opacity `sstep(0.35,0.72,p)`. Push-blur
  overshoots travel 4% then settles.
- **Catalog schema** (`catalog.json` fields + `defineMotion`): every preset
  carries `useFor / roles / weight / formats / mood / loopable / bestLength
  / pairsWith / overlay` — the metadata an automated director needs.
- **The `u` unit system** (`src/core/stage.tsx`): `u = min(w,h)/1080`; all
  sizes in u — resolution/aspect independence.

### 2.3 Rough.js (MIT) — the hand-drawn geometry school

- **Seeded PRNG** (`src/math.ts`, 14 LOC): MINSTD Lehmer
  `Math.imul(48271, seed) & (2³¹−1) / 2³¹`. Landmines: seed 0 falls back to
  `Math.random()` forever; dots filler jitters with raw `Math.random()`;
  scan-line filler has `|| Math.random()`; the randomizer is cached
  mutable on shared options. All four must be fixed in our port.
- **The roughened line** (`src/renderer.ts _line/_doubleLine`, ~80 LOC):
  every stroke = one cubic Bézier drawn TWICE (overlay at seed+1);
  perpendicular bow `bowing·maxRandomnessOffset·Δy/200` and
  `·(x1−x2)/200`; length-based roughness gain (1 below 200px → 0.4 above
  500px, linear between); endpoint jitter `maxRandomnessOffset` capped at
  `length/10`; control points at 20–40% / 40–80% (`divergePoint = 0.2 +
  rand·0.2`).
- **Rough Catmull-Rom curves** (`_curve`, ~65 LOC): jittered polyline →
  cubic Béziers with `s = 1 − curveTightness`, control offset
  `s·(p[i+1]−p[i−1])/6`; first/last points double-drawn.
- **Ellipse with seam overshoot** (`generateEllipseParams/
  _computeEllipsePoints`, ~95 LOC): size-scaled step count
  `max(curveStepCount, curveStepCount/√200·psq)`, radius jitter from
  `1−curveFitting`, random start angle, and the 1.0/0.98/0.9 radius
  overshoot trio past the seam — the hand-drawn crossed circle.
- **Scan-line hachure fills** (`hachure-fill` `straightHachureLines`, ~95
  LOC): rotate polygon by `angle+90` → sorted-edge-table sweep → rotate
  back — TRUE polygon-clipped hatching (vs our bbox-rows + clipPath);
  `hachureGap` defaults `strokeWidth×4`; the `roughness≥1 → 30% skip-row`
  flourish; each other style is a ≤50-LOC wrapper (cross-hatch = +90°
  second pass; zigzag = paired offset lines; zigzag-line = √2·zo midpoint
  kink; dashed = centered dash placement).
- **Bezier flattening + RDP** (`points-on-curve`, 137 LOC): flatness test
  `ux = 3p2−2p1−p4, vx = 3p3−2p4−p1`; RDP epsilon `(1+roughness)/2`.
- **Fixed-decimal serialization** (`opsToPath` + `fixedDecimalPlaceDigits`):
  byte-identical `d` strings across runs — matches our `fmt2` discipline.

### 2.4 HyperFrames (Apache-2.0) — the determinism-enforcement school

- **Integer frame clock** (`packages/core/src/inline-scripts/parityContract.ts`):
  `time = floor(frame)/fps`, quantized seeks, rational fps support.
- **Page-side virtual-time shim** (`producer/src/services/fileServer.ts`):
  Mulberry32 re-seeded from frame time on every seek; virtual Date/
  performance.now; timers fired in due order per seek; rAF flushed
  synchronously. ~200 dependency-free lines. (TubeForge's engines own their
  clocks by construction — the shim's value for us is the 3D page and any
  future page that runs third-party code.)
- **Media never trusted to seek** (`engine/src/services/videoFrameExtractor.ts`):
  every `<video>` pre-extracted frame-by-frame with ffmpeg and swapped for
  `<img>` during capture — video pixels become a pure function of frame
  index.
- **Static-frame dedup with PSNR verification**
  (`frameCapture.ts computeStaticFrameSet` + `verifyStaticFramesSafe`):
  predicted static frames (no tween active, not a cut boundary ±1),
  anchor-verified — the throughput win for hold-heavy scenes.
- **Ready-gate protocol with NAMED diagnostics**
  (`frameCapture.ts HF_READY_DIAGNOSTIC_EXPR`): a diagnostic expression
  that returns exactly which ready key is pending/rejected — turns "render
  hung" into an actionable message.
- **The agent-facing API shape**: prose skills encoding craft + lint rules
  with `Fix:` hints + machine-checkable assertions (`<name>.motion.json`:
  `appearsBy/before/staysInFrame/keepsMoving`, verified by sampling the
  seeked timeline at 20 fps) + `layout` audit (clipped text, occlusion,
  overflow, out-of-canvas).
- **Golden-video regression harness** (`producer/tests/*` +
  `regression-harness.ts`): committed output.mp4 baselines with metadata
  thresholds `{minPsnr, maxFrameFailures, minAudioCorrelation,
  maxAudioLagWindows, residualRmsDb}`; PSNR via `ffmpeg -lavfi psnr`;
  GPU-vs-software parity harness.
- **Chrome flag set** (`browserManager.ts buildChromeArgs`):
  `--deterministic-mode --enable-begin-frame-control
  --run-all-compositor-stages-before-draw --disable-threaded-animation
  --disable-threaded-scrolling --disable-checker-imaging
  --disable-image-animation-resync --font-render-hinting=none
  --disable-lcd-text --force-color-profile=srgb
  --force-device-scale-factor=1`, plus the SwiftShader
  `--disable-gpu-compositing` stale-raster workaround.
- **Transcript-driven ducking lanes** (`media-use/lib/duck.mjs`): word
  timestamps → volume automation (attack 0.15s / release 0.4s / duck 0.25)
  rendered into the mix deterministically.
- **Craft prose** (`skills/hyperframes/references/motion.md`): ease-by-role
  tables, stagger tables, exits 40–50% shorter than entrances, hold = 0.5s
  + 0.3s/word, "defaults that look generated" blacklist.

### 2.5 OpenToonz (BSD-3) — the production-rig school

- **Polar-delta pose model** (`tnzext/plasticskeletondeformation.cpp`
  L515–549): pose = per-part polar deltas (ANGLE Δ, DISTANCE Δ) off the
  parent, rebuilt by recursive polar FK — keys blend trivially; per-part
  rigidity keeps sub-drawings rigid.
- **Interpolation math** (`common/tparam/tdoubleparam.cpp`):
  - SpeedInOut = 1-D cubic bezier in (frame, value) space with handle
    truncation (`getCubicBezierY` L128–149);
  - **EaseInOut = piecewise PARABOLIC** (`getEaseInOutValue` L195–233):
    quadratic acceleration spans at each end, LINEAR constant-velocity
    middle, spans capped to half when they overlap — the animators'
    "constant velocity through the middle" feel smootherstep lacks;
  - **Exponential** = `a·exp(t·log(b/a))` (L237–258) — the correct curve
    for zoom push-ins (constant perceived zoom rate).
- **Xsheet cell model** (`include/toonz/txshcell.h`): a hold = the same
  cell repeated across rows — identity-based exposure, not per-frame keys.
  Maps to our mouth/pose art swaps as *(part, artId) cell spans*.
- **Jacobian IK with Damped Least Squares** (`toonzlib/ikengine.cpp` L62–113):
  pinned-contact chain reduction → `computeJacobian → deltaθ (DLS) →
  update → joint limits`, ≤250 iterations, results written back as editable
  keyframes — the adoption path for our unwired `anim/ik.ts` + `contact.ts`.
- **Lip-sync shape classes** (`toonz/lipsyncpopup.cpp` L130–150): 10 named
  classes; ours (5 vowel groups) is missing **mbp** (bilabial closure) and
  **rest** — the two cheapest accuracy wins.

### 2.6 Blender (GPL — formulas only)

- **Camera shake = fBM Perlin noise modifier** (`blenkernel/intern/
  fmodifier.cc fcm_noise_evaluate` L814–867; `noise.cc perlin_fbm` L728–754):
  octave loop `sum += perlin(f·p)·amp; amp *= roughness(0.5); f *=
  lacunarity(2.0)`, normalized by max amp, applied as
  `value += (noise−0.5)·strength` per channel — decaying non-repeating
  handheld motion; strength carries the per-shot envelope.
- **Defocus CoC** (`nodes/composite/node_composite_defocus.cc` L361–480):
  Potmesil–Chakravarty — `C = |(Vu − Vp)·f/(fstop·Vu)|`, radius = C/2 ×
  pixels-per-meter, clamped; the min-radius cross-layer guard
  (`min(centerRadius, candidateRadius)`) prevents halo bleed.
- **Bloom** (`node_composite_glare.cc execute_bloom` L1773–1857):
  progressive-halving downsample chain + tent-filter upsample (the CoD:AW
  pattern — same family as the reference's mipmapBlur).
- **Grade** (`node_composite_color_balance.cc`): LGG
  `lift'=((c−1)(2−lift))+1 → ×gain → ^(1/γ)` and SOP/ASC-CDL
  `c·slope + offset → ^power` — expressible as ffmpeg
  `curves`/`colorbalance` args per scene.

---

## Part 3 — the six-mode audit (today / missing / borrow)

### 3.1 Motion graphics (2D) — engine `src/lib/tubeforge/graphics/`

Works today: declarative GraphicsDoc (11 element kinds), 6 eases incl.
glide, enter/tween/exit/emphasis composition, per-scene pan/zoom camera
(zoom 1–4), hit-kick shake, VO-measured clocks, resume manifests, QC
lenses, sprite lane, editor with hit-testing.

Missing (ranked): bezier-curve eases (the measured vocabulary); spring
tracks; scene transitions (only assembly-level xfade); counter glyph
jitter (proportional digits + mid-count re-style); per-word masked
stagger; resolution-independent sizing; a preset/registry layer the
Director can pick from.

Borrow (files): opus `ease.ts` constants → `anim/easing.ts`; opus counter/
kinetic/stamp schedule constants → `graphics/frame.ts` motion semantics;
opus transition DEFAULTS + MC transition architecture → NEW
`graphics/transitions.ts` + assembly overlap accounting; MC `sequence`
semantics → planner stagger groups; opus `u` system → `graphics/compose.ts`
sizing; opus catalog schema → a later `graphics/presets.ts`.

### 3.2 Scene story (3D) — `scene3d.ts` / `render3d.ts`

Works today (post-S160): glide camera keys, sky dome, horizon fog, real
shadows, Neutral tone mapping, eased object keyframes, a living scaffold.

Missing: compositor wiring (the recorded gap — 3D clips never assemble);
fBM camera shake; exponential hold push-ins; DOF (CoC) pass; bloom; a
grade field per scene.

Borrow: Blender fBM shake formula + exponential zoom curve → `anim/` +
`scene3d.ts`; Blender CoC/bloom math → the future finisher GL pass; MC
transition buffers → if 3D clips ever composite in-engine. Wiring task:
add `"3d"` to `PlanVisualKind` + `engineSegmentVerdict` admission so
`scene-3d.mp4` joins assembly (the S94 recorded-tail pattern).

### 3.3 Whiteboard explainer — `src/lib/tubeforge/whiteboard/`

Works today: stroke-dash reveal synced to word anchors, hand tremble, pen
width breathing, ink palette, camera drift + director, glyph text.

Missing: real hand-drawn GEOMETRY (strokes are too clean under the tremble
layer), polygon-clipped fills, ellipse/curve primitives, any fill styles
beyond flat.

Borrow (files): Rough.js MINSTD PRNG (seed||1, per-shape fnv1a derivation)
→ `whiteboard/sketch.ts`; the bowing double-stroke line → NEW
`whiteboard/roughen.ts` (replaces the symmetric sine dither); scan-line
hachure + 4 fill wrappers → NEW `whiteboard/fills.ts`; rough Catmull-Rom +
ellipse overshoot → `whiteboard/glyphs.ts`; bezier flatten + RDP →
`whiteboard/svg.ts`. Determinism checklist from Part 1 §4 is binding.

### 3.4 Character animation — `src/lib/tubeforge/characters/`

Works today: FK rig (14 slots), pose tweens 320ms, mouth art swap (5
vowel-group shapes) from syllable estimator, gesture table, BVH partial
mapping, breath rig, mocap re-arm.

Missing: mouth classes mbp/rest; per-part rigidity; IK-driven reach (K1
law says FK-only — a K2 gate decision, not a drive-by); pose key
interpolation limited to linear/hold.

Borrow (files): OpenToonz parabolic EaseInOut + Exponential →
`anim/easing.ts` (shared, benefits every lane); OT polar-delta pose model
+ rigidity → `characters/rig2d.ts` pose schema (v-next, additive); mbp +
rest mouth classes → `characters/rig-frame.ts` SPEECH_CYCLE + art
variants; OT chain-reduction + DLS pattern → `anim/ik.ts` adoption behind
the K2 gate (results written back as editable keyframes); OT xsheet cell
spans → mouth/pose art-swap spans (closer to our current spans than to a
change).

### 3.5 Keynote slides — `src/lib/tubeforge/slides-kinetic.ts`

Works today (S153): staggered headlines, accent pops, counters, bars,
entering rows, camera settle, deterministic hash-cached clips, static
fallback.

Missing: the shared transition engine; counter glyph jitter (same fix as
graphics); editorial layout families beyond the eight; font pairing
discipline.

Borrow: EVERYTHING in 3.1's counter/stagger items rides here for free
(shared substrate); HyperFrames craft prose (exit shorter than entrance,
hold tables, "defaults that look generated" blacklist) → our kinetic
timing constants; the u-system for slide typography scale.

### 3.6 Classic narration — compositor + finishing
(`render.ts` / `render-assembly.ts` / `audiomix.ts`)

Works today: Ken Burns/stock/i2v channels, xfade transitions, ducking,
loudness normalize, ASS subtitles, render manifests + staleness gates.

Missing: per-scene grade fields; golden-video regression pins; static-frame
dedup on hold-heavy stills; transcript-driven duck KEYFRAMES (ours is
sidechain live).

Borrow: Blender SOP/CDL grade → a per-scene `grade` field expressed as
ffmpeg `curves`/`colorbalance` args; HyperFrames golden harness →
extend the s87 battery; static-frame dedup → the kenburns lane's hold
windows; duck automation lanes (attack 0.15 / release 0.4) →
`audiomix.ts` as deterministic gain envelopes.

---

## Part 4 — the implementation roadmap (staged, file-by-file)

Each stage keeps the house laws: no second renderer, one timeline, pure
frame truth, additive seams with byte-identity for absent fields, named
walls, no new dependencies. Order = visual impact per LOC × risk.

### S162 — the measured easing + choreography slice (motion graphics + substrate)

- **Objective**: replace "synthetic-feeling" motion with the measured
  vocabulary; kill counter glyph jitter; add overlap scheduling.
- **Files**: `anim/easing.ts` (add cubic-bezier curve evaluator — pure
  polynomial/binary-split evaluation, exact-multiplication law: bezier via
  de Casteljau on y; add `parabolic-in-out` + `exponential` from OT);
  `graphics/frame.ts` (GRAPHICS_MOTION_SEMANTICS += counter tabular-nums
  flag, landing pulse, kinetic stagger constants); `graphics/compose.ts`
  (counter sized from final string); `graphics/planner.ts` (native enter
  table rides the new curves).
- **Acceptance**: new pins (bezier anchor values incl. the opus six
  constants; parabolic middle-linearity; exponential symmetry); existing
  898 pins byte-stable (absent fields ⇒ old behavior); the blind-rubric
  kit pattern (s123 precedent) for a before/after pair.
- **Complexity**: low-medium. Highest impact-per-LOC of the whole roadmap.

### S163 — the native transition engine (graphics + keynote + whiteboard tails)

- **Objective**: scene-to-scene transitions beyond assembly xfade.
- **Phase A (cheap)**: enrich the assembly xfade preset vocabulary with the
  opus DEFAULTS table numbers (fade 15f, iris, wipe/angle, zoom-through,
  whiteout 42f) as named studio-doc transition presets →
  `studio-doc.ts` + `render.ts` xfade args.
- **Phase B (native)**: NEW `graphics/transitions.ts` —
  `TransitionSpec {type, frames, angle, color, bands, seed}`; per MC's
  architecture, both scenes' snapshots composite with
  transform/alpha/mask hooks; opus kit geometry (axisFor/cornerR/hash01
  seeded edge). Render = a transition-window clip that joins assembly
  (the engine-segment pattern, one more kind).
- **Acceptance**: Phase A pins on generated ffmpeg args; Phase B
  byte-identity for docs without transitions + sweep-hash for with;
  overlap accounting subtracts transition frames (opus `specDuration`
  law).
- **Complexity**: Phase A low; Phase B medium-high (assembly contract
  touch).

> **LANDED** — Phase A at `409fc59` (battery 910); Phase B at `9a9fb9e`
> (battery 920/920 — the 910 pre-existing pins stay green + 10; CI 8/8).
> Phase B shipped the staging as specified: `graphics/transitions.ts`
> (743 LOC, pure — no fs/ffmpeg/Date.now/Math.random) with the closed
> native set (crossfade, iris, whiteout, zoomthrough, wipeleft,
> wiperight) at the measured opus frame counts, the in-house seeded
> geometry (hash01 FNV-1a / axisFor / cornerR — no shared mutable
> stream), the JSON-stable 3-dp-quantized per-frame compositor, and the
> overlap-accounting law in its NET-ZERO form (window frames are CARVED
> from the outgoing scene's tail and given back as the window clip —
> Σ clips + Σ windows ≡ Σ legacy frames as an integer identity, so the
> delivered program stays exactly the doc clock and the two-clock assert
> guards unchanged). The additive opt-in rides `types.ts`
> (`nativeTransitions` indexed by boundary; absent ⇒ byte-identical
> legacy path at parse, write AND render). The QC seam expectation books
> native boundaries as blend windows with the same running-sum
> arithmetic as the builder (the two derivations cannot disagree). The
> live smoke caught a real P5-proof bug (the window applier received an
> OBJECT where it JSON.parses a STRING) — fixed by double-encoding the
> description into a quoted literal, pinned.

### S164 — the whiteboard hand-drawn geometry slice (Rough.js native port)

- **Objective**: real hand-drawn strokes and fills; keep byte-determinism.
- **Files**: NEW `whiteboard/roughen.ts` (MINSTD PRNG with `seed || 1`,
  per-shape seed = fnv1a(assetId::pathId) — NO shared mutable stream;
  bowing double-stroke line; rough Catmull-Rom; ellipse overshoot);
  NEW `whiteboard/fills.ts` (scan-line hachure + cross-hatch/zigzag/
  zigzag-line/dashed wrappers; dots ONLY with the seeded-jitter fix);
  `whiteboard/sketch.ts` (wire behind the existing sketch-pass transform
  + S139 knobs `roughness/bowing`); `whiteboard/svg.ts` (fixed-decimal
  serialization parity; bezier flatten + RDP for authored curves).
- **Acceptance**: same doc + seeds → identical `d` strings across two
  processes (the byte-identity pin, run twice); NO `Math.random` in the
  whiteboard tree (source-pin, the S157 pattern); countPathCommands cap
  guard for large fills; blind kit W-series.
- **Complexity**: medium; ~600–900 new LOC, all pure geometry.

> **LANDED** — `da654d3` (battery 928/928 — the 920 stay green + 8; CI
> 8/8; live smoke byte-identical). The port is in-house — no Rough.js
> dependency: `whiteboard/roughen.ts` (310 LOC, the MINSTD PRNG + the
> per-shape seed law fnv1a(assetId::pathId), no shared mutable stream;
> bowing double-stroke, rough Catmull-Rom, ellipse overshoot) and
> `whiteboard/fills.ts` (314 LOC, scan-line hachure inside by
> construction, the four wrappers, dots ONLY with the seeded jitter)
> wired BEHIND the S139 sketch pass with its roughness/bowing knobs
> (absent ⇒ byte-identical legacy, pinned). `svg.ts` gains fixed-decimal
> parity through the ONE serializer, the authored-curve flatten + RDP,
> and the countPathCommands cap guard. Pins ×8: byte-identity RUN TWICE,
> the extended banned-token source-pin, the cap guard, per-shape seed
> independence, absent-knob byte-identity, fixed-decimal parity, the
> primitives and fill styles at their laws. The live smoke
> (`scripts/s164-proof.mts`) rendered a knob-active asset through the
> real chromium → sketch → applier → ffmpeg path twice — sha256
> 873109629c1732f0… both runs, byte-identical. THE BLIND KIT W-SERIES IS
> NOT YET RUN — the audit's acceptance names it; the kit remains the
> human gate for this slice, unbuilt.

### S165 — the render-farm determinism + throughput slice (HyperFrames patterns)

- **Objective**: enforce and prove determinism at the pipeline level; buy
  throughput on hold-heavy scenes.
- **Files**: render farm launch args (`whiteboard/render.ts` WB_CHROMIUM
  set + per-engine adoption of the srgb/font-hinting flags); ready-gate
  named diagnostics (`render.ts`, `render3d.ts` — replace generic timeout
  errors with which-gate-is-stuck expressions); static-frame dedup for the
  kenburns/holds lane (anchor frame + PSNR spot check); golden-video
  regression harness extension to the s87 battery (committed baselines +
  `{minPsnr, maxFrameFailures, minAudioCorrelation}` metadata); lint-rule
  port: non-deterministic-code scan for engine modules (no Date.now/
  Math.random in frame-truth modules — several already exist as pins; this
  generalizes them).
- **Acceptance**: throughput benchmark (dedup on a 30s hold scene);
  golden harness green on three engines; a deliberate nondeterminism
  fixture is CAUGHT by the new scan.
- **Complexity**: medium; mostly infrastructure.

> **LANDED** — `0be0b5a` (part 1) + `a2759db` (part 2); battery
> 933/933 — the 928 stay green + 5; CI 8/8; the s87 battery FULL (A–E)
> 42/42 foreground. Part 1: the per-engine srgb/font-hinting chromium
> launch sets; the ready-gate named diagnostics (`render-gates.ts` —
> which-gate-is-stuck expressions across graphics/whiteboard/3D/slides);
> `graphics/static-dedup.ts` (the pure scan + PSNR reading law,
> fail-closed below the floor). Part 2: THE DEDUP THROUGHPUT, MEASURED —
> one 30s hold scene (720 delivered frames) through the same pipeline:
> dedup OFF 30,365 ms wall / 720 chromium screenshots; dedup ON 7,035 ms
> wall / 2 screenshots / 693 frames reused — **4.32× wall-clock**, the
> delivered clock identical (the two-clock law holds). The golden-video
> harness rides the s87 battery with committed baselines +
> `{minPsnr, maxFrameFailures, minAudioCorrelation}` per engine — green
> on THREE engines (graphics / scene3d / whiteboard fixtures committed
> under `scripts/golden/s165/`). The generalized frame-truth scan
> (`src/lib/tubeforge/frame-truth-scan.ts`, 251 LOC): the real engine
> tree green at 32 modules, and the DELIBERATE NONDETERMINISM FIXTURE is
> CAUGHT — the acceptance is evidence, not intent.

### S166 — the character expressiveness slice (OpenToonz adoptions)

- **Objective**: better mouths, better pose math; decide the IK gate.
- **Files**: `characters/rig-frame.ts` (SPEECH_CYCLE gains mbp + rest
  classes; syllable→class mapping extension); character parts generation
  (the two new art variants); `anim/easing.ts` rides S162's parabolic +
  exponential; pose tween schema v-next (polar deltas + per-part rigidity,
  additive optional fields); K2 gate record: chain-reduction + DLS IK
  behind an authored-contact contract (OT pattern), results written back
  as keyframes — IMPLEMENT ONLY after the K2 design slice.
- **Acceptance**: mouth-class pins (mbp closure windows; rest on pauses);
  FK byte-identity for untouched docs; K2 decision recorded in this doc's
  successor.
- **Complexity**: mouth classes low; pose schema medium; IK gated.

> **LANDED** — `53a5cec` (battery 947/947 — the 933 stay green + 14).
> The mouth classes: SPEECH_CYCLE gains the mbp closure windows + the
> rest class (rest on pauses), the syllable→class mapping extended; the
> two new art variants join parts generation (existing variants
> byte-identical). The pose tween schema v-next rides ADDITIVELY: polar
> deltas (OT ANGLE Δ / DISTANCE Δ — senior over x/y; two polar keys
> tween ON THE ARC, the constant-radius off-the-chord blend) + per-part
> rigidity (own scale inert, inherited pose scale stripped, the subtree
> rigid; rotation and translation still apply); the new fields' tweens
> ride the ONE curve table `evalEase` so S162's parabolic-in-out and
> exponential drive pose segments directly (their laws re-pinned at the
> pose level). FK byte-identity for untouched docs pinned. THE K2 GATE
> IS RECORDED, NOT IMPLEMENTED — the deferred decision + the contract
> sketch (chain reduction, DLS, the authored-contact contract, bake-only
> results) live in `docs/audits/s166-k2-gate-record.md`, exactly as this
> section's staging required.

### S167 — the cinematic finisher slice (Blender math + 3D wiring)

- **Objective**: depth + grade in the finishing pipeline; wire 3D into
  assembly.
- **Files**: `scene3d.ts`/`anim/camera.ts` (fBM shake channel — an
  in-house seeded Perlin fBM implementation, ~60 LOC, formula from
  Part 2.6; exponential hold push-ins); `studio-doc.ts` (per-scene grade
  field: SOP/CDL scalars); `render.ts`/`render-assembly.ts` (grade →
  ffmpeg `colorbalance`/`curves` args; duck automation lanes in
  `audiomix.ts` — attack 0.15/release 0.4 keyframed envelopes); the 3D
  compositor wiring (PlanVisualKind "3d" + engine-segment admission).
- **Acceptance**: fBM shake pins (zero at strength 0, bounded, seeded);
  grade args pin; the 3D clip appears in a rendered assembly in the e2e
  smoke; duck envelope pins.
- **Complexity**: medium; the 3D wiring touches the compositor contract.

> **LANDED** — `57a6ab2` (the slice) + `cb5ffb5` (the smoke receipt) +
> `a511a45` (the lint law); battery 952/952 — the 947 stay green + 5;
> CI 8/8. `anim/camera.ts` + `scene3d.ts` gain the fBM shake channel —
> the in-house seeded Perlin fBM, pure (it passes the frame-truth scan),
> zero at strength 0, bounded, seeded; exponential hold push-ins ride
> S162's curve. `studio-doc.ts` carries the per-scene SOP/CDL grade
> scalars (additive optional — neutral/absent compiles the legacy
> stream byte-for-byte); the CDL compile to ffmpeg `colorbalance`/`curves`
> is pinned. `audiomix.ts` (NEW, 126 LOC) lands the duck automation
> lanes — attack 0.15 / release 0.4 provenance-pinned keyframed
> envelopes. PlanVisualKind "3d" is admitted as an engine segment (the
> admission law fail-closed without the segment, admitted with it). THE
> ACCEPTANCE'S E2E ARM, ON REAL BYTES
> (`docs/audits/s167-3d-assembly-smoke.json` + `scripts/s167-3d-assembly-smoke.mts`):
> the finisher doc (fBM seed 167, pushIn 0.18) through the 3D engine
> (SwiftShader chromium, 48 frames @ 24 fps), the schema-2 tracks doc
> reading the 3d kind through planFromTracks, the compositor staging
> both segments through the SAME function (identical codec parameters —
> the concat's -c copy law) — the probe reads duration exactly 3.00s,
> the 3d window carries real raster ink (luma variance 204.7 vs the flat
> card window 0.0, mean |Δ| 12.13 — different pictures), and the
> hold-frame |Δ| = 0.296 proves the finisher channels are live in the
> raster. THE 3D-NOT-COMPOSITOR-WIRED GAP (Part 0.3) IS CLOSED.

### Deliberately NOT adopted (recorded rejections)

- Remotion/React/GSAP as dependencies (framework lock-in; license posture).
- HyperFrames' HTML data-attribute composition runtime (couples to their
  seek machinery; our JSON plan + engine dispatch is the better fit).
- Motion Canvas' ui/vite-plugin/2d heavy deps; chroma-js (monochrome house).
- Rough.js' shared mutable randomizer and its unseeded paths (Part 1 §4).
- Opus' three.js motion families and @remotion/noise simplex (reimplement
  in-house when needed — S167 does exactly that for fBM).
- Blender/OpenToonz CODE (GPL boundary / C++ posture) — formulas only.

---

## Part 5 — laws compliance check

| House law | How the roadmap keeps it |
| --- | --- |
| No second renderer | Every stage rides chromium-screenshot → ffmpeg; S163-B adds an engine-segment KIND, not a pipeline |
| One timeline | Transitions subtract frames from the existing window math (opus specDuration law); grades/shake ride existing per-scene fields |
| Pure frame truth | All new motion math is pure (bezier/parabolic/exponential/fBM/roughen — seeded, no clock); S165 ADDS enforcement |
| Determinism | Rough landmines fixed on arrival; fBM/shake seeded; golden harness proves it end-to-end |
| Additive seams | Every doc field optional; absent ⇒ byte-identical (S160 proved the pattern again) |
| Named walls | Fill command caps, transition frame budgets, dedup verification walls declared per stage |
| No new dependencies | Zero; the six repos stay reference-only |
| AI suggests, human approves | Preset/transition selection stays Director-advisory until an approval gate exists |

---

## Part 6 — visual-quality benchmarks (per mode)

The house blind-rubric pattern (w1/k1/s123 precedents) extends to all six
modes. Each mode gets: a fixed fixture project, shuffled A/B kits (pre/post
slice), a scored rubric (composition, motion feel, craft details, readability),
and a mechanical floor (the golden harness thresholds where S165 lands
them). Floors per mode:

- Motion graphics: no counter glyph jitter (frame-sampled text bbox stability);
  entrance/exit ease roles measured from frame deltas; transition windows
  subtract exactly.
- Whiteboard: stroke wobble within roughness band (sampled deviation
  histogram); fills polygon-clipped (no outside-polygon pixels); two-process
  byte-identity.
- Character: mouth closure on mbp windows ≥90% of frames; pose tween
  velocity continuity (no zero-mid-section on parabolic spans).
- Keynote: same counter/stagger floors as graphics (shared substrate).
- Scene story 3D: shadow contact present in ≥95% of lit frames; glide
  velocity profile matches smootherstep (finite-difference check); shake
  envelope decays within 7f on impacts.
- Classic narration: golden PSNR floors per engine segment; duck envelope
  attack/release within ±2 frames of transcript.

## Part 7 — next action

Execute S162 (the measured easing + choreography slice) first — it is the
highest impact-per-LOC, touches only the shared substrate and the graphics
lane, and every other lane inherits its curves. Whiteboard (S164) second,
per the commissioning report's ordering (motion graphics → whiteboard →
keynote, with keynote riding S162's substrate work).

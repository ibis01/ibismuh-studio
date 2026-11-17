# TubeForge — Master Product & Engineering Roadmap (S162–S184)

**Status: PROPOSED — adopted as direction of travel, nothing else.**

This document preserves the commissioning report's complete product and
engineering programme. Its own governing rule is adopted verbatim as this
file's first law:

> Before S163 begins, preserve this entire roadmap as a proposed
> architectural programme in the repository. It should not silently override
> existing milestone specifications or declare future work approved.

Therefore:

1. **No milestone in this document is approved by its presence here.** Every
   milestone needs its own file-level implementation plan, tests and
   acceptance criteria before work starts (the report's development-order
   rule, §7).
2. **Programme A (S162–S167) already has authoritative file-level staging** in
   `docs/audits/six-engine-visual-quality-audit.md` Part 4 (S161). Where this
   document and that audit disagree on Programme A detail, **the audit wins**
   until a slice's own spec supersedes both.
3. **Ground truth at preservation time:** the report was drafted at
   `e07fbb0` (S162). The reconciliation in §9 records what already exists so
   no programme duplicates shipped work.
4. The repository's own milestone numbering (S149–S162 as committed) is the
   record of truth; the report's milestone numbers are proposals that happen
   to align with the audit's staged roadmap for Programme A.

---

## 0. Strategic objective and philosophy

Build a professional video production platform that ordinary people,
including users with very limited budgets, can afford to use.

The central philosophy:

> AI directs. TubeForge creates. Native engines animate. TubeForge renders.

Treat this as ONE integrated product programme, not separate improvements to
animation, voice generation and AI video creation.

---

## 1. The final product architecture

```
USER
        |
        v
TUBEFORGE STUDIO
        |
        v
   AI DIRECTOR
        |
    +-----------+-----------+
    |           |           |
  Script     Storyboard   Planning
    |           |           |
    +-----------+-----------+
        |
        v
 ASSET GENERATION
        |
   +--------+--------+
   |        |        |
 Images   Voice    Music/SFX
   |        |        |
   +--------+--------+
        |
        v
UNIVERSAL SCENE MODEL
        |
        v
NATIVE ANIMATION ENGINE
        |
    +-----------+-----------+
    |           |           |
   2D          3D       Characters
    |           |           |
Whiteboard   Cinematic   Rigging
    |           |           |
    +-----------+-----------+
        |
        v
     COMPOSITOR
        |
        v
  FFmpeg PIPELINE
        |
        v
  QUALITY CONTROL
        |
        v
   FINAL VIDEO
```

The AI Director is NOT responsible for rendering animation frames. It makes
creative decisions and instructs the native engines.

---

## 2. The six production modes

All six modes share the same foundation. One animation infrastructure, six
production experiences — not six templates.

| Mode | What we want to achieve |
|---|---|
| Classic narration | Beautiful documentary-style videos with animated images, captions and camera movement |
| Scene story | Cinematic storytelling with 2D/3D environments, camera choreography and transitions |
| Whiteboard | Natural handwriting, illustrations, progressive drawing and educational diagrams |
| Motion graphics | Professional typography, animated charts, infographics and kinetic compositions |
| Character animation | Expressive characters, natural movement, facial expressions and dialogue |
| Keynote slides | Professional presentations with animated elements, diagrams and sophisticated transitions |

---

## 3. The master programmes (A–H)

Eight programmes, S162–S184 as proposed numbers:

| Programme | Milestones | Main objective |
|---|---|---|
| A. Animation foundation | S162–S167 | Improve native animation quality |
| B. AI Director | S168–S170 | Build intelligent creative direction |
| C. Universal animation system | S171–S172 | Connect all six modes |
| D. Voice Engine | S173–S176 | Low-cost, high-quality narration |
| E. Asset intelligence | S177–S178 | Image, music and sound management |
| F. Production intelligence | S179–S180 | Automated QC and scene repair |
| G. Creator experience | S181–S182 | Professional editing and controls |
| H. Cost and performance | S183–S184 | Affordable, scalable production |

---

### PROGRAMME A — Native Animation Foundation (S162–S167)

Finish the work already underway before introducing another architectural
layer. **Authoritative file-level detail: the six-engine audit Part 4.**

| Milestone | Work | Acceptance criteria |
|---|---|---|
| S162 | Measured easing and choreography | Blind visual comparison demonstrates improvement |
| S163 | Native transition engine | Reusable transitions across the six modes |
| S164 | Whiteboard geometry | Natural-looking deterministic illustrations |
| S165 | Rendering determinism and throughput | Repeatable frames and measured performance |
| S166 | Character expressiveness | Better facial movement, gestures and IK |
| S167 | Cinematic finishing | 3D compositor integration, lighting and grading |

**S162 status (the report's own caution, kept):** the code slice landed at
`e07fbb0` with the blind A/B kit committed (`scripts/s162-blind-kit.mts`).
The human scoring gate — three independent scorers, composite ≥ 4/5 on the
anchored rubric — is **NOT complete without scoring evidence**. Do not
sacrifice visual quality for milestone speed. Track:
`docs/audits/s162-visual-acceptance-record.md` (PENDING).

---

### PROGRAMME VQ1 — Visual Quality (the overlay programme)

VQ1 is not a new engine layer — it is the quality contract that reads the
November 8 eight-profile blind baseline and turns its findings into
measurable engineering requirements for S162–S180. Source of record:
`docs/baselines/s55-blind-scoring-baseline-2026-11-08.json` + the returned
round's narrative `docs/audits/s55-blind-scoring-record.md`.

**The acceptance rule (VQ1's law, verbatim):**

> A scene must demonstrate meaningful subject or environmental movement
> where the story requires it. Camera movement alone must not qualify as
> successful animation.

**The special requirement (Islamic history):** preserve historical scene
continuity and avoid generating visible depictions of prominent religious
figures where the production brief prohibits them (rides the existing S49
restricted-visual chain; the continuity bar is visual quality, the
depiction bar stays policy).

**The five engineering priorities the findings translate into:**

| Priority | Requirements |
|---|---|
| P1 — Subject animation (top) | Facial expression systems; eye and mouth movement; object transformation; mechanical movement; character gestures |
| P2 — Temporal continuity | Scene-entry and exit states; persistent object identity; no unexplained character appearances; stable geometry across frames |
| P3 — Environmental animation | Water movement; smoke and particles; lighting changes; atmospheric depth; background movement |
| P4 — Camera choreography | Dolly and tracking; parallax; controlled zoom; focus changes; camera movement coordinated with subject movement |
| P5 — Profile-specific quality control | Different video types carry different motion expectations — a podcast is not a mechanical explainer |

**The baseline it answers:** mean overall 3.25/5 (temporal coherence 4.5/5
— the engines hold time; motion MEANING is the gap). Social (2/5,
unconvincing facial movement) and Islamic history (2/5, continuity +
character artifacts) are the critical findings; Explainer and Animation
(3/5) need stronger subject-level motion; Narrative, Advertisement,
Podcast and Documentary (4/5) hold.

**The re-benchmark protocol (fixed now, so the comparison is evidence):**
the same eight profiles, the same five scoring dimensions, three or more
independent blind reviewers, the same scene durations and sampling points,
side-by-side against the November 8 baseline, the artifact-load direction
(5 = few artifacts) preserved. It runs after the VQ1 implementation rounds
land.

---

### PROGRAMME B — AI Director (S168–S170)

This is where TubeForge becomes fundamentally different from conventional
AI video generators.

**S168 — Director Specification.** A formal spec defining what the AI
Director can and cannot control. Responsibilities: understand the user's
request; write scripts; design storyboards; determine scene duration; select
visual styles; choose camera intentions; determine animation requirements;
suggest music and sound effects; select appropriate production modes. The
Director must understand the capabilities of the six engines and **must not
invent unsupported animation commands**.

**S169 — Universal Scene Schema.** A structured representation of each
scene. Illustrative format (the real schema must accommodate all six modes,
validation, asset provenance and timeline synchronization):

```json
{
  "scene_id": "scene_001",
  "duration": 8,
  "background": { "type": "image", "asset_id": "asset_001" },
  "narration": { "text": "The universe contains billions of galaxies.", "voice": "narrator_01" },
  "animation": [
    { "target": "background", "action": "slow_zoom", "duration": 8 },
    { "target": "headline", "action": "kinetic_reveal", "duration": 2 }
  ]
}
```

**S170 — Animation Compiler.** Translates Director instructions into native
engine operations: identify the target, select an approved preset, calculate
its timeline, apply easing, generate frame states, render through the native
engine. The AI does not generate the animation.

**S170 acceptance test:** disconnect the AI provider after the project has
been approved. TubeForge must still render the complete video.

---

### PROGRAMME C — Universal Animation System (S171–S172)

**S171 — Shared Animation Vocabulary.** Reusable animation primitives, each
with standardized timing, easing, interpolation and error handling: Fade.
Scale. Rotate. Translate. Draw. Reveal. Morph. Camera pan. Camera zoom.
Particle movement. Character movement. Stagger. Spring. Parallax.

**S172 — Cross-Mode Integration.** Motion graphics can use whiteboard
drawing effects; keynote slides can use kinetic typography; classic
narration can use 3D camera movement; scene stories can use character
animation; whiteboard videos can use animated charts. Shared capabilities,
not duplicated engines.

---

### PROGRAMME D — Affordable Voice Engine (S173–S176)

Voice generation is one of TubeForge's major recurring production costs.
**Extend the existing TTS architecture, do not build another subsystem** —
the report inspected the repo and found the substantial surface already in
place (`providers/tts.ts`, `providers/registry.ts`, `voice-clone.ts`,
`pronounce.ts`, `views/voice-view.tsx`): multiple providers, self-hosted
voice generation, voice cloning, pronunciation controls.

**S173 — Local Voice Engine.** First priority: zero-per-generation-cost
narration. Candidates: Chatterbox (self-hosted), VoiceStudio engines
(self-hosted), Kokoro (lightweight candidate), CosyVoice, VoxCPM2.
Licensing distinction to verify before commercial deployment: the
VoiceStudio application and individual voice models do not necessarily share
the same licence. Recommended first benchmark: Chatterbox and Kokoro,
compared against the existing VoiceStudio options.

**S174 — Voice Quality.** Natural pronunciation; Nigerian English; British
and American English; multiple accents; speaking speed; pauses and
breathing; emotional delivery; sentence-level regeneration; long-form
narration consistency; multilingual narration.

**S175 — Intelligent Voice Management.** The Director automatically:
analyses the narration; selects a suitable voice; splits long scripts into
manageable chunks; applies pronunciation corrections; generates audio;
measures audio duration; synchronizes narration with scenes; regenerates
only failed sections.

**S176 — Voice Provider Router.** Selects the best available provider by
cost, quality, language, availability, speed and user preference. Proposed
hierarchy: (1) self-hosted Chatterbox/Kokoro — zero per-generation cost;
(2) VoiceStudio; (3) free cloud providers as fallback; (4) ElevenLabs as
optional premium. **Free cloud tiers must have spending limits and must
never silently become paid fallbacks.**

---

### PROGRAMME E — Intelligent Asset Generation (S177–S178)

AI-generated images are optional inputs to the native animation engine.

**S177 — Image Generation Intelligence.** The Director understands which
scenes need images, which can use native graphics, when stock suffices,
when AI imagery adds value, and when existing assets can be reused. Avoid
unnecessary generation — a chart should be drawn by the graphics engine,
not generated as an image.

**S178 — Music and Sound Design.** Background music selection; scene-specific
sound effects; narration ducking; automatic volume balancing; fades;
beat-aware editing; audio normalization; music licensing checks. The
Director selects audio assets; TubeForge handles mixing and synchronization.

---

### PROGRAMME F — Production Intelligence (S179–S180)

**S179 — Visual Quality Intelligence.** Inspect every scene for: empty
compositions; repetitive imagery; poor typography; unnatural movement;
inconsistent lighting; bad transitions; audio synchronization problems;
unreadable text.

**S180 — Intelligent Scene Repair.** Identify a problem, propose a
correction ("the second scene has insufficient visual movement" → introduce
a camera movement / animate the foreground / add a native motion graphic /
improve the transition). The user approves; TubeForge regenerates only the
affected scene. Must preserve the existing revision, approval, cost-control
and artifact-provenance guarantees.

---

### PROGRAMME G — Creator Experience (S181–S182)

**S181 — Professional Timeline Editor.** Edit scenes; adjust animation
duration; change images; replace voices; change music; modify camera
movement; edit typography; preview individual scenes.

**S182 — Creative Director Controls.** Creative style; animation intensity;
video pacing; visual complexity; narration style; camera movement; music
mood. A beginner produces a professional video without understanding
animation engineering; an advanced user still gets detailed control.

---

### PROGRAMME H — Cost and Performance (S183–S184)

Affordability is a product requirement, not an afterthought.

**S183 — Production Cost Intelligence.** Every project shows estimated cost
before generation — separate costs for AI scripts, images, voiceovers,
music, rendering, storage. Introduce: project budgets; per-generation
limits; asset caching; duplicate-generation prevention; local processing;
selective regeneration.

**S184 — Affordable Production Mode.** Three operating modes:

| Mode | Description |
|---|---|
| Free | Local rendering, self-hosted voice, free assets, native animation |
| Standard | Affordable cloud AI, optional generated assets |
| Premium | Higher-quality paid voices, image generation, advanced services |

The free tier must still produce complete videos — never an artificially
crippled demonstration.

---

## 4. The implementation architecture

Logical boundaries, not necessarily independent services. Preserve the
existing modular monolith; introduce service boundaries only where
operationally justified.

| System | Responsibility |
|---|---|
| AI Director | Creative decisions |
| Project Planner | Project and scene specifications |
| Asset Manager | Images, audio and other media |
| Voice Engine | TTS and voice management |
| Animation Compiler | Converts instructions into engine operations |
| Animation Runtime | Executes native animation |
| Universal Timeline | Synchronizes all elements |
| Compositor | Combines visual layers |
| Audio Engine | Mixes narration, music and effects |
| Renderer | Produces final video |
| QC Engine | Checks quality and correctness |
| Cost Controller | Controls spending |

---

## 5. Quality benchmarks

Objective evidence that the product is improving:

| Area | Acceptance requirement |
|---|---|
| Animation | Blind visual evaluation demonstrates improvement |
| Determinism | Identical approved inputs produce identical frames |
| Voice | Naturalness, pronunciation and consistency benchmark |
| Audio | No clipping, missing segments or synchronization errors |
| Images | Appropriate composition and asset reuse |
| Timeline | Correct scene and audio synchronization |
| Rendering | No incomplete or corrupted exports |
| Cost | Estimated and actual costs recorded |
| Repair | Single-scene regeneration preserves unaffected scenes |
| AI independence | Rendering continues without AI access after approval |

A permanent benchmark collection of representative videos from all six
production modes; every major animation change passes visual regression
testing.

---

## 6. What we should NOT do

The principles that govern every future milestone:

1. Do not introduce AI video generation as the default animation method.
2. Do not create six separate rendering pipelines.
3. Do not replace working engines with entire external applications.
4. Do not introduce expensive paid services where native rendering achieves
   the result.
5. Do not make the application dependent on one AI provider.
6. Do not sacrifice deterministic rendering.
7. Do not regenerate entire videos when only one scene needs correction.
8. Do not allow free cloud tiers to create unexpected charges.
9. Do not integrate third-party models without reviewing their commercial
   licences.

---

## 7. Recommended development order

Controlled stages; never all programmes simultaneously. Each milestone gets
its own implementation plan, file-level scope, tests and acceptance criteria.

| Stage | Focus | Priority |
|---|---|---|
| 1 | Complete S162 visual acceptance | Critical |
| 2 | S163–S167 native engine | Critical |
| 3 | S168–S170 AI Director | Critical |
| 4 | S171–S172 universal animation | High |
| 5 | S173–S176 Voice Engine | High |
| 6 | S177–S178 assets and sound | High |
| 7 | S179–S180 production intelligence | High |
| 8 | S181–S182 creator experience | High |
| 9 | S183–S184 cost and performance | Continuous |

---

## 8. What success should look like

A user opens TubeForge and types: "Create a 5-minute educational video
explaining how the human heart works." TubeForge: understands the request;
develops the script; creates the storyboard; selects the appropriate video
type; generates or retrieves suitable illustrations; generates the narration
using a free or affordable voice engine; plans the animations; executes the
animations using native engines; synchronizes voice, music and visuals;
renders the video; inspects the output; offers targeted corrections.

The user never needs to know what easing functions, keyframes, SVG paths,
character rigs or FFmpeg are. And a user can produce a complete video
without paying for AI video-generation credits.

TubeForge competes on three things: **quality** (professionally produced
look), **affordability** (limited budgets still produce excellent videos),
**creative freedom** (AI helps direct, TubeForge's own engines provide
precise control).

The strategic decision: **we are not building another application that asks
AI to generate videos. We are building a video production engine directed
by AI.**

---

## 9. Reconciliation — what the repository already holds (at preservation time)

Read-only survey at `e07fbb0`; every claim cites the file that proves it.
Purpose: no programme duplicates shipped work.

### 9.1 Programme A (S162–S167)

| Roadmap ask | Already in the repo | Evidence |
|---|---|---|
| S162 measured easing + choreography | **Code landed** — nine exact-op curves (seven opus MIT anchor sets via cubic-bezier evaluator; OT parabolic-in-out; OT exponential), counter tabular-nums + landing pulse + kinetic stagger, planner/llm-planner adoption | `e07fbb0`; `src/lib/tubeforge/anim/easing.ts`, `graphics/frame.ts`, `graphics/planner.ts`, `graphics/llm-planner.ts`; battery 902/902; blind kit 12/12 |
| S162 acceptance | Blind kit committed; **human scoring gate PENDING** | `scripts/s162-blind-kit.mts`; `docs/audits/s162-visual-acceptance-record.md` |
| S163 native transition engine | **Landed both phases** — Phase A assembly-xfade vocabulary (`409fc59`); Phase B native `graphics/transitions.ts` (`9a9fb9e`) | Six-engine audit Part 4 S163; battery 920/920; CI 8/8 |
| S164 whiteboard geometry (Rough.js native port) | **Code landed** — `da654d3`: roughen.ts + fills.ts in-house (no Rough.js dep), per-shape fnv1a seed law, S139 knobs honored; battery 928/928; live smoke byte-identical; blind kit W-series NOT YET RUN | Six-engine audit Part 4 S164; `scripts/s164-proof.mts` |
| S165 determinism + throughput | **Landed** — `0be0b5a` + `a2759db`: per-engine srgb/font-hinting launch sets; ready-gate named diagnostics (`render-gates.ts`); static-frame dedup (PSNR fail-closed); golden-video harness green on three engines (committed baselines + tolerance metadata); frame-truth scan (32 modules green, planted fixture CAUGHT); dedup throughput measured **4.32×** (30,365 ms → 7,035 ms on a 30s hold scene, delivered clock identical); pins ×5 (battery 933/933); s87 battery FULL 42/42 | Six-engine audit Part 4 S165; `scripts/golden/s165/` |
| S166 character expressiveness | **Landed** — `53a5cec`: SPEECH_CYCLE + mbp closure windows + rest-on-pauses, syllable→class mapping extended; two new art variants (existing byte-identical); pose schema v-next (polar deltas ON-THE-ARC, per-part rigidity, additive-optional); rides the ONE `evalEase` table (S162 curves at the pose level); FK byte-identity pinned; **K2 gate RECORDED, not implemented** (`docs/audits/s166-k2-gate-record.md`); battery 947/947 | Six-engine audit Part 4 S166; `docs/audits/s125-character-rig.md` |
| S167 cinematic finishing + 3D wiring | **Landed** — `57a6ab2` + `cb5ffb5` + `a511a45`: fBM shake (in-house seeded Perlin, pure, zero-at-0/bounded/seeded) + exponential push-ins; SOP/CDL grade scalars (absent ⇒ legacy stream byte-for-byte) compiled to colorbalance/curves; `audiomix.ts` duck lanes (attack 0.15/release 0.4 keyframed); PlanVisualKind "3d" admitted as an engine segment — the 3D-in-assembly smoke on real bytes (receipt `docs/audits/s167-3d-assembly-smoke.json`); battery 952/952 | Six-engine audit Part 4 S167; the Part 0.3 gap CLOSED |

Prior art baseline: S160 (`4e676db`) landed the glide ease, the 3D look seam
(sky dome, fog, shadows, Neutral tone mapping) and the impact kick; S161
(`e72d0ad`) committed the six-repo shortlist deep-dive with clean-room
boundaries (MIT/MIT/Apache-2.0/BSD-3 portable; Blender GPL formulas-only).

### 9.2 Programme B (Director)

| Roadmap ask | Already in the repo | Evidence |
|---|---|---|
| Audit the existing Director | **Done** — the M0 audit proves scene-level fields reach the render while shot-level decisions steer nothing (one image + one movement per scene); `shots.ts` entirely dead; `needsI2V`/`useStock` UI-only | `docs/director-audit-m0.md` (frozen at `d7816e3`) |
| Director shot-engine contract | **Spec exists** — the unified Director→Shot-Engine contract (M1/M2) with frozen-behavior record | `docs/director-m1-m2-spec.md` |
| Camera direction | W5 camera director record | `docs/audits/w5-camera-director.md` |
| Scene schema / planning layers | S147 rhetorical beat layer; PAE architecture reconciliation + implementation spec (five standing prohibitions; the adapter contract = shared `anim/` substrate + graphics/3D lanes) | `docs/audits/s147-rhetorical-beat-layer.md`; `docs/audits/pae-architecture-audit-and-spec.md`; `docs/audits/pae-phase3-2026-11-16.txt` |
| "AI independence" acceptance | The house law already holds: AI suggests, human approves; engines render deterministically without AI (e.g. keynote still-deck fallback, graphics deterministic planner) | Six-engine audit Part 5; S153 (`13032df`) |
| Universal scene schema (S169) | The graphics `GraphicsDoc` + S87 `tracks[]` universal timeline are the per-lane precursors; the six-mode union schema is genuinely NEW work | `graphics/types.ts`; `docs/design/s87-universal-timeline.md` |

### 9.3 Programme D (Voice)

| Roadmap ask | Already in the repo | Evidence |
|---|---|---|
| Extend existing TTS architecture | **Confirmed as the right call** — 10 TTS providers in the registry (Z.ai, VoiceStudio self-hosted, Zhipu GLM-TTS + cloning, HeyGen free tier, self-hosted Chatterbox, OpenAI, ElevenLabs, Gemini, Cartesia, Deepgram, PlayHT) | `providers/registry.ts` `TTS_PROVIDERS` |
| Local engine (S173) | Chatterbox (MIT, commercial-OK) + chatterbox-multilingual already wired as the `selfhost` provider with deployment guides (own PC / Oracle Always Free / HF Space); VoiceStudio engines voxcpm2/cosyvoice/kittentts (Apache-2.0) + omnivoice (CC-BY-NC weights, non-commercial — the licence distinction the report flags is already encoded in the registry hints); AGPL VoiceStudio stays a separate unbundled service | `providers/registry.ts`; `voice-server/` |
| Benchmark candidates | Kokoro is NOT yet in the registry — the one S173 candidate requiring adoption work | absent from `TTS_PROVIDERS` |
| Live-list law (multi-voice catalogs wired to code) | Cartesia (S149), ElevenLabs + PlayHT (S159) resolve against the account's LIVE voice list with 404 self-heal | `providers/tts.ts` (`listCartesiaVoices`, `resolveElevenlabsVoiceId`, `resolvePlayhtVoiceId`, …) |
| Voice cloning + pronunciation | Clone from a 3-second sample; pronunciation controls | `voice-clone.ts`; `pronounce.ts` |
| Provider router (S176) | **v1 exists** — weighted, data-fed, explained provider scoring; ADVISORY ONLY (dispatch keeps reading user config) | `docs/design/s90-provider-selection.md`; `provider-score.ts` |
| Free-tier spending limits (S176 + principle 8) | The spend safety line exists for paid dispatch ($5 stop line, SpendPricingUnverifiedError, credit holds; unknown pricing is never free) | `spend.ts`; `docs/design/s90-provider-selection.md` §0 |
| Model licence review (principle 9) | A model licence policy module gates third-party models | `providers/model-license-policy.ts` |

### 9.4 Programmes C/E/F/G/H

Genuinely open territory — no committed implementation yet. Nearby
precursors worth building on: the QC lens set + S87 battery
(`graphics/qc.ts`, `scripts/s87-acceptance-battery.mts`), the video critic
design (`docs/design/s84-video-critic.md` — a Programme F precursor), stock
intelligence (`docs/design/s89-stock-intelligence.md` — Programme E),
narration pacing (`docs/design/s92-narration-pacing.md`), the production
board (`docs/design/s91-production-board.md`), scene-level editing
reconciliation (`docs/design/scene-level-editing-reconciliation.md` —
Programme G), and `audiomix.ts` ducking/normalization (Programme E/F audio
surface).

---

## 10. The status ledger (maintained milestone-by-milestone)

The living record. One row per milestone: commit, evidence, acceptance
state. Updated as milestones land — never rewritten retroactively.

| Milestone | Commit | Evidence | Acceptance state |
|---|---|---|---|
| S149 live-list law (Cartesia) | `8d1edfd` | unit suite; the archived-404 self-heal pins | CLOSED |
| S150 publish root | `765c429` | Vercel-writable scratch/storage | CLOSED |
| S151 poll reads fleet rows | `202e402` | the "rendered" lie fix | CLOSED |
| S152 measured-VO clock | `f59eae0` | the one-seam derivation pins | CLOSED |
| S153 keynote kinetic | `13032df` | deck animates; still-deck honest fallback | CLOSED |
| S153b kinetic page mount | `4326006` | data URIs + setContent | CLOSED |
| S154 character lane | `98c91ee` | mocap re-arm; durable ledger | CLOSED |
| S155 classic lane | `48c4578` | script-length contract; batch one-job | CLOSED |
| S156 title font ladder | `f930cf1` | ladder pins; doc read alignment | CLOSED |
| S157 browser-chunk seam | `4c3ad22` | CI run 44018036150 8/8 green | CLOSED |
| S158/S159 provider keys per provider | `6552073` | keys map GET; restore-not-inherit; live-list law to ElevenLabs/PlayHT | CLOSED |
| S160 motion-and-light pass | `4e676db` | glide ease; 3D look seam; impact kick; battery 898; CI 44032289104 8/8 | CLOSED |
| S161 six-engine audit | `e72d0ad` | the shortlist deep-dive + staged roadmap | CLOSED (document) |
| S162 measured easing + choreography | `e07fbb0` | battery 902/902; kit 12/12; **round 1 human scoring returned a TIE** — B 4.00 / A 4.00 (phone-relayed single numbers, rubric rows not filled; deviation on record); **operator chose closure path 2 — ROUND 2 KIT BUILT** (session `2026-11-17T20-46-45-735Z`, 14/14; arm B = the S162 vocabulary + the S163 crossfade→iris boundaries; arm A byte-identical to round 1, the additive-absent law proven at pixel level; zips distributed, scores PENDING) | **OPEN — round 2 in flight; verdict rule unchanged (B ≥ 4 AND B > A)** (`docs/audits/s162-visual-acceptance-record.md` §4b) |
| S162b master roadmap preserved | `586b1bf` | the commissioning report in-repo as PROPOSED; §9 reconciliation; ledger live | CLOSED (document) |
| Nov 8 eight-profile blind baseline | — | the S55 kit's human round returned: mean 3.25/5, temporal coherence 4.5/5; weaknesses per profile ON RECORD | CLOSED (baseline of record — `docs/audits/s55-blind-scoring-record.md`) |
| Scene-QC S136 audio contract (scene scope) | `f7d5dce` | `sceneAudioVerdict` pins ×5 (battery 907); the silent-scene false-fail and the vacuous dead-air pass killed | CLOSED |
| S163 Phase A — the transition preset layer | `409fc59` | opus-measured beats (iris 0.267 / whiteout 1.4 / zoomthrough 0.467) as named catalog styles; the style→xfade compile wall (`xfadeTransitionOf`); boundary + seam-QC duration laws mirrored; pins ×3 (battery 910) | CLOSED (Phase A) |
| S163 Phase B — the native graphics transition engine | `9a9fb9e` | `graphics/transitions.ts` (743 LOC, pure) — TransitionSpec closed set (crossfade/iris/whiteout/zoomthrough/wipeleft/wiperight) at the measured opus frame counts; in-house seeded geometry (hash01 FNV-1a / axisFor / cornerR); JSON-stable 3-dp compositor; the overlap-accounting law NET-ZERO (window frames carved from the outgoing tail — Σ clips + Σ windows ≡ Σ legacy frames, the two-clock assert guards unchanged); additive `nativeTransitions` opt-in, absent ⇒ byte-identical legacy path; QC books native boundaries as blend windows with the builder's arithmetic; the live smoke caught a P5-proof applier bug (fixed + pinned); pins ×10 (battery 920/920); CI 8/8 | CLOSED |
| S164 whiteboard hand-drawn geometry | `da654d3` | the Rough.js native port in-house — `whiteboard/roughen.ts` (310 LOC: MINSTD, per-shape seed = fnv1a(assetId::pathId), no shared mutable stream; bowing double-stroke, rough Catmull-Rom, ellipse overshoot) + `whiteboard/fills.ts` (314 LOC: scan-line hachure + 4 wrappers, dots only with seeded jitter) wired BEHIND the S139 sketch pass (absent knobs ⇒ byte-identical legacy); svg.ts ONE-serializer parity + authored-curve flatten/RDP + the command-cap guard; pins ×8 (battery 928/928); live smoke sha256-identical across two real renders; blind kit W-series NOT YET RUN | CLOSED (code); W-series blind kit OPEN |
| VQ1 added as the overlay programme | `f7d5dce` | the acceptance rule + P1–P5 + re-benchmark protocol in this document | CLOSED (spec); P1–P5 implementation NOT STARTED |
| S165 determinism + throughput | `0be0b5a` + `a2759db` | per-engine srgb/font-hinting launch sets; ready-gate named diagnostics (`render-gates.ts`, which-gate-is-stuck across graphics/whiteboard/3D/slides); static-frame dedup with PSNR fail-closed below the floor; the golden-video harness in the s87 battery — committed baselines + {minPsnr, maxFrameFailures, minAudioCorrelation}, green on THREE engines; the generalized frame-truth scan (251 LOC) — real tree green at 32 modules, the planted nondeterminism fixture CAUGHT; dedup throughput MEASURED 4.32× (30,365 ms → 7,035 ms wall, 720 screenshots → 2, delivered clock identical); pins ×5 (battery 933/933); s87 FULL 42/42; CI 8/8 both commits | CLOSED |
| S166 character expressiveness | `53a5cec` | the mouth classes (mbp closure windows + rest on pauses, the syllable→class mapping), the two new art variants (existing variants byte-identical), the pose tween schema v-next (polar deltas senior over x/y, ON-THE-ARC constant-radius blend, per-part rigidity — additive optional fields, FK byte-identity for untouched docs pinned) riding the ONE evalEase curve table (S162 parabolic/exponential re-pinned at the pose level); the K2 gate (chain reduction + DLS IK behind authored contacts, bake-only results) RECORDED + DEFERRED with the contract sketch in `docs/audits/s166-k2-gate-record.md`; pins ×14 (battery 947/947) | CLOSED (code); K2 gate DEFERRED by design |
| S167 cinematic finisher | `57a6ab2` + `cb5ffb5` + `a511a45` | the fBM shake channel (in-house seeded Perlin fBM, pure — passes the frame-truth scan; zero at strength 0, bounded, seeded) + exponential hold push-ins riding S162's curve; the per-scene SOP/CDL grade scalars in studio-doc.ts (additive optional — neutral/absent ⇒ legacy arg stream byte-for-byte) compiled to ffmpeg colorbalance/curves (pinned); audiomix.ts (NEW 126 LOC) — attack 0.15/release 0.4 provenance-pinned keyframed duck envelopes; PlanVisualKind "3d" admitted as an engine segment (fail-closed without, admitted with); the 3D-in-assembly smoke ON REAL BYTES — 3.00s assembly, 3d window luma variance 204.7 vs flat card 0.0, hold-frame |Δ| 0.296 proving the finisher channels live in the raster (`docs/audits/s167-3d-assembly-smoke.json`); pins ×5 (battery 952/952); the Part 0.3 3D-not-compositor-wired gap CLOSED | CLOSED |
| S168–S184 | — | this document (PROPOSED) | Programme B code-landed — S168/S169/S170 below; the rest NOT STARTED / needs per-milestone specs |
| S168 Director Specification | `987ad93` | `director-vocabulary.ts`: nine closed decision domains; the animation catalog derives from the engines' OWN constants (transitions = the same module reference pinned; enters = the union of the doc validator's MOTION_KINDS_BY_ELEMENT; eases = the ONE curve table; camera list type-bound to the real MoveKind union — engine drift fails typecheck); the validator refuses invented commands with named errors and reads the engines' compatibility tables instead of re-listing them; assertNoInventedCommands fail-closed; gesture params smuggling pose geometry refused; prohibitions as data; JSON-stable serialization | CLOSED (spec + enforcement) |
| S169 Universal Scene Schema | `adcf6b8` | `universal-scene.ts`: the envelope over the six modes (the mode's own doc rides in `doc`, validated by THAT mode's validator at compile); STRICT validation (machine-authored data — provenance CLOSURE refuses undeclared asset refs, duplicate ids, junk kinds/colors/sha256s, the S168 directive gate rides); the ONE mapping onto the S87 timeline (slides/classic → video lane; inbound transition read from the PREVIOUS scene's boundary directive; back-to-back sequencing, atSec wins); S184's free/standard/premium ride the project envelope | CLOSED (schema) |
| S170 Animation Compiler | `7a5da93` | `animation-compiler.ts`: the S169 re-validation, directives → typed ops by prefix, boundary atMs by arithmetic on the schema's own clocks, authored-only ease/duration (absent ⇒ the engine's defaults — one writer each), narration slots + S87 projection + suggestions pass-through; THE acceptance proven offline: import graph = director-vocabulary + universal-scene + timeline (zero provider modules, battery-pinned + proof-standalone), three-mode project compiles value-identical across two runs (stable sha256 `141e0ba3…`, receipt `docs/audits/s170-offline-compile.json`); battery 974/974 | CLOSED (compiler) |
| S171 shared animation vocabulary + S172 cross-mode integration | (this commit) | `anim/primitives.ts`: the closed fourteen primitives (fade/scale/rotate/translate/draw/reveal/morph/camera-pan/camera-zoom/particle/character-move/stagger/spring/parallax), one normalized clamped sample shape, junk params refused, easing rides the ONE curve table (the spring's damped oscillator is the primitive's physics, not a new ease), per-primitive timing walls; `cross-mode.ts`: the capability matrix as data (host + borrowers + the ONE implementor per capability) with HONEST wiring statuses (native/borrowed/codified — the matrix may not lie), the resolver with typed refusals, the matrix audit pinned; battery 981/981 (7 pins) | CLOSED (code) |

---

## 11. Immediate next steps

The report's ordering, annotated with the repo state:

| Step | Action | Outcome | State |
|---|---|---|---|
| 1 | Close S162 visual acceptance | Trustworthy animation baseline | Round 1 TIE on record; **operator chose path 2 — the delta is strengthened (S163–S167 landed) and the ROUND-2 KIT IS BUILT + distributed; scores PENDING; verdict rule unchanged: B ≥ 4 AND B > A** (record §4b) |
| 2 | Complete S163–S167 | Improve native rendering | **CODE COMPLETE — S163–S167 all landed** (battery 952/952); the S162 human gate + the S164 W-series blind kit remain the OPEN human gates; VQ1 P1–P5 implementation follows the gates |
| 3 | Audit existing AI Director capabilities | Avoid duplicating work | M0 audit exists; capability mapping in §9.2 |
| 4 | Audit existing TTS integration | Establish what is reusable | Inventory in §9.3 |
| 5 | Benchmark Chatterbox, Kokoro, VoiceStudio | Select the best affordable default | Chatterbox + VoiceStudio wired; Kokoro adoption candidate |
| 6 | Write the AI Director architecture specification | Establish the system contract | **DONE — S168 the closed authority vocabulary** (`987ad93`); S169 the universal scene schema (`adcf6b8`); S170 the compiler, offline acceptance proven |
| 7 | Implement the universal scene schema | Standardize creative instructions | **DONE — S169** (`adcf6b8`, battery 970/970) |
| 8 | Build the animation compiler | Connect AI decisions to native rendering | **DONE — S170** (offline acceptance proven, receipt on disk) |
| 9 | Integrate all six production modes | Unified production | **DONE — S171/S172**: the shared primitive vocabulary + the cross-mode capability matrix with honest wiring statuses |
| 10 | Establish full quality and cost benchmarks | Prove product readiness | S183+ + Part 5 floors |

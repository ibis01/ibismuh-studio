# S148 — the MG-1 motion-quality slice — RECORD

| | |
|---|---|
| Stage | **S148** — the motion-graphics audit's Phase B (B1–B3 + B5): the easing table grows `anticipation` + `spring`, the stagger primitive becomes substrate data, the 3D keyframes gain the ease field, the preset registry lands |
| Design record | `docs/design/mg1-motion-quality.md` (Rev 1 — the design-doc slice the closed-table law requires) |
| Audit basis | `2026-11-16-motion-graphics-engineering-audit.md` §4 MG-1 + §7 Phase B (file-by-file plan) |
| Result | **LANDED.** Battery **852 passed, 0 failed** (849 + the MG-1 suite's three tests, + the strengthened Stage-S pins). typecheck + lint clean. The full check battery green on a fresh DB (billing 40/0, storage, rate, scene-revisions 29/0, drill RTO 75 ms, alert probe HEALTH 0). |
| Law | No second renderer, no second clock, no grammar growth: presets compile into the EXISTING `ElementMotion` directives (structural specs re-validated on compile-in); the 3D ease is an additive optional field; the whiteboard tree is untouched (it keeps its private table — S120 §8) and the frozen W1 benchmark receipt stands. |

## 1. What landed

- **B1 — `anim/easing.ts`**: `EaseName` grows `anticipation` (the pure-polynomial backward wind-up, W = 0.28 / D = 0.12, settling through the file's own cubic in-out) and `spring` (the damped cosine, λ = 5.2 / k = 2, **6-dp quantized** — the transcendental-curve law: V8's exp/cos are not language-specified, so the quantization keeps the golden pins engine-stable; the whiteboard's 4-dp cosine is the precedent). The zoompan compiler grows both closed forms — `spring`'s boundary clamp rides INSIDE the ffmpeg expression so the final frame reads the exact 1. Every consumer inherits through the ONE runtime check (`isEaseName`): tween validation, pose rows, keyframes, the llm-planner's tolerant read.
- **B2 — `anim/stagger.ts`**: `staggerDelayMs(order, profile)` with two registered rhythms (`bullets` 400/350 — the planner's hand-coded cascade byte-identically; `cards` 250/280) and the named wall `STAGGER_ORDER_MAX = 32` (the graphics `elementsPerScene` budget — the clamp never fires inside the planner, which is what makes the adoption byte-identical).
- **B3 — `scene3d.ts`**: `Scene3DObjectKeyframe` and `Scene3DCameraKeyframe` gain the additive optional `ease?: EaseName` — the **destination-key convention** (the segment ARRIVING at the key); default `linear` ≡ the pre-S148 byte-identity (`evalEase("linear", f)` is `clamp01(f)` and f is strictly inside (0,1) on the interpolation branch). Tolerant read (junk ease warn-drops, the key keeps its channels), strict write (the field serializes only when shipped). `cameraAt`/`objectAt` evaluate the destination ease before the lerp — camera and objects symmetric.
- **B5 — `anim/presets.ts`**: six named presets (`stagger-in`, `cards-in`, `pop-emphasis`, `rise-reveal`, `draw-on`, `fade-hold`) compiled as STRUCTURAL specs into the engines' existing directives — the substrate stays engine-neutral (no graphics import; the engine re-validates kinds/eases on compile-in), `compilePreset` is total and fail-safe (unknown → null, never a throw-through). The Phase C studio picker's data source is `presetNames()`.
- **The graphics planner** adopts the stagger primitive for its bullet cascade — byte-identity proven across orders 0..40 by pin.

## 2. The pins

1. **Stage-S suite (strengthened)**: the closed-table pin reads SEVEN curves; the monotone loop splits (anticipation and spring retrograde BY DESIGN and carry their own laws); anticipation's dip/recovery/monotone-settle asserted at the design constants; spring's overshoot (> 1.15), exactly four rest-line crossings (two full oscillations — sampled on a half-step grid that never lands on the quantized cos-zeros), per-sample quantization, and exact settle; the compiled ffmpeg expressions are EVALUATED by a test-local ffmpeg-expression-subset parser (if/lte/gte/pow/exp/cos, PI, `on`) against the table within the recorded 0.02 transcendental bound; the purity scan covers the two new modules.
2. **MG-1 stagger**: the profile constants, the wall endpoints (32 exact / 33 clamped), the junk-order totality, and the planner byte-identity across orders 0..40.
3. **MG-1 3D ease**: eased vs linear divergence mid-segment (camera and object paths), boundary reads (t=0, t=1), the byte-stable round-trip (eases survive parse→serialize), junk-ease warn-drop (the doc never refuses), and the strict-write law (an easeless scaffold serializes with NO ease field).
4. **MG-1 presets**: the six-name registry, the guard, the compile determinism, the closed-table legality of every compiled spec (kinds against `GRAPHICS_MOTION_KINDS`, eases against `isEaseName`, spans validator-legal), the unknown-name null.

## 3. The honest boundary (what S148 deliberately does NOT do)

- **No Studio wiring yet**: the preset picker and the stagger/ease controls are Phase C (C2's authoring UX) — the registry and the field exist as data and pure code; no UI consumes them yet.
- **No B4 (dormant-substrate wiring)**: gait/IK/camera adoption by the character engine is its own slice (the audit sequences it after B1–B3).
- **No bounce curve**: `bounce` stays outside the table (the unknown-curve refusal pin uses it) — a follow-up design-doc slice if a consumer needs it.
- **No existing curve's arithmetic changed**: the five pre-existing curves are byte-for-byte identical — the golden frame hashes of the S123/S134-era pins do not move.

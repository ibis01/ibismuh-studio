# MG-1 — the motion-quality slice: anticipation, spring, stagger, the 3D ease field, the preset registry (Rev 1)

**Status:** approved for execution (the motion-graphics engineering audit's Phase B, items B1–B3 + B5; 2026-11-16).
**Law satisfied:** the easing table is CLOSED — "a new curve is a design-doc slice" (`anim/easing.ts` header). This document is that slice's design record.

## 1. The question this slice answers

The audit's capability matrix (MG-1) finds the deterministic motion core strong but missing the expressiveness vocabulary a professional motion system takes for granted: **anticipation** (the wind-up before an action), **spring/follow-through** (the damped oscillation into a rest), **stagger** (the per-item cascade — today hand-coded as `400 + 350 * order` inside the graphics planner), and **an ease field on the 3D keyframes** (S134's "one vocabulary, two adapters" is partial on the ease axis). Everything below lands ON the existing substrate — no new runtime, no second clock, no grammar growth beyond the additive optional field.

## 2. B1 — the easing table grows by two curves (the design-doc slice)

`EaseName` grows `| "anticipation" | "spring"`. Every consumer inherits through the ONE runtime check (`isEaseName`): graphics tween validation, pose-row ease, `anim/keyframe.ts`, the llm-planner's tolerant read, and the cinematic lane's zoompan compiler.

### `anticipation` — the wind-up (pure polynomial, no transcendentals)

Design-time constants: `ANTICIPATION_WINDUP = 0.28` (the wind-up span), `ANTICIPATION_DIP = 0.12` (how far backward the wind-up reaches).

```
u ≤ W : f(u) = −D · 4 · u · (W − u) / (W · W)      // backward parabola: 0 → −D (at W/2) → 0
u >  W : v = (u − W) / (1 − W); f(u) = easeInOutCubic(v)
```

- Boundaries exact: f(0) = 0, f(1) = 1 (the clamp law handles the outside).
- The wind-up is ALL multiplication/division — IEEE-exact, no `Math.pow`, honoring the file's own 2026-11-15 receipt (node 22 vs 24 split a golden hash on ONE pow ULP).
- The settle phase reuses the file's cubic ease-in-out — one formula family.
- Recorded feel: the velocity reaches 0 at the wind-up apex and again at the handback (the "anticipation pause" animators draw on purpose) before the eased settle.

### `spring` — the damped settle (quantized transcendental)

Design-time constants: `SPRING_DECAY = 5.2` (λ), `SPRING_CYCLES = 2` (k).

```
f(u) = 1 − e^(−λ·u) · cos(2π·k·u)          quantized: round(f · 1e6) / 1e6
```

- f(0) = 0 exactly; f(1) is exact-by-clamp (the `u ≥ 1 → 1` boundary law — the closed form's e^(−5.2) ≈ 0.55% residue never leaks).
- **The quantization law** (NEW in this file, the whiteboard's 4-dp cosine precedent at 6 dp): a curve built on transcendental functions quantizes its output so the golden pins are engine-stable — V8's `exp`/`cos` are not language-specified the way `+ − × ÷` are. 1e-6 progress is ~4 orders of magnitude below one frame of motion.
- Recorded feel: ~27% first overshoot, two visible oscillations, monotone-settling tail. The table's monotone-loop pin SPLITS: `spring` is the first oscillating curve and gets its own assertion block (overshoot > 1, two sign changes of (f−1), quantized samples, settle = 1).

### The zoompan compiler grows both curves (the ffmpeg-side closed forms)

- `anticipation` compiles to the piecewise polynomial with `if(lte(on/last,W), …, if(lt(v,0.5), 4*pow(v,3), 1-pow(-2*v+2,3)/2))` — the same closed forms, ffmpeg-side.
- `spring` compiles to `(if(gte(on/last,1),1,1-exp(-5.2*on/last)*cos(2*PI*2*on/last)))` — the boundary clamp rides INSIDE the expression so the final frame matches the JS-side exact 1 (the closed form's 0.55% residue never reaches the delivered pixel).
- Parity pin: a JS evaluation of each compiled string stays within 0.02 of `evalEase` at sample points (ffmpeg's transcendental rounding is ffmpeg's own; the tolerance is the recorded bound).

## 3. B2 — `anim/stagger.ts`: the cascade primitive is DATA, not a framework

```ts
export const STAGGER_ORDER_MAX = 32;        // the named wall — the graphics elementsPerScene budget
export interface StaggerProfile { baseMs: number; stepMs: number }
export const STAGGER_PROFILES: Record<"bullets" | "cards", StaggerProfile> (frozen)
export function staggerDelayMs(order: number, profile = "bullets"): number
//   baseMs + stepMs · clamp(order, 0, STAGGER_ORDER_MAX)
```

- The graphics planner's bullet line adopts it verbatim — `delayMs: staggerDelayMs(order)` with the `bullets` profile (400/350) reproducing today's `400 + 350 * Math.max(0, order)` BYTE-IDENTICALLY (the wall at 32 never fires inside the planner: order < elementsPerScene = 32; the clamp names the bound without changing behavior).
- The `cards` profile (250/280) is the second registered rhythm — no consumer yet, registered as data for the presets (§5) and the studio picker (Phase C).
- The substrate stays engine-neutral: the module imports nothing.

## 4. B3 — the 3D ease field (S134's missing axis, closed)

`Scene3DObjectKeyframe` and `Scene3DCameraKeyframe` gain the ADDITIVE OPTIONAL `ease?: EaseName` — the **destination-key convention** (`anim/keyframe.ts`'s law): the ease on key k shapes the segment ARRIVING at k. Default `linear` ≡ today's byte-identity (`evalEase("linear", f)` is `clamp01(f)` and f is strictly inside (0,1) on the interpolation branch).

- Tolerant read: a legal name rides; junk warn-drops (the key keeps its channels, loses the ease — the tolerant lane never refuses).
- Strict write: the field serializes only when shipped (parse must not invent, serialize must not fill — the byte-stable round-trip law).
- `cameraAt` / `objectAt` evaluate `evalEase(dest.ease ?? "linear", f)` before the lerp — one evaluation per segment, camera and objects symmetric.
- Version stays 1: the additive-optional law covers the read side; unknown-version docs still read as absent.

## 5. B5 — `anim/presets.ts`: the preset registry (compile-time sugar, zero grammar)

The substrate stays engine-neutral: a preset compiles to a STRUCTURAL spec (`{ kind, durationMs, delayMs, ease }`) that the consuming engine validates against its own closed table on compile-in. The registry:

| preset | compiles to (per order) |
| --- | --- |
| `stagger-in` | slide · 400 ms · `staggerDelayMs(order)` · ease-out |
| `cards-in` | rise · 500 ms · `staggerDelayMs(order, "cards")` · ease-out |
| `pop-emphasis` | pop · 500 ms · 0 · pop |
| `rise-reveal` | rise · 600 ms · 0 · ease-back |
| `draw-on` | draw · 900 ms · `staggerDelayMs(order, "cards")` · linear |
| `fade-hold` | fade · 400 ms · 0 · ease-out |

- `compilePreset(name, order)` is pure and total: an unknown name returns null (the caller decides — fail-safe, never throw-through).
- `presetNames()` is the frozen key list (the studio picker's Phase C data source).
- The kinds above are legal `GraphicsMotionKind`s today; the graphics validator re-checks on compile-in (the grammar stays closed — presets are sugar over `ElementMotion`, not a second motion grammar).

## 6. Pins and acceptance

- Stage-S suite: the closed-table pin grows to seven curves; the unknown-curve refusal keeps a name OUTSIDE the table; the monotone loop covers six curves and `spring` gets its own block (overshoot, oscillation, quantization, settle); the zoompan expressions gain both compiled forms with the JS-parity bound; the purity scan covers the two new modules (no fs/clock/randomness, no engine imports).
- New MG-1 suite: the stagger law (endpoints, the wall, the planner byte-identity across orders 0..40 — proving the wall never fires); the 3D ease field (eased vs linear divergence mid-segment, byte-identity without the field, junk-ease warn-drop, round-trip); the preset registry (all six compile, unknown → null, determinism, delay law).
- Whiteboard byte-identity: untouched by construction — the whiteboard tree keeps its private table (S120 §8), and no whiteboard module imports the new code. The frozen W1 benchmark receipt stands.
- Determinism: the double-run byte-identity law on every sampled series; the golden frame hashes of existing curves do not move (the two new curves add table entries; no existing curve's arithmetic changes).

// Stage S — the shared animation substrate: easing (S120 §8).
//
// ONE tiny, pure, engine-neutral motion vocabulary for the NEW engines
// (G1 motion graphics, K1 character rigs) so they never duplicate easing
// math between themselves. The whiteboard's timing.ts is deliberately NOT
// migrated onto this module — its determinism pins make byte-identity the
// priority (S120 §8: "no rewrite of timing.ts onto the new substrate").
//
// Laws: every curve is a PURE function of progress in [0, 1]; every curve
// clamps (progress outside the domain → the boundary value); no fs, no
// clock, no randomness (the S64 law generalizes). easeInOut is the SAME
// cubic family the whiteboard's own scheduler uses — one formula family,
// two consumers, documented.
//
// MG-1 (S148, docs/design/mg1-motion-quality.md — the design-doc slice the
// closed-table law requires): the table grows "anticipation" (the pure
// polynomial wind-up) and "spring" (the damped settle). A curve built on
// transcendental functions (exp/cos) QUANTIZES its output — V8's
// transcendentals are not language-specified the way + − × ÷ are, so the
// 6-dp rounding (the whiteboard's 4-dp cosine precedent, tighter) keeps
// the golden pins engine-stable. The polynomial wind-up needs no such
// care: + − × ÷ are exactly specified.
export type EaseName =
  | "linear"
  | "ease-in-out"
  | "ease-out"
  | "pop"
  | "ease-back"
  | "anticipation"
  | "spring";

const clamp01 = (t: number): number => (Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0);

/** Constant speed. */
function linear(t: number): number {
  return clamp01(t);
}

/** The whiteboard family's cubic ease-in-out (timing.ts easeInOut — the
 *  same closed form, so a G1/K1 tween and a whiteboard stroke share one
 *  motion feel).
 *
 *  The cubic is EXACT IEEE multiplication, never Math.pow — pow's result is
 *  an implementation-defined approximation of x³, and V8 builds disagree
 *  by 1 ULP on fractional inputs (the 2026-11-15 dispatch receipt: CI's
 *  node 22 and the sandbox's node 24 split the S123 pin 4 30 fps golden
 *  frame hash while the 24 fps series agreed — one pow input, one ULP, one
 *  different byte string). + − × ÷ are exactly specified by the language,
 *  so w*w*w is byte-stable across every engine and version: the golden
 *  hashes below are re-pinned on the exact form. */
function easeInOut(t: number): number {
  const u = clamp01(t);
  if (u < 0.5) return 4 * u * u * u;
  const w = -2 * u + 2;
  return 1 - (w * w * w) / 2;
}

/** Fast start, gentle settle (cubic out — the same family's exit). The
 *  exact-multiplication law as above — Math.pow(1-u, 3) is an
 *  implementation-defined approximation; b*b*b is the language's truth. */
function easeOut(t: number): number {
  const u = clamp01(t);
  const b = 1 - u;
  return 1 - b * b * b;
}

/** Back-overshoot constants: s1 sets how far past the target the curve
 *  swings before settling; c3 is its cubic coefficient (the standard
 *  easeOutBack closed form). */
const BACK_S1 = 1.70158; // the standard small overshoot (~10%)
const BACK_C3 = BACK_S1 + 1;
const POP_S1 = 2.59481; // a louder swing (~20%) for emphasis pops
const POP_C3 = POP_S1 + 1;

const backWith = (s1: number, c3: number) => (t: number): number => {
  const u = clamp01(t);
  // The clamped boundaries are EXACT by definition — the closed form's
  // floating-point residue (1 − c3 + s1 ≈ 2.2e-16) never leaks through.
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  const d = u - 1;
  return 1 + c3 * d * d * d + s1 * d * d;
};

/** Settle with a small overshoot (~10% — the C2-ext "ease-back"). */
const easeBack = backWith(BACK_S1, BACK_C3);

/** Settle with a loud overshoot (~20%) — the emphasis pop. */
const pop = backWith(POP_S1, POP_C3);

// MG-1 design-time constants (docs/design/mg1-motion-quality.md §2):
// parameters are FIXED here, never caller-supplied — a curve is a table
// entry, not a parametric family (the determinism law: frame N is a pure
// function of (project, library, N)).
const ANTICIPATION_WINDUP = 0.28; // the backward wind-up spans this fraction of the move
const ANTICIPATION_DIP = 0.12; // how far past the start the wind-up reaches
// The wind-up denominator W² as an EXACT DECIMAL STRING for the ffmpeg
// expression — computing 0.28*0.28 in JS prints 0.07840000000000001, and
// the compiled literal is byte-pinned (the same law as the back-overshoot
// constants above).
const ANTICIPATION_W2 = "0.0784";
const SPRING_DECAY = 5.2; // the damping λ — ~27% first overshoot, two visible swings
const SPRING_CYCLES = 2; // the damped cosine completes exactly this many oscillations
const SPRING_QUANTUM = 1e6; // the 6-dp quantization (the transcendental-curve law)

/** The wind-up: dip BACKWARD to −D at the wind-up's midpoint, then settle
 *  with the cubic ease-in-out (the file's own family). Phase 1 is the
 *  IEEE-exact backward parabola −D·4·u·(W−u)/W² — 0 at u=0, −D at W/2,
 *  0 at W=W — every step multiplication/division. Phase 2 reuses
 *  easeInOut on the normalized remainder. The recorded feel: the velocity
 *  rests at the wind-up apex and again at the handback (the anticipation
 *  pause animators draw on purpose) before the eased settle. */
function anticipation(t: number): number {
  const u = clamp01(t);
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  if (u <= ANTICIPATION_WINDUP) {
    const w = ANTICIPATION_WINDUP;
    return (-ANTICIPATION_DIP * 4 * u * (w - u)) / (w * w);
  }
  const v = (u - ANTICIPATION_WINDUP) / (1 - ANTICIPATION_WINDUP);
  return easeInOut(v);
}

/** The damped settle: 1 − e^(−λu)·cos(2πku), quantized to 6 dp (the
 *  transcendental-curve law above — exp/cos are not language-specified).
 *  f(0) = 0 exactly; f(1) is exact by the clamp law (the closed form's
 *  e^(−λ) ≈ 0.55% residue never leaks through the boundary). */
function spring(t: number): number {
  const u = clamp01(t);
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  const v = 1 - Math.exp(-SPRING_DECAY * u) * Math.cos(2 * Math.PI * SPRING_CYCLES * u);
  return Math.round(v * SPRING_QUANTUM) / SPRING_QUANTUM;
}

/** The table — complete and closed: a new curve is a design-doc slice. */
export const EASE_CURVES: Readonly<Record<EaseName, (t: number) => number>> = Object.freeze({
  linear,
  "ease-in-out": easeInOut,
  "ease-out": easeOut,
  pop,
  "ease-back": easeBack,
  anticipation,
  spring,
});

export function isEaseName(name: string): name is EaseName {
  return Object.prototype.hasOwnProperty.call(EASE_CURVES, name);
}

/** Evaluate a named curve with the clamp law applied (non-finite → 0). */
export function evalEase(name: EaseName, t: number): number {
  const fn = EASE_CURVES[name];
  if (!fn) throw new Error(`unknown easing curve "${name}" — the table is ${Object.keys(EASE_CURVES).join("|")}`);
  return fn(t);
}

// ---------------------------------------------------------------------------
// The zoompan progress-expression compiler — the ffmpeg-expression shapes
// the cinematic lane's motion.ts uses, generalized to the substrate's
// curves. `last` = the expression's frame count (zoompan's `on` runs
// 0..last). smooth/linear reproduce motion.ts progressExpr BYTE-FOR-BYTE
// (the suite pins the literals against motion.ts's own source); the three
// back-overshoot curves compile to closed-form pow() expressions.
// ---------------------------------------------------------------------------

export function zoomProgressExpr(name: EaseName | "smooth", last: number): string {
  if (!Number.isFinite(last) || last <= 0) {
    throw new Error(`zoomProgressExpr needs a positive frame count, got ${String(last)}`);
  }
  const n = `on/${last}`;
  switch (name) {
    case "linear":
      return `(${n})`;
    case "smooth":
    case "ease-in-out":
      // motion.ts's smooth curve: the cosine ease byte-for-byte.
      return `(0.5-0.5*cos(PI*${n}))`;
    case "ease-out":
      return `(1-pow(1-${n},3))`;
    case "ease-back":
      return `(1+${BACK_C3}*pow(${n}-1,3)+${BACK_S1}*pow(${n}-1,2))`;
    case "pop":
      return `(1+${POP_C3}*pow(${n}-1,3)+${POP_S1}*pow(${n}-1,2))`;
    case "anticipation": {
      // The piecewise polynomial, ffmpeg-side: the wind-up parabola, then
      // the cubic in-out on the normalized remainder (the same closed
      // forms as the JS curve — MG-1 §2).
      const w = ANTICIPATION_WINDUP;
      const v = `((${n})-${w})/(1-${w})`;
      return `(if(lte(${n},${w}),-${ANTICIPATION_DIP}*4*(${n})*(${w}-(${n}))/${ANTICIPATION_W2},if(lt(${v},0.5),4*pow(${v},3),1-pow(-2*${v}+2,3)/2)))`;
    }
    case "spring":
      // The damped cosine with the boundary clamp INSIDE the expression —
      // the final frame reads the exact 1 the JS curve's clamp law
      // guarantees (the e^(−λ) residue never reaches the pixel).
      return `(if(gte(${n},1),1,1-exp(-${SPRING_DECAY}*${n})*cos(2*PI*${SPRING_CYCLES}*${n})))`;
  }
}

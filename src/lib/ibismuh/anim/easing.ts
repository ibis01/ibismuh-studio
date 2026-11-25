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
// S160 — "glide", the measured camera-move curve. The animated-shorts
// style study (references/reports/motion.md, 32,337 frames) measured that
// reference camera moves ride a SYMMETRIC SMOOTHERSTEP — ~10 frames of
// acceleration, ~10 of settle, no linear midsection — and that this one
// curve carries 65% of all screen motion. It is adopted here as the
// camera-glide ease for every engine that keys a camera (the 3D lane's
// cameraAt, the graphics scene camera, the zoompan compiler): one name,
// one formula, the motion grammar the measurement proved.
//
// S162 — the MEASURED VOCABULARY, nine curves lifted as MIT numbers (the
// six-engine audit, Part 2.2/2.5 — clean-room: constants and formulas,
// zero code transcription):
//   opus (src/core/ease.ts, MIT) bezier anchor sets — "measured-out"
//   (0.16,1,0.3,1 the default entrance), "measured-in-out" (0.65,0,0.35,1
//   camera/morph), "drift" (0.37,0,0.63,1 ambient drifts), "measured-in"
//   (0.55,0,1,0.45 exits), "measured-back" (0.34,1.56,0.64,1 small
//   overshoot), "expo-out" (0.19,1,0.22,1), "expo-in-out" (0.87,0,0.13,1);
//   OpenToonz (BSD-3, formulas only) — "parabolic-in-out" (quadratic
//   accel spans + the LINEAR constant-velocity middle, tdoubleparam
//   getEaseInOutValue) and "exponential" (a·exp(t·log(b/a)) — the
//   constant-PERCEIVED-RATE curve zoom push-ins ride, ported here as the
//   symmetric 2^x family through an exact-sqrt ladder table).
//   Every new curve obeys the house laws: PURE (progress in, progress
//   out), clamped at both ends, and built ONLY from + − × ÷ and IEEE sqrt
//   — no Math.pow, no Math.exp, no Math.log (the exact-multiplication
//   law: implementation-approximated transcendentals split bytes across
//   V8 builds — the 2026-11-15 dispatch receipt).
export type EaseName =
  | "linear"
  | "ease-in-out"
  | "ease-out"
  | "pop"
  | "ease-back"
  | "glide"
  | "measured-out"
  | "measured-in-out"
  | "measured-in"
  | "drift"
  | "measured-back"
  | "expo-out"
  | "expo-in-out"
  | "parabolic-in-out"
  | "exponential";

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

/** The glide — Perlin's smootherstep, 6t⁵ − 15t⁴ + 10t³: zero first AND
 *  second derivatives at both ends (the symmetric S the measured camera
 *  grammar rides — slower off the mark and into the settle than the
 *  cubic ease-in-out, which reads as a snappier move). The exact-
 *  multiplication law as everywhere below — the powers are built by
 *  repeated multiplication, never Math.pow. */
function glide(t: number): number {
  const u = clamp01(t);
  const u2 = u * u;
  const u3 = u2 * u;
  return u3 * (u * (6 * u - 15) + 10);
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

// ---------------------------------------------------------------------------
// S162 — the cubic-bezier evaluator (the opus anchor sets ride it).
//
// A CSS-style cubic-bezier(x1,y1,x2,y2) from P0=(0,0) to P3=(1,1): given
// progress t (the X axis), solve u with X(u) = t, then return Y(u).
//   X(u) = 3(1−u)²u·x1 + 3(1−u)u²·x2 + u³   (Bernstein form)
//   Y(u) = 3(1−u)²u·y1 + 3(1−u)u²·y2 + u³
// X is STRICTLY monotone for x1,x2 ∈ [0,1] (the CSS domain — every adopted
// set complies), so the solve is the audit's "binary-split": plain
// bisection, 40 fixed iterations (interval 2⁻⁴⁰ — the y error stays under
// ~2e-11 even at the steepest adopted slope 6.25, far under the 6-decimal
// byte seam). EVERY op is + − × ÷ — the exact-multiplication law holds;
// de Casteljau and the Bernstein form are the same polynomial, the
// expanded form has fewer operations, both exact-law-clean.
// ---------------------------------------------------------------------------

function bezierAxis(u: number, a1: number, a2: number): number {
  const v = 1 - u;
  return 3 * v * v * u * a1 + 3 * v * u * u * a2 + u * u * u;
}

function makeBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  return (t: number): number => {
    const u = clamp01(t);
    // The clamped boundaries are EXACT by definition (the backWith fold).
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (bezierAxis(mid, x1, x2) < u) lo = mid;
      else hi = mid;
    }
    return bezierAxis((lo + hi) / 2, y1, y2);
  };
}

/** opus "out" (0.16, 1, 0.3, 1) — the measured default ENTRANCE: fast
 *  away from rest, a long gentle settle (the curve behind every opus
 *  entrance). */
const measuredOut = makeBezier(0.16, 1, 0.3, 1);
/** opus "inOut" (0.65, 0, 0.35, 1) — camera/morph symmetric. */
const measuredInOut = makeBezier(0.65, 0, 0.35, 1);
/** opus "in" (0.55, 0, 1, 0.45) — EXITS: accelerating away. */
const measuredIn = makeBezier(0.55, 0, 1, 0.45);
/** opus "sine" (0.37, 0, 0.63, 1) — ambient drifts (the gentlest S). */
const drift = makeBezier(0.37, 0, 0.63, 1);
/** opus "back" (0.34, 1.56, 0.64, 1) — entrance with a SMALL overshoot
 *  (y2 > 1 swings past the target once — the measured ~8% swing). */
const measuredBack = makeBezier(0.34, 1.56, 0.64, 1);
/** opus "expoOut" (0.19, 1, 0.22, 1) — the big-stat counter/bar ease:
 *  violent start, long decelerating tail (reads as "landing"). */
const expoOut = makeBezier(0.19, 1, 0.22, 1);
/** opus "expoInOut" (0.87, 0, 0.13, 1) — the symmetric expo family. */
const expoInOut = makeBezier(0.87, 0, 0.13, 1);

// ---------------------------------------------------------------------------
// S162 — the OpenToonz pair (formulas from the BSD-3 source, read at
// tdoubleparam.cpp — clean-room: formulas only, zero code transcription).
// ---------------------------------------------------------------------------

/** "parabolic-in-out" — the OT EaseInOut shape (getEaseInOutValue):
 *  quadratic acceleration spans at each end, a LINEAR constant-velocity
 *  middle (the animators' feel smootherstep lacks — motion reads as
 *  "thrown, then coasting, then caught"). The named default fixes the
 *  accel spans at 25% each; velocity matching across the span boundary
 *  gives the exact constants A = s/(2(1−s)) = 1/6 (span height) and
 *  M = 2A/s = 4/3 (middle slope):
 *    u < 0.25:        A·(u/s)²
 *    0.25 ≤ u ≤ 0.75: 0.5 + M·(u − 0.5)   (the 0.5 anchor makes the
 *                                          midpoint EXACT — a pin law)
 *    u > 0.75:        1 − A·((1−u)/s)²
 *  The piecewise branches meet within ~3 ULP at the span boundaries
 *  (floating-point residue only — invisible under the 6-decimal byte
 *  seam; the pins carry each branch's own literals). */
const PARABOLIC_SPAN = 0.25;
const PARABOLIC_A = 1 / 6;
const PARABOLIC_M = 4 / 3;

function parabolicInOut(t: number): number {
  const u = clamp01(t);
  const s = PARABOLIC_SPAN;
  if (u < s) {
    const w = u / s;
    return PARABOLIC_A * w * w;
  }
  if (u > 1 - s) {
    const w = (1 - u) / s;
    return 1 - PARABOLIC_A * w * w;
  }
  return 0.5 + PARABOLIC_M * (u - 0.5);
}

/** The 2^(−y) primitive for y ∈ [0, 1] — the exact-sqrt ladder. Math.exp
 *  and Math.log are implementation-approximated (the same status as the
 *  banned Math.pow), so the exponential curve rides a table built ONLY
 *  from IEEE sqrt and exact multiplication:
 *    base = 2^(1/1024) (ten sqrt halvings of 2 — sqrt is correctly
 *    rounded, byte-stable across every engine);
 *    T[i] = 2^(−i/1024) built by ONE division of the accumulated product
 *    (accumulated relative error ≤ ~6e-14 — the pins carry the values
 *    this construction produces).
 *  The fraction lane corrects with the 3rd-order Taylor of 2^(−x):
 *    1 − x + x²/2 − x³/6, x = r·ln2/1024 ≤ 6.8e-4 → error ≤ ~1e-14.
 *  Net: 2^(−y) to ~1e-13 relative — under the 6-decimal byte seam with
 *  three orders of magnitude to spare. */
const EXP2_STEPS = 1024;
const EXP2_LN2 = 0.6931471805599453; // the f64 nearest ln(2) — a literal
const EXP2_TABLE: readonly number[] = (() => {
  let base = 2;
  for (let i = 0; i < 10; i++) base = Math.sqrt(base);
  const up = new Array<number>(EXP2_STEPS + 1);
  up[0] = 1;
  for (let i = 1; i <= EXP2_STEPS; i++) up[i] = up[i - 1] * base;
  const down = new Array<number>(EXP2_STEPS + 1);
  for (let i = 0; i <= EXP2_STEPS; i++) down[i] = 1 / up[i];
  return down;
})();

function exp2neg(y: number): number {
  // INTERNAL INVARIANT: y ∈ [0, 1] (callers clamp before the call).
  const scaled = y * EXP2_STEPS;
  const i = Math.floor(scaled); // 0..1024 (y = 1 → i = 1024, r = 0)
  const r = scaled - i;
  const x = (r * EXP2_LN2) / EXP2_STEPS;
  const corr = 1 - x * (1 - x * (0.5 - x / 6)); // 1 − x + x²/2 − x³/6
  return EXP2_TABLE[i] * corr;
}

/** p^10 by EXACT multiplication (nine multiplies after the exact 1·p) —
 *  the pow-law's repeated-multiplication form. */
function pow10(p: number): number {
  let out = 1;
  out *= p;
  out *= p;
  out *= p;
  out *= p;
  out *= p;
  out *= p;
  out *= p;
  out *= p;
  out *= p;
  out *= p;
  return out;
}

/** "exponential" — the OT exponential (a·exp(t·log(b/a))), ported as the
 *  symmetric in-out 2^x family (the standard expo interpolation, the
 *  curve CONSTANT-PERCEIVED-RATE zoom push-ins ride — S167's hold
 *  push-ins): u < 0.5 → 0.5·2^(−10(1−2u)); u ≥ 0.5 → 1 − 0.5·2^(−10(2u−1)).
 *  The midpoint is EXACT (0.5·1^10 = 0.5 — the S162 symmetry pin's
 *  anchor); the ends clamp exactly to 0/1 (the natural tail would sit at
 *  2⁻¹¹ — the clamp law wins, as on every curve in this table). */
function exponentialCurve(t: number): number {
  const u = clamp01(t);
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  if (u < 0.5) return 0.5 * pow10(exp2neg(1 - 2 * u));
  return 1 - 0.5 * pow10(exp2neg(2 * u - 1));
}

/** The table — complete and closed: a new curve is a design-doc slice. */
export const EASE_CURVES: Readonly<Record<EaseName, (t: number) => number>> = Object.freeze({
  linear,
  "ease-in-out": easeInOut,
  "ease-out": easeOut,
  pop,
  "ease-back": easeBack,
  glide,
  "measured-out": measuredOut,
  "measured-in-out": measuredInOut,
  "measured-in": measuredIn,
  drift,
  "measured-back": measuredBack,
  "expo-out": expoOut,
  "expo-in-out": expoInOut,
  "parabolic-in-out": parabolicInOut,
  exponential: exponentialCurve,
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
    case "glide":
      // The smootherstep, compiled to the closed-form polynomial (the
      // string carries pow() — this is an ffmpeg expression, not JS math;
      // the no-pow law governs JS numeric code only).
      return `(6*pow(${n},5)-15*pow(${n},4)+10*pow(${n},3))`;
    case "ease-out":
      return `(1-pow(1-${n},3))`;
    case "ease-back":
      return `(1+${BACK_C3}*pow(${n}-1,3)+${BACK_S1}*pow(${n}-1,2))`;
    case "pop":
      return `(1+${POP_C3}*pow(${n}-1,3)+${POP_S1}*pow(${n}-1,2))`;
    default: {
      // The S162 measured vocabulary (bezier solves, the parabolic
      // piecewise, the exponential) has NO ffmpeg closed form — the
      // curves ride JS frame truth (element tweens, camera keys); the
      // zoompan compile is the S167 cinematic slice's business. Refuse
      // LOUDLY (never fabricate a wrong-shaped move).
      throw new Error(
        `zoomProgressExpr: the "${name}" curve has no ffmpeg closed form — ` +
          `the S162 measured vocabulary rides JS frame truth; the zoompan compile is the S167 slice`,
      );
    }
  }
}

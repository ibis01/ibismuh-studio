// S164 — the roughen pass: the Rough.js native port (hand-drawn geometry).
//
// The S139 sketch pass revealed ONE clean stroke plus a sine-dithered
// retrace; the six-engine audit's Rough.js study (Part 2 §2.3) names what
// actually makes ink look PENNED: every stroke is a BOWED cubic drawn
// TWICE, curves ride a jittered Catmull-Rom, ellipses overshoot the seam,
// and every number comes out of a seeded MINSTD stream — never ambient
// state. This module ports that geometry in-house, with ALL FOUR of the
// audit's Rough.js landmines fixed:
//   1. seed 0 → 1 (Rough.js's seed-0 path fell back to AMBIENT randomness
//      forever — this tree never draws from an unseeded stream);
//   2. every shape derives its OWN seed = fnv1a(assetId::pathId) — the
//      hash lives in sketch.ts (shapeSeed, the ONE fnv1a home) and there
//      is NO shared mutable PRNG stream: each call constructs fresh
//      generators from the derived seed and the state dies with the call;
//   3. dots jitter from the per-shape seed (see fills.ts), never ambient;
//   4. every emitted number rides svg.ts's ONE fixed-decimal serializer.
//
// Everything here is PURE geometry (no fs, no clock, no randomness beyond
// the seeded streams): the same seed always produces byte-identical `d`
// strings — the determinism anchor law rides through unchanged.
import { fmt2, flattenSubpathPoints, countPathCommands, rdp, type Point } from "./svg";

// ---------------------------------------------------------------------------
// The seeded stream — MINSTD Lehmer (Park–Miller), the audit §2.3 PRNG.
// ---------------------------------------------------------------------------

export const MINSTD_MODULUS = 2147483647; // 2^31 − 1
export const MINSTD_MULTIPLIER = 48271;

/** A MINSTD Lehmer generator: `next = (48271·state) mod 2^31−1`, returned
 *  as a 0..1 scalar. THE SEED LAW: `seed || 1` — 0, negative and NaN seeds
 *  collapse to state 1 and the stream stays deterministic (the Rough.js
 *  seed-0 landmine, fixed). The state is LOCAL to this closure: two
 *  interleaved streams never disturb each other (no shared mutable stream
 *  anywhere in this module). Exact integer arithmetic (the product stays
 *  far below 2^53), so the sequence is machine-stable. */
export function minstd(seed: number): () => number {
  let s = Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) % MINSTD_MODULUS : 0;
  if (s === 0) s = 1;
  return () => {
    s = (MINSTD_MULTIPLIER * s) % MINSTD_MODULUS;
    return s / MINSTD_MODULUS;
  };
}

// ---------------------------------------------------------------------------
// The knobs — the S164 additive metadata (absent ⇒ the S139 legacy pass).
// ---------------------------------------------------------------------------

export interface RoughKnobs {
  /** The roughness scale (Rough.js default 1). 0 = clean geometry. */
  roughness?: number;
  /** The perpendicular bow scale (Rough.js default 1). 0 = unbowed. */
  bowing?: number;
}

export const DEFAULT_ROUGHNESS = 1;
export const DEFAULT_BOWING = 1;
export const DEFAULT_MAX_RANDOMNESS_OFFSET = 2;
export const DEFAULT_CURVE_STEP_COUNT = 9;
export const DEFAULT_CURVE_FITTING = 0.95;
export const DEFAULT_CURVE_TIGHTNESS = 0;
/** Rough.js's hachure angle (the fills module rides it as its default). */
export const HACHURE_ANGLE_DEFAULT = -41;

const knob = (v: number | undefined, fallback: number): number =>
  Number.isFinite(v as number) ? (v as number) : fallback;

/** The length-based roughness gain (audit §2.3): 1 below 200px, 0.4 above
 *  500px, linear between — the line through (200, 1) and (500, 0.4), so the
 *  gain is CONTINUOUS at both walls (long strokes calm down the way a long
 *  pen line does; no discontinuity at the 200px seam). */
export function roughnessGain(length: number): number {
  if (!Number.isFinite(length) || length < 200) return 1;
  if (length > 500) return 0.4;
  return -0.002 * length + 1.4;
}

// ---------------------------------------------------------------------------
// The bowing double-stroke line — one cubic per pass, drawn twice.
// ---------------------------------------------------------------------------

export interface Cubic {
  p0: Point;
  c1: Point;
  c2: Point;
  p3: Point;
}

/** Serialize one cubic through the shared fixed-decimal serializer. */
export function cubicD(c: Cubic): string {
  return `C ${fmt2(c.c1.x)} ${fmt2(c.c1.y)} ${fmt2(c.c2.x)} ${fmt2(c.c2.y)} ${fmt2(c.p3.x)} ${fmt2(c.p3.y)}`;
}

/** The roughened line (audit §2.3 `_line`): endpoint jitter capped at
 *  length/10, control points at 20–40% / 40–80% (divergePoint =
 *  0.2 + rand·0.2), and the DETERMINISTIC perpendicular bow
 *  `bowing·maxRandomnessOffset·Δy/200` on x and `·(x1−x2)/200` on y — the
 *  bow comes from the segment's own geometry, so a zero-bow knob yields
 *  exactly straight control lines. `jitterStart`/`jitterEnd` keep
 *  chain-interior joints EXACT (the S139 continuity law: the pen never
 *  teleports between segments) while open ends still drift. */
export function roughLineCubic(
  x1: number, y1: number, x2: number, y2: number,
  rng: () => number,
  roughness: number, bowing: number,
  jitterStart = true, jitterEnd = true
): Cubic {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  const gain = roughnessGain(length);
  // Endpoint jitter: maxRandomnessOffset scaled by the knobs, bounded by
  // the offset²·2>100 → 2 wall and the length/10 cap (audit §2.3).
  let offset = DEFAULT_MAX_RANDOMNESS_OFFSET * Math.max(0, roughness) * gain;
  if (offset * offset * 2 > 100) offset = 2;
  if (offset > length / 10) offset = length / 10;
  const j = (): Point => ({ x: (rng() * 2 - 1) * offset, y: (rng() * 2 - 1) * offset });
  const s0 = jitterStart ? j() : { x: 0, y: 0 };
  const e0 = jitterEnd ? j() : { x: 0, y: 0 };
  const sx = x1 + s0.x;
  const sy = y1 + s0.y;
  const ex = x2 + e0.x;
  const ey = y2 + e0.y;
  // The deterministic perpendicular bow (audit §2.3 formula, verbatim).
  const bow = bowing * DEFAULT_MAX_RANDOMNESS_OFFSET;
  const bowX = (bow * dy) / 200;
  const bowY = (bow * (x1 - x2)) / 200;
  const d1 = 0.2 + rng() * 0.2;
  const d2 = 0.4 + rng() * 0.4;
  return {
    p0: { x: sx, y: sy },
    c1: { x: sx + (ex - sx) * d1 + bowX, y: sy + (ey - sy) * d1 + bowY },
    c2: { x: sx + (ex - sx) * d2 + bowX, y: sy + (ey - sy) * d2 + bowY },
    p3: { x: ex, y: ey },
  };
}

/** The line-chain pass: one bowed cubic per segment (the bowing
 *  double-stroke line), open ends jittered, chain interiors exact. */
export function roughLinesD(points: Point[], closed: boolean, rng: () => number, roughness: number, bowing: number): string {
  if (points.length < 2) return "";
  let out = `M ${fmt2(points[0].x)} ${fmt2(points[0].y)} `;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9) continue;
    const openStart = i === 1 && !closed;
    const openEnd = i === points.length - 1 && !closed;
    out += cubicD(roughLineCubic(a.x, a.y, b.x, b.y, rng, roughness, bowing, openStart, openEnd)) + " ";
  }
  return out.trim();
}

// ---------------------------------------------------------------------------
// The rough Catmull-Rom (audit §2.3 `_curve`).
// ---------------------------------------------------------------------------

/** A raw Catmull-Rom chain through `points`: cubic Béziers with
 *  s = 1 − curveTightness and control offset s·(p[i+1]−p[i−1])/6; the
 *  first bezier is emitted twice and the landing point re-passed (the
 *  audit's first/last points double-drawn); a closed ring gets the
 *  over-close crossing seam (`L p0` — the hand-drawn crossed circle). */
export function curveD(points: Point[], closed = false): string {
  if (points.length < 2) return "";
  const s = 1 - DEFAULT_CURVE_TIGHTNESS;
  const at = (i: number): Point =>
    closed
      ? points[((i % points.length) + points.length) % points.length]
      : points[Math.max(0, Math.min(points.length - 1, i))];
  const seg = (a: Point, b: Point, c: Point, d: Point): Cubic => ({
    p0: { x: b.x, y: b.y },
    c1: { x: b.x + (s * (c.x - a.x)) / 6, y: b.y + (s * (c.y - a.y)) / 6 },
    c2: { x: c.x - (s * (d.x - b.x)) / 6, y: c.y - (s * (d.y - b.y)) / 6 },
    p3: { x: c.x, y: c.y },
  });
  let out = `M ${fmt2(points[0].x)} ${fmt2(points[0].y)} `;
  const first = seg(at(-1), at(0), at(1), at(2));
  out += cubicD(first) + " " + cubicD(first) + " ";
  for (let i = 1; i < points.length - 1; i++) {
    out += cubicD(seg(at(i - 1), at(i), at(i + 1), at(i + 2))) + " ";
  }
  const last = points[points.length - 1];
  out += `L ${fmt2(last.x)} ${fmt2(last.y)} `;
  if (closed) out += `L ${fmt2(points[0].x)} ${fmt2(points[0].y)} `;
  return out.trim();
}

/** The rough Catmull-Rom: the polyline is jittered FIRST (per-point,
 *  seeded; the start is always pinned and a closed ring's seam point is
 *  pinned too, so chains and rings stay joined — an open curve's far end
 *  may drift the way a hand-drawn flourish does), then the raw curve rides
 *  through. */
export function roughCurveD(points: Point[], closed: boolean, rng: () => number, roughness: number): string {
  if (points.length < 2) return "";
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  let offset = DEFAULT_MAX_RANDOMNESS_OFFSET * Math.max(0, roughness) * roughnessGain(length);
  if (offset > length / 10) offset = length / 10;
  const pts = points.map((p, i) => {
    const interior = i > 0 && (i < points.length - 1 || !closed);
    if (!interior || !(offset > 0)) return p;
    return { x: p.x + (rng() * 2 - 1) * offset * 0.5, y: p.y + (rng() * 2 - 1) * offset * 0.5 };
  });
  return curveD(pts, closed);
}

// ---------------------------------------------------------------------------
// The ellipse overshoot — the hand-drawn over-close (audit §2.3).
// ---------------------------------------------------------------------------

/** The rough ellipse's point ring: size-scaled step count
 *  `max(curveStepCount, curveStepCount/√200·psq)`, a seeded start angle,
 *  per-point radius jitter from `1 − curveFitting`, and the 1.0 / 0.98 /
 *  0.9 radius overshoot trio PAST the seam — the pen crosses itself the
 *  way a hand-drawn circle does. */
export function roughEllipseRing(cx: number, cy: number, rx: number, ry: number, rng: () => number, roughness: number): Point[] {
  const psq = Math.sqrt(Math.PI * 2 * Math.hypot(rx, ry));
  const steps = Math.max(DEFAULT_CURVE_STEP_COUNT, Math.round((DEFAULT_CURVE_STEP_COUNT / Math.sqrt(200)) * psq));
  const start = rng() * 2 * Math.PI;
  const jitterScale = 1 - DEFAULT_CURVE_FITTING;
  const jr = (scale = 1): number => scale * (1 + jitterScale * (rng() * 2 - 1) * Math.max(0, roughness));
  const pts: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const th = start + (i / steps) * 2 * Math.PI;
    const r = jr();
    pts.push({ x: cx + Math.cos(th) * rx * r, y: cy + Math.sin(th) * ry * r });
  }
  const step = (2 * Math.PI) / steps;
  for (const k of [1, 2, 3]) {
    const th = start + 2 * Math.PI + step * k;
    const r = jr(k === 1 ? 1.0 : k === 2 ? 0.98 : 0.9);
    pts.push({ x: cx + Math.cos(th) * rx * r, y: cy + Math.sin(th) * ry * r });
  }
  return pts;
}

/** The rough ellipse `d`: one overshoot ring through the raw curve. The
 *  double-stroke rides roughenPath's overlay pass (a fresh stream — a
 *  second ring with its own seeded start angle and jitter). */
export function roughEllipseD(cx: number, cy: number, rx: number, ry: number, rng: () => number, roughness: number): string {
  return curveD(roughEllipseRing(cx, cy, rx, ry, rng, roughness), false);
}

// ---------------------------------------------------------------------------
// The per-path entry: roughen a whole authored path (main + overlay).
// ---------------------------------------------------------------------------

export interface RoughenedPath {
  /** The roughened main pass (replaces the authored stroke's `d`). */
  main: string;
  /** The double-stroke overlay pass (the S139 retrace, roughened). */
  overlay: string;
}

/** Roughen ONE authored path. Every subpath flattens deterministically
 *  first (authored Béziers ride the adaptive flattener + the audit's RDP
 *  epsilon (1+roughness)/2), then:
 *  - authored ellipses (M A A Z) ride the overshoot primitive;
 *  - line chains ride the bowing double-stroke line per segment;
 *  - curved chains ride the rough Catmull-Rom.
 *  The MAIN pass streams from minstd(seed); the OVERLAY from minstd(seed+1)
 *  — Rough.js's overlay-at-seed+1 — two fresh generators, NO shared
 *  stream. Returns null when the path is too small to bear ink or when the
 *  roughened output would breach the per-path command budget (the caller
 *  keeps the authored geometry — the same wall the retrace/hatch guard). */
export function roughenPath(d: string, seed: number, knobs: RoughKnobs): RoughenedPath | null {
  const roughness = knob(knobs.roughness, DEFAULT_ROUGHNESS);
  const bowing = knob(knobs.bowing, DEFAULT_BOWING);
  const eps = (1 + roughness) / 2; // the audit's RDP epsilon
  const subs = flattenSubpathPoints(d, eps);
  if (subs.length === 0) return null;
  const passes = (rng: () => number): string => {
    let out = "";
    for (const sub of subs) {
      if (sub.ellipse) {
        out += roughEllipseD(sub.ellipse.cx, sub.ellipse.cy, sub.ellipse.rx, sub.ellipse.ry, rng, roughness) + " ";
        continue;
      }
      const pts = sub.curved
        ? sub.closed
          ? rdpTrimRing(sub.points, eps)
          : rdp(sub.points, eps)
        : sub.points;
      if (!sub.curved) out += roughLinesD(pts, sub.closed, rng, roughness, bowing) + " ";
      else out += roughCurveD(pts, sub.closed, rng, roughness) + " ";
    }
    return out.trim();
  };
  const main = passes(minstd(seed));
  if (!main) return null;
  const overlay = passes(minstd(seed + 1));
  if (!overlay) return null;
  // The WB_PATH_COMMAND_BUDGET law — BOTH passes ride the ordinary path
  // machinery (the overlay becomes a -od path), so both pay the wall.
  if (countPathCommands(main) > 512 || countPathCommands(overlay) > 512) return null;
  return { main, overlay };
}

/** RDP for a closed ring: simplify the interior run, then re-pin the
 *  closing point so the ring still joins (the S139 joint law). */
function rdpTrimRing(points: Point[], epsilon: number): Point[] {
  const n = points.length;
  if (n <= 2) return points;
  return [...rdp(points.slice(0, n - 1), epsilon), points[0]];
}

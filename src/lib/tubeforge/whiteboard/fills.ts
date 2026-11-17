// S164 — the fills module: true polygon-clipped hachure + the style set.
//
// The S139 hatch was a boustrophedon scribble across a bounding box, kept
// inside by a clipPath. Rough.js's hachure-fill is the stronger discipline:
// ROTATE the polygon by the hachure angle + 90, sweep horizontal scan rows
// through a sorted edge table, pair the intersections (even-odd), and
// rotate back — the ink stays inside the shape BY CONSTRUCTION (no clip
// needed for the lines themselves), and the audit's roughness≥1 → 30%
// skip-row flourish rides the sweep (seeded, never ambient). The audit
// §2.3 stages the wrappers as
// ≤50-LOC compositions: cross-hatch = a +90° second pass; zigzag = paired
// offset lines; zigzag-line = the √2·zo midpoint kink; dashed = centered
// dash placement. Dots ride a grid with the audit's LANDMINE FIX: Rough.js
// jittered dot fills with AMBIENT unseeded randomness — ours jitter from the
// PER-SHAPE seed (the same fnv1a(assetId::pathId) derivation as every
// other layer), so the same shape always dots identically.
//
// Every emitted number rides svg.ts's ONE fixed-decimal serializer (the
// byte-stable `d` law — no parallel rounding anywhere). Pure: no fs, no
// clock, no Math.random — the streams are MINSTD instances local to each
// call. The fill budget: ONE derived fill never exceeds 512 expanded
// commands (the WB_PATH_COMMAND_BUDGET law) — the raw API refuses LOUDLY
// over the cap, and the clamp helper grows the gap until it fits, so a
// large fill can never hang the renderer.
import { fmt2, polylineD, type Point } from "./svg";
import { cubicD, minstd, roughLineCubic, HACHURE_ANGLE_DEFAULT, type RoughKnobs } from "./roughen";

export const MAX_FILL_COMMANDS = 512;

export type FillStyleName = "hachure" | "cross-hatch" | "zigzag" | "zigzag-line" | "dashed" | "dots";

/** The fill style spec — all fields optional; the closed style set above
 *  is the whole vocabulary (hachure is the default, Rough.js's own). */
export interface FillStyleSpec {
  kind?: FillStyleName;
  /** The hatch/dot spacing (px). Default: strokeWidth × 4, floored at 4. */
  gap?: number;
  /** The hachure angle in degrees. Default −41 (Rough.js's own). */
  angle?: number;
}

interface Seg {
  a: Point;
  b: Point;
}

const num = (v: number | undefined, fallback: number): number =>
  Number.isFinite(v as number) ? (v as number) : fallback;

// ---------------------------------------------------------------------------
// The scan-line hachure generator.
// ---------------------------------------------------------------------------

/** Collect the polygon edges (every subpath — even-odd across the set, so
 *  holes flip parity naturally) and run the horizontal sweep: rows spaced
 *  `gap` apart, intersections sorted, paired (0,1),(2,3)…, rotated back.
 *  Deterministic: the half-open vertex rule [a.y, b.y) never double-counts,
 *  and JS sorts are stable, so tied intersections keep edge order.
 *
 *  `skip` arms the audit §2.3 flourish (roughness≥1 → 30% skip-row): each
 *  sweep row consumes exactly ONE draw from the passed stream and is
 *  dropped when it lands under 0.3 — the stream position depends only on
 *  the row index, so the same seed always skips the SAME rows. */
export function hachureSegments(polygons: Point[][], angleDeg: number, gap: number, skip?: { rng: () => number }): Seg[] {
  const g = Math.max(0.5, gap);
  const rad = ((angleDeg + 90) * Math.PI) / 180;
  const cos = Math.cos(-rad);
  const sin = Math.sin(-rad);
  const back = Math.cos(rad);
  const bsin = Math.sin(rad);
  const rot = (p: Point): Point => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos });
  const unrot = (p: Point): Point => ({ x: p.x * back - p.y * bsin, y: p.x * bsin + p.y * back });
  const edges: [Point, Point][] = [];
  let minY = Infinity;
  let maxY = -Infinity;
  for (const poly of polygons) {
    if (poly.length < 3) continue; // a fill needs an area
    for (let i = 0; i < poly.length; i++) {
      const a = rot(poly[i]);
      const b = rot(poly[(i + 1) % poly.length]);
      edges.push([a, b]);
      if (a.y < minY) minY = a.y;
      if (a.y > maxY) maxY = a.y;
    }
  }
  if (edges.length === 0 || !(maxY > minY)) return [];
  const y0 = Math.ceil(minY / g) * g;
  const rows = Math.max(0, Math.floor((maxY - y0) / g));
  const segs: Seg[] = [];
  for (let r = 0; r <= rows; r++) {
    const y = y0 + r * g;
    if (skip && skip.rng() < 0.3) continue; // the §2.3 skip-row flourish (seeded)
    const xs: { x: number; e: number }[] = [];
    for (let e = 0; e < edges.length; e++) {
      const [a, b] = edges[e];
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
        const t = (y - a.y) / (b.y - a.y);
        xs.push({ x: a.x + (b.x - a.x) * t, e });
      }
    }
    if (xs.length < 2) continue;
    xs.sort((p, q) => p.x - q.x);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = xs[k].x;
      const x1 = xs[k + 1].x;
      if (x1 - x0 < 0.1) continue;
      segs.push({ a: unrot({ x: x0, y }), b: unrot({ x: x1, y }) });
    }
  }
  return segs;
}

/** Bounding box of the polygon set (the dot grid's frame). */
function bounds(polygons: Point[][]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const poly of polygons) {
    for (const p of poly) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return Number.isFinite(minX) && maxX > minX && maxY > minY ? { minX, minY, maxX, maxY } : null;
}

/** Even-odd point-in-polygon across the whole subpath set (the dot's
 *  inside test — same half-open rule as the sweep). */
function insidePolys(polygons: Point[][], p: Point): boolean {
  let crossings = 0;
  for (const poly of polygons) {
    if (poly.length < 3) continue;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if ((a.y <= p.y && b.y > p.y) || (b.y <= p.y && a.y > p.y)) {
        const t = (p.y - a.y) / (b.y - a.y);
        const x = a.x + (b.x - a.x) * t;
        if (x > p.x) crossings++;
      }
    }
  }
  return crossings % 2 === 1;
}

/** The dot grid with THE SEEDED-JITTER FIX: hex-ish rows (odd rows offset
 *  half a spacing), each dot jittered per axis from the per-shape stream,
 *  kept only when the JITTERED center is inside the polygon set. */
export function dotPoints(polygons: Point[][], spacing: number, rng: () => number, jitterScale = 0.25): Point[] {
  const s = Math.max(2, spacing);
  const bb = bounds(polygons);
  if (!bb) return [];
  const dots: Point[] = [];
  const rows = Math.floor((bb.maxY - bb.minY) / s);
  for (let r = 0; r <= rows; r++) {
    const y = bb.minY + r * s;
    const xOff = r % 2 === 1 ? s / 2 : 0;
    const cols = Math.floor((bb.maxX - bb.minX - xOff) / s);
    for (let c = 0; c <= cols; c++) {
      const jx = (rng() * 2 - 1) * s * jitterScale;
      const jy = (rng() * 2 - 1) * s * jitterScale;
      const p = { x: bb.minX + xOff + c * s + jx, y: y + jy };
      if (insidePolys(polygons, p)) dots.push(p);
    }
  }
  return dots;
}

// ---------------------------------------------------------------------------
// The wrappers (audit §2.3: each style is a ≤50-LOC composition).
// ---------------------------------------------------------------------------

/** cross-hatch: the hachure pass plus its +90° sibling (the flourish rides
 *  both passes — the same stream hands out the rows' fates in order). */
export function crossHatchSegments(polygons: Point[][], angleDeg: number, gap: number, skip?: { rng: () => number }): Seg[] {
  return [...hachureSegments(polygons, angleDeg, gap, skip), ...hachureSegments(polygons, angleDeg + 90, gap, skip)];
}

const kinkMid = (a: Point, b: Point, zo: number, rng: () => number): Point => {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const k = zo * (rng() * 2 - 1);
  return { x: mx + (-(b.y - a.y) / len) * k, y: my + ((b.x - a.x) / len) * k };
};

/** zigzag: hatch lines paired into a boustrophedon ribbon; each of the
 *  three connectors carries a midpoint kink offset by `zo` (seeded). */
export function zigzagSegments(hatch: Seg[], zo: number, rng: () => number): Point[][] {
  const out: Point[][] = [];
  for (let i = 0; i + 1 < hatch.length; i += 2) {
    const A = hatch[i];
    const B = hatch[i + 1];
    out.push([
      A.a,
      kinkMid(A.a, A.b, zo, rng),
      A.b,
      kinkMid(A.b, B.b, zo, rng),
      B.b,
      kinkMid(B.b, B.a, zo, rng),
      B.a,
    ]);
  }
  return out;
}

/** zigzag-line: each hatch line alone, with ONE midpoint kink at √2·zo
 *  (the audit's kink magnitude). */
export function zigzagLineSegments(hatch: Seg[], zo: number, rng: () => number): Point[][] {
  return hatch.map((s) => [s.a, kinkMid(s.a, s.b, zo * Math.SQRT2, rng), s.b]);
}

/** dashed: each hatch line cut into CENTERED dashes (the audit's centered
 *  dash placement). Defaults derive from the gap so small fills never
 *  drown: dash length 0.9·gap, dash gap 0.35·gap. */
export function dashSegments(hatch: Seg[], gap: number, dashLength?: number, dashGap?: number): Seg[] {
  const dl = Math.max(2, num(dashLength, gap * 0.9));
  const dg = Math.max(1, num(dashGap, gap * 0.35));
  const out: Seg[] = [];
  for (const s of hatch) {
    const L = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
    if (!(L >= 1)) continue;
    const count = Math.max(1, Math.floor((L + dg) / (dl + dg)));
    const len = Math.min(dl, (L - (count - 1) * dg) / count);
    if (!(len > 0.2)) continue;
    const start = (L - count * len - (count - 1) * dg) / 2;
    const ux = (s.b.x - s.a.x) / L;
    const uy = (s.b.y - s.a.y) / L;
    for (let k = 0; k < count; k++) {
      const t0 = start + k * (len + dg);
      out.push({
        a: { x: s.a.x + ux * t0, y: s.a.y + uy * t0 },
        b: { x: s.a.x + ux * (t0 + len), y: s.a.y + uy * (t0 + len) },
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The emit path — geometry → roughened ink → ONE serializer → `d` string.
// ---------------------------------------------------------------------------

export interface FillResult {
  d: string;
  /** Expanded command count of the emitted `d` (the budget's unit). */
  commands: number;
  kind: FillStyleName;
}

/** The fill generator WITHOUT the cap wall: emits the style's ink
 *  ROUGHENED (each hatch line is a bowed rough cubic — single-pass, the
 *  fill's own budget law; the zigzag family carries its kinks as the
 *  roughness; dots are seeded circles). Returns the `d` string and its
 *  ACTUAL expanded command count. Pure; deterministic per (polygons,
 *  seed, knobs, spec). */
export function buildFill(polygons: Point[][], seed: number, knobs: RoughKnobs, spec: FillStyleSpec, strokeWidth = 3): FillResult {
  const kind = spec.kind ?? "hachure";
  const roughness = Number.isFinite(knobs.roughness) ? (knobs.roughness as number) : 1;
  const bowing = Number.isFinite(knobs.bowing) ? (knobs.bowing as number) : 1;
  const gap = Math.max(4, num(spec.gap, Math.max(4, strokeWidth * 4)));
  const angle = num(spec.angle, HACHURE_ANGLE_DEFAULT);
  const rng = minstd(seed);
  // The §2.3 flourish: roughness≥1 skips ~30% of hatch rows — every
  // row-consuming style rides it (the wrappers all consume `hatch`);
  // DOTS keep the stream to themselves (the dot grid owns draw 0).
  const flourish = roughness >= 1 ? { rng } : undefined;
  const hatch = kind === "dots" ? [] : hachureSegments(polygons, angle, gap, flourish);
  let d = "";
  let commands = 0;
  if (kind === "dots") {
    const dots = dotPoints(polygons, gap, rng);
    const r = Math.max(0.8, Math.min(2.2, gap * 0.16));
    for (const p of dots) {
      d += `M ${fmt2(p.x - r)} ${fmt2(p.y)} A ${fmt2(r)} ${fmt2(r)} 0 1 1 ${fmt2(p.x + r)} ${fmt2(p.y)} A ${fmt2(r)} ${fmt2(r)} 0 1 1 ${fmt2(p.x - r)} ${fmt2(p.y)} `;
    }
    commands = dots.length * 3;
  } else if (kind === "zigzag" || kind === "zigzag-line") {
    const zo = Math.max(1, gap * 0.5);
    const polys = kind === "zigzag" ? zigzagSegments(hatch, zo, rng) : zigzagLineSegments(hatch, zo, rng);
    for (const poly of polys) {
      d += polylineD(poly) + " ";
      commands += 1 + (poly.length - 1); // M + one L per remaining point
    }
  } else {
    const lines = kind === "cross-hatch" ? crossHatchSegments(polygons, angle, gap, flourish) : hatch;
    const inked = kind === "dashed" ? dashSegments(lines, gap) : lines;
    for (const s of inked) {
      d += `M ${fmt2(s.a.x)} ${fmt2(s.a.y)} ` + cubicD(roughLineCubic(s.a.x, s.a.y, s.b.x, s.b.y, rng, roughness, bowing, false, false)) + " ";
      commands += 2;
    }
  }
  return { d: d.trim(), commands, kind };
}

/** The raw fill API: buildFill plus THE CAP WALL — a fill whose actual
 *  command count exceeds MAX_FILL_COMMANDS refuses LOUDLY (a fill this
 *  dense would hang the renderer). The wiring's clamp half lives in
 *  clampFillSpec. */
export function roughFillD(polygons: Point[][], seed: number, knobs: RoughKnobs, spec: FillStyleSpec, strokeWidth = 3): FillResult {
  const res = buildFill(polygons, seed, knobs, spec, strokeWidth);
  if (res.commands > MAX_FILL_COMMANDS) {
    throw new Error(
      `S164 fill exceeds the command cap: style "${res.kind}" at gap ${fmt2(num(spec.gap, Math.max(4, strokeWidth * 4)))} emits ${res.commands} expanded commands ` +
        `against the ${MAX_FILL_COMMANDS} budget — grow the gap (clampFillSpec) or split the shape; a fill this dense would hang the renderer`
    );
  }
  return res;
}

/** Grow the fill's gap until the ACTUAL build (same seed, same code path)
 *  fits the cap — the wiring's clamp half of the guard. Bounded loop,
 *  deterministic, monotone (a larger gap strictly reduces the row/dot
 *  counts). Returns the adjusted spec; never throws. */
export function clampFillSpec(polygons: Point[][], seed: number, knobs: RoughKnobs, spec: FillStyleSpec, strokeWidth = 3): FillStyleSpec {
  const kind = spec.kind ?? "hachure";
  let gap = Math.max(4, num(spec.gap, Math.max(4, strokeWidth * 4)));
  for (let i = 0; i < 48; i++) {
    const projected = buildFill(polygons, seed, knobs, { kind, gap, angle: spec.angle }, strokeWidth).commands;
    if (projected <= MAX_FILL_COMMANDS) return { kind, gap, angle: spec.angle };
    gap *= 1.3;
  }
  return { kind, gap, angle: spec.angle };
}

// S64 — the Whiteboard Engine: SVG sanitizer + path geometry.
//
// The engine's foundation, PURE (no fs, no browser, no DB):
//   1. sanitizeSvg — the security gate every SVG asset passes before it can
//      reach a renderer page (the plan's security test category). Strips
//      scripts, foreignObject, event handlers, script-y URLs, external
//      references, and XML entity/DOCTYPE attacks (billion laughs).
//   2. parsePathData / flattenPath — the full SVG path grammar
//      (M L H V C S Q T A Z, absolute + relative) flattened to polylines.
//   3. Arc-length math — cumulative length, point-at-length, tangent —
//      the geometry both the dash-reveal timing and the drawing hand ride.
//
// The browser rasterizes; THIS module owns the truth about where every
// stroke is at every moment. No CSS animation anywhere — determinism law.
export interface Point {
  x: number;
  y: number;
}

export interface PathSegment {
  /** Polyline points of one subpath (M…Z / M…M). */
  points: Point[];
  /** Cumulative arc length at each point (lengths[i] = dist over points[0..i]). */
  lengths: number[];
  /** True when the subpath closed (Z). */
  closed: boolean;
}

// ---------------------------------------------------------------------------
// 1. The sanitizer
// ---------------------------------------------------------------------------

const BLOCKED_ELEMENTS = [
  "script",
  "foreignobject",
  "iframe",
  "embed",
  "object",
  "image",
  "use",
  "animate",
  "animatetransform",
  "animatemotion",
  "set",
];

/** Strip a blocked element with its entire subtree (nested included). */
function stripElements(svg: string): string {
  let out = svg;
  let changed = true;
  while (changed) {
    changed = false;
    for (const tag of BLOCKED_ELEMENTS) {
      // Paired element (case-insensitive, attributes allowed on the open tag).
      const paired = new RegExp(`<${tag}(\\s[^>]*)?>[\\s\\S]*?<\\/${tag}\\s*>`, "gi");
      const selfClosed = new RegExp(`<${tag}(\\s[^>]*)?\\/>`, "gi");
      const bare = new RegExp(`<${tag}\\s*>`, "gi");
      const before = out;
      out = out.replace(paired, "").replace(selfClosed, "").replace(bare, "");
      if (out !== before) changed = true;
    }
  }
  return out;
}

/**
 * Sanitize an SVG document string for safe rasterization. Returns the
 * cleaned markup. Defense in depth: the renderer ALSO runs chromium with
 * all network routes aborted — this gate is the first line, not the only.
 */
export function sanitizeSvg(svg: string): string {
  let out = svg;
  // XML prolog / doctype / entity declarations (entity expansion attacks).
  out = out.replace(/<\?[\s\S]*?\?>/g, "");
  out = out.replace(/<!DOCTYPE[\s\S]*?>/gi, "");
  out = out.replace(/<!ENTITY[\s\S]*?>/gi, "");
  // Blocked elements, subtrees included.
  out = stripElements(out);
  // Event handler attributes (onclick=, onload=, onanything= — quoted or not).
  out = out.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // Script-y and external URLs on href/xlink:href/src/style url(...).
  out = out.replace(/\s(?:xlink:)?href\s*=\s*(?:"\s*(?:javascript|data|vbscript):[^"]*"|'\s*(?:javascript|data|vbscript):[^']*'|(?:javascript|data|vbscript):[^\s>]+)/gi, "");
  out = out.replace(/\ssrc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  out = out.replace(/url\(\s*(?:"|')?\s*(?:https?:|ftp:)[^)]*\)/gi, "url(#none)");
  // style="...behavior/script..." — style attributes can carry expressions.
  out = out.replace(/\sstyle\s*=\s*"[^"]*(?:expression|javascript|behavior)\s*:[^"]*"/gi, "");
  out = out.replace(/\sstyle\s*=\s*'[^']*(?:expression|javascript|behavior)\s*:[^']*'/gi, "");
  return out;
}

// ---------------------------------------------------------------------------
// 2. The path grammar
// ---------------------------------------------------------------------------

export interface PathCommand {
  cmd: string;
  args: number[];
}

/** Tokenize a path-data string into commands with numeric args. */
export function parsePathData(d: string): PathCommand[] {
  const cmds: PathCommand[] = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
  let match: RegExpExecArray | null;
  let current: PathCommand | null = null;
  while ((match = re.exec(d)) !== null) {
    if (match[1] !== undefined) {
      if (current) cmds.push(current);
      current = { cmd: match[1], args: [] };
    } else if (current) {
      current.args.push(Number(match[2]));
    }
  }
  if (current) cmds.push(current);
  return cmds;
}

/** Points-per-command of the grammar (Z consumes none). */
export const TOKENS_PER_CMD: Readonly<Record<string, number>> = {
  M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0,
};

/** S65 (E1): the EXPANDED command count of a path — parsePathData groups a
 *  command letter with all its implicit-repeat numbers into one entry, so
 *  the real cost (what the flattener and the rasterizer pay) is the number
 *  of complete coordinate groups, not the number of letters. Z counts as
 *  one command (it consumes no tokens). This is the per-path budget's
 *  unit of account. */
export function countPathCommands(d: string): number {
  let n = 0;
  for (const c of parsePathData(d)) {
    const per = TOKENS_PER_CMD[c.cmd.toUpperCase()] ?? 2;
    n += per === 0 ? 1 : Math.max(1, Math.floor(c.args.length / per));
  }
  return n;
}

function cubicAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

function quadAt(p0: Point, p1: Point, p2: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

/** SVG-spec endpoint→center arc parameterization, then sample the ellipse.
 *  Returns the sampled arc points EXCLUDING the start point. */
function flattenArc(
  start: Point,
  rx: number, ry: number, rotDeg: number,
  largeArc: boolean, sweep: boolean,
  end: Point,
  steps: number
): Point[] {
  let hrx = Math.abs(rx);
  let hry = Math.abs(ry);
  if (hrx === 0 || hry === 0) return [end]; // degenerate → line
  const phi = (rotDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (start.x - end.x) / 2;
  const dy = (start.y - end.y) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;
  // Auto-scale radii per spec (F.6.6).
  const lambda = (x1p * x1p) / (hrx * hrx) + (y1p * y1p) / (hry * hry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    hrx *= s;
    hry *= s;
  }
  const rx2 = hrx * hrx;
  const ry2 = hry * hry;
  const sign = largeArc !== sweep ? 1 : -1;
  const numerator = rx2 * ry2 - rx2 * y1p * y1p - ry2 * x1p * x1p;
  const denominator = rx2 * y1p * y1p + ry2 * x1p * x1p;
  const co = sign * Math.sqrt(Math.max(0, numerator / denominator));
  const cxp = (co * hrx * y1p) / hry;
  const cyp = (-co * hry * x1p) / hrx;
  const cx = cosPhi * cxp - sinPhi * cyp + (start.x + end.x) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (start.y + end.y) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
    let a = Math.acos(Math.max(-1, Math.min(1, dot / (len || 1))));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const theta1 = angle(1, 0, (x1p - cxp) / hrx, (y1p - cyp) / hry);
  let dTheta = angle((x1p - cxp) / hrx, (y1p - cyp) / hry, (-x1p - cxp) / hrx, (-y1p - cyp) / hry);
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweep && dTheta < 0) dTheta += 2 * Math.PI;
  const pts: Point[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const th = theta1 + dTheta * t;
    pts.push({
      x: cosPhi * hrx * Math.cos(th) - sinPhi * hry * Math.sin(th) + cx,
      y: sinPhi * hrx * Math.cos(th) + cosPhi * hry * Math.sin(th) + cy,
    });
  }
  return pts;
}

const CURVE_STEPS = 20; // per cubic/quadratic; P0 precision vs browser ≈ <0.5%
const ARC_STEPS = 24;

/**
 * Normalize the token stream: extra args after a command IMPLICITLY REPEAT
 * it (the SVG grammar — extra pairs after M become L, same case). Without
 * this, "M 0 0 10 10 20 20" would silently drop the two implied lines.
 */
export function normalizeCommands(cmds: PathCommand[]): PathCommand[] {
  const out: PathCommand[] = [];
  for (const { cmd, args } of cmds) {
    const upper = cmd.toUpperCase();
    const per = TOKENS_PER_CMD[upper] ?? 0;
    if (per === 0) {
      out.push({ cmd, args: [] }); // Z
      continue;
    }
    const usable = args.slice(0, Math.floor(args.length / per) * per);
    for (let i = 0; i < usable.length; i += per) {
      // First chunk keeps M; repeats degrade to L (per grammar).
      const c = i === 0 ? cmd : upper === "M" ? (cmd === upper ? "L" : "l") : cmd;
      out.push({ cmd: c, args: usable.slice(i, i + per) });
    }
  }
  return out;
}

/** Flatten parsed commands into subpaths with cumulative lengths. */
export function flattenPath(cmdsIn: PathCommand[]): PathSegment[] {
  const cmds = normalizeCommands(cmdsIn);
  const segs: PathSegment[] = [];
  let cur: Point[] = [];
  let lengths: number[] = [];
  let closed = false;
  let cx = 0;
  let cy = 0; // current point
  let sx = 0;
  let sy = 0; // subpath start
  let lastC: Point | null = null; // last cubic control (S reflection)
  let lastQ: Point | null = null; // last quadratic control (T reflection)

  const push = (p: Point): void => {
    const last = cur[cur.length - 1];
    if (last && Math.abs(last.x - p.x) < 1e-9 && Math.abs(last.y - p.y) < 1e-9) return;
    cur.push(p);
    lengths.push((lengths[lengths.length - 1] ?? 0) + (last ? Math.hypot(p.x - last.x, p.y - last.y) : 0));
  };
  const endSub = (): void => {
    if (cur.length > 1) segs.push({ points: cur, lengths, closed });
    cur = [];
    lengths = [];
    closed = false;
  };

  for (const { cmd, args } of cmds) {
    const upper = cmd.toUpperCase();
    const rel = cmd !== upper;
    const A = (n: number, anchor: number): number => (rel ? anchor + n : n);

    switch (upper) {
      case "M": {
        endSub();
        cx = A(args[0], cx);
        cy = A(args[1], cy);
        sx = cx;
        sy = cy;
        cur = [{ x: cx, y: cy }];
        lengths = [0];
        lastC = null;
        lastQ = null;
        break;
      }
      case "L": {
        const nx = A(args[0], cx);
        const ny = A(args[1], cy);
        push({ x: nx, y: ny });
        cx = nx;
        cy = ny;
        lastC = null;
        lastQ = null;
        break;
      }
      case "H": {
        const nx = A(args[0], cx);
        push({ x: nx, y: cy });
        cx = nx;
        lastC = null;
        lastQ = null;
        break;
      }
      case "V": {
        const ny = A(args[0], cy);
        push({ x: cx, y: ny });
        cy = ny;
        lastC = null;
        lastQ = null;
        break;
      }
      case "C": {
        const c1 = { x: A(args[0], cx), y: A(args[1], cy) };
        const c2 = { x: A(args[2], cx), y: A(args[3], cy) };
        const p = { x: A(args[4], cx), y: A(args[5], cy) };
        for (let s = 1; s <= CURVE_STEPS; s++) push(cubicAt({ x: cx, y: cy }, c1, c2, p, s / CURVE_STEPS));
        lastC = c2;
        lastQ = null;
        cx = p.x;
        cy = p.y;
        break;
      }
      case "S": {
        const c2 = { x: A(args[0], cx), y: A(args[1], cy) };
        const p = { x: A(args[2], cx), y: A(args[3], cy) };
        const c1 = lastC ? { x: 2 * cx - lastC.x, y: 2 * cy - lastC.y } : { x: cx, y: cy };
        for (let s = 1; s <= CURVE_STEPS; s++) push(cubicAt({ x: cx, y: cy }, c1, c2, p, s / CURVE_STEPS));
        lastC = c2;
        lastQ = null;
        cx = p.x;
        cy = p.y;
        break;
      }
      case "Q": {
        const c = { x: A(args[0], cx), y: A(args[1], cy) };
        const p = { x: A(args[2], cx), y: A(args[3], cy) };
        for (let s = 1; s <= CURVE_STEPS; s++) push(quadAt({ x: cx, y: cy }, c, p, s / CURVE_STEPS));
        lastQ = c;
        lastC = null;
        cx = p.x;
        cy = p.y;
        break;
      }
      case "T": {
        const p = { x: A(args[0], cx), y: A(args[1], cy) };
        const c = lastQ ? { x: 2 * cx - lastQ.x, y: 2 * cy - lastQ.y } : { x: cx, y: cy };
        for (let s = 1; s <= CURVE_STEPS; s++) push(quadAt({ x: cx, y: cy }, c, p, s / CURVE_STEPS));
        lastQ = c;
        lastC = null;
        cx = p.x;
        cy = p.y;
        break;
      }
      case "A": {
        const pts = flattenArc(
          { x: cx, y: cy },
          args[0], args[1], args[2],
          args[3] !== 0, args[4] !== 0,
          { x: A(args[5], cx), y: A(args[6], cy) },
          ARC_STEPS
        );
        for (const p of pts) push(p);
        cx = pts[pts.length - 1].x;
        cy = pts[pts.length - 1].y;
        lastC = null;
        lastQ = null;
        break;
      }
      case "Z": {
        if (cur.length > 0) push({ x: sx, y: sy });
        closed = true;
        cx = sx;
        cy = sy;
        endSub();
        break;
      }
    }
  }
  endSub();
  return segs;
}

/** Convenience: parse + flatten a path-data string. */
export function pathSegments(d: string): PathSegment[] {
  return flattenPath(parsePathData(d));
}

/** Total length of a path's segments. */
export function totalLength(segs: PathSegment[]): number {
  let s = 0;
  for (const g of segs) s += g.lengths[g.lengths.length - 1] ?? 0;
  return s;
}

export interface PathSample {
  point: Point;
  /** Radians of the local tangent. */
  angle: number;
  /** Which segment (subpath index) the sample landed in. */
  segment: number;
}

/** The point at arc length `s` (clamped), with tangent angle. */
export function sampleAtLength(segs: PathSegment[], s: number): PathSample {
  const total = totalLength(segs);
  const target = Math.max(0, Math.min(total, s));
  let acc = 0;
  for (let gi = 0; gi < segs.length; gi++) {
    const g = segs[gi];
    const gl = g.lengths[g.lengths.length - 1] ?? 0;
    if (target <= acc + gl || gi === segs.length - 1) {
      const local = Math.max(0, Math.min(gl, target - acc));
      for (let i = 1; i < g.points.length; i++) {
        if (g.lengths[i] >= local || i === g.points.length - 1) {
          const l0 = g.lengths[i - 1];
          const l1 = g.lengths[i];
          const t = l1 > l0 ? (local - l0) / (l1 - l0) : 0;
          const a = g.points[i - 1];
          const b = g.points[i];
          return {
            point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
            angle: Math.atan2(b.y - a.y, b.x - a.x),
            segment: gi,
          };
        }
      }
    }
    acc += gl;
  }
  const g = segs[segs.length - 1];
  const p = g.points[g.points.length - 1];
  return { point: p, angle: 0, segment: segs.length - 1 };
}

// ---------------------------------------------------------------------------
// 3. Scene-space transforms (hand placement)
// ---------------------------------------------------------------------------

export interface Placement {
  x: number;
  y: number;
  scale: number;
  rotateDeg: number;
}

/** Map an asset-space point through a placement (SVG transform order:
 *  translate(x,y) rotate(r) scale(s) — right-to-left on the point). */
export function transformPoint(p: Point, pl: Placement): Point {
  const r = (pl.rotateDeg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const sx = p.x * pl.scale;
  const sy = p.y * pl.scale;
  return {
    x: pl.x + sx * cos - sy * sin,
    y: pl.y + sx * sin + sy * cos,
  };
}

// ---------------------------------------------------------------------------
// 4. S164 — the fixed-decimal serializer + the authored-curve flattener.
//
// The Rough.js port's two svg-level primitives:
//   1. fmt2 — the ONE fixed-decimal number formatter (2dp, trimmed). The
//      glyph table's own discipline, hoisted here so every generator
//      (sketch, roughen, fills) emits through the same serializer — no
//      parallel rounding anywhere (the byte-stable `d` law).
//   2. bezierFlatPoints + rdp — adaptive Bézier flattening (the
//      points-on-curve flatness test `ux = 3p2−2p1−p4, vx = 3p3−2p4−p1`)
//      and Ramer–Douglas–Peucker simplification. Authored curves flatten
//      deterministically into lean point sets BEFORE roughening.
// ---------------------------------------------------------------------------

/** Fixed-precision (2dp, trimmed) path number — the ONE serializer the
 *  whiteboard tree rounds through (byte-stable `d` strings across runs). */
export function fmt2(v: number): string {
  if (!Number.isFinite(v)) return "0";
  let s = v.toFixed(2);
  if (s === "-0.00") s = "0.00";
  s = s.replace(/\.?0+$/, "");
  return s === "-0" ? "0" : s;
}

/** Serialize a polyline as an M/L chain through the shared serializer (the
 *  fill module's zigzag family and any future line ink ride this). */
export function polylineD(points: Point[]): string {
  if (points.length === 0) return "";
  let out = `M ${fmt2(points[0].x)} ${fmt2(points[0].y)}`;
  for (let i = 1; i < points.length; i++) out += ` L ${fmt2(points[i].x)} ${fmt2(points[i].y)}`;
  return out;
}

/**
 * Ramer–Douglas–Peucker polyline simplification. Deterministic: the
 * first/last points always survive; each split keeps the farthest point;
 * the explicit stack processes left ranges before right ones (no
 * recursion-depth cliffs, one fixed traversal order).
 */
export function rdp(points: Point[], epsilon: number): Point[] {
  const n = points.length;
  if (n <= 2 || !(epsilon > 0)) return points.slice();
  const keep = new Array<boolean>(n).fill(false);
  keep[0] = true;
  keep[n - 1] = true;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length > 0) {
    const [lo, hi] = stack.pop() as [number, number];
    if (hi - lo < 2) continue;
    const a = points[lo];
    const b = points[hi];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const denom = Math.hypot(dx, dy);
    let best = -1;
    let bestDist = -1;
    for (let i = lo + 1; i < hi; i++) {
      const p = points[i];
      // Perpendicular distance to the chord (exact at denom 0: point-to-a).
      const dist = denom > 0 ? Math.abs(dy * (p.x - a.x) - dx * (p.y - a.y)) / denom : Math.hypot(p.x - a.x, p.y - a.y);
      if (dist > bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    if (best >= 0 && bestDist > epsilon) {
      keep[best] = true;
      stack.push([lo, best]);
      stack.push([best, hi]);
    }
  }
  const out: Point[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i]);
  return out;
}

/** Adaptive cubic-Bézier flattening (the points-on-curve algorithm): the
 *  structural flatness test `ux = 3p2−2p1−p4` vs `vx = 3p3−2p4−p1` (per
 *  axis, squared) AND a deviation gate — both control points must sit
 *  within `tolerance` of the endpoint chord — recurse at the midpoint
 *  until both hold (the structural test alone reads symmetric arcs as
 *  flat, which would corner-cut authored curves). Deterministic;
 *  depth-capped. */
export function bezierFlatPoints(p0: Point, c1: Point, c2: Point, p3: Point, tolerance = 0.15): Point[] {
  const out: Point[] = [];
  const tol = Number.isFinite(tolerance) && tolerance > 0 ? tolerance : 0.15;
  const walk = (a: Point, b: Point, c: Point, d: Point, depth: number): void => {
    const ux = (3 * b.x - 2 * a.x - d.x) * (3 * b.x - 2 * a.x - d.x);
    const uy = (3 * b.y - 2 * a.y - d.y) * (3 * b.y - 2 * a.y - d.y);
    const vx = (3 * c.x - 2 * d.x - a.x) * (3 * c.x - 2 * d.x - a.x);
    const vy = (3 * c.y - 2 * d.y - a.y) * (3 * c.y - 2 * d.y - a.y);
    // The deviation gate: perpendicular distance of each control point to
    // the endpoint chord (the RDP family's own measure).
    const denom = Math.hypot(d.x - a.x, d.y - a.y);
    const dev = (p: Point): number =>
      denom > 0 ? Math.abs((d.y - a.y) * (p.x - a.x) - (d.x - a.x) * (p.y - a.y)) / denom : Math.hypot(p.x - a.x, p.y - a.y);
    const flat = ux <= vx && uy <= vy && dev(b) <= tol && dev(c) <= tol;
    if (depth >= 16 || flat) {
      out.push(d);
      return;
    }
    // de Casteljau at t = 0.5.
    const ab = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const bc = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
    const cd = { x: (c.x + d.x) / 2, y: (c.y + d.y) / 2 };
    const abc = { x: (ab.x + bc.x) / 2, y: (ab.y + bc.y) / 2 };
    const bcd = { x: (bc.x + cd.x) / 2, y: (bc.y + cd.y) / 2 };
    const mid = { x: (abc.x + bcd.x) / 2, y: (abc.y + bcd.y) / 2 };
    walk(a, ab, abc, mid, depth + 1);
    walk(mid, bcd, cd, d, depth + 1);
  };
  out.push(p0);
  walk(p0, c1, c2, p3, 0);
  return out;
}

export interface FlattenedSubpath {
  points: Point[];
  closed: boolean;
  /** True when the subpath carried any curve command (C/S/Q/T). */
  curved: boolean;
  /** For an authored ellipse (M A A Z with rotation 0, shared radii): the
   *  center + radii the overshoot primitive rides. Null otherwise. */
  ellipse: { cx: number; cy: number; rx: number; ry: number } | null;
}

/** Flatten a path-data string into per-subpath point sets for the ROUGHEN
 *  pass: authored Béziers ride the adaptive flattener (deterministic, lean
 *  point sets — `curveTolerance` is the control-deviation gate, the
 *  audit's (1+roughness)/2 epsilon family), straight chains ride their
 *  endpoints, arc-bearing subpaths sample through the fixed-step arc
 *  flattener, and authored ellipses (M A A Z, rotation 0, shared radii)
 *  surface their geometry for the overshoot primitive. Pure; one fixed
 *  traversal order. */
export function flattenSubpathPoints(d: string, curveTolerance = 1): FlattenedSubpath[] {
  const cmds = normalizeCommands(parsePathData(d));
  const subs: FlattenedSubpath[] = [];
  let cur: { pts: Point[]; curved: boolean; arcs: number; ellipse: FlattenedSubpath["ellipse"] } | null = null;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let lastC: Point | null = null;
  let lastQ: Point | null = null;
  const pushPt = (p: Point): void => {
    if (!cur) return;
    const last = cur.pts[cur.pts.length - 1];
    if (last && Math.abs(last.x - p.x) < 1e-9 && Math.abs(last.y - p.y) < 1e-9) return;
    cur.pts.push(p);
  };
  const endSub = (closed: boolean): void => {
    if (cur && cur.pts.length > 1) {
      subs.push({ points: cur.pts, closed, curved: cur.curved, ellipse: cur.ellipse });
    }
    cur = null;
    lastC = null;
    lastQ = null;
  };
  for (const { cmd, args } of cmds) {
    const upper = cmd.toUpperCase();
    const rel = cmd !== upper;
    const A = (n: number, anchor: number): number => (rel ? anchor + n : n);
    if (upper === "M") {
      endSub(false);
      cx = A(args[0], cx);
      cy = A(args[1], cy);
      sx = cx;
      sy = cy;
      cur = { pts: [{ x: cx, y: cy }], curved: false, arcs: 0, ellipse: null };
      continue;
    }
    if (!cur) {
      // A path that starts without M: the grammar treats it as M 0 0.
      cur = { pts: [{ x: cx, y: cy }], curved: false, arcs: 0, ellipse: null };
    }
    switch (upper) {
      case "L": {
        cx = A(args[0], cx);
        cy = A(args[1], cy);
        pushPt({ x: cx, y: cy });
        lastC = null;
        lastQ = null;
        break;
      }
      case "H": {
        cx = A(args[0], cx);
        pushPt({ x: cx, y: cy });
        lastC = null;
        lastQ = null;
        break;
      }
      case "V": {
        cy = A(args[0], cy);
        pushPt({ x: cx, y: cy });
        lastC = null;
        lastQ = null;
        break;
      }
      case "C": {
        const c1 = { x: A(args[0], cx), y: A(args[1], cy) };
        const c2 = { x: A(args[2], cx), y: A(args[3], cy) };
        const p = { x: A(args[4], cx), y: A(args[5], cy) };
        for (const pt of bezierFlatPoints({ x: cx, y: cy }, c1, c2, p, curveTolerance)) pushPt(pt);
        cur.curved = true;
        lastC = c2;
        lastQ = null;
        cx = p.x;
        cy = p.y;
        break;
      }
      case "S": {
        const c2 = { x: A(args[0], cx), y: A(args[1], cy) };
        const p = { x: A(args[2], cx), y: A(args[3], cy) };
        const c1 = lastC ? { x: 2 * cx - lastC.x, y: 2 * cy - lastC.y } : { x: cx, y: cy };
        for (const pt of bezierFlatPoints({ x: cx, y: cy }, c1, c2, p, curveTolerance)) pushPt(pt);
        cur.curved = true;
        lastC = c2;
        lastQ = null;
        cx = p.x;
        cy = p.y;
        break;
      }
      case "Q": {
        const c = { x: A(args[0], cx), y: A(args[1], cy) };
        const p = { x: A(args[2], cx), y: A(args[3], cy) };
        // Quadratic → cubic (the standard degree lift): c1 = q0 + 2/3(q−q0).
        const c1 = { x: cx + (2 / 3) * (c.x - cx), y: cy + (2 / 3) * (c.y - cy) };
        const c2 = { x: p.x + (2 / 3) * (c.x - p.x), y: p.y + (2 / 3) * (c.y - p.y) };
        for (const pt of bezierFlatPoints({ x: cx, y: cy }, c1, c2, p, curveTolerance)) pushPt(pt);
        cur.curved = true;
        lastQ = c;
        lastC = null;
        cx = p.x;
        cy = p.y;
        break;
      }
      case "T": {
        const p = { x: A(args[0], cx), y: A(args[1], cy) };
        const c = lastQ ? { x: 2 * cx - lastQ.x, y: 2 * cy - lastQ.y } : { x: cx, y: cy };
        const c1 = { x: cx + (2 / 3) * (c.x - cx), y: cy + (2 / 3) * (c.y - cy) };
        const c2 = { x: p.x + (2 / 3) * (c.x - p.x), y: p.y + (2 / 3) * (c.y - p.y) };
        for (const pt of bezierFlatPoints({ x: cx, y: cy }, c1, c2, p, curveTolerance)) pushPt(pt);
        cur.curved = true;
        lastQ = c;
        lastC = null;
        cx = p.x;
        cy = p.y;
        break;
      }
      case "A": {
        const nx = A(args[5], cx);
        const ny = A(args[6], cy);
        const from = cur.pts[cur.pts.length - 1] ?? { x: cx, y: cy };
        // Authored ellipse candidate: the FIRST arc of a potential M A A Z
        // (rotation 0, shared radii). The SECOND arc must close it back to
        // the subpath start with the same radii, else the candidate drops.
        if (cur.arcs === 0 && args[2] === 0 && cur.pts.length === 1 && Math.abs(args[0] - args[1]) < 1e-9 && Math.abs(args[0]) > 0) {
          cur.ellipse = { cx: (from.x + nx) / 2, cy: (from.y + ny) / 2, rx: Math.abs(args[0]), ry: Math.abs(args[1]) };
        } else if (cur.arcs === 1 && cur.ellipse) {
          const ok =
            Math.abs(args[0] - cur.ellipse.rx) < 1e-9 &&
            Math.abs(args[1] - cur.ellipse.ry) < 1e-9 &&
            Math.abs(args[2]) < 1e-9 &&
            Math.abs(nx - sx) < 1e-9 &&
            Math.abs(ny - sy) < 1e-9;
          cur.ellipse = ok ? cur.ellipse : null;
        }
        // Arc-bearing subpaths sample through the fixed-step arc flattener so
        // the sweep stays true (the walker never re-parameterizes arcs).
        const arcPts = flattenArc(from, args[0], args[1], args[2], args[3] !== 0, args[4] !== 0, { x: nx, y: ny }, ARC_STEPS);
        for (const pt of arcPts) pushPt(pt);
        cur.arcs += 1;
        cx = nx;
        cy = ny;
        lastC = null;
        lastQ = null;
        break;
      }
      case "Z": {
        pushPt({ x: sx, y: sy });
        // Every Z-terminated subpath is CLOSED (the seam law: a ring's
        // first/last points stay joined through the roughen pass) — the
        // authored-ellipse flag rides cur.ellipse independently.
        endSub(true);
        cx = sx;
        cy = sy;
        break;
      }
    }
  }
  endSub(false);
  return subs;
}

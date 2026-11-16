/**
 * Per-pixel reveal-time painters.
 *
 * Port of the reference `fill_painters.py` (whiteboard-animator, MIT).
 * Each painter fills a Float32Array with the reveal time of every ink
 * pixel in [start, start + dur]; Infinity = untouched. cv2.findContours
 * + EDT-index inheritance are replaced by Moore boundary tracing +
 * multi-source BFS inheritance (same visual result, O(n) cost).
 */

import { mulberry32 } from "./rng";
import { traceExternalContours } from "./skeleton";

/** Multi-source BFS: propagate times from assigned pixels to their
 * nearest unassigned ink pixels (replaces EDT return_indices). */
function inheritNearest(
  timing: Float32Array,
  mask: Uint8Array,
  w: number,
  h: number,
): number {
  // Collect assigned ink pixels as sources.
  const qx = new Int32Array(mask.length);
  const qy = new Int32Array(mask.length);
  let head = 0;
  let tail = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (mask[p] && timing[p] !== Infinity) {
        qy[tail] = y;
        qx[tail] = x;
        tail++;
      }
    }
  }
  // BFS over unassigned ink pixels.
  const seen = new Uint8Array(mask.length);
  for (let i = 0; i < tail; i++) seen[qy[i] * w + qx[i]] = 1;
  let propagated = 0;
  while (head < tail) {
    const y = qy[head];
    const x = qx[head];
    head++;
    const t = timing[y * w + x];
    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= w || (dy === 0 && dx === 0)) continue;
        const q = ny * w + nx;
        if (mask[q] && timing[q] === Infinity) {
          timing[q] = t;
          seen[q] = 1;
          qy[tail] = ny;
          qx[tail] = nx;
          tail++;
          propagated++;
        }
      }
    }
  }
  return propagated;
}

/** Simple axis-aligned sweep fallback (port of `simple_timing`). */
export function simpleTiming(
  mask: Uint8Array,
  w: number,
  h: number,
  start: number,
  dur: number,
): Float32Array {
  const timing = new Float32Array(mask.length).fill(Infinity);
  let minX = w;
  let maxX = -1;
  let minY = h;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return timing;
  const xSpan = maxX - minX;
  const ySpan = maxY - minY;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!mask[p]) continue;
      const progress =
        xSpan >= ySpan
          ? (x - minX) / Math.max(xSpan, 1)
          : (y - minY) / Math.max(ySpan, 1);
      timing[p] = start + progress * dur;
    }
  }
  return timing;
}

/**
 * One travelling front along the outline (port of `contour_timing`).
 * External contours of `contourSource` are traced, rotated to a
 * canonical top-left start, oriented to initially travel rightward,
 * then concatenated and assigned monotonically increasing times.
 * Pixels of `boundaryMask` not on the traced front (ragged ink outline,
 * thick bodies) inherit the nearest front pixel's time. Pass the same
 * mask twice for stroke closed-loops.
 */
export function contourTiming(
  boundaryMask: Uint8Array,
  contourSource: Uint8Array,
  w: number,
  h: number,
  start: number,
  dur: number,
): Float32Array {
  const timing = new Float32Array(boundaryMask.length).fill(Infinity);
  const contours = traceExternalContours(contourSource, w, h);
  if (contours.length === 0) {
    // Fall back to a plain sweep when no contour can be traced.
    let hasInk = false;
    for (let i = 0; i < boundaryMask.length; i++) {
      if (boundaryMask[i]) hasInk = true;
    }
    return hasInk ? simpleTiming(boundaryMask, w, h, start, dur) : timing;
  }

  // Sort longest first (reference parity).
  contours.sort((a, b) => b.length - a.length);

  const ordered: number[] = []; // flat y, x
  for (const contour of contours) {
    const n = contour.length / 2;
    if (n < 2) continue;
    // Canonical start: top-left-most point.
    let startIdx = 0;
    for (let i = 1; i < n; i++) {
      const y = contour[i * 2];
      const x = contour[i * 2 + 1];
      const by = contour[startIdx * 2];
      const bx = contour[startIdx * 2 + 1];
      if (x < bx || (x === bx && y < by)) startIdx = i;
    }
    const forward = new Int32Array(contour.length);
    for (let i = 0; i < n; i++) {
      const src = ((startIdx + i) % n) * 2;
      forward[i * 2] = contour[src];
      forward[i * 2 + 1] = contour[src + 1];
    }
    // Reverse orientation rotated so its first point is also the
    // canonical start.
    const reverse = new Int32Array(contour.length);
    for (let i = 0; i < n; i++) {
      const src = ((startIdx - i + n) % n) * 2;
      reverse[i * 2] = contour[src];
      reverse[i * 2 + 1] = contour[src + 1];
    }
    // Choose the orientation whose lookahead travels more rightward
    // (matches a natural frame stroke; reference parity).
    const lookahead = Math.min(8, n - 1) * 2;
    const chosen =
      forward[lookahead + 1] >= reverse[lookahead + 1] ? forward : reverse;
    for (const v of chosen) ordered.push(v);
  }

  // Assign times along the concatenated contour, de-duplicating pixels.
  const total = ordered.length / 2;
  const assigned = new Map<number, number>();
  for (let i = 0; i < total; i++) {
    const y = ordered[i * 2];
    const x = ordered[i * 2 + 1];
    if (y < 0 || y >= h || x < 0 || x >= w) continue;
    const p = y * w + x;
    if (!assigned.has(p)) {
      assigned.set(p, start + (i / Math.max(total - 1, 1)) * dur);
    }
  }
  for (const [p, t] of assigned) timing[p] = t;

  // Leftover boundary pixels inherit the nearest assigned pixel's time.
  // Propagation runs through `contourSource` (the solid shape), not the
  // boundary ring: hole-edge rings (letter counters) are disconnected
  // from the outer contour within the boundary, while the Euclidean-
  // nearest contour pixel semantics of the reference (EDT return
  // indices) cross the shape interior.
  inheritNearest(timing, contourSource, w, h);
  return timing;
}

/**
 * Angled sweep fill with per-column speed jitter and per-row wobble
 * (port of `legacy_sweep_timing`, deterministic seed 42 parity).
 */
export function legacySweepTiming(
  interior: Uint8Array,
  w: number,
  h: number,
  start: number,
  dur: number,
  angle = 30.0,
): Float32Array {
  const timing = new Float32Array(interior.length).fill(Infinity);
  const rng = mulberry32(42);

  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  let count = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!interior[y * w + x]) continue;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      count++;
    }
  }
  if (count === 0) return timing;
  const ySpan = Math.max(maxY - minY, 1.0);
  const xSpan = Math.max(maxX - minX, 1.0);

  const angleRad = (angle * Math.PI) / 180;
  const dy = Math.cos(angleRad);
  const dx = Math.sin(angleRad);

  // Column cells (cw = 4 px) with cumulative speed jitter.
  const cw = 4.0;
  const nc = Math.max(Math.floor(xSpan / cw) + 2, 1);
  const cs = new Float32Array(nc);
  for (let i = 0; i < nc; i++) cs[i] = rng() * 0.06 - 0.03;
  cs[0] = 0;
  const cspd = new Float32Array(nc);
  let cum = 1.0;
  let sum = 0;
  for (let i = 0; i < nc; i++) {
    cum = Math.min(Math.max(cum + cs[i], 0.88), 1.12);
    cspd[i] = cum;
    sum += cum;
  }
  const mean = sum / nc;
  for (let i = 0; i < nc; i++) cspd[i] -= mean - 1.0;

  // Row bands (rbh = 6 px) with wobble.
  const rbh = 6.0;
  const nrb = Math.max(Math.floor(ySpan / rbh) + 2, 1);
  const wob = new Float32Array(nrb * nc);
  for (let r = 0; r < nrb; r++) {
    for (let c = 0; c < nc; c++) {
      wob[r * nc + c] = rng() * 0.012 - 0.006;
    }
  }
  for (let c = 0; c < nc; c++) wob[c] = 0;
  for (let r = 1; r < nrb; r++) {
    for (let c = 0; c < nc; c++) {
      const prev = wob[(r - 1) * nc + c];
      wob[r * nc + c] = Math.min(Math.max(prev + wob[r * nc + c], -0.04), 0.04);
    }
  }
  // Center each column's wobble.
  for (let c = 0; c < nc; c++) {
    let s = 0;
    for (let r = 0; r < nrb; r++) s += wob[r * nc + c];
    const m = s / nrb;
    for (let r = 0; r < nrb; r++) wob[r * nc + c] -= m;
  }

  // Precompute projection span: with rel coords starting at 0 and
  // angle 30° (dy, dx > 0), proj_min = 0 (reference parity).
  const projSpan = Math.max(
    (maxY - minY) * dy + (maxX - minX) * dx,
    1.0,
  );

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!interior[p]) continue;
      const ry = y - minY;
      const rx = x - minX;
      const proj = ry * dy + rx * dx;
      const baseProgress = proj / projSpan;
      const ci = Math.min(Math.max(Math.floor(rx / cw), 0), nc - 1);
      const rbi = Math.min(Math.max(Math.floor(ry / rbh), 0), nrb - 1);
      const pw = wob[rbi * nc + ci] * dur;
      const pn = (rng() * 0.006 - 0.003) * dur;
      let t = start + baseProgress * cspd[ci] * dur + pw + pn;
      if (t < start) t = start;
      if (t > start + dur) t = start + dur;
      timing[p] = t;
    }
  }
  return timing;
}

/**
 * One pass of alternating bristle-textured brush strokes (port of
 * `brush_strokes_timing`): lanes perpendicular to the brush angle,
 * alternating direction, lane pauses, taper, bristle texture and
 * dry-brush lags — all from a geometry-seeded RNG.
 */
export function brushStrokesTiming(
  interior: Uint8Array,
  w: number,
  h: number,
  start: number,
  dur: number,
  fillAngle = -30.0,
  angleVariance = 7.0,
  brushWidth = 34.0,
): Float32Array {
  const timing = new Float32Array(interior.length).fill(Infinity);
  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  let count = 0;
  const pixels: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!interior[y * w + x]) continue;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      count++;
      pixels.push(y, x);
    }
  }
  if (count === 0) return timing;

  const seed =
    ((Math.floor(minY) * 73856093) ^
      (Math.floor(maxY) * 19349663) ^
      (Math.floor(minX) * 83492791) ^
      (Math.floor(maxX) * 2654435761) ^
      (count * 97531)) >>> 0;
  const rng = mulberry32(seed);

  const bboxW = Math.max(maxX - minX, 1.0);
  const bboxH = Math.max(maxY - minY, 1.0);
  const aspectRatio = bboxW / bboxH;
  let baseAngle: number;
  if (aspectRatio > 1.15) baseAngle = 0;
  else if (aspectRatio < 1 / 1.15) baseAngle = 90;
  else baseAngle = rng() < 0.5 ? 0 : 90;

  angleVariance = Math.max(angleVariance, 0);
  let strokeAngle = baseAngle + fillAngle;
  if (angleVariance > 0) strokeAngle += rng() * 2 * angleVariance - angleVariance;
  const angleRad = (strokeAngle * Math.PI) / 180;
  const dxA = Math.cos(angleRad);
  const dyA = Math.sin(angleRad);

  const along = new Float32Array(count);
  const across = new Float32Array(count);
  let alongMin = Infinity;
  let alongMax = -Infinity;
  let acrossMin = Infinity;
  let acrossMax = -Infinity;
  for (let i = 0; i < count; i++) {
    const ry = pixels[i * 2] - minY;
    const rx = pixels[i * 2 + 1] - minX;
    const a = rx * dxA + ry * dyA;
    const c = ry * dxA - rx * dyA;
    along[i] = a;
    across[i] = c;
    if (a < alongMin) alongMin = a;
    if (a > alongMax) alongMax = a;
    if (c < acrossMin) acrossMin = c;
    if (c > acrossMax) acrossMax = c;
  }
  const acrossSpan = Math.max(acrossMax - acrossMin, 1.0);
  brushWidth = Math.max(brushWidth, 1.0);

  // Variable-width lanes covering the across span.
  const laneStart = acrossMin - brushWidth * 0.5;
  const laneWidths: number[] = [];
  let covered = 0;
  const targetSpan = acrossSpan + brushWidth;
  while (covered < targetSpan) {
    const lw = brushWidth * (0.72 + rng() * (1.38 - 0.72));
    laneWidths.push(lw);
    covered += lw;
  }
  const laneEdges: number[] = [laneStart];
  for (const lw of laneWidths) {
    laneEdges.push(laneEdges[laneEdges.length - 1] + lw);
  }
  const nLanes = laneWidths.length;

  const laneYMin = new Float32Array(nLanes).fill(Infinity);
  const laneYMax = new Float32Array(nLanes).fill(-Infinity);
  for (let i = 0; i < count; i++) {
    // searchsorted right on laneEdges[1:]
    let lane = 0;
    // Linear scan is fine: lanes are few; but do binary search anyway.
    let lo = 0;
    let hi = laneEdges.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (laneEdges[mid + 1] <= across[i]) lo = mid + 1;
      else hi = mid;
    }
    lane = Math.min(Math.max(lo, 0), nLanes - 1);
    if (along[i] < laneYMin[lane]) laneYMin[lane] = along[i];
    if (along[i] > laneYMax[lane]) laneYMax[lane] = along[i];
  }
  for (let lane = 0; lane < nLanes; lane++) {
    if (!isFinite(laneYMin[lane])) {
      laneYMin[lane] = alongMin;
      laneYMax[lane] = alongMax;
    }
  }

  // Per-lane weights, pauses, curves.
  const laneWeights = new Float32Array(nLanes);
  const pauseWeights = new Float32Array(nLanes);
  const laneCurves = new Float32Array(nLanes);
  for (let lane = 0; lane < nLanes; lane++) {
    laneWeights[lane] = 0.75 + rng() * (1.45 - 0.75);
    pauseWeights[lane] = rng() * 0.22;
  }
  pauseWeights[0] = 0;
  for (let lane = 0; lane < nLanes; lane++) {
    laneCurves[lane] = 0.78 + rng() * (1.35 - 0.78);
  }
  const laneUnits = new Float32Array(nLanes);
  let totalUnits = 0;
  for (let lane = 0; lane < nLanes; lane++) {
    laneUnits[lane] = laneWeights[lane] + pauseWeights[lane];
    totalUnits += laneUnits[lane];
  }
  totalUnits = Math.max(totalUnits, 1);
  const laneStarts = new Float32Array(nLanes);
  let acc = 0;
  for (let lane = 0; lane < nLanes - 1; lane++) {
    laneStarts[lane] = acc / totalUnits;
    acc += laneUnits[lane];
  }
  laneStarts[nLanes - 1] = acc / totalUnits;
  const laneDurFrac = (lane: number) => laneWeights[lane] / totalUnits;
  const lanePauseFrac = (lane: number) => pauseWeights[lane] / totalUnits;

  // Bristle texture + grain.
  const bristleWidth = Math.max(brushWidth * 0.11, 2.0);
  const grainAlong = Math.max(brushWidth * 0.42, 5.0);
  const grainAcross = Math.max(brushWidth * 0.16, 3.0);

  // Precompute bristle offsets & grain values with bounded indices.
  const bristleOffsetFor = (idx: number) => {
    // Deterministic per-index pseudo-random via extra rng streams is not
    // index-addressable; precompute lazily in a Map.
    let v = bristleMap.get(idx);
    if (v === undefined) {
      v = rng() * 0.085 - 0.045;
      bristleMap.set(idx, v);
    }
    return v;
  };
  const bristleMap = new Map<number, number>();
  const grainValueMap = new Map<number, number>();
  const grainLagMap = new Map<number, number>();
  const grainValueFor = (idx: number) => {
    let v = grainValueMap.get(idx);
    if (v === undefined) {
      v = rng();
      grainValueMap.set(idx, v);
    }
    return v;
  };
  const grainLagFor = (idx: number) => {
    let v = grainLagMap.get(idx);
    if (v === undefined) {
      v = 0.035 + rng() * (0.105 - 0.035);
      grainLagMap.set(idx, v);
    }
    return v;
  };

  for (let i = 0; i < count; i++) {
    const y = pixels[i * 2];
    const x = pixels[i * 2 + 1];
    // Lane index (repeat binary search).
    let lane = 0;
    let lo = 0;
    let hi = laneEdges.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (laneEdges[mid + 1] <= across[i]) lo = mid + 1;
      else hi = mid;
    }
    lane = Math.min(Math.max(lo, 0), nLanes - 1);

    const laneSpan = Math.max(laneYMax[lane] - laneYMin[lane], 1.0);
    const down = (along[i] - laneYMin[lane]) / laneSpan;
    const up = (laneYMax[lane] - along[i]) / laneSpan;
    let vp = (lane % 2 === 0 ? down : up) as number;
    vp = Math.min(Math.max(vp, 0), 1);

    const laneLeft = laneEdges[lane];
    const laneRight = laneEdges[lane + 1];
    const laneW = Math.max(laneRight - laneLeft, 1.0);
    const localAcross = across[i] - laneLeft;
    const localNorm = Math.min(Math.max(localAcross / laneW, 0), 1);
    const edgeDistance = Math.min(localAcross, laneW - localAcross);
    const edgeProximity = 1 - Math.min(Math.max(edgeDistance / (laneW * 0.45), 0), 1);
    const brushTaper = Math.pow(edgeProximity, 1.35) * 0.095;

    const bristleIdx = Math.floor((across[i] - acrossMin) / bristleWidth);
    const bristleTexture =
      bristleOffsetFor(bristleIdx) * (1 - localNorm * 0.12);

    const grainY = Math.floor((along[i] - alongMin) / grainAlong);
    const grainX = Math.floor((across[i] - acrossMin) / grainAcross);
    const grainIdx = grainY * 100003 + grainX;
    const gv = grainValueFor(grainIdx);
    const dryBrushLag =
      gv > 0.88
        ? grainLagFor(grainIdx) * (1 - edgeProximity * 0.45)
        : 0;

    const curved = Math.pow(vp, laneCurves[lane]);
    let sp = curved * 0.86 + brushTaper + bristleTexture + dryBrushLag;
    sp = Math.min(Math.max(sp, 0), 1);
    let progress =
      laneStarts[lane] + lanePauseFrac(lane) + sp * laneDurFrac(lane);
    progress = Math.min(Math.max(progress, 0), 1);
    let t = start + progress * dur;
    if (t < start) t = start;
    if (t > start + dur) t = start + dur;
    timing[y * w + x] = t;
  }
  return timing;
}

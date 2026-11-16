/**
 * Whiteboard animation orchestrator.
 *
 * Port of the reference `WhiteboardAnimator` (whiteboard-animator, MIT):
 * detect components -> order them like a hand would -> schedule each
 * onto the timeline -> trace per-pixel reveal times (skeleton strokes,
 * contour outlines, sweep/brush fills) -> produce the timing map the
 * renderer plays back.
 *
 * Everything is deterministic: painters seed their RNG from geometry.
 */

import {
  adaptiveInkThreshold,
  buildComp,
  buildComponentGroup,
  collectResidual,
  despeckle,
  dilate3x3,
  enforceWhiteBg,
  erode3x3,
  inkFromGray,
  isMarkerStroke,
  labelComponents,
  splitIntoComps,
  toGray,
  DEFAULT_COMPONENT_TUNING,
  type Comp,
  type ComponentTuning,
} from "./mask";
import {
  bfsSkeleton,
  buildLineArtStrokes,
  extractSkeletonPaths,
  skeletonDegree,
  skeletonize,
} from "./skeleton";
import {
  brushStrokesTiming,
  contourTiming,
  legacySweepTiming,
  simpleTiming,
} from "./painters";
import {
  attachTrailingDots,
  mergeTextBlocks,
  orderTextComponents,
  sortComponentsLayered,
  sortComponentsReadingOrder,
} from "./ordering";
import { geometrySeed, mulberry32 } from "./rng";

export interface WhiteboardOptions {
  /** Total scene duration in seconds (drawing spans drawFraction). */
  sceneDuration: number;
  /** Fraction of the scene spent drawing (default 0.7). */
  drawFraction: number;
  /** Pixel fade-in duration in seconds. */
  fadeDuration: number;
  fillDurationScale: number;
  maxFillDuration: number;
  outlineTimeFraction: number;
  brushFillCurveMinArea: number;
  brushFillCurveMaxArea: number;
  brushFillCurveCenter: number;
  brushFillMinProbability: number;
  brushFillMaxProbability: number;
  fillAngle: number;
  fillAngleVariance: number;
  fillBrushWidth: number;
  legacyFillAngle: number;
  denseLineArtMinArea: number;
  denseLineArtMinSkeleton: number;
  denseLineArtMinJunctions: number;
  denseLineArtMinEndpoints: number;
}

export const DEFAULT_OPTIONS: WhiteboardOptions = {
  sceneDuration: 8,
  drawFraction: 0.7,
  fadeDuration: 0.12,
  fillDurationScale: 1.0,
  maxFillDuration: 3.0,
  outlineTimeFraction: 0.35,
  brushFillCurveMinArea: 2000,
  brushFillCurveMaxArea: 30000,
  brushFillCurveCenter: 0.7,
  brushFillMinProbability: 0.1,
  brushFillMaxProbability: 0.9,
  fillAngle: -30,
  fillAngleVariance: 7,
  fillBrushWidth: 34,
  legacyFillAngle: 30,
  denseLineArtMinArea: 500,
  denseLineArtMinSkeleton: 60,
  denseLineArtMinJunctions: 1,
  denseLineArtMinEndpoints: 4,
};

export type PlanEntryType = "stroke" | "fill" | "text" | "group";

export interface PlanEntry {
  index: number;
  type: PlanEntryType;
  label: string;
  bbox: [number, number, number, number]; // left, top, right, bottom
  start: number;
  duration: number;
  area: number;
  /** Ink pixels this component's trace could not assign (safety net catches them). */
  failures: number;
}

export interface WhiteboardStats {
  components: number;
  strokes: number;
  fills: number;
  text: number;
  groups: number;
  residual: number;
  inkPixels: number;
  unassignedPixels: number;
  analyzeMs: number;
}

export interface WhiteboardAnalysis {
  width: number;
  height: number;
  /** Reveal time per pixel in seconds; Infinity = background. */
  timing: Float32Array;
  /** Time the last pixel finishes revealing. */
  drawEnd: number;
  totalDuration: number;
  plan: PlanEntry[];
  stats: WhiteboardStats;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Component detection (port of `_find_components`, CRAFT-free)
// ---------------------------------------------------------------------------

interface DetectionResult {
  components: Comp[];
  /** Despeckled ink mask used for detection (single source of truth). */
  ink: Uint8Array;
}

function findComponents(
  rgb: Uint8Array,
  w: number,
  h: number,
  tuning: ComponentTuning,
  inkThreshold: number,
): DetectionResult {
  const gray = toGray(rgb, w, h);
  const ink = inkFromGray(gray, inkThreshold);
  despeckle(ink, w, h, 12);
  let inkCount = 0;
  for (let i = 0; i < ink.length; i++) inkCount += ink[i];
  if (inkCount === 0) return { components: [], ink };

  // Text-ish components first (heuristic, CRAFT-free). Single pass over
  // the frame buckets pixels per label — no per-label rescans.
  const { labels, count } = labelComponents(ink, w, h, 4);
  const textComps: Comp[] = [];
  const useTight = new Uint8Array(ink.length);
  const labelStats = new Array<{ minY: number; maxY: number; minX: number; maxX: number; area: number }>(count + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const l = labels[row + x];
      if (l === 0) continue;
      let s = labelStats[l];
      if (!s) {
        s = { minY: y, maxY: y, minX: x, maxX: x, area: 0 };
        labelStats[l] = s;
      }
      s.area++;
      if (y < s.minY) s.minY = y;
      if (y > s.maxY) s.maxY = y;
      if (x < s.minX) s.minX = x;
      if (x > s.maxX) s.maxX = x;
    }
  }
  for (let label = 1; label <= count; label++) {
    const s = labelStats[label];
    if (!s || s.area < 10) continue;
    const cw = s.maxX - s.minX + 1;
    const ch = s.maxY - s.minY + 1;
    const crop = new Uint8Array(cw * ch);
    for (let y = s.minY; y <= s.maxY; y++) {
      const row = y * w;
      for (let x = s.minX; x <= s.maxX; x++) {
        if (labels[row + x] === label) crop[(y - s.minY) * cw + (x - s.minX)] = 1;
      }
    }
    const comp = buildComp(crop, cw, ch, s.minX, s.minY, rgb, w, tuning);
    if (comp && comp.isText && comp.area >= 8) {
      textComps.push(comp);
      for (let y = s.minY; y <= s.maxY; y++) {
        const row = y * w;
        for (let x = s.minX; x <= s.maxX; x++) {
          if (labels[row + x] === label) {
            useTight[row + x] = 1;
          }
        }
      }
    }
  }

  // Non-text components on the dilated ink, minus text pixels.
  const dilated = dilate3x3(ink, w, h);
  const nonTextSource = new Uint8Array(dilated.length);
  for (let i = 0; i < dilated.length; i++) {
    nonTextSource[i] = dilated[i] && !useTight[i] ? 1 : 0;
  }
  const { labels: ntLabels, count: ntCount } = labelComponents(
    nonTextSource,
    w,
    h,
    4,
  );

  const components: Comp[] = [...textComps];
  for (let label = 1; label <= ntCount; label++) {
    let minY = h;
    let maxY = -1;
    let minX = w;
    let maxX = -1;
    let area = 0;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        if (ntLabels[row + x] !== label) continue;
        area++;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    if (area < 10) continue;
    // Tight ink inside this dilated piece.
    const cw = maxX - minX + 1;
    const ch = maxY - minY + 1;
    const tight = new Uint8Array(cw * ch);
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const fi = (minY + y) * w + (minX + x);
        if (ink[fi] && !useTight[fi] && ntLabels[fi] === label) {
          tight[y * cw + x] = 1;
        }
      }
    }
    const pieces = splitIntoComps(tight, cw, ch, minX, minY, rgb, w, tuning, 10);
    if (pieces.length > 1) {
      const group = buildComponentGroup(pieces, { isText: false });
      if (group) components.push(group);
    } else if (pieces.length === 1) {
      components.push(pieces[0]);
    }
  }

  // Residual sweep: no ink pixel may be dropped.
  const residualParts = collectResidual(components, ink, w, h, rgb, tuning);
  components.push(...residualParts);

  return { components, ink };
}

// ---------------------------------------------------------------------------
// Scheduling (port of `_schedule_components`)
// ---------------------------------------------------------------------------

function scheduleComponents(
  components: Comp[],
  drawDuration: number,
  opts: WhiteboardOptions,
): Array<{ comp: Comp; start: number; duration: number }> {
  const weight = (c: Comp) => Math.sqrt(Math.max(c.area, 1));
  const totalWeight = components.reduce((s, c) => s + weight(c), 0);
  const schedule: Array<{ comp: Comp; start: number; duration: number }> = [];
  let t = 0;
  for (const comp of components) {
    let dur = Math.max((drawDuration * weight(comp)) / Math.max(totalWeight, 1), 0.05);
    if (comp.isFill) {
      dur = Math.min(dur * opts.fillDurationScale, opts.maxFillDuration);
    }
    schedule.push({ comp, start: t, duration: dur });
    t += dur;
  }
  return schedule;
}

// ---------------------------------------------------------------------------
// Tracing (port of `_trace_component` and friends)
// ---------------------------------------------------------------------------

/**
 * Multi-source BFS from skeleton pixels over the ink mask: for every
 * ink pixel returns (nearest skeleton pixel index, distance to it).
 * Replaces scipy's `distance_transform_edt(..., return_indices=True)`.
 */
function nearestSkeleton(
  mask: Uint8Array,
  skel: Uint8Array,
  w: number,
  h: number,
): { nearest: Int32Array; d2s: Float32Array } {
  const nearest = new Int32Array(mask.length).fill(-1);
  const d2s = new Float32Array(mask.length).fill(Infinity);
  const qy = new Int32Array(mask.length);
  const qx = new Int32Array(mask.length);
  let head = 0;
  let tail = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (skel[p]) {
        nearest[p] = p;
        d2s[p] = 0;
        qy[tail] = y;
        qx[tail] = x;
        tail++;
      }
    }
  }
  while (head < tail) {
    const y = qy[head];
    const x = qx[head];
    head++;
    const p = y * w + x;
    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= w || (dy === 0 && dx === 0)) continue;
        const q = ny * w + nx;
        if (mask[q] && nearest[q] === -1) {
          nearest[q] = nearest[p];
          d2s[q] = d2s[p] + 1;
          qy[tail] = ny;
          qx[tail] = nx;
          tail++;
        }
      }
    }
  }
  return { nearest, d2s };
}

function traceStroke(
  comp: Comp,
  start: number,
  dur: number,
  opts: WhiteboardOptions,
): Float32Array {
  const { mask, w, h } = comp;
  const timing = new Float32Array(mask.length).fill(Infinity);
  let inkCount = 0;
  for (let i = 0; i < mask.length; i++) inkCount += mask[i];
  if (inkCount === 0) return timing;
  if (inkCount <= 2) {
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) timing[i] = start;
    }
    return timing;
  }

  // Lazy skeleton.
  let skeleton = comp.skeleton;
  if (!skeleton) {
    skeleton = skeletonize(mask, w, h);
    comp.skeleton = skeleton;
  }
  if (!skeleton.some((v) => v !== 0)) {
    return simpleTiming(mask, w, h, start, dur);
  }

  const degree = skeletonDegree(skeleton, w, h);
  let startY = -1;
  let startX = -1;
  let hasEndpoint = false;
  let maxDeg = 0;
  // Endpoints: degree == 1; start from min (y, x) endpoint.
  let bestY = Infinity;
  let bestX = Infinity;
  let canonY = Infinity;
  let canonX = Infinity;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!skeleton[p]) continue;
      const d = degree[p];
      if (d > maxDeg) maxDeg = d;
      if (d === 1 && (y < bestY || (y === bestY && x < bestX))) {
        bestY = y;
        bestX = x;
        hasEndpoint = true;
      }
      if (y < canonY || (y === canonY && x < canonX)) {
        canonY = y;
        canonX = x;
      }
    }
  }
  if (hasEndpoint) {
    startY = bestY;
    startX = bestX;
  } else {
    startY = canonY;
    startX = canonX;
    // A simple closed mark needs one travelling front (not two-way BFS).
    if (maxDeg <= 2) {
      return contourTiming(mask, mask, w, h, start, dur);
    }
  }

  if (isDenseLineArt(comp, skeleton, degree, w, h, opts)) {
    const dense = traceDenseLineArt(comp, skeleton, start, dur, opts);
    if (dense !== null) return dense;
  }

  const skelDists = bfsSkeleton(skeleton, w, h, startY, startX);
  const { nearest, d2s } = nearestSkeleton(mask, skeleton, w, h);
  let maxSd = 1;
  let maxD2s = 1;
  let anyValid = false;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    if (nearest[i] < 0) continue;
    anyValid = true;
    const sd = skelDists[nearest[i]];
    if (isFinite(sd) && sd > maxSd) maxSd = sd;
    if (d2s[i] > maxD2s) maxD2s = d2s[i];
  }
  if (!anyValid) return simpleTiming(mask, w, h, start, dur);

  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || nearest[i] < 0) continue;
    const sd = skelDists[nearest[i]];
    if (!isFinite(sd)) continue;
    const prog = Math.min(Math.max(sd / maxSd + (d2s[i] / maxD2s) * 0.02, 0), 1);
    timing[i] = start + prog * dur;
  }
  // Any ink pixel whose nearest skeleton pixel was unreachable falls
  // back to a simple sweep time so nothing pops instantly.
  let fallback = false;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || timing[i] !== Infinity) continue;
    fallback = true;
    break;
  }
  if (fallback) {
    const st = simpleTiming(mask, w, h, start, dur);
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] && timing[i] === Infinity) timing[i] = st[i];
    }
  }
  return timing;
}

function isDenseLineArt(
  comp: Comp,
  skel: Uint8Array,
  degree: Int8Array,
  w: number,
  h: number,
  opts: WhiteboardOptions,
): boolean {
  if (comp.isFill) return false;
  let skelCount = 0;
  for (let i = 0; i < skel.length; i++) skelCount += skel[i];
  if (skelCount < 4) return false;

  let endpointCount = 0;
  let junctionPixelCount = 0;
  for (let i = 0; i < skel.length; i++) {
    if (!skel[i]) continue;
    if (degree[i] === 1) endpointCount++;
    if (degree[i] >= 3) junctionPixelCount++;
  }
  // Junction pixels form one junction when adjacent; approximate with a
  // single junction when any exist (min_junctions = 1 in reference).
  const junctionCount = junctionPixelCount > 0 ? 1 : 0;
  if (junctionCount >= opts.denseLineArtMinJunctions) return true;
  if (comp.isText) return false;
  if (comp.area < opts.denseLineArtMinArea) return false;
  if (skelCount < opts.denseLineArtMinSkeleton) return false;
  return endpointCount >= opts.denseLineArtMinEndpoints;
}

function traceDenseLineArt(
  comp: Comp,
  skel: Uint8Array,
  start: number,
  dur: number,
  opts: WhiteboardOptions,
): Float32Array | null {
  const { mask, w, h } = comp;
  const paths = extractSkeletonPaths(skel, w, h);
  if (paths.length === 0) return null;
  const strokes = buildLineArtStrokes(paths);
  if (strokes.length === 0) return null;

  const skelTiming = new Float32Array(mask.length).fill(Infinity);
  const totalWeight = strokes.reduce((s, st) => s + Math.max(st.weight, 1), 0);
  let t = start;
  for (const stroke of strokes) {
    if (stroke.count === 0) continue;
    const sd = (dur * Math.max(stroke.weight, 1)) / Math.max(totalWeight, 1);
    const span = stroke.count > 1 ? stroke.count - 1 : 1;
    for (let i = 0; i < stroke.count; i++) {
      const y = stroke.coords[i * 2];
      const x = stroke.coords[i * 2 + 1];
      const p = y * w + x;
      const progress = i / span;
      const time = Math.min(Math.max(t + progress * sd, start), start + dur);
      if (time < skelTiming[p]) skelTiming[p] = time;
    }
    t += sd;
  }

  // Missing skeleton pixels inherit the nearest assigned pixel.
  let assignedAny = false;
  for (let i = 0; i < skel.length; i++) {
    if (skel[i] && skelTiming[i] !== Infinity) assignedAny = true;
  }
  if (!assignedAny) return null;
  for (let i = 0; i < skel.length; i++) {
    if (skel[i] && skelTiming[i] === Infinity) {
      // BFS from assigned pixels happens below via nearestSkeleton on
      // the assigned subset; do a simple pass with a local queue.
      skelTiming[i] = -1; // mark missing
    }
  }
  if (skelTiming.some((v) => v === -1)) {
    const qx = new Int32Array(skel.length);
    const qy = new Int32Array(skel.length);
    let head = 0;
    let tail = 0;
    for (let i = 0; i < skel.length; i++) {
      if (skel[i] && skelTiming[i] >= 0 && skelTiming[i] !== Infinity) {
        qy[tail] = (i / w) | 0;
        qx[tail] = i % w;
        tail++;
      }
    }
    while (head < tail) {
      const y = qy[head];
      const x = qx[head];
      head++;
      const p = y * w + x;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w || (dy === 0 && dx === 0)) continue;
          const q = ny * w + nx;
          if (skel[q] && skelTiming[q] === -1) {
            skelTiming[q] = skelTiming[p];
            qy[tail] = ny;
            qx[tail] = nx;
            tail++;
          }
        }
      }
    }
  }

  const timing = new Float32Array(mask.length).fill(Infinity);
  const { nearest, d2s } = nearestSkeleton(mask, skel, w, h);
  let maxD2s = 1;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] && d2s[i] > maxD2s) maxD2s = d2s[i];
  }
  const spread = Math.min(dur * 0.025, opts.fadeDuration * 0.5);
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const n = nearest[i];
    if (n < 0) return null;
    const base = skelTiming[n];
    if (!isFinite(base)) return null;
    const time = Math.min(
      Math.max(base + (d2s[i] / maxD2s) * spread, start),
      start + dur,
    );
    timing[i] = time;
  }
  return timing;
}

function traceFilled(
  comp: Comp,
  start: number,
  dur: number,
  opts: WhiteboardOptions,
): Float32Array {
  const { mask, solid, w, h } = comp;
  let e = erode3x3(solid, w, h);
  for (let i = 1; i < 4; i++) e = erode3x3(e, w, h);

  const boundary = new Uint8Array(mask.length);
  const interior = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || !solid[i]) continue;
    if (e[i]) interior[i] = 1;
    else boundary[i] = 1;
  }

  let interiorCount = 0;
  for (let i = 0; i < interior.length; i++) interiorCount += interior[i];
  if (interiorCount === 0) {
    return traceStroke(comp, start, dur, opts);
  }
  let boundaryCount = 0;
  for (let i = 0; i < boundary.length; i++) boundaryCount += boundary[i];

  const outlineFraction = Math.min(
    opts.outlineTimeFraction,
    boundaryCount / Math.max(boundaryCount + interiorCount, 1),
  );
  const olDur = dur * outlineFraction;
  const fiDur = dur * (1 - outlineFraction);
  const fiStart = start + olDur;

  const olT = contourTiming(boundary, solid, w, h, start, olDur);
  const fiT = mixedFillTiming(comp, interior, w, h, fiStart, fiDur, opts);

  const timing = new Float32Array(mask.length).fill(Infinity);
  for (let i = 0; i < mask.length; i++) {
    if (boundary[i]) timing[i] = olT[i];
    else if (interior[i]) timing[i] = fiT[i];
  }
  return timing;
}

function mixedFillTiming(
  comp: Comp,
  interior: Uint8Array,
  w: number,
  h: number,
  start: number,
  dur: number,
  opts: WhiteboardOptions,
): Float32Array {
  const area = Math.max(comp.area, 1);
  const lo = opts.brushFillCurveMinArea;
  const hi = opts.brushFillCurveMaxArea;
  const span = Math.max(hi - lo, 1.0);
  const sizeProgress = Math.min(Math.max((area - lo) / span, 0), 1);

  let minProb = Math.min(Math.max(opts.brushFillMinProbability, 0), 1);
  let maxProb = Math.min(Math.max(opts.brushFillMaxProbability, 0), 1);
  if (maxProb < minProb) [minProb, maxProb] = [maxProb, minProb];

  const center = Math.min(Math.max(opts.brushFillCurveCenter, 0), 1);
  const steepness = 8; // reference default: brush_fill_curve_steepness
  const sLo = 1 / (1 + Math.exp(steepness * center));
  const sHi = 1 / (1 + Math.exp(-steepness * (1 - center)));
  const sRaw = 1 / (1 + Math.exp(-steepness * (sizeProgress - center)));
  const sNorm = Math.min(
    Math.max((sRaw - sLo) / Math.max(sHi - sLo, 1e-9), 0),
    1,
  );
  const brushProbability = minProb + sNorm * (maxProb - minProb);

  const seed = geometrySeed(comp.top, comp.bottom, comp.left, comp.right, area);
  const rng = mulberry32(seed);

  if (rng() < brushProbability) {
    return brushStrokesTiming(
      interior,
      w,
      h,
      start,
      dur,
      opts.fillAngle,
      opts.fillAngleVariance,
      opts.fillBrushWidth,
    );
  }
  return legacySweepTiming(interior, w, h, start, dur, opts.legacyFillAngle);
}

function traceComponentGroup(
  comp: Comp,
  start: number,
  dur: number,
  opts: WhiteboardOptions,
): Float32Array {
  const subs = comp.subComponents;
  if (!subs || subs.length <= 1) {
    const solo: Comp = {
      ...comp,
      subComponents: undefined,
    };
    return traceComponent(solo, start, dur, opts);
  }

  let ordered: Comp[];
  let weights: number[];
  if (comp.multicolor) {
    ordered = [...subs];
    weights = ordered.map((s) => Math.sqrt(Math.max(s.area, 1)));
  } else if (comp.isText) {
    ordered = orderTextComponents(subs);
    weights = ordered.map((s) => s.area);
  } else {
    ordered = sortComponentsLayered([...subs]);
    weights = ordered.map((s) => Math.sqrt(Math.max(s.area, 1)));
  }

  const timing = new Float32Array(mask_length(comp.w, comp.h)).fill(Infinity);
  const totalW = weights.reduce((s, x) => s + x, 0);
  let t = start;
  for (let i = 0; i < ordered.length; i++) {
    const sub = ordered[i];
    const sd = (dur * weights[i]) / Math.max(totalW, 1);
    const st = traceComponent(sub, t, sd, opts);
    // Write sub crop into the group map.
    for (let y = 0; y < sub.h; y++) {
      const gy = sub.top - comp.top + y;
      if (gy < 0 || gy >= comp.h) continue;
      for (let x = 0; x < sub.w; x++) {
        const gx = sub.left - comp.left + x;
        if (gx < 0 || gx >= comp.w) continue;
        const gp = gy * comp.w + gx;
        if (sub.mask[y * sub.w + x]) timing[gp] = st[y * sub.w + x];
      }
    }
    t += sd;
  }
  return timing;
}

const mask_length = (w: number, h: number) => w * h;

function traceComponent(
  comp: Comp,
  start: number,
  dur: number,
  opts: WhiteboardOptions,
): Float32Array {
  if (comp.subComponents) {
    return traceComponentGroup(comp, start, dur, opts);
  }
  if (comp.isFill) {
    if (isMarkerStroke(comp)) {
      const marker: Comp = { ...comp, isFill: false };
      return traceStroke(marker, start, dur, opts);
    }
    return traceFilled(comp, start, dur, opts);
  }
  return traceStroke(comp, start, dur, opts);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function analyzeWhiteboard(
  rgb: Uint8Array,
  w: number,
  h: number,
  options: Partial<WhiteboardOptions> = {},
): WhiteboardAnalysis {
  const t0 = Date.now();
  const opts: WhiteboardOptions = { ...DEFAULT_OPTIONS, ...options };
  const tuning: ComponentTuning = { ...DEFAULT_COMPONENT_TUNING };

  const inkThreshold = adaptiveInkThreshold(toGray(rgb, w, h));
  enforceWhiteBg(rgb, w, h, inkThreshold);

  // Downscale is handled by the caller (canvas / sharp); cap defensively.
  const { components, ink } = findComponents(rgb, w, h, tuning, inkThreshold);

  // Merge text blocks, then order like a hand would draw.
  const withTextBlocks = mergeTextBlocks(components);
  const ordered = sortComponentsLayered(withTextBlocks);

  const drawDuration = Math.max(opts.sceneDuration * opts.drawFraction, 0.1);
  const schedule = scheduleComponents(ordered, drawDuration, opts);

  const timing = new Float32Array(w * h).fill(Infinity);
  const plan: PlanEntry[] = [];
  const warnings: string[] = [];
  let strokeCount = 0;
  let fillCount = 0;
  let textCount = 0;
  let groupCount = 0;
  let residualCount = 0;

  schedule.forEach(({ comp, start, duration }, index) => {
    if (comp.subComponents) groupCount++;
    if (comp.isFill) fillCount++;
    else if (comp.isText) textCount++;
    else strokeCount++;
    if (comp.isResidual) residualCount++;

    const ct = traceComponent(comp, start, duration, opts);
    let compFailures = 0;
    for (let y = 0; y < comp.h; y++) {
      const gy = comp.top + y;
      if (gy < 0 || gy >= h) continue;
      for (let x = 0; x < comp.w; x++) {
        const gx = comp.left + x;
        if (gx < 0 || gx >= w) continue;
        const gp = gy * w + gx;
        if (comp.mask[y * comp.w + x]) {
          const v = ct[y * comp.w + x];
          if (!isFinite(v)) {
            compFailures++;
            continue;
          }
          if (timing[gp] === Infinity || v < timing[gp]) {
            timing[gp] = v;
          }
        }
      }
    }

    plan.push({
      index,
      // Marker strokes classify as fills but draw like strokes — report
      // the effective animation style.
      type: comp.isFill
        ? isMarkerStroke(comp)
          ? "stroke"
          : "fill"
        : comp.isText
          ? "text"
          : comp.subComponents
            ? "group"
            : "stroke",
      label: labelFor(comp, index),
      bbox: [comp.left, comp.top, comp.right, comp.bottom],
      start,
      duration,
      area: comp.area,
      failures: compFailures,
    });
  });

  // Integrity: every ink pixel must carry a reveal time (same despeckled
  // mask the detection used — no double bookkeeping).
  let inkPixels = 0;
  let unassigned = 0;
  for (let i = 0; i < ink.length; i++) {
    if (!ink[i]) continue;
    inkPixels++;
    if (timing[i] === Infinity) unassigned++;
  }
  if (unassigned > 0) {
    // Safety net: reveal stragglers progressively across the draw window.
    warnings.push(
      `${unassigned} ink pixel(s) lacked a traced reveal time; assigned end-of-draw times.`,
    );
    let k = 0;
    for (let i = 0; i < ink.length; i++) {
      if (ink[i] && timing[i] === Infinity) {
        timing[i] = drawDuration * (k++ / Math.max(unassigned, 1));
      }
    }
  }

  let drawEnd = 0;
  for (const { comp, start, duration } of schedule) {
    void comp;
    drawEnd = Math.max(drawEnd, start + duration);
  }

  return {
    width: w,
    height: h,
    timing,
    drawEnd,
    totalDuration: opts.sceneDuration,
    plan,
    stats: {
      components: schedule.length,
      strokes: strokeCount,
      fills: fillCount,
      text: textCount,
      groups: groupCount,
      residual: residualCount,
      inkPixels,
      unassignedPixels: unassigned,
      analyzeMs: Date.now() - t0,
    },
    warnings,
  };
}

function labelFor(comp: Comp, index: number): string {
  const w = comp.right - comp.left + 1;
  const h = comp.bottom - comp.top + 1;
  if (comp.isFill) return `fill #${index} (${w}x${h})`;
  if (comp.isText) return `text #${index} (${w}x${h})`;
  if (comp.subComponents) return `group #${index} (${comp.subComponents.length} parts)`;
  return `stroke #${index} (${w}x${h})`;
}

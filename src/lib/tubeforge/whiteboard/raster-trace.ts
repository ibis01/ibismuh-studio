// S151 — the sketch-trace import pass: raster → ordered stroke geometry.
//
// The engine could only animate STROKE-AUTHORED SVG (the upload gates and
// the external-repos audit agree: "THE GAP — the engine cannot draw an
// uploaded PNG/JPG/AI-illustration"). This module closes it with a pure,
// deterministic port of the whiteboard-animator study (MIT) — the same
// suite that audit's §3.3 prescribed for this lane — adapted to the house
// laws instead of the reference's painter pipeline:
//
//   1. Timeline-as-projection: the reference emits a per-pixel REVEAL-TIME
//      map; that machinery is deliberately NOT ported. timing.ts owns
//      scheduling — this module emits ordered PATH GEOMETRY, the study's
//      human draw-order rides the document order, and the engine's
//      length-weighted draw budget + pen-follow does the animation.
//   2. One gate stack: the output is an ordinary SVG DOCUMENT that rides
//      validateUploadedSvg verbatim — sniff, sanitize, the 512/path and
//      2,048/asset command walls, extraction, the W3 stroke validator and
//      the rasterize probe all apply unchanged. There is no second
//      vocabulary for traced ink.
//   3. The W3 geometry laws hold BY CONSTRUCTION: one subpath per path
//      (every skeleton stroke is junction-split), region outlines precede
//      their pure fills (fill-after-outline), closed shapes carry real
//      winding, every pen declares a usable stroke-width/linecap.
//   4. Budget-by-construction: Ramer–Douglas–Peucker simplification with a
//      deterministic escalation loop keeps every path and the whole asset
//      inside the upload walls, or refuses with a readable error — the
//      gates never see a traced asset that breaks them.
//   5. Determinism: NO RNG anywhere (the reference seeded jitter from
//      geometry; here every tie-break is coordinate-based) — same bytes in,
//      byte-identical document out. The suite pins the double-run equality.
//
// Pure: no fs, no DOM, no clock, no sharp (the route owns decoding; the
// module works over an RGB buffer + dimensions so the unit suite pins it
// without an image dependency).

// ---------------------------------------------------------------------------
// Ink mask analysis (the study's mask pass, trimmed to what stroke
// emission needs: threshold, despeckle, morphology, EDT, components)
// ---------------------------------------------------------------------------

export interface BinaryMask {
  data: Uint8Array; // 0 or 1
  w: number;
  h: number;
}

export interface Comp {
  /** Bounding box in full-frame coordinates (inclusive). */
  left: number;
  top: number;
  right: number;
  bottom: number;
  /** Crop size: right-left+1 x bottom-top+1. */
  w: number;
  h: number;
  /** Ink mask cropped to the bbox. */
  mask: Uint8Array;
  /** Morphologically closed mask cropped to the bbox (fill interiors). */
  solid: Uint8Array;
  area: number;
  /** Max EDT depth of the ink (half stroke width for thin marks). */
  maxDepth: number;
  isFill: boolean;
  isText: boolean;
  isResidual: boolean;
  /** Members when this comp is a merged group. */
  subComponents?: Comp[];
  multicolor?: boolean;
}

export interface ComponentTuning {
  fillDepthThreshold: number;
  minFillArea: number;
  fillPerimeterAreaThreshold: number;
  largeFillArea: number;
  largeFillDepthFactor: number;
  largeFillSolidityMin: number;
  textMaxHeight: number;
  textMaxWidth: number;
  textMaxArea: number;
  textMaxDepth: number;
}

export const DEFAULT_COMPONENT_TUNING: ComponentTuning = {
  fillDepthThreshold: 12.0,
  minFillArea: 200,
  fillPerimeterAreaThreshold: 0.15,
  largeFillArea: 3000,
  largeFillDepthFactor: 0.5,
  largeFillSolidityMin: 0.25,
  textMaxHeight: 48,
  textMaxWidth: 48,
  textMaxArea: 400,
  textMaxDepth: 7,
};

export const INK_THRESHOLD = 240; // gray < 240 counts as ink

/** Per-pixel grayscale of an RGB buffer. */
export function toGray(rgb: Uint8Array, w: number, h: number): Uint8Array {
  const n = w * h;
  const gray = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    gray[i] = Math.min(
      255,
      Math.max(
        0,
        Math.round((rgb[i * 3] * 299 + rgb[i * 3 + 1] * 587 + rgb[i * 3 + 2] * 114) / 1000),
      ),
    );
  }
  return gray;
}

/**
 * Adaptive ink threshold for imperfect inputs (photos, scans, generated
 * images): when the page is predominantly light (median gray >= 200), pull
 * the ink threshold below the texture band; otherwise keep the default.
 */
export function adaptiveInkThreshold(gray: Uint8Array): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  let cum = 0;
  const half = gray.length / 2;
  let median = 255;
  for (let v = 0; v < 256; v++) {
    cum += hist[v];
    if (cum >= half) {
      median = v;
      break;
    }
  }
  if (median >= 200) {
    return Math.max(180, Math.min(INK_THRESHOLD, median - 14));
  }
  return INK_THRESHOLD;
}

/** Build the ink mask from a grayscale buffer with a threshold. */
export function inkFromGray(gray: Uint8Array, threshold: number): Uint8Array {
  const mask = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) mask[i] = gray[i] < threshold ? 1 : 0;
  return mask;
}

/** Remove connected ink specks smaller than minArea (paper-texture noise). */
export function despeckle(ink: Uint8Array, w: number, h: number, minArea = 8): number {
  const visited = new Uint8Array(ink.length);
  const stack = new Int32Array(ink.length);
  const doomed: number[] = [];
  let removed = 0;
  for (let start = 0; start < ink.length; start++) {
    if (!ink[start] || visited[start]) continue;
    let sp = 0;
    stack[sp++] = start;
    visited[start] = 1;
    const pixels: number[] = [];
    while (sp > 0) {
      const p = stack[--sp];
      pixels.push(p);
      const y = (p / w) | 0;
      const x = p % w;
      if (x > 0 && ink[p - 1] && !visited[p - 1]) {
        visited[p - 1] = 1;
        stack[sp++] = p - 1;
      }
      if (x < w - 1 && ink[p + 1] && !visited[p + 1]) {
        visited[p + 1] = 1;
        stack[sp++] = p + 1;
      }
      if (y > 0 && ink[p - w] && !visited[p - w]) {
        visited[p - w] = 1;
        stack[sp++] = p - w;
      }
      if (y < h - 1 && ink[p + w] && !visited[p + w]) {
        visited[p + w] = 1;
        stack[sp++] = p + w;
      }
    }
    if (pixels.length < minArea) doomed.push(...pixels);
    else pixels.length = 0;
  }
  for (const p of doomed) {
    ink[p] = 0;
    removed++;
  }
  return removed;
}

/** Single 3x3 dilation pass (8-neighborhood max filter). */
export function dilate3x3(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - 1);
    const y1 = Math.min(h - 1, y + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(w - 1, x + 1);
      let v = 0;
      for (let yy = y0; yy <= y1 && !v; yy++) {
        const row = yy * w;
        for (let xx = x0; xx <= x1; xx++) {
          if (mask[row + xx]) {
            v = 1;
            break;
          }
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

/** Single 3x3 erosion pass (8-neighborhood min filter). */
export function erode3x3(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - 1);
    const y1 = Math.min(h - 1, y + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(w - 1, x + 1);
      let v = 1;
      for (let yy = y0; yy <= y1 && v; yy++) {
        const row = yy * w;
        for (let xx = x0; xx <= x1; xx++) {
          if (!mask[row + xx]) {
            v = 0;
            break;
          }
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

/** Morphological close = dilate then erode (n iterations of each). */
export function morphClose(mask: Uint8Array, w: number, h: number, iterations = 2): Uint8Array {
  let cur = mask;
  for (let i = 0; i < iterations; i++) cur = dilate3x3(cur, w, h);
  for (let i = 0; i < iterations; i++) cur = erode3x3(cur, w, h);
  return cur;
}

/**
 * Exact Euclidean distance transform (Felzenszwalb & Huttenlocher) —
 * for each foreground pixel, the distance to the nearest background.
 */
export function distanceTransform(mask: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e18;
  const f = new Float64Array(w * h);
  for (let i = 0; i < f.length; i++) f[i] = mask[i] ? INF : 0;

  const dt1d = (func: Float64Array, len: number, out: Float64Array) => {
    const z = new Float64Array(len + 1);
    const v = new Int32Array(len);
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = (func[q] + q * q - (func[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (func[q] + q * q - (func[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      const d = q - v[k];
      out[q] = d * d + func[v[k]];
    }
  };

  const tmp = new Float64Array(w);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    dt1d(f.subarray(row, row + w) as Float64Array, w, tmp);
    for (let x = 0; x < w; x++) f[row + x] = tmp[x];
  }
  const out = new Float32Array(w * h);
  const colF = new Float64Array(h);
  const colOut = new Float64Array(h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) colF[y] = f[y * w + x];
    dt1d(colF, h, colOut);
    for (let y = 0; y < h; y++) out[y * w + x] = Math.sqrt(colOut[y]);
  }
  return out;
}

export function maskPerimeter(mask: Uint8Array, w: number, h: number): number {
  let perim = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!mask[p]) continue;
      if (x === 0 || !mask[p - 1]) perim++;
      if (x === w - 1 || !mask[p + 1]) perim++;
      if (y === 0 || !mask[p - w]) perim++;
      if (y === h - 1 || !mask[p + w]) perim++;
    }
  }
  return perim;
}

/** Chroma (max channel - min channel) stat over ink pixels. */
function maxChroma(
  rgb: Uint8Array,
  fullW: number,
  left: number,
  top: number,
  w: number,
  h: number,
  mask: Uint8Array,
): number {
  let maxC = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      const fi = ((top + y) * fullW + (left + x)) * 3;
      const r = rgb[fi];
      const g = rgb[fi + 1];
      const b = rgb[fi + 2];
      const c = Math.max(r, g, b) - Math.min(r, g, b);
      if (c > maxC) maxC = c;
      if (maxC >= 36) return maxC;
    }
  }
  return maxC;
}

/** Build one Comp from a cropped mask + placement. */
export function buildComp(
  mask: Uint8Array, // cropped
  w: number,
  h: number,
  left: number,
  top: number,
  rgb: Uint8Array,
  fullW: number,
  tuning: ComponentTuning,
  isTextOverride = false,
  forceFill = false,
): Comp | null {
  let area = 0;
  for (let i = 0; i < mask.length; i++) area += mask[i];
  if (area === 0) return null;
  const right = left + w - 1;
  const bottom = top + h - 1;

  const solid = morphClose(mask, w, h, isTextOverride ? 1 : 2);

  // EDT with an explicit background border so thickness is measured
  // correctly even when the component fills its bbox.
  const padded = new Uint8Array((w + 2) * (h + 2));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      padded[(y + 1) * (w + 2) + (x + 1)] = mask[y * w + x];
    }
  }
  const dt = distanceTransform(padded, w + 2, h + 2);
  let maxDepth = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = dt[(y + 1) * (w + 2) + (x + 1)];
      if (d > maxDepth) maxDepth = d;
    }
  }

  const perim = maskPerimeter(mask, w, h);
  const paRatio = perim / Math.max(area, 1);
  const bboxArea = w * h;
  const solidity = area / Math.max(bboxArea, 1);

  let isFill = false;
  if (forceFill) {
    isFill = true;
  } else if (!isTextOverride && area >= tuning.minFillArea) {
    isFill =
      (maxDepth > tuning.fillDepthThreshold && paRatio < tuning.fillPerimeterAreaThreshold) ||
      (area >= tuning.largeFillArea &&
        maxDepth > tuning.fillDepthThreshold * tuning.largeFillDepthFactor &&
        solidity > tuning.largeFillSolidityMin);
  }

  // Heuristic text classification: a single glyph is small in both
  // dimensions, compact, thin and neutral-ink. Only per-glyph smallness
  // keeps geometric strokes (lines, circles) from being misread as text.
  let isText = isTextOverride;
  if (!isText && !isFill) {
    const chroma = maxChroma(rgb, fullW, left, top, w, h, mask);
    isText =
      h <= tuning.textMaxHeight &&
      w <= tuning.textMaxWidth &&
      area <= tuning.textMaxArea &&
      maxDepth <= tuning.textMaxDepth &&
      chroma < 36 &&
      solidity >= 0.12;
  }

  return {
    left,
    top,
    right,
    bottom,
    w,
    h,
    mask,
    solid,
    area,
    maxDepth,
    isFill,
    isText,
    isResidual: false,
    subComponents: undefined,
  };
}

/**
 * Marker-stroke override: a thick elongated pen mark is drawn like a
 * stroke, not painted like a fill (the study's `_is_marker_stroke`).
 */
export function isMarkerStroke(comp: Comp): boolean {
  const width = Math.max(comp.right - comp.left + 1, 1);
  const height = Math.max(comp.bottom - comp.top + 1, 1);
  const bboxArea = width * height;
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  const fillRatio = comp.area / Math.max(bboxArea, 1);
  const depth = comp.maxDepth > 0 ? comp.maxDepth : shortSide;
  const elongated = longSide >= shortSide * 3.5 && depth <= shortSide * 0.6;
  const sparseBranched = fillRatio <= 0.45 && depth <= longSide * 0.18;
  return shortSide >= 16 && (elongated || sparseBranched);
}

/** Split an ink mask into its 4-connected pieces as Comps. */
export function splitIntoComps(
  mask: Uint8Array,
  maskW: number,
  maskH: number,
  offsetX: number,
  offsetY: number,
  rgb: Uint8Array,
  rgbFullW: number,
  tuning: ComponentTuning,
  minArea = 10,
  isTextOverride = false,
): Comp[] {
  const comps: Comp[] = [];
  const visited = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;
    let sp = 0;
    stack[sp++] = start;
    visited[start] = 1;
    const pixels: number[] = [];
    let minY = maskH;
    let maxY = -1;
    let minX = maskW;
    let maxX = -1;
    while (sp > 0) {
      const p = stack[--sp];
      pixels.push(p);
      const y = (p / maskW) | 0;
      const x = p % maskW;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      const neighbors: number[] = [];
      if (x > 0) neighbors.push(p - 1);
      if (x < maskW - 1) neighbors.push(p + 1);
      if (y > 0) neighbors.push(p - maskW);
      if (y < maskH - 1) neighbors.push(p + maskW);
      for (const q of neighbors) {
        if (mask[q] && !visited[q]) {
          visited[q] = 1;
          stack[sp++] = q;
        }
      }
    }
    const cw = maxX - minX + 1;
    const ch = maxY - minY + 1;
    const crop = new Uint8Array(cw * ch);
    for (const p of pixels) {
      const y = (p / maskW) | 0;
      const x = p % maskW;
      crop[(y - minY) * cw + (x - minX)] = 1;
    }
    if (pixels.length >= minArea) {
      const comp = buildComp(
        crop,
        cw,
        ch,
        minX + offsetX,
        minY + offsetY,
        rgb,
        rgbFullW,
        tuning,
        isTextOverride,
      );
      if (comp) comps.push(comp);
    }
  }
  return comps;
}

/**
 * Combine several components into one group whose mask spans the union
 * bbox (the study's `_build_component_group`).
 */
export function buildComponentGroup(
  subComponents: Comp[],
  opts: { isText: boolean; forceFill?: boolean; multicolor?: boolean },
): Comp | null {
  if (subComponents.length === 0) return null;
  if (subComponents.length === 1) return subComponents[0];
  const top = Math.min(...subComponents.map((c) => c.top));
  const bottom = Math.max(...subComponents.map((c) => c.bottom));
  const left = Math.min(...subComponents.map((c) => c.left));
  const right = Math.max(...subComponents.map((c) => c.right));
  const w = right - left + 1;
  const h = bottom - top + 1;
  const combined = new Uint8Array(w * h);
  const solid = new Uint8Array(w * h);
  let maxDepth = 0;
  let area = 0;
  for (const sub of subComponents) {
    area += sub.area;
    if (sub.maxDepth > maxDepth) maxDepth = sub.maxDepth;
    for (let y = 0; y < sub.h; y++) {
      const gy = sub.top - top + y;
      for (let x = 0; x < sub.w; x++) {
        const gx = sub.left - left + x;
        const g = gy * w + gx;
        if (sub.mask[y * sub.w + x]) combined[g] = 1;
        if (sub.solid[y * sub.w + x]) solid[g] = 1;
      }
    }
  }
  return {
    left,
    top,
    right,
    bottom,
    w,
    h,
    mask: combined,
    solid,
    area,
    maxDepth,
    isFill: !!opts.forceFill,
    isText: opts.isText,
    isResidual: false,
    subComponents,
    multicolor: !!opts.multicolor,
  };
}

// ---------------------------------------------------------------------------
// Skeleton graph tracing (the study's skeleton pass: Zhang-Suen thinning,
// junction-aware path extraction, junction branch pairing). Multi-branch
// line art (an X, a plus, a grid) draws one continuous pen stroke after
// another instead of growing every branch at once.
// ---------------------------------------------------------------------------

export interface SkelPath {
  /** Pixels (y,x) incl. node pixels on both ends, in walk order. */
  coords: Int32Array; // pairs: y, x
  /** Pixels strictly between the nodes, in walk order — SAME (y,x) pair
   *  format as coords (appendSkeletonPath converts the walk's raw pixel
   *  indices; orientedCore consumes pairs, never indices). */
  core: Int32Array; // pairs: y, x
  startNode: number; // node id or -1
  endNode: number;
  startY: number;
  startX: number;
  endY: number;
  endX: number;
  startIsEndpoint: boolean;
  endIsEndpoint: boolean;
}

export interface PenStroke {
  /** Pixels (y,x) in draw order. */
  coords: Int32Array; // pairs: y, x
  count: number;
  weight: number;
}

/** 8-neighbor count minus self. */
export function skeletonDegree(skel: Uint8Array, w: number, h: number): Int8Array {
  const degree = new Int8Array(skel.length);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - 1);
    const y1 = Math.min(h - 1, y + 1);
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!skel[p]) continue;
      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(w - 1, x + 1);
      let n = 0;
      for (let yy = y0; yy <= y1; yy++) {
        const row = yy * w;
        for (let xx = x0; xx <= x1; xx++) {
          if (yy === y && xx === x) continue;
          if (skel[row + xx]) n++;
        }
      }
      degree[p] = n;
    }
  }
  return degree;
}

/** Zhang-Suen thinning: 0/1 mask in, 1px-wide skeleton out.
 *
 *  The pass carries a deterministic STOP-FLOOR: closed rings collapse to a
 *  single point under unguarded Zhang–Suen (every stage of a 2px ring has
 *  exactly one 0→1 transition in its neighborhood, so the pass keeps
 *  eating). The floor halts thinning while a shape-proportional amount of
 *  ink remains — the result is a thin-but-intact skeleton instead of a
 *  vanished loop. */
export function skeletonize(mask: Uint8Array, w: number, h: number): Uint8Array {
  const img = new Uint8Array(mask.length);
  const other = new Uint8Array(mask.length);
  img.set(mask);

  let inkCount = 0;
  for (let i = 0; i < img.length; i++) if (img[i]) inkCount++;
  const stopFloor = Math.max(4, Math.round(inkCount * 0.12));

  const neighbors = [
    [-1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, -1],
  ];

  const thinPass = (phase: 1 | 2): boolean => {
    other.fill(0);
    const toRemove: number[] = [];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x;
        if (!img[p]) continue;
        let n = 0;
        for (const [dy, dx] of neighbors) {
          if (img[(y + dy) * w + (x + dx)]) n++;
        }
        if (n < 2 || n > 6) continue;
        let a = 0;
        for (let i = 0; i < 8; i++) {
          const cur = img[(y + neighbors[i][0]) * w + (x + neighbors[i][1])];
          const nxt =
            img[(y + neighbors[(i + 1) % 8][0]) * w + (x + neighbors[(i + 1) % 8][1])];
          if (cur === 0 && nxt === 1) a++;
        }
        if (a !== 1) continue;
        const p2 = img[(y - 1) * w + x];
        const _p3 = img[(y - 1) * w + x + 1];
        const p4 = img[y * w + x + 1];
        const _p5 = img[(y + 1) * w + x + 1];
        const p6 = img[(y + 1) * w + x];
        const _p7 = img[(y + 1) * w + x - 1];
        const p8 = img[y * w + x - 1];
        const _p9 = img[(y - 1) * w + x - 1];
        if (phase === 1) {
          if (p2 && p4 && p6) continue;
          if (p4 && p6 && p8) continue;
        } else {
          if (p2 && p4 && p8) continue;
          if (p2 && p6 && p8) continue;
        }
        toRemove.push(p);
      }
    }
    for (const p of toRemove) other[p] = 1;
    for (const p of toRemove) img[p] = 0;
    return toRemove.length > 0;
  };

  let changed = true;
  let guard = 0;
  while (changed && guard++ < 200) {
    changed = thinPass(1);
    changed = thinPass(2) || changed;
    if (changed) {
      let count = 0;
      for (let i = 0; i < img.length; i++) if (img[i]) count++;
      if (count <= stopFloor) break;
    }
  }
  return img;
}

/** 8-connected component labeling of a node mask. */
function labelComponent(mask: Uint8Array, w: number, h: number): { labels: Int32Array; count: number } {
  const labels = new Int32Array(mask.length);
  const stack = new Int32Array(mask.length);
  let count = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    count++;
    let sp = 0;
    stack[sp++] = start;
    labels[start] = count;
    while (sp > 0) {
      const p = stack[--sp];
      const y = (p / w) | 0;
      const x = p % w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dy === 0 && dx === 0) continue;
          const ny = y + dy;
          const nx = x + dx;
          if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue;
          const q = ny * w + nx;
          if (mask[q] && !labels[q]) {
            labels[q] = count;
            stack[sp++] = q;
          }
        }
      }
    }
  }
  return { labels, count };
}

/** Remove duplicate pixels while preserving first-seen order. */
function uniqueCoords(coords: number[]): Int32Array {
  const seen = new Set<number>();
  const out: number[] = [];
  for (let i = 0; i < coords.length; i += 2) {
    const key = coords[i] * 0x40000000 + coords[i + 1];
    if (!seen.has(key)) {
      seen.add(key);
      out.push(coords[i], coords[i + 1]);
    }
  }
  return new Int32Array(out);
}

function walkSkeletonPath(
  skel: Uint8Array,
  nodeMask: Uint8Array,
  labels: Int32Array,
  visited: Uint8Array,
  isNode: (p: number) => boolean,
  prev: [number, number],
  curr: [number, number],
  w: number,
  h: number,
): { core: number[]; endNode: number } | null {
  const core: number[] = [];
  let endNode = -1;
  let py = prev[0];
  let px = prev[1];
  let cy = curr[0];
  let cx = curr[1];
  while (true) {
    const p = cy * w + cx;
    if (isNode(p)) {
      endNode = labels[p];
      break;
    }
    if (visited[p]) break;
    visited[p] = 1;
    core.push(p);
    let nextY = -1;
    let nextX = -1;
    let foundNode = -1;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dy === 0 && dx === 0) continue;
        const ny = cy + dy;
        const nx = cx + dx;
        if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue;
        if (ny === py && nx === px) continue;
        const q = ny * w + nx;
        if (!skel[q]) continue;
        if (nodeMask[q]) {
          foundNode = labels[q];
          break;
        }
        if (!visited[q] && nextY < 0) {
          nextY = ny;
          nextX = nx;
        }
      }
      if (foundNode >= 0) break;
    }
    if (foundNode >= 0) {
      endNode = foundNode;
      break;
    }
    if (nextY < 0) break;
    py = cy;
    px = cx;
    cy = nextY;
    cx = nextX;
  }
  if (core.length < 2) return null;
  return { core, endNode };
}

function appendSkeletonPath(
  paths: SkelPath[],
  path: { core: number[]; endNode: number },
  startNode: number,
  nodePixels: Map<number, number[]>,
  nodeCenters: Map<number, [number, number]>,
  degree: Int8Array,
  w: number,
): void {
  const pieces: number[] = [];
  const startPixels = nodePixels.get(startNode) ?? [];
  for (const p of startPixels) pieces.push((p / w) | 0, p % w);
  // The walk's core is raw pixel INDICES — convert to (y,x) pairs here so
  // every downstream consumer (orientedCore, the trail builder) reads one
  // format. Mixing formats here once corrupted every junction stroke's
  // geometry (indices emitted as coordinates).
  const corePairs: number[] = [];
  for (const p of path.core) corePairs.push((p / w) | 0, p % w);
  const endNode = path.endNode;
  const endPixels = endNode >= 0 ? nodePixels.get(endNode) ?? [] : [];
  for (const p of endPixels) pieces.push((p / w) | 0, p % w);

  const coords = uniqueCoords(pieces);
  const count = coords.length / 2;
  if (count < 2) return;
  const coreCoords = uniqueCoords(corePairs);

  let top = Infinity;
  let left = Infinity;
  for (let i = 0; i < coords.length; i += 2) {
    if (coords[i] < top) top = coords[i];
    if (coords[i + 1] < left) left = coords[i + 1];
  }

  const degreeStats = (nodeId: number): { deg1: boolean; deg3: boolean } => {
    const pixels = nodePixels.get(nodeId) ?? [];
    let deg1 = false;
    let deg3 = false;
    for (const p of pixels) {
      const d = degree[p];
      if (d === 1) deg1 = true;
      if (d >= 3) deg3 = true;
    }
    return { deg1, deg3 };
  };
  const sStats = degreeStats(startNode);
  const eStats = endNode >= 0 ? degreeStats(endNode) : { deg1: false, deg3: false };

  const startCenter = nodeCenters.get(startNode) ?? [0, 0];
  const endCenterMap = endNode >= 0 ? nodeCenters.get(endNode) : undefined;
  const endCenter = endCenterMap ?? [coords[coords.length - 4], coords[coords.length - 3]];

  paths.push({
    coords,
    core: coreCoords.length >= 2 ? coreCoords : coords,
    startNode,
    endNode,
    startY: startCenter[0],
    startX: startCenter[1],
    endY: endCenter[0],
    endX: endCenter[1],
    startIsEndpoint: sStats.deg1 && !sStats.deg3,
    endIsEndpoint: eStats.deg1 && !eStats.deg3,
  });
}

/**
 * Extract skeleton paths between nodes (pixels whose degree != 2); falls
 * back to cycle extraction when the skeleton has no nodes (a plain closed
 * loop — a circle, a rectangle outline).
 */
export function extractSkeletonPaths(skel: Uint8Array, w: number, h: number): SkelPath[] {
  const degree = skeletonDegree(skel, w, h);
  const nodeMask = new Uint8Array(skel.length);
  for (let i = 0; i < skel.length; i++) {
    if (skel[i] && degree[i] !== 2) nodeMask[i] = 1;
  }
  const { labels, count } = labelComponent(nodeMask, w, h);
  if (count === 0) return extractCyclePaths(skel, w, h);

  const nodePixels = new Map<number, number[]>();
  const nodeCenters = new Map<number, [number, number]>();
  for (let i = 0; i < skel.length; i++) {
    const id = labels[i];
    if (id > 0 && nodeMask[i]) {
      let arr = nodePixels.get(id);
      if (!arr) {
        arr = [];
        nodePixels.set(id, arr);
      }
      arr.push(i);
    }
  }
  for (const [id, pixels] of nodePixels) {
    let sy = 0;
    let sx = 0;
    for (const p of pixels) {
      sy += (p / w) | 0;
      sx += p % w;
    }
    nodeCenters.set(id, [sy / pixels.length, sx / pixels.length]);
  }

  const visited = new Uint8Array(skel.length);
  const paths: SkelPath[] = [];
  const isNode = (p: number): boolean => nodeMask[p] === 1;

  for (const [nodeId, pixels] of nodePixels) {
    for (const p of pixels) {
      const py = (p / w) | 0;
      const px = p % w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dy === 0 && dx === 0) continue;
          const ny = py + dy;
          const nx = px + dx;
          if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue;
          const q = ny * w + nx;
          if (!skel[q] || nodeMask[q] || visited[q]) continue;
          const path = walkSkeletonPath(skel, nodeMask, labels, visited, isNode, [py, px], [ny, nx], w, h);
          if (path) {
            appendSkeletonPath(paths, path, nodeId, nodePixels, nodeCenters, degree, w);
          }
        }
      }
    }
  }
  if (paths.length === 0) return extractCyclePaths(skel, w, h);
  return paths;
}

/**
 * Trace external boundary of each connected region as an ordered pixel
 * chain (Moore-neighbor tracing with Jacob's stopping criterion).
 * Coordinates returned as flat [y0, x0, y1, x1, ...] in walk order.
 */
export function traceExternalContours(mask: Uint8Array, w: number, h: number): Int32Array[] {
  const contours: Int32Array[] = [];
  const visitedStart = new Uint8Array(mask.length);
  for (let sy = 0; sy < h; sy++) {
    for (let sx = 0; sx < w; sx++) {
      const start = sy * w + sx;
      if (!mask[start] || visitedStart[start]) continue;
      const above = sy === 0 ? 0 : mask[start - w];
      if (above === 1) continue;
      visitedStart[start] = 1;
      const contour = traceOne(mask, w, h, sy, sx);
      if (contour && contour.length >= 8) {
        contours.push(contour);
        for (let i = 0; i < contour.length; i += 2) {
          visitedStart[contour[i] * w + contour[i + 1]] = 1;
        }
      }
    }
  }
  return contours;
}

function traceOne(mask: Uint8Array, w: number, h: number, sy: number, sx: number): Int32Array | null {
  const dirs = [
    [0, 1],
    [1, 1],
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, -1],
    [-1, 0],
    [-1, 1],
  ];
  const points: number[] = [];
  let y = sy;
  let x = sx;
  let dir = 7; // came from north (background above)
  const maxSteps = w * h * 2 + 8;
  // Jacob's stopping criterion, done right: the boundary is CLOSED when the
  // walker repeats a (pixel, out-direction) state — not when it merely
  // re-enters the start pixel. Thin protrusions (the cap on a filled disc)
  // re-enter the start from another direction long before the outer cycle
  // is complete; a naive arrival check fragments such regions into caps.
  const seen = new Set<number>();
  let steps = 0;
  for (;;) {
    points.push(y, x);
    let found = false;
    // Moore radial sweep: scan clockwise starting at the neighbor just
    // AFTER the backtrack pixel (my ring is clockwise, so that is dir+1).
    // Starting anywhere else lets the walk cut across interior ink and
    // fragment the boundary into caps.
    const nd = (dir + 1) % 8;
    for (let i = 0; i < 8; i++) {
      const tryDir = (nd + i) % 8;
      const ny = y + dirs[tryDir][0];
      const nx = x + dirs[tryDir][1];
      if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue;
      if (mask[ny * w + nx]) {
        dir = (tryDir + 4) % 8;
        y = ny;
        x = nx;
        found = true;
        break;
      }
    }
    if (!found) break; // isolated pixel
    const key = (y * w + x) * 8 + dir;
    if (seen.has(key)) break;
    seen.add(key);
    if (++steps > maxSteps) break;
  }
  if (points.length < 8) return null;
  return new Int32Array(points);
}

/** Closed-loop fallback: external contours as cycle paths. */
function extractCyclePaths(skel: Uint8Array, w: number, h: number): SkelPath[] {
  const contours = traceExternalContours(skel, w, h);
  const paths: SkelPath[] = [];
  for (const c of contours) {
    const coords = uniqueCoords(Array.from(c));
    if (coords.length / 2 < 4) continue;
    paths.push({
      coords,
      core: coords,
      startNode: -1,
      endNode: -1,
      startY: coords[0],
      startX: coords[1],
      endY: coords[coords.length - 2],
      endX: coords[coords.length - 1],
      startIsEndpoint: false,
      endIsEndpoint: false,
    });
  }
  return paths;
}

// ---------------------------------------------------------------------------
// Junction branch pairing → sequential pen strokes
// ---------------------------------------------------------------------------

function orientedCore(path: SkelPath, fromStart: boolean): Int32Array {
  const core = path.core.length >= 4 ? path.core : path.coords;
  if (core.length < 4) return path.coords;
  if (fromStart) return core;
  const rev = new Int32Array(core.length);
  for (let i = 0; i < core.length; i += 2) {
    rev[i] = core[core.length - 2 - i];
    rev[i + 1] = core[core.length - 1 - i];
  }
  return rev;
}

function outwardDirection(path: SkelPath, fromStart: boolean): [number, number] {
  const coords = orientedCore(path, fromStart);
  if (coords.length < 4) return [0, 0];
  const lookahead = Math.min(5, coords.length / 2 - 1) * 2;
  const dy = coords[lookahead] - coords[0];
  const dx = coords[lookahead + 1] - coords[1];
  const norm = Math.hypot(dy, dx);
  if (norm <= 1e-6) return [0, 0];
  return [dy / norm, dx / norm];
}

interface Token {
  index: number; // path index
  fromStart: boolean;
}

function tokenPosition(path: SkelPath, token: Token): number {
  const endpoint = token.fromStart ? path.startIsEndpoint : path.endIsEndpoint;
  const y = token.fromStart ? path.startY : path.endY;
  const x = token.fromStart ? path.startX : path.endX;
  return (endpoint ? 0 : 1) * 1e9 + y * 100000 + x;
}

/**
 * Pair incident path ends into the straightest continuations so the
 * top/bottom arms of a plus become one stroke (the study's
 * `_pair_junction_branches`). Coordinate tie-breaks only — no RNG.
 */
function pairJunctionBranches(paths: SkelPath[]): Map<string, Token> {
  const incident = new Map<number, Token[]>();
  paths.forEach((path, index) => {
    if (path.startNode >= 0) {
      const arr = incident.get(path.startNode) ?? [];
      arr.push({ index, fromStart: true });
      incident.set(path.startNode, arr);
    }
    if (path.endNode >= 0) {
      const arr = incident.get(path.endNode) ?? [];
      arr.push({ index, fromStart: false });
      incident.set(path.endNode, arr);
    }
  });

  const pairings = new Map<string, Token>();
  const key = (t: Token) => `${t.index}:${t.fromStart ? "s" : "e"}`;

  for (const tokens of incident.values()) {
    const available = new Set(tokens.map(key));
    const candidates: Array<{ cosine: number; left: Token; right: Token; tie: number }> = [];
    for (let i = 0; i < tokens.length; i++) {
      const left = tokens[i];
      const ld = outwardDirection(paths[left.index], left.fromStart);
      if (ld[0] === 0 && ld[1] === 0) continue;
      for (let j = i + 1; j < tokens.length; j++) {
        const right = tokens[j];
        if (left.index === right.index) continue;
        const rd = outwardDirection(paths[right.index], right.fromStart);
        if (rd[0] === 0 && rd[1] === 0) continue;
        const cosine = ld[0] * rd[0] + ld[1] * rd[1];
        const tie = tokenPosition(paths[left.index], left) - tokenPosition(paths[right.index], right);
        candidates.push({ cosine, left, right, tie });
      }
    }
    // cosine ascending (straightest continuation first), then a coordinate
    // tie-break so equal-cosine pairs stay stable across runs.
    candidates.sort((a, b) => a.cosine - b.cosine || a.tie - b.tie);
    for (const { left, right } of candidates) {
      const lk = key(left);
      const rk = key(right);
      if (!available.has(lk) || !available.has(rk)) continue;
      pairings.set(lk, right);
      pairings.set(rk, left);
      available.delete(lk);
      available.delete(rk);
    }
  }
  return pairings;
}

function appendTrail(
  firstToken: Token,
  paths: SkelPath[],
  pairings: Map<string, Token>,
  usedPaths: Set<number>,
  strokes: PenStroke[],
): void {
  const trail: Int32Array[] = [];
  let token: Token | null = firstToken;
  while (token !== null) {
    const pathIndex = token.index;
    if (usedPaths.has(pathIndex)) break;
    const path = paths[pathIndex];
    let coords: Int32Array;
    if (path.startNode < 0 && path.endNode < 0) {
      // Closed path: rotate to begin at top-left pixel.
      const c = path.coords;
      let best = 0;
      for (let i = 0; i < c.length; i += 2) {
        if (c[i] < c[best] || (c[i] === c[best] && c[i + 1] < c[best + 1])) {
          best = i;
        }
      }
      const rotated = new Int32Array(c.length);
      for (let i = 0; i < c.length; i += 2) {
        const src = (best + i) % c.length;
        rotated[i] = c[src];
        rotated[i + 1] = c[src + 1];
      }
      coords = rotated;
    } else {
      coords = orientedCore(path, token.fromStart);
    }
    if (coords.length >= 2) trail.push(coords);
    usedPaths.add(pathIndex);
    const exitKey = `${pathIndex}:${!token.fromStart ? "s" : "e"}`;
    token = pairings.get(exitKey) ?? null;
  }
  if (trail.length === 0) return;
  const all: number[] = [];
  for (const t of trail) for (const v of t) all.push(v);
  const coords = uniqueCoords(all);
  const count = coords.length / 2;
  if (count < 2) return;
  strokes.push({ coords, count, weight: count });
}

/**
 * Build sequential pen strokes from skeleton paths (the study's
 * `build_line_art_strokes`): trails start at natural or unpaired ends and
 * follow junction pairings into complete endpoint-to-endpoint strokes.
 */
export function buildLineArtStrokes(paths: SkelPath[]): PenStroke[] {
  const usable = paths.filter((p) => p.coords.length / 2 >= 2);
  if (usable.length === 0) return [];
  const pairings = pairJunctionBranches(usable);
  const usedPaths = new Set<number>();
  const strokes: PenStroke[] = [];

  const key = (t: Token) => `${t.index}:${t.fromStart ? "s" : "e"}`;

  const startTokens: Token[] = [];
  usable.forEach((path, index) => {
    for (const fromStart of [true, false]) {
      const token: Token = { index, fromStart };
      const hasNode = fromStart ? path.startNode >= 0 : path.endNode >= 0;
      if (!hasNode || !pairings.has(key(token))) {
        startTokens.push(token);
      }
    }
  });
  startTokens.sort((a, b) => tokenPosition(usable[a.index], a) - tokenPosition(usable[b.index], b));
  for (const token of startTokens) {
    appendTrail(token, usable, pairings, usedPaths, strokes);
  }

  // Closed graphs: every end paired — start any remaining trail.
  let guard = 0;
  while (usedPaths.size < usable.length && guard++ < usable.length * 2) {
    const choices: Token[] = [];
    usable.forEach((path, index) => {
      if (!usedPaths.has(index)) {
        choices.push({ index, fromStart: true });
        choices.push({ index, fromStart: false });
      }
    });
    if (choices.length === 0) break;
    choices.sort((a, b) => tokenPosition(usable[a.index], a) - tokenPosition(usable[b.index], b));
    appendTrail(choices[0], usable, pairings, usedPaths, strokes);
  }
  return strokes;
}

// ---------------------------------------------------------------------------
// Human draw-order (the study's ordering pass): containers before
// contents, reading order via visual-line buckets, dots attached to their
// glyphs, text merged into word/line blocks.
// ---------------------------------------------------------------------------

interface BBoxOf {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function bboxOf(c: Comp): BBoxOf {
  return { left: c.left, top: c.top, right: c.right, bottom: c.bottom };
}

export function containsComponent(outer: Comp, inner: Comp, pad = 10): boolean {
  const outerW = Math.max(outer.right - outer.left, 1);
  const outerH = Math.max(outer.bottom - outer.top, 1);
  const innerW = Math.max(inner.right - inner.left, 1);
  const innerH = Math.max(inner.bottom - inner.top, 1);
  const outerArea = outerW * outerH;
  const innerArea = innerW * innerH;
  if (outerArea <= innerArea * 1.08) return false;

  const left = outer.left - pad;
  const right = outer.right + pad;
  const top = outer.top - pad;
  const bottom = outer.bottom + pad;

  const interW = Math.max(0, Math.min(right, inner.right) - Math.max(left, inner.left));
  const interH = Math.max(0, Math.min(bottom, inner.bottom) - Math.max(top, inner.top));
  const coverage = (interW * interH) / Math.max(innerArea, 1);

  const cx = (inner.left + inner.right) / 2;
  const cy = (inner.top + inner.bottom) / 2;
  const centerInside = left <= cx && cx <= right && top <= cy && cy <= bottom;
  return centerInside && coverage >= 0.85;
}

function shouldGroupComponents(a: Comp, b: Comp): boolean {
  const ah = Math.max(a.bottom - a.top, 1);
  const bh = Math.max(b.bottom - b.top, 1);
  const aw = Math.max(a.right - a.left, 1);
  const bw = Math.max(b.right - b.left, 1);

  const xOverlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const yOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  const xGap = Math.max(a.left, b.left) - Math.min(a.right, b.right);
  const yGap = Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom);

  const xOverlapRatio = Math.max(xOverlap, 0) / Math.max(Math.min(aw, bw), 1);
  const yOverlapRatio = Math.max(yOverlap, 0) / Math.max(Math.min(ah, bh), 1);
  const widthRatio = Math.max(aw, bw) / Math.max(Math.min(aw, bw), 1);

  if (containsComponent(a, b) || containsComponent(b, a)) return true;

  const bridgesColumns = widthRatio > 2.8 && Math.max(aw, bw) > Math.min(aw, bw) + 120;

  if (xOverlapRatio > 0.25 && yGap < Math.max(ah, bh) * 1.7) return !bridgesColumns;
  if (yOverlapRatio > 0.35 && xGap < Math.max(ah, bh, 40) * 1.4) return true;
  if (xOverlapRatio > 0.55 && yGap < 90) return !bridgesColumns;
  return false;
}

interface SpatialGroup {
  items: Comp[];
}

function buildSpatialGroups(components: Comp[]): SpatialGroup[] {
  if (components.length <= 1) return components.length ? [{ items: [...components] }] : [];
  const parent = components.map((_, i) => i);
  const find = (idx: number): number => {
    while (parent[idx] !== idx) {
      parent[idx] = parent[parent[idx]];
      idx = parent[idx];
    }
    return idx;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  for (let i = 0; i < components.length; i++) {
    for (let j = i + 1; j < components.length; j++) {
      if (shouldGroupComponents(components[i], components[j])) union(i, j);
    }
  }
  const buckets = new Map<number, Comp[]>();
  components.forEach((comp, i) => {
    const root = find(i);
    const arr = buckets.get(root) ?? [];
    arr.push(comp);
    buckets.set(root, arr);
  });
  return [...buckets.values()].map((items) => ({ items }));
}

/**
 * Bucket indices into top-down visual lines (midpoint-Y proximity with a
 * height-ratio veto), sorted left-to-right within each line, keeping
 * visually adjacent clusters contiguous (the study's `line_bucket_indices`).
 */
export function lineBucketIndices(indices: number[], items: Comp[]): number[] {
  if (indices.length === 0) return [];
  const ordered = [...indices].sort(
    (a, b) => (items[a].top + items[a].bottom) / 2 - (items[b].top + items[b].bottom) / 2,
  );

  const lines: Array<{ midY: number; tol: number; idxs: number[]; firstH: number; weight: number }> = [];
  for (const idx of ordered) {
    const comp = items[idx];
    const ct = comp.top;
    const cb = comp.bottom;
    const ch = Math.max(cb - ct, 1);
    const midY = (ct + cb) / 2;
    const weight = Math.max(comp.area, 1);

    let matched: (typeof lines)[number] | null = null;
    for (const line of lines) {
      const heightRatio = Math.max(ch, line.firstH) / Math.max(Math.min(ch, line.firstH), 1);
      if (heightRatio > 2.5) continue;
      if (Math.abs(midY - line.midY) <= line.tol) {
        matched = line;
        break;
      }
    }
    if (matched) {
      const oldW = matched.weight;
      const newW = oldW + weight;
      matched.midY = (matched.midY * oldW + midY * weight) / newW;
      matched.weight = newW;
      matched.idxs.push(idx);
    } else {
      lines.push({ midY, tol: ch * 0.4, idxs: [idx], firstH: ch, weight });
    }
  }

  lines.sort((a, b) => a.midY - b.midY);
  const out: number[] = [];
  for (const line of lines) {
    line.idxs.sort((a, b) => items[a].left - items[b].left);
    const clusters: number[][] = [];
    for (const idx of line.idxs) {
      const comp = items[idx];
      const ch = comp.bottom - comp.top;
      let placed = false;
      if (clusters.length > 0) {
        const lastId = clusters[clusters.length - 1][clusters[clusters.length - 1].length - 1];
        const last = items[lastId];
        const lh = last.bottom - last.top;
        const hr = Math.max(ch, lh) / Math.max(Math.min(ch, lh), 1);
        const xg = comp.left - last.right;
        if (hr < 3.0 && xg < Math.max(ch, lh) * 2.0) {
          clusters[clusters.length - 1].push(idx);
          placed = true;
        }
      }
      if (!placed) clusters.push([idx]);
    }
    for (const cluster of clusters) out.push(...cluster);
  }
  return out;
}

/**
 * Reading order: top-down lines, left-to-right, containers emitted before
 * their contents (the study's `sort_components_reading_order`).
 */
export function sortComponentsReadingOrder(components: Comp[]): Comp[] {
  if (components.length === 0) return components;
  const n = components.length;
  const parents: Array<number | null> = new Array(n).fill(null);
  let hasContainment = false;
  for (let i = 0; i < n; i++) {
    let bestParent: number | null = null;
    let bestArea = Infinity;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (containsComponent(components[j], components[i])) {
        hasContainment = true;
        const a =
          (components[j].right - components[j].left) * (components[j].bottom - components[j].top);
        if (a < bestArea) {
          bestArea = a;
          bestParent = j;
        }
      }
    }
    parents[i] = bestParent;
  }

  if (!hasContainment) {
    const order = lineBucketIndices([...Array(n).keys()], components);
    return order.map((i) => components[i]);
  }

  const children: number[][] = [];
  const roots: number[] = [];
  parents.forEach((parent, i) => {
    if (parent === null) roots.push(i);
    else {
      (children[parent] ??= []).push(i);
    }
  });

  const ordered: Comp[] = [];
  const emit = (idx: number) => {
    ordered.push(components[idx]);
    const kids = children[idx];
    if (kids && kids.length > 0) {
      for (const c of lineBucketIndices(kids, components)) emit(c);
    }
  };
  for (const r of lineBucketIndices(roots, components)) emit(r);
  return ordered;
}

/**
 * Move glyph dots (question marks etc.) to draw immediately after the mark
 * they belong to (the study's `attach_trailing_dots`).
 */
export function attachTrailingDots(ordered: Comp[]): Comp[] {
  if (ordered.length < 2) return ordered;
  let result = [...ordered];
  for (const comp of ordered) {
    const cw = comp.right - comp.left;
    const ch = comp.bottom - comp.top;
    if (comp.isFill || cw > 45 || ch > 45 || comp.area > 1200) continue;
    const cx = (comp.left + comp.right) / 2;
    const dotH = Math.max(ch, 1);

    let best: Comp | null = null;
    let bestGap: number | null = null;
    for (const parent of ordered) {
      if (parent === comp || parent.area < comp.area * 3) continue;
      if (!(parent.left - 5 <= cx && cx <= parent.right + 5)) continue;
      const gap = comp.top - parent.bottom;
      if (-dotH <= gap && gap <= 4 * dotH) {
        if (bestGap === null || gap < bestGap) {
          best = parent;
          bestGap = gap;
        }
      }
    }
    if (best === null) continue;
    const idx = result.indexOf(comp);
    if (idx >= 0) result = [...result.slice(0, idx), ...result.slice(idx + 1)];
    const pIdx = result.indexOf(best);
    result = [...result.slice(0, pIdx + 1), comp, ...result.slice(pIdx + 1)];
  }
  return result;
}

/** Treat a spatial group as a pseudo-component for bucketing. */
function pseudoCompOf(group: SpatialGroup): Comp {
  const boxes = group.items.map(bboxOf);
  const top = Math.min(...boxes.map((b) => b.top));
  const bottom = Math.max(...boxes.map((b) => b.bottom));
  const left = Math.min(...boxes.map((b) => b.left));
  const right = Math.max(...boxes.map((b) => b.right));
  return {
    ...group.items[0],
    top,
    bottom,
    left,
    right,
    area: group.items.reduce((s, c) => s + c.area, 0),
  };
}

/**
 * Layered order: spatial groups bucketed in reading order, each group
 * drawn contiguously (the study's `sort_components_layered`).
 */
export function sortComponentsLayered(components: Comp[]): Comp[] {
  if (components.length === 0) return components;
  const groups = buildSpatialGroups(components);
  const groupOrder = lineBucketIndices(
    [...Array(groups.length).keys()],
    groups.map((g) => pseudoCompOf(g)),
  );
  const ordered: Comp[] = [];
  for (const gi of groupOrder) {
    ordered.push(...sortComponentsReadingOrder(groups[gi].items));
  }
  return attachTrailingDots(ordered);
}

/**
 * Order text sub-components: lines by vertical overlap, left-to-right
 * within a line (the study's `order_text_components`).
 */
export function orderTextComponents(subs: Comp[]): Comp[] {
  const lines: Comp[][] = [];
  for (const sub of [...subs].sort((a, b) => a.top - b.top || a.left - b.left)) {
    let placed = false;
    for (const line of lines) {
      const r = line[0];
      if (sub.top <= r.bottom && sub.bottom >= r.top) {
        line.push(sub);
        placed = true;
        break;
      }
    }
    if (!placed) lines.push([sub]);
  }
  for (const line of lines) line.sort((a, b) => a.left - b.left);
  return lines.flat();
}

/**
 * Merge text components into word/line blocks via union-find with the
 * reference's gap thresholds (the study's `_merge_text_blocks`).
 */
export function mergeTextBlocks(
  components: Comp[],
  opts: {
    wordGapFactor: number;
    maxLineGapFactor: number;
    minWordGapPx: number;
    maxLineGapPx: number;
  } = { wordGapFactor: 2.0, maxLineGapFactor: 1.0, minWordGapPx: 8, maxLineGapPx: 25 },
): Comp[] {
  const text = components.filter((c) => c.isText);
  const other = components.filter((c) => !c.isText);
  if (text.length <= 1) return components;

  const parent = text.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  for (let i = 0; i < text.length; i++) {
    const ci = text[i];
    const hi = ci.bottom - ci.top;
    for (let j = i + 1; j < text.length; j++) {
      const cj = text[j];
      const hj = cj.bottom - cj.top;

      const yov = Math.min(ci.bottom, cj.bottom) - Math.max(ci.top, cj.top);
      if (yov > Math.min(hi, hj) * 0.3) {
        const xgap = Math.max(ci.left, cj.left) - Math.min(ci.right, cj.right);
        const maxGap = Math.min(
          Math.max(Math.max(hi, hj) * opts.wordGapFactor, opts.minWordGapPx),
          opts.maxLineGapPx * 2,
        );
        if (xgap < maxGap) {
          union(i, j);
          continue;
        }
      }
      const xov = Math.min(ci.right, cj.right) - Math.max(ci.left, cj.left);
      const mw = Math.min(ci.right - ci.left, cj.right - cj.left);
      if (xov > mw * 0.3) {
        const ygap = Math.max(ci.top, cj.top) - Math.min(ci.bottom, cj.bottom);
        const ygapThreshold = Math.min(((hi + hj) / 2) * opts.maxLineGapFactor, opts.maxLineGapPx);
        if (0 <= ygap && ygap < ygapThreshold) union(i, j);
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < text.length; i++) {
    const root = find(i);
    const arr = groups.get(root) ?? [];
    arr.push(i);
    groups.set(root, arr);
  }

  const merged: Comp[] = [];
  for (const indices of groups.values()) {
    if (indices.length === 1) {
      merged.push(text[indices[0]]);
      continue;
    }
    const members = indices.map((idx) => text[idx]);
    const group = buildComponentGroup(members, { isText: true });
    if (group) merged.push(group);
  }
  return [...other, ...merged];
}

// ---------------------------------------------------------------------------
// Geometry → SVG path emission (the NEW half: the reference's painter
// pipeline ends here — TubeForge's timing.ts owns scheduling, so the plan
// is ordered PATH GEOMETRY, simplified inside the upload command walls).
// ---------------------------------------------------------------------------

/** Ramer–Douglas–Peucker over a flat [x0,y0,x1,y1,…] polyline. */
export function rdpSimplify(pts: number[], tol: number): number[] {
  const n = pts.length / 2;
  if (n <= 2 || tol <= 0) return pts.slice();
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  // Iterative (explicit stack of [start,end] index pairs) — deterministic
  // order, no recursion depth limits on long strokes.
  const stack: Array<[number, number]> = [[0, n - 1]];
  while (stack.length > 0) {
    const popped = stack.pop();
    if (!popped) break;
    const s = popped[0];
    const e = popped[1];
    if (e - s < 2) continue;
    const x1 = pts[s * 2];
    const y1 = pts[s * 2 + 1];
    const x2 = pts[e * 2];
    const y2 = pts[e * 2 + 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    let maxDist = -1;
    let maxIdx = -1;
    for (let i = s + 1; i < e; i++) {
      const px = pts[i * 2];
      const py = pts[i * 2 + 1];
      let d: number;
      if (len <= 1e-9) {
        d = Math.hypot(px - x1, py - y1);
      } else {
        d = Math.abs(dy * (px - x1) - dx * (py - y1)) / len;
      }
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }
    if (maxDist > tol && maxIdx > 0) {
      keep[maxIdx] = 1;
      stack.push([s, maxIdx], [maxIdx, e]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (keep[i]) out.push(pts[i * 2], pts[i * 2 + 1]);
  }
  return out;
}

/** Deepest EDT point of a solid region (crop coords) — the fill's probe
 *  seed, guaranteed strictly inside the outline polygon. */
function fillCore(solid: Uint8Array, w: number, h: number): [number, number] {
  const padded = new Uint8Array((w + 2) * (h + 2));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      padded[(y + 1) * (w + 2) + (x + 1)] = solid[y * w + x];
    }
  }
  const dt = distanceTransform(padded, w + 2, h + 2);
  let best = -1;
  let bestIdx = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = dt[(y + 1) * (w + 2) + (x + 1)];
      if (d > best) {
        best = d;
        bestIdx = y * w + x;
      }
    }
  }
  if (bestIdx < 0) return [Math.floor(h / 2), Math.floor(w / 2)];
  return [(bestIdx / w) | 0, bestIdx % w];
}

/** Count the path commands the upload walls will charge for a d string
 *  (M/L point pairs — matches svg.ts's countPathCommands for this
 *  vocabulary: every pair is one command, M and Z are one each). */
function commandCount(d: string): number {
  let n = 0;
  for (let i = 0; i < d.length; i++) {
    const c = d[i];
    if (c === "M" || c === "L" || c === "Z") n++;
  }
  return n;
}

interface PlannedPath {
  id: string;
  d: string;
  /** "stroke" draws with the pen; "outline" is a closed pen path; "fill"
   *  is the pure fill that follows its outline (the W3 law). */
  kind: "stroke" | "outline" | "fill";
}

export interface TracePlan {
  paths: PlannedPath[];
  viewBox: { w: number; h: number };
  stats: {
    components: number;
    strokes: number;
    fills: number;
    commands: number;
    tolerance: number;
    skippedComponents: number;
  };
}

export const WB_TRACE_TOLERANCE = 1.4; // px — the first RDP pass
export const WB_TRACE_MAX_ROUNDS = 5;
export const WB_TRACE_PATH_COMMANDS = 500; // headroom under the 512 gate
export const WB_TRACE_TOTAL_COMMANDS = 2040; // headroom under the 2,048 gate

/** The house ink (the library's dominant pen) + pen width law (3–7). */
const TRACE_INK = "#1d3557";
const traceStrokeWidth = (w: number, h: number): number =>
  Math.min(7, Math.max(3, Math.round(Math.max(w, h) / 320)));

export class RasterTraceError extends Error {
  readonly code: "empty" | "budget";
  constructor(code: "empty" | "budget", message: string) {
    super(message);
    this.name = "RasterTraceError";
    this.code = code;
  }
}

/** Build one open path's d from a flat [x,y,…] polyline. */
function openPathD(pts: number[]): string {
  let d = `M ${pts[0]} ${pts[1]}`;
  for (let i = 2; i < pts.length; i += 2) d += ` L ${pts[i]} ${pts[i + 1]}`;
  return d;
}

/** Build one closed path's d from a flat [x,y,…] polyline. */
function closedPathD(pts: number[]): string {
  let d = `M ${pts[0]} ${pts[1]}`;
  for (let i = 2; i < pts.length; i += 2) d += ` L ${pts[i]} ${pts[i + 1]}`;
  return d + " Z";
}

/**
 * Simplify one polyline inside the per-path command wall: escalate the
 * tolerance deterministically until the point count fits (a stroke never
 * collapses below its two endpoints).
 */
function simplifyInsidePathWall(pts: number[], tol: number, maxCommands: number): number[] {
  let cur = rdpSimplify(pts, tol);
  let t = tol;
  let guard = 0;
  while (cur.length / 2 - 1 > maxCommands && guard++ < 24) {
    t *= 1.7;
    cur = rdpSimplify(pts, t);
  }
  return cur;
}

/**
 * Drop consecutive duplicate points (the boundary walk can revisit a
 * pixel between laps; a zero-length segment is invisible ink).
 */
function dropConsecutiveDups(pts: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    if (i > 0 && pts[i] === out[out.length - 2] && pts[i + 1] === out[out.length - 1]) continue;
    out.push(pts[i], pts[i + 1]);
  }
  return out;
}

/** Shoelace |area| of a flat [x,y,…] polygon — the degenerate-outline
 *  detector for the fill branch. */
function polygonAbsArea(pts: number[]): number {
  const n = pts.length / 2;
  if (n < 3) return 0;
  let a = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += pts[i * 2] * pts[j * 2 + 1] - pts[j * 2] * pts[i * 2 + 1];
  }
  return Math.abs(a / 2);
}

/**
 * Row-run silhouette polygon: per row, the FIRST and LAST ink pixels of
 * the run holding the row's first ink pixel. Monotone in y — a simple
 * polygon with real winding BY CONSTRUCTION. The deterministic fallback
 * when the boundary walk degenerates (net area ≈ 0) on pathological
 * shapes: a slightly coarser but honest, drawable outline.
 */
function rowRunPolygon(mask: Uint8Array, w: number, h: number): number[] {
  const left: Array<[number, number]> = [];
  const right: Array<[number, number]> = [];
  for (let y = 0; y < h; y++) {
    let first = -1;
    let last = -1;
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) {
        if (first < 0) first = x;
        last = x;
      }
    }
    if (first >= 0) {
      left.push([first, y]);
      right.push([last, y]);
    }
  }
  if (left.length < 3) return [];
  const poly: number[] = [];
  for (const [x, y] of left) poly.push(x, y);
  for (let i = right.length - 1; i >= 0; i--) poly.push(right[i][0], right[i][1]);
  return poly;
}

/** Zhang-Suen never examines a crop's border pixels, and a component's
 *  bbox is TIGHT by construction (ink touches every edge it can) — so a
 *  bar that fills its crop vertically could never thin. Padding the crop
 *  with background before thinning gives the pass room to work; the
 *  coordinates shift back when mapped to full-frame. */
const SKELETON_PAD = 2;

function skeletonizePadded(mask: Uint8Array, w: number, h: number): { skel: Uint8Array; w: number; h: number } {
  const pw = w + SKELETON_PAD * 2;
  const ph = h + SKELETON_PAD * 2;
  const padded = new Uint8Array(pw * ph);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) padded[(y + SKELETON_PAD) * pw + (x + SKELETON_PAD)] = 1;
    }
  }
  return { skel: skeletonize(padded, pw, ph), w: pw, h: ph };
}

/**
 * Build the ordered stroke plan for one tolerance. Deterministic: the
 * component detection, ordering, skeleton tracing and simplification all
 * carry coordinate tie-breaks only.
 */
function buildTracePlan(rgb: Uint8Array, w: number, h: number, tolerance: number): TracePlan {
  const tuning = DEFAULT_COMPONENT_TUNING;
  const gray = toGray(rgb, w, h);
  const threshold = adaptiveInkThreshold(gray);
  const ink = inkFromGray(gray, threshold);
  despeckle(ink, w, h, 8);

  let comps = splitIntoComps(ink, w, h, 0, 0, rgb, w, tuning, 10);
  // The marker-stroke override: a thick elongated pen mark draws as a
  // stroke, not a fill.
  for (const c of comps) {
    if (c.isFill && isMarkerStroke(c)) c.isFill = false;
  }
  // Text merges into word/line blocks BEFORE ordering (the study's order:
  // merge → order), so a sentence draws as blocks in reading order.
  comps = mergeTextBlocks(comps);
  const ordered = sortComponentsLayered(comps);

  const paths: PlannedPath[] = [];
  let skipped = 0;
  let strokeCount = 0;
  let fillCount = 0;
  let pathIndex = 0;

  const emitComp = (comp: Comp): void => {
    const ox = comp.left;
    const oy = comp.top;
    if (comp.isFill) {
      // A region draws as its outline (a closed pen path) followed by its
      // pure fill (the W3 fill-after-outline law). The fill starts at the
      // region's EDT core so its first point is strictly INSIDE the
      // outline polygon (the probe the validator checks containment with)
      // — the spoke contributes no winding and the fill's geometry stays
      // inside the region.
      const contours = traceExternalContours(comp.solid, comp.w, comp.h);
      // The LONGEST walk is the outer cycle (defensive: the state-repeat
      // criterion should yield one full boundary per region).
      let contour: Int32Array | null = contours.length > 0 ? contours[0] : null;
      for (const c of contours) {
        if (contour && c.length > contour.length) contour = c;
      }
      if (!contour || contour.length / 2 < 4) {
        skipped++;
        return;
      }
      const poly: number[] = [];
      for (let i = 0; i < contour.length; i += 2) {
        poly.push(contour[i + 1] + ox, contour[i] + oy); // (y,x) → (x,y)
      }
      const deduped = dropConsecutiveDups(poly);
      let simplified = simplifyInsidePathWall(deduped, tolerance, WB_TRACE_PATH_COMMANDS - 1);
      if (simplified.length / 2 < 4 || polygonAbsArea(simplified) < 1) {
        // Degenerate boundary walk → the row-run silhouette (real winding
        // by construction) keeps the region drawable and the law intact.
        const runPoly = rowRunPolygon(comp.solid, comp.w, comp.h);
        if (runPoly.length / 2 < 4) {
          skipped++;
          return;
        }
        simplified = simplifyInsidePathWall(runPoly, tolerance, WB_TRACE_PATH_COMMANDS - 1);
        if (simplified.length / 2 < 4) {
          skipped++;
          return;
        }
      }
      const id = `p${++pathIndex}`;
      paths.push({ id, d: closedPathD(simplified), kind: "outline" });
      const [cy, cx] = fillCore(comp.solid, comp.w, comp.h);
      const fillPts: number[] = [cx + ox, cy + oy, ...simplified];
      paths.push({ id: `${id}-f`, d: closedPathD(fillPts), kind: "fill" });
      fillCount++;
      return;
    }

    // Line art / text: skeletonize the crop, junction-pair into pen
    // strokes, one path per stroke (the W3 single-subpath law).
    const strokesForComp = (target: Comp): PenStroke[] => {
      const padded = skeletonizePadded(target.mask, target.w, target.h);
      const skelPaths = extractSkeletonPaths(padded.skel, padded.w, padded.h);
      return buildLineArtStrokes(skelPaths);
    };
    // Merged groups draw member-by-member (each glyph its own strokes) in
    // the group's established order; single comps draw directly.
    const members = comp.subComponents
      ? comp.isText
        ? orderTextComponents(comp.subComponents)
        : comp.subComponents
      : [comp];
    for (const member of members) {
      const strokes = strokesForComp(member);
      for (const s of strokes) {
        if (s.count < 2) continue;
        const pts: number[] = [];
        for (let i = 0; i < s.coords.length; i += 2) {
          // skeleton coords are (y,x) in the PADDED crop → full-frame (x,y)
          pts.push(s.coords[i + 1] - SKELETON_PAD + member.left, s.coords[i] - SKELETON_PAD + member.top);
        }
        const simplified = simplifyInsidePathWall(dropConsecutiveDups(pts), tolerance, WB_TRACE_PATH_COMMANDS - 1);
        if (simplified.length / 2 < 2) continue;
        paths.push({ id: `p${++pathIndex}`, d: openPathD(simplified), kind: "stroke" });
        strokeCount++;
      }
    }
  };

  for (const comp of ordered) emitComp(comp);

  let commands = 0;
  for (const p of paths) commands += commandCount(p.d);
  return {
    paths,
    viewBox: { w, h },
    stats: {
      components: ordered.length,
      strokes: strokeCount,
      fills: fillCount,
      commands,
      tolerance,
      skippedComponents: skipped,
    },
  };
}

/**
 * traceRasterToSvgDoc — the S151 entry point: an RGB buffer + dimensions
 * in, an upload-gate-ready SVG document out. Deterministic: identical
 * bytes in, byte-identical document out (pinned by the suite).
 *
 * The escalation loop raises the simplification tolerance until the whole
 * plan fits inside the upload command walls; if even the coarsest round
 * does not fit, the error names the walls readably (the route turns it
 * into a 400 — the gates themselves are never asked to accept a traced
 * asset that breaks them).
 */
export function traceRasterToSvgDoc(
  rgb: Uint8Array,
  w: number,
  h: number,
  ink = TRACE_INK,
): { svg: string; viewBox: { w: number; h: number }; stats: TracePlan["stats"] } {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1 || rgb.length < w * h * 3) {
    throw new RasterTraceError("empty", `the pixel buffer does not match ${w}×${h}×3 (RGB)`);
  }
  let plan: TracePlan | null = null;
  let tolerance = WB_TRACE_TOLERANCE;
  for (let round = 0; round < WB_TRACE_MAX_ROUNDS; round++) {
    plan = buildTracePlan(rgb, w, h, tolerance);
    if (plan.paths.length === 0) {
      throw new RasterTraceError(
        "empty",
        "no drawable ink survived thresholding, despeckle and the component walls — the image reads as blank paper",
      );
    }
    const overPath = plan.paths.some((p) => commandCount(p.d) > WB_TRACE_PATH_COMMANDS);
    if (plan.stats.commands <= WB_TRACE_TOTAL_COMMANDS && !overPath) break;
    tolerance *= 1.7;
  }
  if (!plan) throw new RasterTraceError("budget", "the trace plan never materialized");
  if (plan.stats.commands > WB_TRACE_TOTAL_COMMANDS) {
    throw new RasterTraceError(
      "budget",
      `the traced ink needs ${plan.stats.commands} path commands even at the coarsest simplification — the per-asset wall is ${WB_TRACE_TOTAL_COMMANDS}. Try a cleaner or smaller image`,
    );
  }

  const sw = traceStrokeWidth(w, h);
  const parts: string[] = [];
  for (const p of plan.paths) {
    if (p.kind === "fill") {
      parts.push(`<path id="${p.id}" d="${p.d}" fill="${ink}" stroke="none"/>`);
    } else {
      parts.push(
        `<path id="${p.id}" d="${p.d}" fill="none" stroke="${ink}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`,
      );
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${parts.join("")}</svg>`;
  return { svg, viewBox: { w, h }, stats: plan.stats };
}

// ---------------------------------------------------------------------------
// The transport sniff (route-side): the magic bytes the upload path trusts
// — content-type headers are advisory only (the SVG gate's own law).
// ---------------------------------------------------------------------------

export const WB_TRACE_MAX_BYTES = 8 * 1024 * 1024; // 8 MB raw
export const WB_TRACE_MIN_DIM = 16;
export const WB_TRACE_MAX_DIM = 1280;

export type RasterKind = "png" | "jpeg" | "webp";

/** Gate 2 for rasters — magic-byte sniff (PURE). */
export function sniffRasterKind(raw: Buffer): RasterKind | null {
  if (raw.length >= 8 && raw[0] === 0x89 && raw[1] === 0x50 && raw[2] === 0x4e && raw[3] === 0x47) {
    return "png";
  }
  if (raw.length >= 3 && raw[0] === 0xff && raw[1] === 0xd8 && raw[2] === 0xff) {
    return "jpeg";
  }
  if (
    raw.length >= 12 &&
    raw.toString("ascii", 0, 4) === "RIFF" &&
    raw.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

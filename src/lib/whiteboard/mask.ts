/**
 * Ink mask analysis: thresholding, connected components, distance
 * transform, and stroke/fill/text classification.
 *
 * Ported from the reference engine's `_find_components` / `_build_component`
 * (whiteboard-animator, MIT), replacing scipy/OpenCV with pure TypeScript:
 * - ndimage.label            -> flood-fill labeling (4-connectivity)
 * - cv2.dilate               -> separable 3x3 max filter
 * - distance_transform_edt   -> exact Felzenszwalb squared EDT
 * - cv2.morphologyEx CLOSE   -> dilate-then-erode
 */

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
  /** Seed point on the skeleton (local crop coords), set when traced. */
  skelStart: [number, number] | null;
  skeleton: Uint8Array | null; // lazy, cropped
  /** Members when this comp is a merged group. */
  subComponents?: Comp[];
  /** Group draws members darkest-first (multicolor fill parity). */
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
        Math.round(
          (rgb[i * 3] * 299 + rgb[i * 3 + 1] * 587 + rgb[i * 3 + 2] * 114) / 1000,
        ),
      ),
    );
  }
  return gray;
}

/**
 * Adaptive ink threshold for imperfect inputs (photos, generated
 * images, scans). The reference assumes clean white backgrounds with
 * gray >= 240; real images carry paper texture just below that. If the
 * image is predominantly light (median gray >= 200), pull the ink
 * threshold below the texture band; otherwise keep the default.
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

/**
 * Remove connected ink specks smaller than minArea (paper-texture noise
 * from photos/scans). Runs before component detection so noise never
 * becomes components.
 */
export function despeckle(
  ink: Uint8Array,
  w: number,
  h: number,
  minArea = 8,
): number {
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

/** Snap near-white pixels to pure white (mutates rgb). */
export function enforceWhiteBg(
  rgb: Uint8Array,
  w: number,
  h: number,
  threshold = INK_THRESHOLD,
): void {
  const n = w * h;
  for (let i = 0; i < n; i++) {
    const r = rgb[i * 3];
    const g = rgb[i * 3 + 1];
    const b = rgb[i * 3 + 2];
    const gray = (r * 299 + g * 587 + b * 114) / 1000;
    if (gray >= threshold) {
      rgb[i * 3] = 255;
      rgb[i * 3 + 1] = 255;
      rgb[i * 3 + 2] = 255;
    }
  }
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
export function morphClose(
  mask: Uint8Array,
  w: number,
  h: number,
  iterations = 2,
): Uint8Array {
  let cur = mask;
  for (let i = 0; i < iterations; i++) cur = dilate3x3(cur, w, h);
  for (let i = 0; i < iterations; i++) cur = erode3x3(cur, w, h);
  return cur;
}

/**
 * 4-connected component labeling via flood fill (scipy ndimage.label
 * default parity). Returns labels array (0 = background, 1..n labels).
 */
export function labelComponents(
  mask: Uint8Array,
  w: number,
  h: number,
  connectivity: 4 | 8 = 4,
): { labels: Int32Array; count: number } {
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
      const x = p - y * w;
      const neighbors: number[] = [];
      if (x > 0) neighbors.push(p - 1);
      if (x < w - 1) neighbors.push(p + 1);
      if (y > 0) neighbors.push(p - w);
      if (y < h - 1) neighbors.push(p + w);
      if (connectivity === 8) {
        if (x > 0 && y > 0) neighbors.push(p - w - 1);
        if (x < w - 1 && y > 0) neighbors.push(p - w + 1);
        if (x > 0 && y < h - 1) neighbors.push(p + w - 1);
        if (x < w - 1 && y < h - 1) neighbors.push(p + w + 1);
      }
      for (const q of neighbors) {
        if (mask[q] && !labels[q]) {
          labels[q] = count;
          stack[sp++] = q;
        }
      }
    }
  }
  return { labels, count };
}

/**
 * Exact Euclidean distance transform (Felzenszwalb & Huttenlocher).
 * Returns, for each foreground pixel, the distance to the nearest
 * background pixel (in pixel units), computed on the given mask.
 */
export function distanceTransform(
  mask: Uint8Array,
  w: number,
  h: number,
): Float32Array {
  const INF = 1e18;
  // f[i] = squared distance seed: 0 where background, INF where foreground.
  const f = new Float64Array(w * h);
  for (let i = 0; i < f.length; i++) f[i] = mask[i] ? INF : 0;

  // 1D squared distance transform of a sampled function.
  const dt1d = (func: Float64Array, len: number, out: Float64Array) => {
    // Lower envelope of parabolas; standard Felzenszwalb algorithm.
    const z = new Float64Array(len + 1);
    const v = new Int32Array(len);
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s =
        (func[q] + q * q - (func[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s =
          (func[q] + q * q - (func[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
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

  const cols = new Float64Array(w);
  const tmp = new Float64Array(w);
  // Pass 1: transform each row.
  for (let y = 0; y < h; y++) {
    const row = y * w;
    dt1d(f.subarray(row, row + w) as Float64Array, w, tmp);
    for (let x = 0; x < w; x++) f[row + x] = tmp[x];
  }
  // Pass 2: transform each column.
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

export interface PerimeterResult {
  perimeter: number;
}

/**
 * Perimeter of the ink mask via boundary pixel counting (Chebyshev
 * neighbors): each ink pixel missing a 4-neighbor contributes edge
 * length. Approximates cv2.arcLength for classification parity.
 */
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

/** Chroma (max channel - min channel) stats over ink pixels. */
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
  // correctly even when the component fills its bbox (reference pads by 1).
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
      (maxDepth > tuning.fillDepthThreshold &&
        paRatio < tuning.fillPerimeterAreaThreshold) ||
      (area >= tuning.largeFillArea &&
        maxDepth > tuning.fillDepthThreshold * tuning.largeFillDepthFactor &&
        solidity > tuning.largeFillSolidityMin);
  }

  // Heuristic text classification (CRAFT-free fallback): a single glyph
  // is small in both dimensions, compact, thin and neutral-ink. Only
  // per-glyph smallness keeps geometric strokes (lines, circles) from
  // being misread as handwriting.
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
    skelStart: null,
    skeleton: null,
  };
}

/**
 * Marker-stroke override: a thick elongated pen mark is drawn like a
 * stroke, not painted like a fill (port of `_is_marker_stroke`).
 */
export function isMarkerStroke(comp: Comp): boolean {
  const width = Math.max(comp.right - comp.left + 1, 1);
  const height = Math.max(comp.bottom - comp.top + 1, 1);
  const bboxArea = width * height;
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  const fillRatio = comp.area / Math.max(bboxArea, 1);
  const maxDepth = comp.maxDepth > 0 ? comp.maxDepth : shortSide;
  const elongated =
    longSide >= shortSide * 3.5 && maxDepth <= shortSide * 0.6;
  const sparseBranched = fillRatio <= 0.45 && maxDepth <= longSide * 0.18;
  return shortSide >= 16 && (elongated || sparseBranched);
}

interface BBoxOf {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Split a generic ink mask into its 4-connected pieces and build a Comp
 * for each piece with area >= minArea (port of `_build_connected_components`).
 *
 * maskW/maskH are the dims of the given mask; (offsetX, offsetY) place
 * the mask's origin in full-frame coordinates; rgbFullW is the stride
 * used to sample colors from the full-frame rgb buffer.
 */
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
    // Flood fill this piece, tracking bbox + pixel list.
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
 * Union of component masks → coverage check; residual ink becomes
 * residual comps so no ink pixel is ever dropped (port of the residual
 * sweep at the end of `_find_components`).
 */
export function collectResidual(
  comps: Comp[],
  ink: Uint8Array,
  fullW: number,
  fullH: number,
  rgb: Uint8Array,
  tuning: ComponentTuning,
): Comp[] {
  const covered = new Uint8Array(ink.length);
  for (const comp of comps) {
    for (let y = 0; y < comp.h; y++) {
      const fy = comp.top + y;
      if (fy < 0 || fy >= fullH) continue;
      for (let x = 0; x < comp.w; x++) {
        const fx = comp.left + x;
        if (fx < 0 || fx >= fullW) continue;
        if (comp.mask[y * comp.w + x]) covered[fy * fullW + fx] = 1;
      }
    }
  }
  const residual = new Uint8Array(ink.length);
  let any = false;
  for (let i = 0; i < ink.length; i++) {
    if (ink[i] && !covered[i]) {
      residual[i] = 1;
      any = true;
    }
  }
  if (!any) return [];
  const parts = splitIntoComps(residual, fullW, fullH, 0, 0, rgb, fullW, tuning, 1);
  for (const p of parts) p.isResidual = true;
  return parts;
}

/**
 * Combine several components into one group whose mask spans the union
 * bbox (port of `_build_component_group`). The members stay available
 * as `subComponents` so tracing can slice time across them.
 */
export function buildComponentGroup(
  subComponents: Comp[],
  opts: { isText: boolean; forceFill?: boolean; multicolor?: boolean } ,
): Comp | null {
  if (subComponents.length === 0) return null;
  if (subComponents.length === 1) return subComponents[0];
  const ref = subComponents[0];
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
    skelStart: [top, left],
    skeleton: null,
    subComponents,
    multicolor: !!opts.multicolor,
  };
}

/** Type used by ordering helpers that only need bbox+flags. */
export type BBoxComp = BBoxOf;

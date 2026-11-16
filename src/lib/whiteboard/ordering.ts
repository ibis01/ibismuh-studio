/**
 * Component ordering and spatial grouping.
 *
 * Port of the reference `component_ordering.py` + `_merge_text_blocks`
 * (whiteboard-animator, MIT): the order a hand would draw — containers
 * before contents, reading order via visual line buckets, dots attached
 * to their glyphs, and text merged into word/line blocks.
 */

import { buildComponentGroup } from "./mask";
import type { Comp } from "./mask";

function bboxOf(c: Comp) {
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
 * Bucket indices into top-down visual lines (midpoint-Y proximity with
 * a height-ratio veto), sorted left-to-right within each line, keeping
 * visually adjacent clusters contiguous (port of `line_bucket_indices`).
 */
export function lineBucketIndices(indices: number[], items: Comp[]): number[] {
  if (indices.length === 0) return [];
  const ordered = [...indices].sort(
    (a, b) =>
      (items[a].top + items[a].bottom) / 2 - (items[b].top + items[b].bottom) / 2,
  );

  const lines: Array<{
    midY: number;
    tol: number;
    idxs: number[];
    firstH: number;
    weight: number;
  }> = [];
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
        const last = items[clusters[clusters.length - 1][clusters[clusters.length - 1].length - 1]];
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
 * Reading order: top-down lines, left-to-right, containers emitted
 * before their contents (port of `sort_components_reading_order`).
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
          (components[j].right - components[j].left) *
          (components[j].bottom - components[j].top);
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
 * Move glyph dots (question marks etc.) to draw immediately after the
 * mark they belong to (port of `attach_trailing_dots`).
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

/**
 * Layered order: spatial groups bucketed in reading order, each group
 * drawn contiguously (port of `sort_components_layered`).
 */
export function sortComponentsLayered(components: Comp[]): Comp[] {
  if (components.length === 0) return components;
  const groups = buildSpatialGroups(components);
  const groupOrder = lineBucketIndices([...Array(groups.length).keys()], groups.map((g) => pseudoCompOf(g)));
  const ordered: Comp[] = [];
  for (const gi of groupOrder) {
    ordered.push(...sortComponentsReadingOrder(groups[gi].items));
  }
  return attachTrailingDots(ordered);
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
 * Order text sub-components: lines by vertical overlap, left-to-right
 * within a line (port of `order_text_components`).
 */
export function orderTextComponents(subs: Comp[]): Comp[] {
  const lines: Comp[][] = [];
  for (const sub of [...subs].sort((a, b) => a.top - b.top)) {
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
 * reference's gap thresholds (port of `_merge_text_blocks`).
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
        const ygapThreshold = Math.min(
          ((hi + hj) / 2) * opts.maxLineGapFactor,
          opts.maxLineGapPx,
        );
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

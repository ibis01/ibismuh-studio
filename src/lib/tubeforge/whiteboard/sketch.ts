// S139 — the sketch pass: the derived double-stroke and hatch-fill layer.
//
// The engine's reveal machinery (dash write-on + pen follow) is only as
// beautiful as what it reveals — one clean pass per stroke reads as vector
// art, not hand work. Every reference engine the S139 study cloned lands
// the same lesson: a second, slightly-off re-trace revealed in rhythm (the
// reference Remotion engine's paired main/overdraw strokes) plus a
// scribbled hatch inside filled shapes (the raster engines' crayon/brush
// fills) is what makes ink look PENNED.
//
// Everything here is PURE and DETERMINISTIC: seeds hash from ids (FNV-1a),
// every jitter is a fixed-precision sum of seeded sines, and the same
// asset bytes always produce byte-identical derived markup — the
// determinism anchor law rides through unchanged.
//
// Integration: loadLibrary's register() runs withSketchPasses AFTER the
// glyph-text transform and BEFORE extraction, so the derived paths ride
// the ordinary path machinery — geometry, scheduleScene, the pen follow,
// the page applier, the camera director, the QC lenses. Hands are
// excluded (a hand is not drawn; it draws).
import { pathSegments, totalLength, sampleAtLength, countPathCommands } from "./svg";

/** FNV-1a 32-bit — the seed law: stable across machines and processes. */
export function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
  }
  return h >>> 0;
}

/** Fixed-precision (2dp, trimmed) path numbers — the glyph table's own
 *  discipline, so re-transforms of derived strokes stay stable. */
function fmt2(v: number): string {
  if (!Number.isFinite(v)) return "0";
  let s = v.toFixed(2);
  if (s === "-0.00") s = "0.00";
  s = s.replace(/\.?0+$/, "");
  return s === "-0" ? "0" : s;
}

/** The naturalist dither: resample a path's polyline and offset each
 *  sample perpendicular to the tangent by a seeded sum of two sines,
 *  DAMPED TO ZERO at both endpoints (stroke joints stay continuous —
 *  the pen never teleports between a stroke and its retrace). */
export function strokeDither(d: string, seed: number, amp: number): string {
  const segs = pathSegments(d);
  const L = totalLength(segs);
  if (!(L > 4) || !(amp > 0)) return d;
  const n = Math.max(8, Math.ceil(L / 14));
  const f1 = 2.6 + (seed % 5) * 0.7;
  const f2 = 9 + (seed % 7) * 1.3;
  const ph1 = ((seed >>> 7) % 628) / 100;
  const ph2 = ((seed >>> 13) % 628) / 100;
  let out = "";
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * L;
    const sm = sampleAtLength(segs, s);
    // Damp near the endpoints so dithered re-traces meet their neighbors.
    const damp = Math.min(1, Math.min(s, L - s) / 12);
    const off =
      amp * damp * (0.62 * Math.sin(2 * Math.PI * (s / L) * f1 + ph1) + 0.38 * Math.sin(2 * Math.PI * (s / L) * f2 + ph2));
    const nx = -Math.sin(sm.angle);
    const ny = Math.cos(sm.angle);
    out += (i === 0 ? "M " : "L ") + fmt2(sm.point.x + nx * off) + " " + fmt2(sm.point.y + ny * off) + " ";
  }
  return out.trim();
}

/** The S139 derived-path id suffixes — scheduleScene reads them (an
 *  overdraw retraces FASTER than its main stroke; a hatch scribbles), and
 *  the page applier caps their opacity (a re-trace shadows, never covers). */
export const OVERDRAW_SUFFIX = "-od";
export const HATCH_SUFFIX = "-h";

export interface DerivedPath {
  id: string;
  svg: string;
  /** The path's original id this derivation rides with. */
  of: string;
}

/** The retrace: one dithered second pass over a stroke, seeded from the
 *  asset+path ids. Returns null for paths too short to bear a retrace. */
export function overdrawStroke(assetId: string, pathId: string, d: string, attrs: { stroke?: string; strokeWidth?: number; linecap?: string }): DerivedPath | null {
  const segs = pathSegments(d);
  const len = totalLength(segs);
  if (len < 26 || countPathCommands(d) > 512) return null;
  const seed = fnv1a(`${assetId}::${pathId}${OVERDRAW_SUFFIX}`);
  const amp = Math.max(0.7, Math.min(1.7, len / 210));
  const d2 = strokeDither(d, seed, amp);
  if (!d2 || d2 === d) return null;
  const sw = attrs.strokeWidth && attrs.strokeWidth > 0 ? Math.max(1, attrs.strokeWidth * 0.9) : 3;
  const svg =
    `<path id="${pathId}${OVERDRAW_SUFFIX}" d="${d2}"` +
    ` fill="none" stroke="${attrs.stroke ?? "#1d3557"}" stroke-width="${Math.round(sw * 100) / 100}"` +
    ` stroke-linecap="${attrs.linecap ?? "round"}" stroke-linejoin="round"/>`;
  return { id: `${pathId}${OVERDRAW_SUFFIX}`, svg, of: pathId };
}

/** The hatch: a boustrophedon scribble across a filled shape's bounding
 *  box, CLIPPED to the shape itself (the ink stays inside the outline by
 *  construction — the clip is the shape's own path, namespaced with the
 *  asset like every internal reference). Seeded per shape; the zigzag
 *  spacing follows the box so small fills never drown. */
export function hatchForFill(assetId: string, pathId: string, d: string, fillColor: string): DerivedPath | null {
  if (!fillColor || fillColor === "none" || fillColor.trim() === "") return null;
  const segs = pathSegments(d);
  const len = totalLength(segs);
  if (len < 40 || countPathCommands(d) > 512) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const seg of segs) {
    for (const pt of seg.points) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }
  }
  const w = maxX - minX;
  const h = maxY - minY;
  if (!(w > 16 && h > 16)) return null;
  const seed = fnv1a(`${assetId}::${pathId}${HATCH_SUFFIX}`);
  const spacing = Math.max(7, Math.min(13, h / 12));
  const rows = Math.max(2, Math.floor((h - 4) / spacing));
  let out = "";
  let first = true;
  for (let r = 0; r < rows; r++) {
    const y = minY + 3 + (r + 0.5) * ((h - 6) / rows);
    const leftToRight = r % 2 === 0;
    const x0 = leftToRight ? minX + 2.5 : maxX - 2.5;
    const x1 = leftToRight ? maxX - 2.5 : minX + 2.5;
    const sag = ((seed >>> r) % 5) - 2; // seeded ±2 units row sag
    out += (first ? "M " : "L ") + fmt2(x0) + " " + fmt2(y) + " L " + fmt2(x1) + " " + fmt2(y + sag * 0.4) + " ";
    first = false;
  }
  const clipId = `${pathId}${HATCH_SUFFIX}-clip`;
  const svg =
    `<clipPath id="${clipId}"><path d="${d}"/></clipPath>` +
    `<path id="${pathId}${HATCH_SUFFIX}" d="${out.trim()}" fill="none" stroke="${fillColor}"` +
    ` stroke-width="5.5" stroke-linecap="round" clip-path="url(#${clipId})"/>`;
  return { id: `${pathId}${HATCH_SUFFIX}`, svg, of: pathId };
}

/** Parse one authored path tag's presentation attrs (the extractAsset
 *  regex family, kept local to avoid coupling to the extractor). */
function pathAttrs(tag: string): { stroke?: string; strokeWidth?: number; linecap?: string; fill?: string } {
  const stroke = /\sstroke="([^"]*)"/.exec(tag)?.[1];
  const swRaw = /\sstroke-width="([-\d.]+)"/.exec(tag)?.[1];
  const linecap = /\sstroke-linecap="([^"]*)"/.exec(tag)?.[1];
  const fill = /\sfill="([^"]*)"/.exec(tag)?.[1];
  return {
    ...(stroke !== undefined ? { stroke } : {}),
    ...(swRaw !== undefined ? { strokeWidth: Number(swRaw) } : {}),
    ...(linecap !== undefined ? { linecap } : {}),
    ...(fill !== undefined ? { fill } : {}),
  };
}

export interface SketchPassStats {
  overdraws: number;
  hatches: number;
}

/** withSketchPasses — the one-call asset transform: every STROKE path
 *  gains a seeded retrace; every FILLED path (fill ≠ none) gains a clipped
 *  hatch. Document order is preserved (each derivation lands right after
 *  its source), ids stay inside the WB_ID_RE charset, and hands are the
 *  caller's exclusion (this function never decides). Deterministic:
 *  same svg bytes → byte-identical output. */
export function withSketchPasses(svg: string, assetId: string): { svg: string; stats: SketchPassStats } {
  const stats: SketchPassStats = { overdraws: 0, hatches: 0 };
  // The existing-derivations set: a source path that ALREADY carries its
  // retrace/hatch (the idempotence law — re-running the pass on its own
  // output must be byte-identical) is skipped wholesale.
  const existing = new Set<string>();
  for (const m of svg.matchAll(/\sid="([^"]+)"/g)) existing.add(m[1]);
  const out = svg.replace(/<path\b([^>]*?)\/>/g, (full, tag: string) => {
    const id = /\sid="([^"]+)"/.exec(tag)?.[1];
    const dRaw = /\sd="([^"]+)"/.exec(tag)?.[1];
    if (!id || !dRaw) return full;
    if (id.endsWith(OVERDRAW_SUFFIX) || id.endsWith(HATCH_SUFFIX)) return full; // derived ids never re-derive
    const pieces: string[] = [full];
    if (!existing.has(id + OVERDRAW_SUFFIX)) {
      const attrs = pathAttrs(tag);
      const od = overdrawStroke(assetId, id, dRaw, attrs);
      if (od) {
        pieces.push(od.svg);
        stats.overdraws += 1;
      }
      const fill = attrs.fill;
      if (fill && fill !== "none" && !existing.has(id + HATCH_SUFFIX)) {
        const hatch = hatchForFill(assetId, id, dRaw, fill);
        if (hatch) {
          pieces.push(hatch.svg);
          stats.hatches += 1;
        }
      }
    }
    return pieces.join("");
  });
  return { svg: out, stats };
}

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
//
// S164 — the Rough.js native port rides BEHIND this transform: an asset
// that carries the additive knobs (`roughness`/`bowing`) has its source
// strokes roughened FIRST (the bowing double-stroke line / rough
// Catmull-Rom / ellipse overshoot — roughen.ts), and the S139 derivation
// structure survives ON TOP unchanged (the -od retrace becomes the rough
// double-stroke's overlay pass; the -h hatch becomes the true
// polygon-clipped hachure — fills.ts). ASSENT IS OPT-IN: absent knobs take
// the exact legacy path below, byte for byte (the additive-absent law).
// The roughened source carries a `data-s164="1"` marker so re-running the
// pass on its own output is still byte-identical (the idempotence law).
import { fmt2, flattenSubpathPoints, pathSegments, totalLength, sampleAtLength, countPathCommands } from "./svg";
import { roughenPath, type RoughKnobs } from "./roughen";
import { buildFill, clampFillSpec, MAX_FILL_COMMANDS } from "./fills";

/** FNV-1a 32-bit — the seed law: stable across machines and processes. */
export function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
  }
  return h >>> 0;
}

/** The per-shape seed (S164): fnv1a(assetId::pathId) — every shape derives
 *  its OWN seed from its two stable ids, so changing ONE shape's ids moves
 *  ONLY that shape's roughened geometry (no shared mutable PRNG stream
 *  anywhere downstream: roughen.ts/fills.ts build fresh streams per call). */
export function shapeSeed(assetId: string, pathId: string): number {
  return fnv1a(`${assetId}::${pathId}`);
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

/** S164 — the rough double-stroke's overlay as a derived `-od` path: the
 *  SAME id suffix, the SAME attr law (strokeWidth·0.9, min 1) as the
 *  legacy retrace — only the geometry method upgrades. */
function roughOverlaySvg(pathId: string, d: string, attrs: { stroke?: string; strokeWidth?: number; linecap?: string }): string {
  const sw = attrs.strokeWidth && attrs.strokeWidth > 0 ? Math.max(1, attrs.strokeWidth * 0.9) : 3;
  return (
    `<path id="${pathId}${OVERDRAW_SUFFIX}" d="${d}"` +
    ` fill="none" stroke="${attrs.stroke ?? "#1d3557"}" stroke-width="${Math.round(sw * 100) / 100}"` +
    ` stroke-linecap="${attrs.linecap ?? "round"}" stroke-linejoin="round"/>`
  );
}

/** S164 — the rough fill as a derived `-h` layer: true polygon-clipped
 *  hachure (fills.ts), gap-clamped under the command cap, the SAME clip/
 *  stroke/opacity laws as the legacy hatch (the page applier's -h cap
 *  rides the suffix, not the geometry). */
function roughHatchSvg(assetId: string, pathId: string, d: string, fillColor: string, strokeWidth: number | undefined, knobs: RoughKnobs): string | null {
  const subs = flattenSubpathPoints(d);
  const polygons = subs.map((s) => s.points).filter((p) => p.length >= 3);
  if (polygons.length === 0) return null;
  const len = totalLength(pathSegments(d));
  if (len < 40 || countPathCommands(d) > 512) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of polygons) {
    for (const pt of poly) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }
  }
  if (!(maxX - minX > 16 && maxY - minY > 16)) return null;
  const seed = fnv1a(`${assetId}::${pathId}${HATCH_SUFFIX}`);
  const spec = clampFillSpec(polygons, seed, knobs, { kind: "hachure" }, strokeWidth ?? 3);
  const res = buildFill(polygons, seed, knobs, spec, strokeWidth ?? 3);
  if (!res.d || res.commands > MAX_FILL_COMMANDS) return null; // belt + suspenders under the clamp
  const clipId = `${pathId}${HATCH_SUFFIX}-clip`;
  return (
    `<clipPath id="${clipId}"><path d="${d}"/></clipPath>` +
    `<path id="${pathId}${HATCH_SUFFIX}" d="${res.d}" fill="none" stroke="${fillColor}"` +
    ` stroke-width="5.5" stroke-linecap="round" clip-path="url(#${clipId})"/>`
  );
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
 *  same svg bytes → byte-identical output.
 *
 *  S164 — `knobs` (the additive per-asset `roughness`/`bowing` metadata)
 *  switches the GEOMETRY source to the Rough.js port while the S139
 *  structure (ids, suffixes, clip, attr laws, opacity caps) rides
 *  unchanged on top. Knobs absent ⇒ this function is byte-identical to
 *  the legacy S139 pass (the additive-absent law). */
export function withSketchPasses(svg: string, assetId: string, knobs?: RoughKnobs): { svg: string; stats: SketchPassStats } {
  const stats: SketchPassStats = { overdraws: 0, hatches: 0 };
  const knobActive =
    knobs !== undefined && (knobs.roughness !== undefined || knobs.bowing !== undefined);
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
    const attrs = pathAttrs(tag);
    // S164 — knob-active paths roughen FIRST (the pass rides BEHIND the
    // sketch derivations); the marker keeps re-runs byte-identical.
    if (knobActive && !/\sdata-s164="1"/.test(tag)) {
      const knobsN: RoughKnobs = { roughness: knobs?.roughness, bowing: knobs?.bowing };
      const rp = roughenPath(dRaw, shapeSeed(assetId, id), knobsN);
      if (rp) {
        const pieces: string[] = [full.replace(`d="${dRaw}"`, `d="${rp.main}"`).replace(/\/>$/, ' data-s164="1"/>')];
        if (!existing.has(id + OVERDRAW_SUFFIX) && totalLength(pathSegments(rp.main)) >= 26 && rp.overlay) {
          pieces.push(roughOverlaySvg(id, rp.overlay, attrs));
          stats.overdraws += 1;
        }
        const fill = attrs.fill;
        if (fill && fill !== "none" && !existing.has(id + HATCH_SUFFIX)) {
          const hatch = roughHatchSvg(assetId, id, rp.main, fill, attrs.strokeWidth, knobsN);
          if (hatch) {
            pieces.push(hatch);
            stats.hatches += 1;
          }
        }
        return pieces.join("");
      }
      // roughenPath declined (too small / over budget) — the legacy
      // derivations ride unchanged below (a deterministic decline, so the
      // outcome is stable across re-runs).
    }
    const pieces: string[] = [full];
    if (!existing.has(id + OVERDRAW_SUFFIX)) {
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

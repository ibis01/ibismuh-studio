// S126 — the external import lane's PURE gates (docs/design/s126-import-lane.md
// §2, the E11 seven-gate battery's raster twin). The route orchestrates;
// this module owns the sniff/alpha/budget arithmetic — no fs, no ffmpeg, no
// clock: everything decidable from the bytes and the declaration.
//
// THE ONE-LANE LAW: three accepted import FORMATS normalize to ONE runtime
// representation (sheet | sequence) at admission — a WebM source is decoded
// to alpha PNG frames by the ROUTE (the decode IS the raster probe); the
// runtime never sees a video clock. The pure gates here cover the
// header-decidable checks; the ffmpeg probes live in the route.
//
// THE ALPHA LAW: the lane exists for alpha compositing — a fully opaque
// raster is refused with a named reason (the graphics shape/icon grammar is
// the vector path; an opaque image is not an import).

import { GRAPHICS_BUDGETS } from "./types";

/** The named walls — the import lane's own table (the route's messages cite
 *  these numbers, never invented ones). */
export const IMPORT_WALLS = {
  /** Per-file byte caps. */
  sheetBytesMax: 8 * 1024 * 1024,
  webmBytesMax: 48 * 1024 * 1024,
  frameBytesMax: 2 * 1024 * 1024,
  /** The frame-count wall — the grammar's spriteFramesMax mirrored. */
  framesMax: GRAPHICS_BUDGETS.spriteFramesMax,
  /** Per-frame pixel walls. */
  dimMax: 4096,
  /** The sheet strip's decoded width wall (chromium's safe raster band). */
  sheetWidthMax: 16_384,
  /** The sequence's frame-size uniformity is exact (mixed sizes refuse). */
  sequenceUniform: true,
  /** Quota walls (gate 6 — the ONE quota surface; bytes ride put). */
  importsPerVideo: 8,
  importsPerOrg: 24,
} as const;

export type ImportSniffKind = "png" | "webp" | "webm" | null;

/** Magic-byte sniff — never extension trust (gate 2). */
export function sniffImportKind(bytes: Buffer): ImportSniffKind {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "png";
  }
  if (bytes.length >= 12 && bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP") {
    return "webp";
  }
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return "webm";
  }
  return null;
}

export interface PngHeader {
  width: number;
  height: number;
  /** true when the header declares alpha (color types 4/6) or carries a
   *  tRNS chunk (palette transparency). */
  hasAlpha: boolean;
}

/** The PNG IHDR parse + the tRNS presence scan (gate 3, PNG flavor). Pure;
 *  null on a malformed header (the caller refuses with the named reason). */
export function parsePngHeader(bytes: Buffer): PngHeader | null {
  if (sniffImportKind(bytes) !== "png") return null;
  // IHDR: signature (8) + length (4) + "IHDR" (4) + data (13).
  if (bytes.length < 8 + 4 + 4 + 13 + 4) return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const colorType = bytes[25];
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const bitDepth = bytes[24];
  // Color types: 0 gray, 2 rgb, 3 palette, 4 gray+alpha, 6 rgba. Bit depth
  // must be one of the spec's values (1,2,4,8,16) — a junk header refuses.
  if (![1, 2, 4, 8, 16].includes(bitDepth)) return null;
  if (![0, 2, 3, 4, 6].includes(colorType)) return null;
  const hasAlpha = colorType === 4 || colorType === 6 || hasTrnsChunk(bytes);
  return { width, height, hasAlpha };
}

/** The tRNS chunk scan — palette transparency carries alpha too. Pure. */
function hasTrnsChunk(bytes: Buffer): boolean {
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const len = bytes.readUInt32BE(offset);
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    if (type === "tRNS") return true;
    if (type === "IDAT") return false; // tRNS precedes IDAT by spec
    offset += 12 + len;
  }
  return false;
}

/** The WebP VP8X parse (gate 3, WebP flavor): alpha requires the VP8X
 *  chunk (the ALPHA flag, byte 4 bit 4 of the chunk's flags). Simple
 *  lossy/lossless WebP has no alpha stream — refused with the named
 *  reason. Pure; null on a malformed header. */
export function parseWebpHeader(bytes: Buffer): PngHeader | null {
  if (sniffImportKind(bytes) !== "webp") return null;
  // RIFF size at 4..8; the first chunk's FourCC at 12.
  const fourcc = bytes.toString("latin1", 12, 16);
  if (fourcc === "VP8X") {
    // VP8X payload: 4 flags bytes + 3×(canvas minus one) LE.
    if (bytes.length < 30) return null;
    const flags = bytes[20];
    const hasAlpha = (flags & 0x10) !== 0;
    const wMinus1 = bytes[24] | (bytes[25] << 8) | (bytes[26] << 16);
    const hMinus1 = bytes[27] | (bytes[28] << 8) | (bytes[29] << 16);
    return { width: wMinus1 + 1, height: hMinus1 + 1, hasAlpha };
  }
  // VP8 / VP8L — no VP8X: no alpha stream (VP8L's own alpha bit is the
  // lossless format; the lane's sheets are alpha-first — refuse honestly).
  return { width: 0, height: 0, hasAlpha: false };
}

/** Validate a sprite-sheet import (gates 3–4, header-decidable half): the
 *  header parses, alpha is present, dims inside the walls, the declared
 *  frames divide the strip evenly, the strip fits the decode wall. */
export function validateSheetImport(
  bytes: Buffer,
  declaredFrames: number
): { ok: true; frameW: number; frameH: number; mime: "image/png" | "image/webp" } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const kind = sniffImportKind(bytes);
  if (kind !== "png" && kind !== "webp") {
    errors.push(`the sheet is ${kind ?? "an unrecognized format"} — a sprite sheet is a PNG (or alpha WebP)`);
    return { ok: false, errors };
  }
  if (bytes.length > IMPORT_WALLS.sheetBytesMax) {
    errors.push(`the sheet is ${Math.round(bytes.length / 1024 / 1024)} MB — the cap is ${IMPORT_WALLS.sheetBytesMax / 1024 / 1024} MB`);
    return { ok: false, errors };
  }
  const header = kind === "png" ? parsePngHeader(bytes) : parseWebpHeader(bytes);
  if (header === null) {
    errors.push("the image header is malformed — the gates refuse, never guess");
    return { ok: false, errors };
  }
  if (!header.hasAlpha) {
    errors.push("the sheet carries no alpha channel — the import lane composites transparency; an opaque raster is refused (use the graphics shape grammar)");
    return { ok: false, errors };
  }
  if (header.width <= 0 || header.height <= 0 || header.width > IMPORT_WALLS.sheetWidthMax || header.height > IMPORT_WALLS.dimMax) {
    errors.push(`the sheet is ${header.width}x${header.height} — outside the walls (${IMPORT_WALLS.sheetWidthMax}x${IMPORT_WALLS.dimMax})`);
    return { ok: false, errors };
  }
  if (!Number.isInteger(declaredFrames) || declaredFrames < 1 || declaredFrames > IMPORT_WALLS.framesMax) {
    errors.push(`frames must be an integer 1..${IMPORT_WALLS.framesMax} — got ${declaredFrames}`);
    return { ok: false, errors };
  }
  if (header.width % declaredFrames !== 0) {
    errors.push(`the sheet width ${header.width} does not divide evenly into ${declaredFrames} frames — a strip is frames × frameW`);
    return { ok: false, errors };
  }
  const frameW = header.width / declaredFrames;
  if (frameW * declaredFrames > IMPORT_WALLS.sheetWidthMax) {
    errors.push(`the strip decodes at ${frameW * declaredFrames}px — past the ${IMPORT_WALLS.sheetWidthMax} wall`);
    return { ok: false, errors };
  }
  return { ok: true, frameW, frameH: header.height, mime: kind === "png" ? "image/png" : "image/webp" };
}

/** Validate ONE sequence frame (gates 3–4, PNG only — the decode produces
 *  PNGs; user sequences are PNGs too). Returns the header for the route's
 *  uniformity check. */
export function validateSequenceFrame(
  bytes: Buffer
): { ok: true; width: number; height: number; hasAlpha: boolean } | { ok: false; errors: string[] } {
  if (sniffImportKind(bytes) !== "png") {
    return { ok: false, errors: ["sequence frames are PNGs (a WebM source is decoded by the lane itself)"] };
  }
  if (bytes.length > IMPORT_WALLS.frameBytesMax) {
    return { ok: false, errors: [`the frame is ${Math.round(bytes.length / 1024)} KB — the per-frame cap is ${IMPORT_WALLS.frameBytesMax / 1024} KB`] };
  }
  const header = parsePngHeader(bytes);
  if (header === null) return { ok: false, errors: ["the frame header is malformed"] };
  if (!header.hasAlpha) {
    return { ok: false, errors: ["the frame carries no alpha — an opaque raster is refused"] };
  }
  if (header.width <= 0 || header.height <= 0 || header.width > IMPORT_WALLS.dimMax || header.height > IMPORT_WALLS.dimMax) {
    return { ok: false, errors: [`the frame is ${header.width}x${header.height} — outside the ${IMPORT_WALLS.dimMax} walls`] };
  }
  return { ok: true, width: header.width, height: header.height, hasAlpha: header.hasAlpha };
}

/** The fps snap — the shared-timebase normalization law (D3): a measured
 *  rate lands on the NEAREST of 24|30 (ties snap down to 24 — film tempo). */
export function snapFps(measured: number): 24 | 30 {
  if (!Number.isFinite(measured) || measured <= 0) return 24;
  return Math.abs(measured - 24) <= Math.abs(measured - 30) ? 24 : 30;
}

/** The provenance shape — user-declared, length-capped (the reception
 *  record's binding rule: imported assets are provenance-tagged per
 *  asset; absent is legal, junk-length is not). */
export function sanitizeProvenance(raw: { source?: unknown; license?: unknown }): { source: string | null; license: string | null; warnings: string[] } {
  const warnings: string[] = [];
  const cut = (v: unknown, cap: number, what: string): string | null => {
    if (v === undefined || v === null) return null;
    if (typeof v !== "string") {
      warnings.push(`provenance ${what} dropped — not a string`);
      return null;
    }
    const t = v.trim();
    if (!t) return null;
    if (t.length > cap) {
      warnings.push(`provenance ${what} clamped to ${cap} chars`);
      return t.slice(0, cap);
    }
    return t;
  };
  return {
    source: cut(raw.source, 300, "source"),
    license: cut(raw.license, 120, "license"),
    warnings,
  };
}

/** The id minted for an import — url-safe, deterministic from the video +
 *  a nonce the route owns. Shape-checked by the doc grammar's id law. */
export function importIdShape(id: string): boolean {
  return /^[a-z0-9][a-z0-9-]{2,40}$/.test(id);
}

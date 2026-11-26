// Uploaded-image byte inspection — the S43 format catalog (PNG / JPEG /
// WebP / HEIC incl. iPhone collection brands) and the WASM HEIC decode.
// Lives BELOW the story/characters graph so every upload seam (Scene
// Studio, S51 reference photos) shares one sniffer without import cycles.

/** The ftyp box carries the brand: bytes 4-8 "ftyp", brand at 8-12 —
 * heic/heix/hevc (photos), mif1/msf1 (image collections iPhone photos also
 * use), heim/heis (media collections). Decoding is NOT ffmpeg's job here —
 * stock builds ship without libheif — but the WASM heic-convert pass in
 * decodeHeicPng. */
const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "heim", "heis", "mif1", "msf1"]);

export function sniffImageFormat(buf: Buffer): "png" | "jpeg" | "webp" | "heic" | null {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return "png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (
    buf.length > 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "webp";
  if (
    buf.length > 12 &&
    buf.subarray(4, 8).toString("ascii") === "ftyp" &&
    HEIF_BRANDS.has(buf.subarray(8, 12).toString("ascii"))
  )
    return "heic";
  return null;
}

/** Decode HEIC/HEIF bytes to PNG via the WASM libheif build (heic-convert).
 * Stock ffmpeg ships without libheif on most distros (including the CI
 * image), so the decode rides a pure-WASM pass instead — same output
 * everywhere, no native dependency. Returns PNG bytes.
 *
 * API note (v2.1.0): convert() resolves to the encoded image Buffer
 * DIRECTLY — there is no {buffer} wrapper. Reaching for `.buffer` on it
 * grabs the Buffer-pool ArrayBuffer behind it (64 KB of unrelated memory),
 * which once aliased the input HEIC and produced a "PNG" that was still
 * HEIC bytes.
 *
 * Decompression wall (the audit's F-6): the WASM decoder expands raw bytes
 * into an RGBA frame with no ceiling of its own — a crafted ≤15 MB HEIC can
 * declare enormous `ispe` dimensions and balloon memory before any other
 * wall runs. The dims are parsed from the `ispe` box BEFORE convert() and
 * refused past the cap (the whiteboard raster lane's dimension law). */
export const HEIC_MAX_PIXELS = 64_000_000; // ≈ 8k × 8k — 256 MB RGBA worst case

export async function decodeHeicPng(upload: Buffer): Promise<Buffer> {
  const dims = heicPrimaryDims(upload);
  if (dims && dims.width * dims.height > HEIC_MAX_PIXELS) {
    throw new Error(
      `Image exceeds the ${Math.round(HEIC_MAX_PIXELS / 1_000_000)} megapixel limit (${dims.width}×${dims.height}) — downscale it first`
    );
  }
  // Lazy import: the WASM module only enters the process graph when a HEIC
  // actually arrives (cold start stays free for everyone else).
  const convert = (await import("heic-convert")).default;
  const out = await convert({ buffer: upload, format: "PNG" });
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}

/** Parse the PRIMARY item's declared pixel dimensions from the `ispe` box
 * (ISO BMFF): walk top-level boxes → `meta` → `iprp` → `ipco` → `ispe`.
 * Pure, allocation-light; returns null when the box layout is absent or
 * malformed (the decode then proceeds — heic-convert owns its own errors). */
export function heicPrimaryDims(buf: Buffer): { width: number; height: number } | null {
  const u32 = (off: number): number | null =>
    off + 4 <= buf.length ? buf.readUInt32BE(off) : null;
  let off = 0;
  // top-level boxes: [size(4) type(4) payload]
  while (off + 8 <= buf.length) {
    let size = u32(off);
    if (size === null) return null;
    const type = buf.toString("latin1", off + 4, off + 8);
    let headerLen = 8;
    if (size === 1) {
      // 64-bit largesize follows the type
      if (off + 16 > buf.length) return null;
      const hi = buf.readUInt32BE(off + 8);
      const lo = buf.readUInt32BE(off + 12);
      size = hi * 4294967296 + lo;
      headerLen = 16;
    } else if (size === 0) {
      size = buf.length - off; // extends to EOF
    }
    if (size < headerLen) return null;
    if (type === "meta") {
      // meta is a full box; skip its 4-byte version/flags
      return walkMeta(off + headerLen + 4, Math.min(off + size, buf.length));
    }
    off += size;
  }
  return null;

  function walkMeta(start: number, end: number): { width: number; height: number } | null {
    let o = start;
    while (o + 8 <= end) {
      const size = u32(o);
      if (size === null || size < 8) return null;
      const type = buf.toString("latin1", o + 4, o + 8);
      if (type === "iprp") return walkChildren(o + 8, Math.min(o + size, end));
      o += size;
    }
    return null;
  }

  function walkChildren(start: number, end: number): { width: number; height: number } | null {
    let o = start;
    while (o + 8 <= end) {
      const size = u32(o);
      if (size === null || size < 8) return null;
      const type = buf.toString("latin1", o + 4, o + 8);
      const body = o + 8;
      if (type === "ipco") return walkChildren(body, Math.min(o + size, end));
      if (type === "ispe") {
        // version/flags (4) + width (4) + height (4)
        const width = u32(body + 4);
        const height = u32(body + 8);
        if (width && height && width > 0 && height > 0) return { width, height };
        return null;
      }
      o += size;
    }
    return null;
  }
}

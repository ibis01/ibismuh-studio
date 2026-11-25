// image.ts — the image-generation provider wrapper (backend-only; z-ai-web-dev-sdk).
//
// One door for board/scene art: prompt + aspect in, PNG bytes out. Aspect
// ids map onto the provider's supported sizes; the returned dimensions are
// read from the PNG IHDR (never trusted from the request). THE LAW: never
// throws — any provider or decode failure surfaces as null so the pipeline
// can take its declared gradient-board fallback.

import ZAI from "z-ai-web-dev-sdk";

export interface ImageResult {
  png: Uint8Array;
  width: number;
  height: number;
  /** The REAL payload format — the provider sends PNG or JPEG per call. */
  mime: "image/png" | "image/jpeg";
  ext: "png" | "jpg";
}

const ASPECT_SIZES: Record<"16:9" | "9:16" | "1:1", "1344x768" | "768x1344" | "1024x1024"> = {
  "16:9": "1344x768",
  "9:16": "768x1344",
  "1:1": "1024x1024",
};

export async function generateImage(
  prompt: string,
  aspect: "16:9" | "9:16" | "1:1",
): Promise<{ image: ImageResult | null; error: string | null }> {
  try {
    const clean = prompt.trim();
    if (clean.length === 0) return { image: null, error: "empty prompt" };
    const size = ASPECT_SIZES[aspect];
    const zai = await ZAI.create();
    const response = await zai.images.generations.create({ prompt: clean, size });
    const base64: unknown = response?.data?.[0]?.base64;
    if (typeof base64 !== "string" || base64.length === 0) {
      return { image: null, error: "provider returned no image payload" };
    }
    const png = decodeBase64(base64);
    if (png === null) return { image: null, error: "base64 decode failed" };
    const dims = readImageSize(png);
    if (dims === null) return { image: null, error: "payload is not a decodable PNG/JPEG" };
    const isPng = dims.mime === "image/png";
    return {
      image: { png, width: dims.width, height: dims.height, mime: dims.mime, ext: isPng ? "png" : "jpg" },
      error: null,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { image: null, error: message.slice(0, 300) };
  }
}

/** atob-based decode — keeps this module free of node-only globals. */
function decodeBase64(base64: string): Uint8Array | null {
  try {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** Detect PNG (signature) or JPEG (FF D8 FF) and read real dimensions. */
function readImageSize(bytes: Uint8Array): { width: number; height: number; mime: "image/png" | "image/jpeg" } | null {
  if (bytes.length < 24) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16, false);
    const height = view.getUint32(20, false);
    if (width === 0 || height === 0) return null;
    return { width, height, mime: "image/png" };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = bytes[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
        i += 2;
        continue;
      }
      const len = view.getUint16(i + 2, false);
      // SOF0..SOF15 (except DHT/JPG/DAC markers) carries the frame geometry.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const height = view.getUint16(i + 5, false);
        const width = view.getUint16(i + 7, false);
        if (width === 0 || height === 0) return null;
        return { width, height, mime: "image/jpeg" };
      }
      i += 2 + len;
    }
    return null;
  }
  return null;
}

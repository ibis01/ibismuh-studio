/**
 * Browser-side helpers: decode an image file/data URL into the
 * downscaled RGB buffer the analyzer expects (max 1280 on the long
 * side, mirroring the reference's MAX_DIM).
 */

export const CLIENT_MAX_DIM = 1280;

export interface DecodedImage {
  width: number;
  height: number;
  rgb: Uint8Array;
  dataUrl: string;
}

export async function decodeToRgb(
  source: File | Blob | string,
): Promise<DecodedImage> {
  let bitmap: ImageBitmap;
  let dataUrl: string;
  if (typeof source === "string") {
    // Fetch (URL path or data URL) and normalize to a data URL so the
    // persistence and server-analysis APIs always receive a data URL.
    const res = await fetch(source);
    const blob = await res.blob();
    bitmap = await createImageBitmap(blob);
    dataUrl = await blobToDataUrl(blob);
  } else {
    bitmap = await createImageBitmap(source);
    dataUrl = await blobToDataUrl(source);
  }

  const scale = Math.min(
    1,
    CLIENT_MAX_DIM / Math.max(bitmap.width, bitmap.height),
  );
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const rgba = ctx.getImageData(0, 0, w, h).data;
  const rgb = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    rgb[i * 3] = rgba[i * 4];
    rgb[i * 3 + 1] = rgba[i * 4 + 1];
    rgb[i * 3 + 2] = rgba[i * 4 + 2];
  }
  return { width: w, height: h, rgb, dataUrl };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("failed to read file"));
    reader.readAsDataURL(blob);
  });
}

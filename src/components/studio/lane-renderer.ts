// lane-renderer.ts — per-lane canvas frame painters (PURE — no React, no DOM
// except the hidden SVG path-length probe, no fetch, no state).
//
// Preview/final parity: these painters consume the SAME documents the render
// pipeline does — plan.timeline.ops + plan.beats + the lane doc scenes — and
// render exactly what the ops say. Where provider art is missing they draw
// the lane's DECLARED fallback (gradient boards) instead of inventing a
// silent stand-in, and every frame carries the PREVIEW watermark.

import type { AssetDTO } from "@/lib/ibismuh/api-dto";
import type { PlanBeat, VideoPlanEnvelope } from "@/lib/ibismuh/plan-envelope";
import type { TimelineOp } from "@/lib/ibismuh/timeline-ops";
import type { LaneScene } from "@/lib/ibismuh/planner-types";
import type { VideoType } from "@/lib/ibismuh/studio-lanes";

// ---------- render context ----------

export interface FrameRenderCtx {
  plan: VideoPlanEnvelope;
  lane: VideoType;
  scenes: LaneScene[];
  /** DTO assets — the browser-fetchable ones (AssetDTO.url serves bytes). */
  assets: AssetDTO[];
  /** Preloaded image cache keyed by asset url. */
  images: Map<string, HTMLImageElement>;
  accentHex: string;
}

// ---------- image cache (shared by the preview player + static frames) ----------

/**
 * Module-level image cache keyed by asset url. The preview player preloads
 * into it; every FrameRenderCtx shares the same map so workspace stills and
 * the player agree on the same decoded frames.
 */
export const imageCache = new Map<string, HTMLImageElement>();

/** Begin loading every url not yet cached. Returns how many loads started. */
export function preloadImages(urls: string[], onSettled: () => void): number {
  let started = 0;
  for (const url of urls) {
    if (imageCache.has(url)) continue;
    const img = new Image();
    started++;
    img.onload = onSettled;
    img.onerror = onSettled;
    img.src = url;
    imageCache.set(url, img);
  }
  return started;
}

// ---------- small math helpers ----------

export function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

export function easeInOut(p: number): number {
  const t = clamp01(p);
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * clamp01(k);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return { r: 232, g: 182, b: 76 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function hexAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${clamp01(alpha)})`;
}

function pathRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

function safeJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ---------- document queries ----------

export function totalDurationMs(plan: VideoPlanEnvelope | null): number {
  if (!plan) return 0;
  let end = 0;
  for (const beat of plan.beats) end = Math.max(end, beat.narrationWindow.endMs);
  for (const op of plan.timeline.ops) end = Math.max(end, op.endMs);
  if (plan.audioReceipt) end = Math.max(end, plan.audioReceipt.durationMs);
  return end;
}

export function currentBeat(plan: VideoPlanEnvelope, tMs: number): PlanBeat | null {
  let found: PlanBeat | null = null;
  for (const beat of plan.beats) {
    if (tMs >= beat.narrationWindow.startMs) found = beat;
    else break;
  }
  return found;
}

/** Ops whose window contains tMs (start <= t < end; zero-length ops count at t == start). */
export function opsActiveAt(ops: TimelineOp[], tMs: number): TimelineOp[] {
  return ops.filter((op) => op.startMs <= tMs && (tMs < op.endMs || (op.startMs === op.endMs && tMs === op.startMs)));
}

export function sceneById(scenes: LaneScene[], ref: string | null | undefined): LaneScene | null {
  if (!ref) return null;
  return scenes.find((s) => s.id === ref) ?? null;
}

/** The image asset bound to a scene (preview binding: AssetDTO.sceneRef). */
function imageAssetForScene(assets: AssetDTO[], sceneRef: string | null | undefined): AssetDTO | null {
  if (!sceneRef) return null;
  return assets.find((a) => a.kind === "image" && a.sceneRef === sceneRef) ?? null;
}

interface CameraRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function kenBurnsProgress(op: TimelineOp, tMs: number, easing: string): number {
  const span = Math.max(1, op.endMs - op.startMs);
  const p = clamp01((tMs - op.startMs) / span);
  return easing === "linear" ? p : easeInOut(p);
}

function drawCoverKenBurns(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  rect: CameraRect,
): void {
  const imgW = img.naturalWidth || img.width;
  const imgH = img.naturalHeight || img.height;
  if (imgW === 0 || imgH === 0) return;
  const baseScale = Math.max(w / imgW, h / imgH);
  const fittedW = imgW * baseScale;
  const fittedH = imgH * baseScale;
  const ox = (w - fittedW) / 2;
  const oy = (h - fittedH) / 2;
  // Visible camera window inside the cover-fitted frame, mapped back to image px.
  const vx = ox + rect.x * fittedW;
  const vy = oy + rect.y * fittedH;
  const vw = Math.max(1, rect.w * fittedW);
  const vh = Math.max(1, rect.h * fittedH);
  const sx = (vx - ox) / baseScale;
  const sy = (vy - oy) / baseScale;
  const sw = vw / baseScale;
  const sh = vh / baseScale;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
}

// ---------- shared painting pieces ----------

function wrapTextLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
      if (lines.length >= maxLines) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

function fitFontSize(ctx: CanvasRenderingContext2D, text: string, weight: string, maxPx: number, minPx: number, maxWidth: number): number {
  let size = maxPx;
  for (; size > minPx; size -= 2) {
    ctx.font = `${weight} ${size}px ${STUDIO_SANS}`;
    if (ctx.measureText(text).width <= maxWidth) break;
  }
  return size;
}

const STUDIO_SANS = "'Geist Sans', 'Inter', system-ui, sans-serif";
const STUDIO_MONO = "'Geist Mono', ui-monospace, monospace";
const BOARD_SPACE = { w: 1280, h: 720 };

function drawGradientBoard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  scene: LaneScene | null,
  accent: string,
): void {
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#231d18");
  grad.addColorStop(1, hexAlpha(accent, 0.28));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // soft accent glow
  const glow = ctx.createRadialGradient(w / 2, h * 0.42, 10, w / 2, h * 0.42, Math.max(w, h) * 0.6);
  glow.addColorStop(0, hexAlpha(accent, 0.22));
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  const index = (scene?.index ?? 0) + 1;
  ctx.fillStyle = hexAlpha(accent, 0.85);
  ctx.font = `700 ${Math.round(h * 0.34)}px ${STUDIO_SANS}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(index), w / 2, h * 0.36);

  const intent = scene?.visualIntent ?? "awaiting plan";
  ctx.font = `500 ${Math.round(h * 0.036)}px ${STUDIO_SANS}`;
  ctx.fillStyle = "rgba(244, 244, 245, 0.92)";
  const lines = wrapTextLines(ctx, intent, w * 0.72, 3);
  lines.forEach((line, i) => {
    ctx.fillText(line, w / 2, h * 0.62 + i * h * 0.05);
  });
  ctx.font = `500 ${Math.round(Math.max(11, h * 0.02))}px ${STUDIO_MONO}`;
  ctx.fillStyle = "rgba(244, 244, 245, 0.5)";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("gradient board — declared fallback (no provider art)", 16, h - 16);
}

function drawCaptionBar(ctx: CanvasRenderingContext2D, w: number, h: number, text: string): void {
  if (!text) return;
  const fontSize = Math.max(20, Math.round(h * 0.042));
  ctx.font = `500 ${fontSize}px ${STUDIO_SANS}`;
  const lines = wrapTextLines(ctx, text, w * 0.82, 2);
  if (lines.length === 0) return;
  const lineH = fontSize * 1.35;
  const padX = fontSize * 0.9;
  const padY = fontSize * 0.55;
  const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const boxW = Math.min(w * 0.9, widest + padX * 2);
  const boxH = lines.length * lineH + padY * 2;
  const boxX = (w - boxW) / 2;
  const boxY = h - boxH - h * 0.05;
  const radius = Math.min(14, boxH / 2);
  pathRoundRect(ctx, boxX, boxY, boxW, boxH, radius);
  ctx.fillStyle = "rgba(12, 10, 8, 0.66)";
  ctx.fill();
  ctx.fillStyle = "#f4f4f5";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((line, i) => {
    ctx.fillText(line, w / 2, boxY + padY + lineH * (i + 0.5));
  });
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function drawTransitionOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, op: TimelineOp, tMs: number): void {
  const style = String(op.params?.style ?? "cut");
  if (style === "cut") return;
  const duration = Math.max(1, Number(op.params?.durationMs ?? 400));
  const p = clamp01((tMs - op.startMs) / duration);
  const alpha = 1 - p;
  if (alpha <= 0.01) return;
  if (style === "fadeblack") {
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  } else if (style === "dissolve") {
    ctx.fillStyle = `rgba(20, 18, 16, ${alpha * 0.85})`;
  } else {
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.7})`;
  }
  ctx.fillRect(0, 0, w, h);
}

function drawWatermark(ctx: CanvasRenderingContext2D, w: number, lane: VideoType): void {
  const label = `PREVIEW · ${lane}`;
  ctx.font = `500 10px ${STUDIO_MONO}`;
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = "rgba(10, 8, 6, 0.55)";
  ctx.fillRect(8, 8, tw + 12, 18);
  ctx.fillStyle = "rgba(244, 244, 245, 0.78)";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 14, 17);
  ctx.textBaseline = "alphabetic";
}

// ---------- SVG path-length probe (whiteboard stroke reveal) ----------

const SVG_NS = "http://www.w3.org/2000/svg";
const pathProbeCache = new Map<string, { el: SVGPathElement; len: number }>();

function probePath(d: string): { el: SVGPathElement; len: number } | null {
  const cached = pathProbeCache.get(d);
  if (cached) return cached;
  try {
    const el = document.createElementNS(SVG_NS, "path");
    el.setAttribute("d", d);
    const len = el.getTotalLength();
    if (!Number.isFinite(len) || len <= 0) return null;
    const entry = { el, len };
    pathProbeCache.set(d, entry);
    return entry;
  } catch {
    return null;
  }
}

// ---------- lane painter: classic / story (Ken Burns compositor) ----------

function drawKenBurnsScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  tMs: number,
  rc: FrameRenderCtx,
  beat: PlanBeat | null,
): void {
  const scene = sceneById(rc.scenes, beat?.sceneRef ?? null);
  const ops = rc.plan.timeline.ops;
  const showOps = ops.filter(
    (op) => op.op === "showAsset" && op.sceneRef === (beat?.sceneRef ?? undefined),
  );
  const showOp = showOps[showOps.length - 1] ?? null;
  const asset = imageAssetForScene(rc.assets, beat?.sceneRef ?? null);
  const img = asset ? rc.images.get(asset.url) : undefined;

  if (showOp && img) {
    // current camera pose: the active cameraMove op for this scene, eased
    const camOps = ops.filter((op) => op.op === "cameraMove" && op.sceneRef === (beat?.sceneRef ?? undefined));
    const activeCam = opsActiveAt(camOps, tMs)[0] ?? null;
    let rect: CameraRect = { x: 0, y: 0, w: 1, h: 1 };
    if (activeCam) {
      const start = safeJson<CameraRect | null>(activeCam.params?.start, null);
      const end = safeJson<CameraRect | null>(activeCam.params?.end, null);
      if (start && end) {
        const k = kenBurnsProgress(activeCam, tMs, String(activeCam.params?.easing ?? "smooth"));
        rect = {
          x: lerp(start.x, end.x, k),
          y: lerp(start.y, end.y, k),
          w: lerp(start.w, end.w, k),
          h: lerp(start.h, end.h, k),
        };
      }
    }
    ctx.fillStyle = "#0e0c0a";
    ctx.fillRect(0, 0, w, h);
    drawCoverKenBurns(ctx, img, w, h, rect);
  } else {
    // DECLARED fallback: no provider art yet — the gradient board carries the scene.
    drawGradientBoard(ctx, w, h, scene, rc.accentHex);
  }
}

// ---------- lane painter: whiteboard ----------

function drawWhiteboardFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  tMs: number,
  rc: FrameRenderCtx,
  beat: PlanBeat | null,
): void {
  // paper + subtle grid
  ctx.fillStyle = "#f7f4ed";
  ctx.fillRect(0, 0, w, h);
  const gridStep = Math.max(24, Math.round(w / 32));
  ctx.strokeStyle = "rgba(31, 41, 55, 0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = gridStep; x < w; x += gridStep) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = gridStep; y < h; y += gridStep) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();

  const scale = Math.min(w / BOARD_SPACE.w, h / BOARD_SPACE.h);
  const offX = (w - BOARD_SPACE.w * scale) / 2;
  const offY = (h - BOARD_SPACE.h * scale) / 2;

  const sceneOps = rc.plan.timeline.ops.filter((op) => op.sceneRef === (beat?.sceneRef ?? undefined));

  // strokes, revealed progressively (draw order = op order)
  let drawingPoint: { x: number; y: number; progress: number } | null = null;
  for (const op of sceneOps) {
    if (op.op !== "drawPath") continue;
    if (tMs < op.startMs) continue;
    const d = String(op.params?.d ?? "");
    const probe = probePath(d);
    if (!probe) continue;
    const span = Math.max(1, op.endMs - op.startMs);
    const progress = clamp01((tMs - op.startMs) / span);
    if (progress <= 0) continue;
    ctx.save();
    ctx.translate(offX, offY);
    ctx.scale(scale, scale);
    ctx.strokeStyle = "#1f2937";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash([probe.len, probe.len]);
    ctx.lineDashOffset = probe.len * (1 - progress);
    ctx.stroke(new Path2D(d));
    ctx.restore();
    if (progress < 1) {
      try {
        const pt = probe.el.getPointAtLength(probe.len * progress);
        drawingPoint = { x: offX + pt.x * scale, y: offY + pt.y * scale, progress };
      } catch {
        // point probe unavailable — skip the hand cursor
      }
    }
  }

  // board title (writeText role=title) — handwritten style
  const titleOp = sceneOps.find((op) => op.op === "writeText");
  if (titleOp && tMs >= titleOp.startMs) {
    const text = String(titleOp.params?.text ?? "");
    const span = Math.max(1, titleOp.endMs - titleOp.startMs);
    const reveal = clamp01((tMs - titleOp.startMs) / Math.min(span, 600));
    const fontSize = Math.round(42 * scale);
    ctx.font = `600 ${fontSize}px 'Comic Sans MS', 'Segoe Print', cursive`;
    ctx.fillStyle = "#1f2937";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = reveal;
    const lines = wrapTextLines(ctx, text, BOARD_SPACE.w * 0.8 * scale, 2);
    lines.forEach((line, i) => {
      ctx.fillText(line, w / 2, offY + 150 * scale + i * fontSize * 1.25);
    });
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  // hand cursor at the stroke tip while drawing
  if (drawingPoint) {
    const size = Math.max(10, Math.round(scale * 22));
    ctx.save();
    ctx.translate(drawingPoint.x, drawingPoint.y);
    ctx.rotate(Math.PI * 0.75);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(size * 0.62, size);
    ctx.lineTo(-size * 0.62, size);
    ctx.closePath();
    ctx.fillStyle = "#3f3a34";
    ctx.fill();
    ctx.strokeStyle = "#f7f4ed";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}

// ---------- lane painter: graphics2d ----------

function safeRect(w: number, h: number, layout: { x: number; y: number; w: number; h: number } | null): { x: number; y: number; w: number; h: number } {
  const marginX = w * 0.05;
  const marginY = h * 0.05;
  const r = layout ?? { x: 0.1, y: 0.25, w: 0.8, h: 0.4 };
  let x = r.x * w;
  let y = r.y * h;
  let rw = r.w * w;
  let rh = r.h * h;
  x = Math.min(Math.max(x, marginX), w - marginX);
  y = Math.min(Math.max(y, marginY), h - marginY);
  rw = Math.min(rw, w - marginX - x);
  rh = Math.min(rh, h - marginY - y);
  rw = Math.max(rw, 8);
  rh = Math.max(rh, 8);
  return { x, y, w: rw, h: rh };
}

function drawGraphicsFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  tMs: number,
  rc: FrameRenderCtx,
  beat: PlanBeat | null,
): void {
  // dark stage + accent vignette
  ctx.fillStyle = "#171311";
  ctx.fillRect(0, 0, w, h);
  const vignette = ctx.createRadialGradient(w / 2, h / 2, h * 0.1, w / 2, h / 2, Math.max(w, h) * 0.75);
  vignette.addColorStop(0, hexAlpha(rc.accentHex, 0.16));
  vignette.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  const sceneOps = rc.plan.timeline.ops.filter(
    (op) => op.sceneRef === (beat?.sceneRef ?? undefined) && (op.op === "fillRegion" || op.op === "writeText"),
  );

  let citation: string | null = null;

  for (const op of sceneOps) {
    if (tMs < op.startMs) continue;
    const kind = String(op.params?.kind ?? op.role ?? "");
    const layout = safeJson<{ x: number; y: number; w: number; h: number } | null>(op.params?.layout, null);
    const rect = safeRect(w, h, layout);
    // reveal eased over 600ms from op start
    const progress = easeInOut(clamp01((tMs - op.startMs) / 600));
    ctx.globalAlpha = progress;

    const text = op.params?.text !== undefined ? String(op.params.text) : "";
    const value = op.params?.value !== undefined ? String(op.params.value) : "";

    if (op.params?.citation !== undefined) {
      citation = String(op.params.citation);
    }

    switch (kind) {
      case "headline": {
        const size = fitFontSize(ctx, text, "700", Math.round(h * 0.1), 28, rect.w);
        ctx.font = `700 ${size}px ${STUDIO_SANS}`;
        ctx.fillStyle = "#f4f4f5";
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        const lines = wrapTextLines(ctx, text, rect.w, 3);
        lines.forEach((line, i) => {
          const y = rect.y + rect.h / 2 + (i - (lines.length - 1) / 2) * size * 1.2 + (1 - progress) * 12;
          ctx.fillText(line, rect.x, y);
        });
        break;
      }
      case "statistic": {
        const valueSize = Math.min(Math.round(rect.h * 0.55), 96);
        ctx.font = `700 ${valueSize}px ${STUDIO_SANS}`;
        ctx.fillStyle = rc.accentHex;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(value, rect.x + rect.w / 2, rect.y + rect.h * 0.34 + (1 - progress) * 14);
        ctx.font = `500 ${Math.max(14, Math.round(h * 0.03))}px ${STUDIO_SANS}`;
        ctx.fillStyle = "rgba(228, 228, 231, 0.85)";
        const label = op.params?.label !== undefined ? String(op.params.label) : "";
        wrapTextLines(ctx, label, rect.w, 2).forEach((line, i) => {
          ctx.fillText(line, rect.x + rect.w / 2, rect.y + rect.h * 0.62 + i * h * 0.04);
        });
        break;
      }
      case "chart": {
        const bars = safeJson<Array<{ label?: string; value?: number }> | null>(op.params?.data, null) ?? [];
        const numeric = bars.map((b) => ({ label: String(b?.label ?? ""), value: Number(b?.value ?? 0) })).filter((b) => Number.isFinite(b.value));
        if (numeric.length === 0) break;
        const maxV = Math.max(...numeric.map((b) => Math.abs(b.value)), 1);
        const slotW = rect.w / numeric.length;
        const barW = slotW * 0.52;
        const baseY = rect.y + rect.h * 0.86;
        const maxBarH = rect.h * 0.62;
        numeric.forEach((bar, i) => {
          const barProgress = easeInOut(clamp01(progress * 1.4 - i * 0.12));
          const bh = maxBarH * (Math.abs(bar.value) / maxV) * barProgress;
          const bx = rect.x + slotW * i + (slotW - barW) / 2;
          ctx.fillStyle = i === 0 ? rc.accentHex : hexAlpha(rc.accentHex, 0.55);
          pathRoundRect(ctx, bx, baseY - bh, barW, bh, 6);
          ctx.fill();
          ctx.font = `500 ${Math.max(11, Math.round(h * 0.024))}px ${STUDIO_SANS}`;
          ctx.fillStyle = "rgba(228, 228, 231, 0.85)";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(bar.value), bx + barW / 2, baseY - bh - h * 0.02);
          ctx.fillStyle = "rgba(212, 212, 216, 0.6)";
          ctx.fillText(bar.label, bx + barW / 2, baseY + h * 0.03);
        });
        ctx.strokeStyle = "rgba(244, 244, 245, 0.18)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(rect.x, baseY);
        ctx.lineTo(rect.x + rect.w, baseY);
        ctx.stroke();
        break;
      }
      case "quote": {
        const attribution = op.params?.attribution !== undefined ? String(op.params.attribution) : "";
        const size = fitFontSize(ctx, text, "600", Math.round(h * 0.062), 20, rect.w * 0.9);
        ctx.font = `italic 600 ${size}px ${STUDIO_SANS}`;
        ctx.fillStyle = "#f4f4f5";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const lines = wrapTextLines(ctx, text, rect.w * 0.9, 4);
        lines.forEach((line, i) => {
          ctx.fillText(line, rect.x + rect.w / 2, rect.y + rect.h * 0.4 + (i - (lines.length - 1) / 2) * size * 1.3);
        });
        // big quote mark
        ctx.font = `700 ${Math.round(h * 0.16)}px ${STUDIO_SANS}`;
        ctx.fillStyle = hexAlpha(rc.accentHex, 0.35);
        ctx.fillText("\u201C", rect.x + rect.w * 0.06, rect.y + rect.h * 0.18);
        if (attribution) {
          ctx.font = `500 ${Math.max(12, Math.round(h * 0.026))}px ${STUDIO_MONO}`;
          ctx.fillStyle = "rgba(212, 212, 216, 0.7)";
          ctx.fillText(`— ${attribution}`, rect.x + rect.w / 2, rect.y + rect.h * 0.82);
        }
        break;
      }
      case "cta": {
        const pillH = Math.min(rect.h * 0.42, h * 0.12);
        const fontSize = Math.max(16, Math.round(h * 0.038));
        ctx.font = `600 ${fontSize}px ${STUDIO_SANS}`;
        const textW = ctx.measureText(text).width;
        const pillW = Math.min(rect.w, textW + fontSize * 2.4);
        const px = rect.x + (rect.w - pillW) / 2;
        const py = rect.y + (rect.h - pillH) / 2;
        ctx.beginPath();
        pathRoundRect(ctx, px, py, pillW, pillH, pillH / 2);
        ctx.fillStyle = rc.accentHex;
        ctx.fill();
        ctx.fillStyle = "#141210";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, px + pillW / 2, py + pillH / 2);
        break;
      }
      case "lower-third": {
        const barH = Math.max(28, h * 0.075);
        const by = h - barH - h * 0.05;
        ctx.fillStyle = hexAlpha(rc.accentHex, 0.9);
        ctx.fillRect(w * 0.05, by, Math.min(w * 0.5, 6 + ctx.measureText(text).width), barH * 0.28);
        ctx.fillStyle = "rgba(12, 10, 8, 0.72)";
        ctx.fillRect(w * 0.05, by, w * 0.9, barH);
        ctx.fillStyle = hexAlpha(rc.accentHex, 1);
        ctx.fillRect(w * 0.05, by, 6, barH);
        ctx.font = `600 ${Math.max(14, Math.round(h * 0.032))}px ${STUDIO_SANS}`;
        ctx.fillStyle = "#f4f4f5";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(text, w * 0.05 + 16, by + barH / 2);
        break;
      }
      case "icon-group": {
        const source = op.params?.source !== undefined ? String(op.params.source) : "";
        ctx.font = `500 ${Math.max(12, Math.round(h * 0.024))}px ${STUDIO_MONO}`;
        ctx.fillStyle = "rgba(212, 212, 216, 0.7)";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(source || "icon group", rect.x, rect.y + rect.h / 2);
        break;
      }
      default: {
        if (text) {
          ctx.font = `600 ${Math.max(16, Math.round(h * 0.045))}px ${STUDIO_SANS}`;
          ctx.fillStyle = "#f4f4f5";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          wrapTextLines(ctx, text, rect.w, 3).forEach((line, i) => {
            ctx.fillText(line, rect.x, rect.y + rect.h / 2 + i * h * 0.05);
          });
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  // citation — small, bottom-right, always inside the safe margin
  if (citation) {
    ctx.font = `500 ${Math.max(10, Math.round(h * 0.018))}px ${STUDIO_MONO}`;
    ctx.fillStyle = "rgba(212, 212, 216, 0.55)";
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`source: ${citation}`, w * 0.95, h * 0.95);
    ctx.textAlign = "left";
  }
}

// ---------- lane painter: character ----------

interface PoseConfig {
  armRAngle: number; // radians, 0 = straight down, positive = raised outward
  armLAngle: number;
  legSplit: number; // 0 = together, 1 = stride
  headShift: number; // -1 left .. 1 right
}

function poseConfigFor(pose: string): PoseConfig {
  switch (pose) {
    case "gesture-emphasis":
      return { armRAngle: Math.PI / 4, armLAngle: 0.08, legSplit: 0, headShift: 0 };
    case "gesture-open":
      return { armRAngle: Math.PI / 2.4, armLAngle: Math.PI / 2.4, legSplit: 0.15, headShift: 0 };
    case "gesture-point":
      return { armRAngle: Math.PI / 2, armLAngle: 0.05, legSplit: 0, headShift: 0.2 };
    case "walk":
      return { armRAngle: 0.35, armLAngle: 0.35, legSplit: 1, headShift: 0 };
    case "look-left":
      return { armRAngle: 0.06, armLAngle: 0.06, legSplit: 0, headShift: -1 };
    case "look-right":
      return { armRAngle: 0.06, armLAngle: 0.06, legSplit: 0, headShift: 1 };
    case "idle":
      return { armRAngle: 0.1, armLAngle: 0.1, legSplit: 0, headShift: 0 };
    case "neutral":
    default:
      return { armRAngle: 0.06, armLAngle: 0.06, legSplit: 0, headShift: 0 };
  }
}

function lerpPose(a: PoseConfig, b: PoseConfig, k: number): PoseConfig {
  return {
    armRAngle: lerp(a.armRAngle, b.armRAngle, k),
    armLAngle: lerp(a.armLAngle, b.armLAngle, k),
    legSplit: lerp(a.legSplit, b.legSplit, k),
    headShift: lerp(a.headShift, b.headShift, k),
  };
}

function drawPuppet(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  pose: PoseConfig,
  viseme: string,
  nativeRig: boolean,
  accent: string,
): void {
  const figH = h * 0.3; // 30% height, bottom-center
  const cx = w / 2;
  const baseY = h * 0.96;
  const topY = baseY - figH;
  const headR = figH * 0.16;
  const headY = topY + headR;
  const bodyTop = headY + headR * 1.3;
  const bodyH = figH * 0.42;
  const bodyW = figH * 0.2;
  const shoulderY = bodyTop + bodyH * 0.12;
  const hipY = bodyTop + bodyH;
  const outline = nativeRig ? accent : "#e4e4e7";
  const fill = nativeRig ? "rgba(28, 25, 23, 0.92)" : "rgba(228, 228, 231, 0.94)";

  // legs
  const spread = figH * 0.1 * pose.legSplit;
  ctx.strokeStyle = outline;
  ctx.lineWidth = Math.max(3, figH * 0.045);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, hipY);
  ctx.lineTo(cx - spread, baseY);
  ctx.moveTo(cx, hipY);
  ctx.lineTo(cx + spread, baseY);
  ctx.stroke();

  // body
  pathRoundRect(ctx, cx - bodyW / 2, bodyTop, bodyW, bodyH, bodyW * 0.35);
  ctx.fillStyle = fill;
  ctx.fill();
  if (nativeRig) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(2, figH * 0.02);
    ctx.stroke();
  }

  // arms — shoulder pivot, angle 0 = hanging down; positive rotates outward/up
  const armLen = figH * 0.3;
  const drawArm = (side: -1 | 1, angle: number) => {
    const sx = cx + side * bodyW * 0.42;
    const sy = shoulderY;
    // elbow bend: upper arm at angle, forearm continues with slight bend
    const dirX = side * Math.sin(angle);
    const dirY = Math.cos(angle);
    const elbowX = sx + dirX * armLen * 0.55;
    const elbowY = sy + dirY * armLen * 0.55;
    const handX = elbowX + dirX * armLen * 0.45 + side * Math.sin(angle + 0.5) * armLen * 0.1;
    const handY = elbowY + dirY * armLen * 0.45;
    ctx.strokeStyle = outline;
    ctx.lineWidth = Math.max(3, figH * 0.04);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(elbowX, elbowY);
    ctx.lineTo(handX, handY);
    ctx.stroke();
  };
  drawArm(1, pose.armRAngle); // right arm (canvas right)
  drawArm(-1, pose.armLAngle);

  // head
  const hx = cx + pose.headShift * headR * 0.5;
  ctx.beginPath();
  ctx.arc(hx, headY, headR, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (nativeRig) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(2, figH * 0.02);
    ctx.stroke();
  }
  // face: two dot eyes + mouth viseme
  ctx.fillStyle = nativeRig ? accent : "#3f3a34";
  ctx.beginPath();
  ctx.arc(hx - headR * 0.32, headY - headR * 0.1, headR * 0.09, 0, Math.PI * 2);
  ctx.arc(hx + headR * 0.32, headY - headR * 0.1, headR * 0.09, 0, Math.PI * 2);
  ctx.fill();
  const mouthY = headY + headR * 0.42;
  ctx.strokeStyle = nativeRig ? accent : "#3f3a34";
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = Math.max(1.5, headR * 0.1);
  ctx.beginPath();
  if (viseme === "aa") {
    ctx.ellipse(hx, mouthY, headR * 0.18, headR * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (viseme === "ee") {
    ctx.ellipse(hx, mouthY, headR * 0.28, headR * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (viseme === "oo") {
    ctx.ellipse(hx, mouthY, headR * 0.16, headR * 0.22, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.moveTo(hx - headR * 0.22, mouthY);
    ctx.lineTo(hx + headR * 0.22, mouthY);
    ctx.stroke();
  }

  if (nativeRig) {
    ctx.font = `700 ${Math.max(10, Math.round(figH * 0.09))}px ${STUDIO_MONO}`;
    ctx.fillStyle = accent;
    ctx.textAlign = "right";
    ctx.fillText("RIG", cx + figH * 0.32, topY + headR * 0.4);
    ctx.textAlign = "left";
  }
}

function drawCharacterFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  tMs: number,
  rc: FrameRenderCtx,
  beat: PlanBeat | null,
): void {
  const scene = sceneById(rc.scenes, beat?.sceneRef ?? null);
  const rigMode = scene?.pose?.rigMode ?? (scene?.mode === "native-rig" ? "native-rig" : "storyboard-fallback");

  // stage backdrop
  ctx.fillStyle = "#171310";
  ctx.fillRect(0, 0, w, h);
  const wash = ctx.createLinearGradient(0, 0, 0, h);
  wash.addColorStop(0, hexAlpha(rc.accentHex, 0.14));
  wash.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);

  const nativeRig = rigMode === "native-rig";

  // storyboard-fallback scenes ride the asset board (the assembler declares a showAsset op for them)
  if (!nativeRig) {
    drawKenBurnsScene(ctx, w, h, tMs, rc, beat);
    // dim the board so the puppet reads
    ctx.fillStyle = "rgba(14, 12, 10, 0.25)";
    ctx.fillRect(0, 0, w, h);
  }

  // pose interpolation: previous pose config -> current pose over 300ms
  const ops = rc.plan.timeline.ops.filter(
    (op) => op.op === "poseCharacter" && op.sceneRef === (beat?.sceneRef ?? undefined),
  );
  const active = opsActiveAt(ops, tMs);
  const currentOp = active[0] ?? null;
  const poseName = currentOp ? String(currentOp.params?.pose ?? "neutral") : "neutral";
  const viseme = currentOp?.params?.viseme !== undefined ? String(currentOp.params.viseme) : "rest";
  const sincePoseStart = currentOp ? tMs - currentOp.startMs : 0;
  const poseIndex = currentOp ? ops.findIndex((o) => o.id === currentOp.id) : -1;
  const prevOp = poseIndex > 0 ? ops[poseIndex - 1] : null;
  const prevPose = poseConfigFor(prevOp ? String(prevOp.params?.pose ?? "neutral") : "neutral");
  const targetPose = poseConfigFor(poseName);
  const blend = clamp01(sincePoseStart / 300);
  const pose = lerpPose(prevPose, targetPose, blend);

  drawPuppet(ctx, w, h, pose, viseme, nativeRig, rc.accentHex);

  // identity anchor — bottom-left, small
  const anchor = scene?.pose?.identityAnchor ?? "";
  if (anchor) {
    ctx.font = `500 ${Math.max(10, Math.round(h * 0.018))}px ${STUDIO_MONO}`;
    ctx.fillStyle = "rgba(212, 212, 216, 0.6)";
    ctx.textAlign = "left";
    ctx.fillText(anchor, w * 0.03, h * 0.97);
  }
}

// ---------- lane painter: slides ----------

function drawSlidesFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  tMs: number,
  rc: FrameRenderCtx,
  beat: PlanBeat | null,
): void {
  const sceneOps = rc.plan.timeline.ops.filter((op) => op.sceneRef === (beat?.sceneRef ?? undefined));
  const slideOp = sceneOps.find((op) => op.op === "revealSlide") ?? null;
  const template = slideOp ? String(slideOp.params?.template ?? "title") : "title";
  const title = slideOp ? String(slideOp.params?.title ?? "") : beat?.visualIntent ?? "";
  const statValue = slideOp?.params?.statValue !== undefined ? String(slideOp.params.statValue) : "";
  const statLabel = slideOp?.params?.statLabel !== undefined ? String(slideOp.params.statLabel) : "";
  const quoteText = slideOp?.params?.quoteText !== undefined ? String(slideOp.params.quoteText) : "";
  const quoteAttr = slideOp?.params?.quoteAttribution !== undefined ? String(slideOp.params.quoteAttribution) : "";
  const citation = slideOp?.params?.citation !== undefined ? String(slideOp.params.citation) : "";

  const accent = rc.accentHex;
  const dark = template === "section" ? false : true;
  if (template === "section") {
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, w, h);
    const shade = ctx.createLinearGradient(0, 0, 0, h);
    shade.addColorStop(0, "rgba(0,0,0,0.08)");
    shade.addColorStop(1, "rgba(0,0,0,0.22)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);
  } else {
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, dark ? "#221c16" : "#efe9df");
    bg.addColorStop(1, dark ? "#181410" : "#e5ddd0");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    const glow = ctx.createRadialGradient(w * 0.5, h * 0.3, 10, w * 0.5, h * 0.3, Math.max(w, h) * 0.7);
    glow.addColorStop(0, hexAlpha(accent, dark ? 0.12 : 0.1));
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
  }
  const fg = template === "section" ? "#141210" : dark ? "#f4f4f5" : "#221c16";
  const fgMuted = template === "section" ? "rgba(20, 18, 16, 0.72)" : dark ? "rgba(212, 212, 216, 0.75)" : "rgba(34, 28, 22, 0.7)";

  const slideProgress = slideOp ? easeInOut(clamp01((tMs - slideOp.startMs) / 500)) : 1;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  switch (template) {
    case "title": {
      const size = fitFontSize(ctx, title, "700", Math.round(h * 0.11), 30, w * 0.82);
      ctx.font = `700 ${size}px ${STUDIO_SANS}`;
      ctx.fillStyle = fg;
      ctx.globalAlpha = slideProgress;
      wrapTextLines(ctx, title, w * 0.82, 3).forEach((line, i) => {
        ctx.fillText(line, w / 2, h * 0.42 + (i - 0.5) * size * 1.25 + (1 - slideProgress) * 14);
      });
      ctx.globalAlpha = 1;
      ctx.fillStyle = accent;
      ctx.fillRect(w * 0.5 - w * 0.09 * slideProgress, h * 0.585, w * 0.18 * slideProgress, Math.max(3, h * 0.006));
      break;
    }
    case "title-body": {
      ctx.textAlign = "left";
      const titleSize = fitFontSize(ctx, title, "700", Math.round(h * 0.075), 22, w * 0.8);
      ctx.font = `700 ${titleSize}px ${STUDIO_SANS}`;
      ctx.fillStyle = fg;
      ctx.globalAlpha = slideProgress;
      wrapTextLines(ctx, title, w * 0.8, 2).forEach((line, i) => {
        ctx.fillText(line, w * 0.09, h * 0.16 + i * titleSize * 1.25 + (1 - slideProgress) * -10);
      });
      ctx.globalAlpha = 1;
      ctx.fillStyle = accent;
      ctx.fillRect(w * 0.09, h * 0.16 + titleSize * 1.4, w * 0.12 * slideProgress, Math.max(2, h * 0.005));
      // bullets — staggered writeText ops, each slides in from 12px
      const bullets = sceneOps.filter((op) => op.op === "writeText" && op.role === "bullet");
      const bulletSize = Math.max(15, Math.round(h * 0.038));
      ctx.font = `500 ${bulletSize}px ${STUDIO_SANS}`;
      bullets.forEach((op) => {
        if (tMs < op.startMs) return;
        const p = easeInOut(clamp01((tMs - op.startMs) / 450));
        const idx = Number(op.params?.index ?? 0);
        const text = String(op.params?.text ?? "");
        ctx.globalAlpha = p;
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(w * 0.095, h * 0.34 + idx * h * 0.105, Math.max(2.5, h * 0.005), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillText(text, w * 0.12 + (1 - p) * 12, h * 0.34 + idx * h * 0.105);
        ctx.globalAlpha = 1;
      });
      break;
    }
    case "stat": {
      const valueSize = Math.min(Math.round(h * 0.24), 120);
      ctx.font = `700 ${valueSize}px ${STUDIO_SANS}`;
      ctx.fillStyle = accent;
      ctx.globalAlpha = slideProgress;
      ctx.fillText(statValue || title, w / 2, h * 0.42 + (1 - slideProgress) * 18);
      ctx.font = `500 ${Math.max(15, Math.round(h * 0.04))}px ${STUDIO_SANS}`;
      ctx.fillStyle = fgMuted;
      wrapTextLines(ctx, statLabel, w * 0.8, 2).forEach((line, i) => {
        ctx.fillText(line, w / 2, h * 0.58 + i * h * 0.05);
      });
      ctx.globalAlpha = 1;
      break;
    }
    case "quote": {
      ctx.font = `700 ${Math.round(h * 0.2)}px ${STUDIO_SANS}`;
      ctx.fillStyle = hexAlpha(accent, 0.4);
      ctx.fillText("\u201C", w * 0.12, h * 0.2);
      const size = fitFontSize(ctx, quoteText || title, "600", Math.round(h * 0.062), 18, w * 0.78);
      ctx.font = `italic 600 ${size}px ${STUDIO_SANS}`;
      ctx.fillStyle = fg;
      ctx.globalAlpha = slideProgress;
      wrapTextLines(ctx, quoteText || title, w * 0.78, 4).forEach((line, i) => {
        ctx.fillText(line, w / 2, h * 0.44 + (i - 0.5) * size * 1.3);
      });
      if (quoteAttr) {
        ctx.font = `500 ${Math.max(12, Math.round(h * 0.028))}px ${STUDIO_MONO}`;
        ctx.fillStyle = fgMuted;
        ctx.fillText(`— ${quoteAttr}`, w / 2, h * 0.72);
      }
      ctx.globalAlpha = 1;
      break;
    }
    case "section": {
      const size = fitFontSize(ctx, title, "700", Math.round(h * 0.1), 26, w * 0.8);
      ctx.font = `700 ${size}px ${STUDIO_SANS}`;
      ctx.fillStyle = fg;
      ctx.globalAlpha = slideProgress;
      wrapTextLines(ctx, title, w * 0.8, 2).forEach((line, i) => {
        ctx.fillText(line, w / 2, h * 0.48 + (i - 0.5) * size * 1.3 + (1 - slideProgress) * 14);
      });
      ctx.globalAlpha = 1;
      break;
    }
    case "closing": {
      const size = fitFontSize(ctx, title, "700", Math.round(h * 0.09), 26, w * 0.8);
      ctx.font = `700 ${size}px ${STUDIO_SANS}`;
      ctx.fillStyle = fg;
      ctx.globalAlpha = slideProgress;
      ctx.fillText(title, w / 2, h * 0.4);
      ctx.font = `500 ${Math.max(16, Math.round(h * 0.045))}px ${STUDIO_SANS}`;
      ctx.fillStyle = accent;
      ctx.fillText("Thank you", w / 2, h * 0.56);
      ctx.globalAlpha = 1;
      break;
    }
    default: {
      ctx.font = `700 ${Math.round(h * 0.07)}px ${STUDIO_SANS}`;
      ctx.fillStyle = fg;
      ctx.fillText(title, w / 2, h * 0.45);
    }
  }

  if (citation) {
    ctx.font = `500 ${Math.max(10, Math.round(h * 0.018))}px ${STUDIO_MONO}`;
    ctx.fillStyle = fgMuted;
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`source: ${citation}`, w * 0.96, h * 0.965);
    ctx.textAlign = "left";
  }
}

// ---------- dispatcher ----------

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  tMs: number,
  rc: FrameRenderCtx,
): void {
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0e0c0a";
  ctx.fillRect(0, 0, w, h);

  const beat = currentBeat(rc.plan, tMs);
  const ops = rc.plan.timeline.ops;
  const sceneOps = opsActiveAt(ops, tMs);

  switch (rc.lane) {
    case "classic":
    case "story":
      drawKenBurnsScene(ctx, w, h, tMs, rc, beat);
      break;
    case "whiteboard":
      drawWhiteboardFrame(ctx, w, h, tMs, rc, beat);
      break;
    case "graphics2d":
      drawGraphicsFrame(ctx, w, h, tMs, rc, beat);
      break;
    case "character":
      drawCharacterFrame(ctx, w, h, tMs, rc, beat);
      break;
    case "slides":
      drawSlidesFrame(ctx, w, h, tMs, rc, beat);
      break;
  }

  // caption bar (all lanes carry caption ops)
  const captionOp = sceneOps.find((op) => op.op === "caption");
  if (captionOp) {
    drawCaptionBar(ctx, w, h, String(captionOp.params?.text ?? ""));
  }

  // transition overlay near scene start
  const transitionOp = sceneOps.find((op) => op.op === "transition");
  if (transitionOp) {
    drawTransitionOverlay(ctx, w, h, transitionOp, tMs);
  }

  drawWatermark(ctx, w, rc.lane);
  ctx.restore();
}

// ---------- static preview (lane workspace board/slide stills) ----------

export function drawStaticFrame(canvas: HTMLCanvasElement, tMs: number, rc: FrameRenderCtx): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  drawFrame(ctx, canvas.width, canvas.height, tMs, rc);
}

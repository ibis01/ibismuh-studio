/**
 * Client-side reveal renderer.
 *
 * Port of the reference `video_encoding.encode_timing_video`
 * (whiteboard-animator, MIT): pixels are sorted by reveal time, fully
 * revealed pixels are committed once into a persistent buffer, and only
 * the narrow actively-fading band is blended per frame — the same
 * 50-100x reduction in per-frame pixel work, now driving a canvas.
 */

export interface RenderSource {
  width: number;
  height: number;
  /** RGB row-major, white-snapped (as returned by the analyzer). */
  rgb: Uint8Array;
  timing: Float32Array;
  fadeDuration: number;
}

interface SortedPixels {
  count: number;
  y: Uint16Array;
  x: Uint16Array;
  t: Float32Array;
  r: Uint8Array;
  g: Uint8Array;
  b: Uint8Array;
}

export class RevealRenderer {
  readonly width: number;
  readonly height: number;
  private readonly fade: number;
  private readonly sorted: SortedPixels;
  private readonly frame: Uint8ClampedArray;
  private lastT = -1;
  private committed = 0;

  constructor(source: RenderSource) {
    this.width = source.width;
    this.height = source.height;
    this.fade = Math.max(source.fadeDuration, 0.001);

    // Content pixels = finite reveal time (background is Infinity).
    const n = source.width * source.height;
    const idx: number[] = [];
    for (let i = 0; i < n; i++) {
      if (source.timing[i] !== Infinity) idx.push(i);
    }
    idx.sort((a, b) => source.timing[a] - source.timing[b]);

    const count = idx.length;
    const y = new Uint16Array(count);
    const x = new Uint16Array(count);
    const t = new Float32Array(count);
    const r = new Uint8Array(count);
    const g = new Uint8Array(count);
    const b = new Uint8Array(count);
    for (let k = 0; k < count; k++) {
      const i = idx[k];
      const py = (i / source.width) | 0;
      const px = i - py * source.width;
      y[k] = py;
      x[k] = px;
      t[k] = source.timing[i];
      r[k] = source.rgb[i * 3];
      g[k] = source.rgb[i * 3 + 1];
      b[k] = source.rgb[i * 3 + 2];
    }
    this.sorted = { count, y, x, t, r, g, b };
    this.frame = new Uint8ClampedArray(n * 4).fill(255);
    this.lastT = -1;
    this.committed = 0;
  }

  /** Total time the draw + fade takes (hold handled by the player). */
  get drawEnd(): number {
    return this.sorted.count > 0
      ? this.sorted.t[this.sorted.count - 1] + this.fade
      : 0;
  }

  /** Pixel position currently at the drawing front (pen tip). */
  frontAt(time: number): { x: number; y: number } | null {
    const { count, t, x, y } = this.sorted;
    if (count === 0) return null;
    // Binary search for the last pixel with t <= time.
    let lo = 0;
    let hi = count - 1;
    let best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (t[mid] <= time) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (best < 0) return null;
    // Average the last few front pixels for a steadier marker.
    const K = 48;
    const from = Math.max(0, best - K + 1);
    let sx = 0;
    let sy = 0;
    for (let k = from; k <= best; k++) {
      sx += x[k];
      sy += y[k];
    }
    const n = best - from + 1;
    return { x: sx / n, y: sy / n };
  }

  /**
   * Render the frame at `time` seconds into an ImageData. Fast path
   * (monotonic) commits once and blends the active band; random access
   * rebuilds the buffer from scratch.
   */
  renderAt(time: number, imageData: ImageData): void {
    const { count, y, x, t, r, g, b } = this.sorted;
    const frame = this.frame;
    const fade = this.fade;
    const sequential = time >= this.lastT && this.lastT >= 0 && time - this.lastT < 0.5;
    if (!sequential) {
      // Rebuild from white.
      frame.fill(255);
      this.committed = 0;
    }
    this.lastT = time;

    // 1. Commit newly fully-revealed pixels.
    const fullCutoff = time - fade;
    let newCommitted = this.committed;
    if (sequential) {
      while (newCommitted < count && t[newCommitted] <= fullCutoff) {
        const k = newCommitted;
        const p = (y[k] * this.width + x[k]) * 4;
        frame[p] = r[k];
        frame[p + 1] = g[k];
        frame[p + 2] = b[k];
        frame[p + 3] = 255;
        newCommitted++;
      }
    } else {
      // Full scan commit.
      let lo = 0;
      let hi = count;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (t[mid] <= fullCutoff) lo = mid + 1;
        else hi = mid;
      }
      newCommitted = lo;
      for (let k = 0; k < newCommitted; k++) {
        const p = (y[k] * this.width + x[k]) * 4;
        frame[p] = r[k];
        frame[p + 1] = g[k];
        frame[p + 2] = b[k];
        frame[p + 3] = 255;
      }
    }
    this.committed = newCommitted;

    // 2. Blend the narrow active band (committed..active_end].
    let activeEnd = this.committed;
    let lo = this.committed;
    let hi = count;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (t[mid] <= time) lo = mid + 1;
      else hi = mid;
    }
    activeEnd = lo;
    for (let k = this.committed; k < activeEnd; k++) {
      const a = Math.min(Math.max((time - t[k]) / fade, 0), 1);
      const ease = Math.sqrt(a);
      const p = (y[k] * this.width + x[k]) * 4;
      frame[p] = 255 + (r[k] - 255) * ease;
      frame[p + 1] = 255 + (g[k] - 255) * ease;
      frame[p + 2] = 255 + (b[k] - 255) * ease;
      frame[p + 3] = 255;
    }

    imageData.data.set(frame);
  }
}

/** Draw the marker sprite at the pen tip (upgrade the reference asked for). */
export function drawMarkerSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale = 1,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.rotate(-Math.PI / 4);
  // Tip
  ctx.fillStyle = "#1c1917";
  ctx.beginPath();
  ctx.moveTo(-4, 2);
  ctx.lineTo(4, 2);
  ctx.lineTo(0, -6);
  ctx.closePath();
  ctx.fill();
  // Body
  const grad = ctx.createLinearGradient(-7, 2, 7, 2);
  grad.addColorStop(0, "#57534e");
  grad.addColorStop(1, "#292524");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(-6, 2, 12, 30, 4);
  ctx.fill();
  // Band
  ctx.fillStyle = "#e7e5e4";
  ctx.fillRect(-6, 12, 12, 5);
  // Cap
  ctx.fillStyle = "#0c0a09";
  ctx.beginPath();
  ctx.roundRect(-6.5, 26, 13, 9, 3);
  ctx.fill();
  ctx.restore();
}

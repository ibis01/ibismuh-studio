// S153 — the KINETIC SLIDES ENGINE: the keynote deck stops being "designed
// stills + camera" and becomes what the picker always promised — a kinetic-
// typography render. Every slide animates per frame through the SAME laws
// the other engines ride:
//
//   PURE FRAME TRUTH  slideFrameAt(spec, tMs, durMs, camera) → the frame
//                     state (word stagger, accent pop, counter count-up,
//                     bar growth, row enters, camera scale) — deterministic,
//                     no fs, no DOM, no clock, no randomness (the S64 law).
//   ONE APPLIER       APPLY_SLIDE_FRAME_FN — the page-side function the
//                     renderer evaluates per frame (the graphics/rig shape:
//                     one compose, one applier, two callers — the editor
//                     seam when the studio wants scrubbing later).
//   THE SEAT          the clip is VIDEO-ONLY (the rig-clip law): buildSegment
//                     owns the mix — narration, SFX, ambience, music, the
//                     loudness chain all ride the story segment's audio graph
//                     unchanged. Transitions, the stitch, QC and loudnorm
//                     never learn the clip is animated.
//   THE CLOCK         the clip renders at min(fps, 30) (the D3 shared
//                     timebase — a 60fps program's clips render at 30 and
//                     the segment's -r resample carries them); frames come
//                     from frameCountOf — ONE clock derivation.
//   THE CACHE         the i2v/rig clip-cache shape upgraded: a sha256
//                     sidecar over EVERY input (spec bytes, duration, fps,
//                     brand, camera plan, art file stat) — a mismatch
//                     re-renders, the cache never lies.
//   THE BUDGET        SLIDES_KINETIC_FRAME_BUDGET per scene clip (the engine
//                     wall, 25,920 frames) — the caller checks the DECK total
//                     before the pass and falls back to the static deck with
//                     a visible note when the program would exceed it.
//   THE FALLBACK      every failure is HONEST and non-fatal: a scene whose
//                     clip fails answers null and that scene plays the
//                     proven static deck + zoompan (the S153-era path,
//                     byte-identical); the caller reports the degradation in
//                     the progress feed and the liveliness ledger. Cancellation
//                     is the one error that is NEVER swallowed (a cancel must
//                     abort the render, not degrade it — detected by the
//                     error's name to keep this module leaf-clean of the jobs
//                     import cycle).
//
// SECURITY POSTURE (whiteboard/graphics/rig parity): the composed HTML is the
// composer's own output (esc() at every interpolation); chromium launches
// with ALL network routes aborted; the page loads via file:// (the photo-art
// + logo subresource law); per-scene context recycling hands chromium's
// memory back (the S75 E10 receipt).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { WB_CHROMIUM_LAUNCH_ARGS } from "./whiteboard/render";
import { runProcess } from "./proc";
import { frameCountOf } from "./anim/clock";
import { slideHtml, type SlideBrand, type SlideSpec } from "./slides";

// ---------------------------------------------------------------------------
// The motion model — timings are receipts to tune; the NAMES are the contract.
// ---------------------------------------------------------------------------

/** The v1 kinetic semantics — ONE source, cited by the pins. */
export const SLIDE_KINETIC_SEMANTICS = {
  /** badge enter (ms) — fade + rise. */
  badgeDurMs: 480,
  badgeDyPx: 40,
  /** headline words: first delay, per-word stagger, per-word duration. */
  wordStartMs: 140,
  wordStaggerMs: 90,
  wordDurMs: 420,
  wordDyPx: 34,
  /** the accent word's pop (ease-out-back overshoot). */
  accentPopFrom: 0.86,
  accentPopDurMs: 520,
  /** focal element / rows enter. */
  focalStartMs: 380,
  focalDyPx: 44,
  rowStaggerMs: 110,
  rowDurMs: 520,
  /** counter count-up. */
  counterStartMs: 420,
  counterDurMs: 1200,
  /** bars growth. */
  barStartMs: 420,
  barStaggerMs: 160,
  barDurMs: 900,
  /** footer + source fade. */
  footerStartMs: 650,
  footerDurMs: 480,
  /** the photo settle (a Ken Burns-lite inside the card). */
  photoSettleDurMs: 1400,
  photoSettleFrom: 1.05,
} as const;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

const easeOutCubic = (p: number): number => 1 - Math.pow(1 - p, 3);

/** The pop's overshoot (ease-out-back, the graphics ease-back shape). */
function easeOutBack(p: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
}

const slideEnter = (tMs: number, delayMs: number, durMs: number): number =>
  easeOutCubic(clamp01((tMs - delayMs) / durMs));

const rise = (progress: number, dyPx: number): number => (1 - progress) * dyPx;

// ---------------------------------------------------------------------------
// The camera — the SAME endpoints slideMotionPlan gives the zoompan path
// (gentle push/pull, the rehook punch, motion-off holds), evaluated here as
// a CSS scale about center. One camera model, two executors.
// ---------------------------------------------------------------------------

export type SlideCameraKind = "push" | "pull" | "punch" | "hold";

/** The camera plan for one kinetic slide — mirrors slideMotionPlan's
 *  decisions exactly (rehook → punch; every third beat breathes the other
 *  way; motion off → hold). */
export function kineticCameraKind(
  scene: { rehook?: boolean | null; index: number },
  settings: { mode?: string | null; intensity?: number | null } | null
): SlideCameraKind {
  if (!settings || settings.mode === "off") return "hold";
  if (scene.rehook) return "punch";
  return scene.index % 3 === 0 ? "pull" : "push";
}

/** The camera amplitude — the same lever slideMotionPlan pulls. */
export function kineticCameraAmp(
  settings: { mode?: string | null; intensity?: number | null } | null
): number {
  if (!settings || settings.mode === "off") return 0;
  return Math.min(0.06, Math.max(0.02, ((settings.intensity ?? 10) / 100) * 0.5));
}

/** The camera scale at scene-local progress t01 (0..1) — the SAME endpoints
 *  the zoompan executor uses (punch = amp × 1.4), so the animated deck and
 *  the static fallback feel like the same format. Pure. */
export function kineticCameraScale(t01: number, kind: SlideCameraKind, amp: number): number {
  switch (kind) {
    case "hold":
      return 1;
    case "pull":
      return 1 + amp - amp * clamp01(t01);
    case "punch":
      return 1 + amp * 1.4 * clamp01(t01);
    case "push":
    default:
      return 1 + amp * clamp01(t01);
  }
}

// ---------------------------------------------------------------------------
// The counter — parse once, format deterministically (no locale arithmetic).
// ---------------------------------------------------------------------------

export interface CounterShape {
  sign: number;
  prefix: string;
  value: number;
  decimals: number;
  suffix: string;
}

/** Parse the spec's number text ("27.4", "29,239,000,000", "$2,599", "-12%")
 *  into an animatable shape — null when the text is not a clean number (the
 *  counter then holds the literal text, honest and static). */
export function parseCounterValue(raw: string): CounterShape | null {
  const m = /^([-+]?)([$€£]?)([\d.,]+)([%×xX]?)$/.exec(raw.trim());
  if (!m) return null;
  const [, sign, prefix, digits, suffix] = m;
  const decimals = digits.includes(".") ? (digits.split(".")[1]?.length ?? 0) : 0;
  const value = Number(digits.replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  return { sign: sign === "-" ? -1 : 1, prefix, value, decimals, suffix };
}

/** The deterministic grouped format ("29,239,000,000", never locale math). */
export function formatCounterValue(c: CounterShape, value: number): string {
  const neg = value < 0 || (value === 0 && c.sign < 0);
  const fixed = Math.abs(value).toFixed(c.decimals);
  const [int, dec] = fixed.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${c.prefix}${grouped}${dec ? `.${dec}` : ""}${c.suffix}`;
}

// ---------------------------------------------------------------------------
// The pure frame truth
// ---------------------------------------------------------------------------

export interface SlideWordFrame {
  opacity: number;
  dy: number;
  scale: number;
}

export interface SlideRowFrame {
  opacity: number;
  dy: number;
}

export interface SlideFrameState {
  /** the CSS camera scale (1 = none). */
  cameraScale: number;
  badge: SlideRowFrame | null;
  words: SlideWordFrame[];
  /** the focal root(s) — shared enter state (opacity, dy, settle scale). */
  focalOpacity: number;
  focalDy: number;
  focalScale: number;
  /** counter layout: the formatted value at t (null = hold the literal). */
  counterText: string | null;
  /** bars: per-row fill progress 0..1. */
  barProgress: number[];
  /** card lines / steps rows. */
  rowStates: SlideRowFrame[];
  footerOpacity: number;
  sourceOpacity: number;
}

/** The ONE frame rule: (spec, tMs, scene duration, camera) → frame state.
 *  Pure — same input → byte-identical output (the sweep-hash pin). */
export function slideFrameAt(
  spec: SlideSpec,
  tMs: number,
  durationMs: number,
  camera: { kind: SlideCameraKind; amp: number }
): SlideFrameState {
  const t = Math.max(0, tMs);

  // Camera across the scene's own clock.
  const cameraScale = kineticCameraScale(
    durationMs > 0 ? clamp01(t / durationMs) : 1,
    camera.kind,
    camera.amp
  );

  // Headline word stagger (the accent word pops with ease-back on its own
  // slot).
  const words = spec.headline.split(/\s+/).filter(Boolean);
  const accentLower = spec.accentWord?.toLowerCase() ?? null;
  let accentTaken = false;
  const wordFrames: SlideWordFrame[] = words.map((w, i) => {
    const delay = SLIDE_KINETIC_SEMANTICS.wordStartMs + i * SLIDE_KINETIC_SEMANTICS.wordStaggerMs;
    const p = slideEnter(t, delay, SLIDE_KINETIC_SEMANTICS.wordDurMs);
    let scale = 1;
    const isAccent = accentLower !== null && !accentTaken && w.toLowerCase() === accentLower;
    if (isAccent) {
      accentTaken = true;
      const pp = easeOutBack(clamp01((t - delay) / SLIDE_KINETIC_SEMANTICS.accentPopDurMs));
      scale =
        SLIDE_KINETIC_SEMANTICS.accentPopFrom +
        (1 - SLIDE_KINETIC_SEMANTICS.accentPopFrom) * pp;
    }
    return { opacity: p, dy: rise(p, SLIDE_KINETIC_SEMANTICS.wordDyPx), scale };
  });

  const badgeFrame = spec.badge
    ? {
        opacity: slideEnter(t, 0, SLIDE_KINETIC_SEMANTICS.badgeDurMs),
        dy: rise(
          slideEnter(t, 0, SLIDE_KINETIC_SEMANTICS.badgeDurMs),
          SLIDE_KINETIC_SEMANTICS.badgeDyPx
        ),
      }
    : null;

  const focalP = slideEnter(t, SLIDE_KINETIC_SEMANTICS.focalStartMs, SLIDE_KINETIC_SEMANTICS.rowDurMs);
  const focalOpacity = focalP;
  const focalDy = rise(focalP, SLIDE_KINETIC_SEMANTICS.focalDyPx);
  const focalScale =
    spec.layout === "photo"
      ? SLIDE_KINETIC_SEMANTICS.photoSettleFrom -
        (SLIDE_KINETIC_SEMANTICS.photoSettleFrom - 1) *
          easeOutCubic(clamp01(t / SLIDE_KINETIC_SEMANTICS.photoSettleDurMs))
      : 1;

  // The counter counts UP (0 → the spec's value) inside the focal window;
  // an unparseable number holds the literal text (honest static).
  let counterText: string | null = null;
  if ((spec.layout === "counter" || spec.layout === "bars") && spec.number) {
    const shape = parseCounterValue(spec.number);
    if (shape) {
      const p = easeOutCubic(
        clamp01((t - SLIDE_KINETIC_SEMANTICS.counterStartMs) / SLIDE_KINETIC_SEMANTICS.counterDurMs)
      );
      counterText = formatCounterValue(shape, shape.value * p);
    }
  }

  const barProgress = spec.bars.map((_, bi) =>
    easeOutCubic(
      clamp01(
        (t - SLIDE_KINETIC_SEMANTICS.barStartMs - bi * SLIDE_KINETIC_SEMANTICS.barStaggerMs) /
          SLIDE_KINETIC_SEMANTICS.barDurMs
      )
    )
  );

  const rowCount =
    spec.layout === "card"
      ? spec.cardLines.length
      : spec.layout === "steps"
        ? spec.steps.length
        : 0;
  const rowStates: SlideRowFrame[] = Array.from({ length: rowCount }, (_, ri) => {
    const p = slideEnter(
      t,
      SLIDE_KINETIC_SEMANTICS.focalStartMs + (ri + 1) * SLIDE_KINETIC_SEMANTICS.rowStaggerMs,
      SLIDE_KINETIC_SEMANTICS.rowDurMs
    );
    return { opacity: p, dy: rise(p, SLIDE_KINETIC_SEMANTICS.focalDyPx) };
  });

  return {
    cameraScale,
    badge: badgeFrame,
    words: wordFrames,
    focalOpacity,
    focalDy,
    focalScale,
    counterText,
    barProgress,
    rowStates,
    footerOpacity: spec.footer
      ? slideEnter(t, SLIDE_KINETIC_SEMANTICS.footerStartMs, SLIDE_KINETIC_SEMANTICS.footerDurMs)
      : 1,
    sourceOpacity: spec.source
      ? slideEnter(t, SLIDE_KINETIC_SEMANTICS.footerStartMs, SLIDE_KINETIC_SEMANTICS.footerDurMs)
      : 1,
  };
}

/** Deterministic sweep hash — two runs of the same doc MUST produce the
 *  same hash (the graphics determinism law, mirrored). */
export function slideKineticSweepHash(spec: SlideSpec, durationMs: number, camera: { kind: SlideCameraKind; amp: number }): string {
  const { createHash } = crypto;
  const parts: string[] = [];
  const total = Math.max(1, Math.floor(durationMs));
  const stepMs = Math.max(60, Math.ceil(total / 400));
  for (let t = 0; t <= total; t += stepMs) {
    parts.push(JSON.stringify(slideFrameAt(spec, t, durationMs, camera)));
  }
  return createHash("sha256").update(parts.join("\n")).digest("hex");
}

// ---------------------------------------------------------------------------
// The ONE applier — page-side, evaluated per frame (the graphics evaluate
// law: the payload string is JSON.stringify'd INTO the call; the node list
// is computed once per page).
// ---------------------------------------------------------------------------

export const APPLY_SLIDE_FRAME_FN = `
function __slideApply(payload) {
  if (!window.__slideNodes) {
    window.__slideNodes = {
      words: Array.prototype.slice.call(document.querySelectorAll('[data-w]')),
      badge: document.querySelector('[data-k="badge"]'),
      focals: Array.prototype.slice.call(document.querySelectorAll('[data-k="focal"]')),
      counterValue: document.querySelector('[data-k="counter-value"]'),
      bars: Array.prototype.slice.call(document.querySelectorAll('[data-k="bar"]')),
      rows: Array.prototype.slice.call(document.querySelectorAll('[data-k="row"]')),
      footer: document.querySelector('[data-k="footer"]'),
      source: document.querySelector('[data-k="source"]')
    };
  }
  const n = window.__slideNodes;
  document.body.style.transform = payload.cameraScale !== 1 ? 'scale(' + payload.cameraScale + ')' : '';
  if (n.badge) {
    n.badge.style.opacity = payload.badge ? String(payload.badge.opacity) : '';
    n.badge.style.transform = payload.badge && payload.badge.dy ? 'translateY(' + payload.badge.dy + 'px)' : '';
  }
  for (let i = 0; i < payload.words.length; i++) {
    const el = n.words[i];
    if (!el) continue;
    const w = payload.words[i];
    el.style.opacity = String(w.opacity);
    const t = [];
    if (w.dy) t.push('translateY(' + w.dy + 'px)');
    if (w.scale !== 1) t.push('scale(' + w.scale + ')');
    el.style.transform = t.join(' ');
  }
  for (let i = 0; i < n.focals.length; i++) {
    const el = n.focals[i];
    el.style.opacity = String(payload.focalOpacity);
    const t = [];
    if (payload.focalDy) t.push('translateY(' + payload.focalDy + 'px)');
    if (payload.focalScale !== 1) t.push('scale(' + payload.focalScale + ')');
    el.style.transform = t.join(' ');
  }
  if (n.counterValue && payload.counterText !== null && payload.counterText !== undefined) {
    n.counterValue.textContent = payload.counterText;
  }
  for (let i = 0; i < payload.barProgress.length; i++) {
    const el = n.bars[i];
    if (el) el.style.width = (payload.barProgress[i] * 100).toFixed(2) + '%';
  }
  for (let i = 0; i < payload.rowStates.length; i++) {
    const el = n.rows[i];
    if (!el) continue;
    const r = payload.rowStates[i];
    el.style.opacity = String(r.opacity);
    el.style.transform = r.dy ? 'translateY(' + r.dy + 'px)' : '';
  }
  if (n.footer) n.footer.style.opacity = String(payload.footerOpacity);
  if (n.source) n.source.style.opacity = String(payload.sourceOpacity);
  return true;
}
`;

// ---------------------------------------------------------------------------
// The clip renderer — ONE browser for the deck, per-scene contexts, the
// rig-clip encode law (video-only, -t bounded, yuv420p).
// ---------------------------------------------------------------------------

const SLIDE_OUT_W = 1080;
const SLIDE_OUT_H = 1920;
/** 1.5× supersample — the zoompan path's own work-canvas ratio (1620×2880),
 *  so the animated deck's text is as crisp as the still deck's. */
const SLIDE_KINETIC_SCALE = 1.5;

export const SLIDES_KINETIC_FRAME_BUDGET = 25_920; // the engine wall (18 min @24)

export const SLIDE_KINETIC_CLIP_FLOOR = 10_000;

/** The per-scene encode args — video-only (the buildSegment audio graph owns
 *  the mix), frames supersampled to 1620×2880 then lanczos'd to the deck's
 *  1080×1920. Exported for the unit pins — the arg list IS the contract. */
export function slideKineticEncodeArgs(input: {
  framesDir: string;
  fps: number;
  durSec: number;
  sceneFile: string;
}): string[] {
  return [
    "-y",
    "-framerate", String(input.fps),
    "-i", path.join(input.framesDir, "f%05d.jpg"),
    "-filter_complex",
    `[0:v]scale=${SLIDE_OUT_W}:${SLIDE_OUT_H}:flags=lanczos,format=yuv420p[v]`,
    "-map", "[v]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "19",
    "-t", input.durSec.toFixed(3),
    input.sceneFile,
  ];
}

export interface KineticClipItem {
  scene: { index: number; rehook?: boolean | null };
  spec: SlideSpec;
  /** The DELIVERED scene duration in ms (the WAV-derived clock the segment
   *  will be cut on — the clip matches it exactly). */
  durationMs: number;
  /** The photo layout's art path (file:// URL) — null when unused. */
  imageUrl?: string | null;
}

export interface RenderKineticClipsOptions {
  outDir: string;
  brand?: SlideBrand | null;
  /** The Smart Motion settings — the camera plan is decided PER SCENE from
   *  them (kineticCameraKind: the slideMotionPlan decisions verbatim). */
  motion: { mode?: string | null; intensity?: number | null } | null;
  fps: number;
  force?: boolean;
  onProgress?: (done: number, total: number, label: string) => void;
}

/** The cache hash — deterministic over EVERY render input. Pure. */
export function kineticClipHash(item: KineticClipItem, opts: RenderKineticClipsOptions): string {
  const stat = (p: string | null | undefined): { size: number; mtimeMs: number } | null => {
    if (!p) return null;
    try {
      const s = fs.statSync(p);
      return { size: s.size, mtimeMs: s.mtimeMs };
    } catch {
      return null;
    }
  };
  const camera = {
    kind: kineticCameraKind(item.scene, opts.motion),
    amp: kineticCameraAmp(opts.motion),
  };
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        version: 1, // the applier/timing contract version — bump re-renders
        spec: item.spec,
        durationMs: item.durationMs,
        camera,
        fps: opts.fps,
        brand: opts.brand ?? null,
        imageUrl: item.imageUrl ?? null,
        imageStat: stat(item.imageUrl ?? null),
      })
    )
    .digest("hex");
}

function slideKineticClipPath(videoDirPath: string, sceneIndex: number): string {
  return path.join(videoDirPath, `slide-anim-${String(sceneIndex).padStart(2, "0")}.mp4`);
}

/** Render the deck's kinetic clips. Per scene: a cache hit answers the clip
 *  path; a miss renders frames + encodes; a FAILURE of one scene answers
 *  null for it (that scene falls back to the static deck — the honest
 *  degradation) EXCEPT cancellation, which propagates (a cancel must abort,
 *  never degrade). A browser-level failure rethrows — the caller notes the
 *  fallback once for the whole deck. */
export async function renderKineticSlideClips(
  videoDirPath: string,
  items: KineticClipItem[],
  opts: RenderKineticClipsOptions
): Promise<(string | null)[]> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true, args: [...WB_CHROMIUM_LAUNCH_ARGS] });
  const out: (string | null)[] = new Array(items.length).fill(null);
  const fps = Math.min(opts.fps, 30); // the D3 shared timebase (the rig law)
  const tmpHtml = path.join(opts.outDir, `slide-anim-tmp-${Date.now()}.html`);
  const isCancel = (e: unknown): boolean =>
    e instanceof Error && e.name === "JobCancelledError";
  try {
    for (const [i, item] of items.entries()) {
      const clipPath = slideKineticClipPath(videoDirPath, item.scene.index);
      const hashPath = `${clipPath}.hash`;
      const hash = kineticClipHash(item, opts);
      opts.onProgress?.(i, items.length, `Animating slide ${i + 1} of ${items.length}`);
      if (
        !opts.force &&
        fs.existsSync(clipPath) &&
        fs.existsSync(hashPath) &&
        fs.readFileSync(hashPath, "utf8").trim() === hash &&
        fs.statSync(clipPath).size > SLIDE_KINETIC_CLIP_FLOOR
      ) {
        out[i] = clipPath;
        continue;
      }
      const frames = frameCountOf(item.durationMs, fps);
      if (frames > SLIDES_KINETIC_FRAME_BUDGET) {
        // One scene past the wall — that scene falls back; the caller's
        // deck-total gate makes this near-impossible (it refuses the pass
        // before chromium launches).
        continue;
      }
      const camera = {
        kind: kineticCameraKind(item.scene, opts.motion),
        amp: kineticCameraAmp(opts.motion),
      };
      const framesDir = path.join(opts.outDir, `slide-anim-${String(item.scene.index).padStart(2, "0")}-frames`);
      try {
        fs.mkdirSync(framesDir, { recursive: true });
        const durSec = frames / fps;
        fs.writeFileSync(
          tmpHtml,
          slideHtml(item.spec, item.imageUrl ?? null, opts.brand ?? null, true)
        );
        const context = await browser.newContext({
          viewport: { width: SLIDE_OUT_W, height: SLIDE_OUT_H },
          deviceScaleFactor: SLIDE_KINETIC_SCALE,
        });
        await context.route("**/*", (route) => route.abort());
        const page = await context.newPage();
        try {
          await page.goto(`file://${tmpHtml}`, { waitUntil: "load" });
          await page.waitForTimeout(30); // font shaping settle (the PNG law)
          for (let f = 0; f < frames; f++) {
            const tMs = (f / fps) * 1000;
            const payload = slideFrameAt(item.spec, tMs, item.durationMs, camera);
            await page.evaluate(`(${APPLY_SLIDE_FRAME_FN})(${JSON.stringify(payload)})`);
            await page.screenshot({
              path: path.join(framesDir, `f${String(f).padStart(5, "0")}.jpg`),
              type: "jpeg",
              quality: 90,
              clip: { x: 0, y: 0, width: SLIDE_OUT_W, height: SLIDE_OUT_H },
            });
            if (f % 24 === 0) {
              opts.onProgress?.(
                i,
                items.length,
                `Animating slide ${i + 1} of ${items.length} — frame ${f + 1}/${frames}`
              );
            }
          }
          const sceneFile = path.join(opts.outDir, `slide-anim-render-${item.scene.index}.mp4`);
          await runFfmpeg(slideKineticEncodeArgs({ framesDir, fps, durSec, sceneFile }));
          fs.renameSync(sceneFile, clipPath);
          fs.writeFileSync(hashPath, hash);
          out[i] = clipPath;
        } finally {
          await context.close().catch(() => {});
        }
      } catch (err) {
        if (isCancel(err)) throw err;
        // A broken spec / encode failure for ONE scene — answer null, that
        // scene plays the static deck (the honest degradation, reported by
        // the caller through the null entries).
        continue;
      } finally {
        fs.rmSync(framesDir, { recursive: true, force: true });
      }
    }
  } finally {
    fs.rmSync(tmpHtml, { force: true });
    await browser.close();
  }
  return out;
}

async function runFfmpeg(args: string[]): Promise<void> {
  // The zombie-aware runner (proc.ts) — the engine doctrine (the S154
  // consistency fix): a hung reaper after Playwright can't stall a clip
  // encode; runProcess decides completion itself.
  await runProcess("ffmpeg", args, { timeoutMs: 10 * 60 * 1000, label: "slide-kinetic-encode" });
}

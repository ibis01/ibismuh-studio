// Audio mix engine — the single source of truth for how narration and music
// become one broadcast-normalized stereo track.
//
// Why this module exists (the -24.6 LUFS post-mortem):
//   The old finalizer only ran loudness normalization INSIDE the music
//   branch. A narration-only render (music off) shipped whatever the TTS
//   produced — measured live at -24.6 LUFS integrated, ~9 LU quieter than
//   the YouTube comfort zone. The fix is structural, not parametric:
//   EVERY final mix, with or without music, now flows through the same
//   measure-then-normalize contract implemented here.
//
// Pipeline contract (shared by the render finalizer, the mix-preview route
// and the QC gate):
//   1. Build the mix   — voice split, ducked bed (sidechaincompress), amix.
//   2. Measure it      — one loudnorm analysis pass (I / TP / LRA / thresh).
//   3. Normalize it    — LINEAR two-pass loudnorm to the delivery targets
//                        (dynamic single-pass only when measurement is
//                        impossible, e.g. fully silent input) + alimiter.
//
// Targets follow the delivery spec: stereo web video at ~-16 LUFS integrated
// with true peaks at or below -1 dBTP. Individual library tracks are ALSO
// anchored at -16 LUFS at ingest (music.ts), so the mix stage only trims the
// SUM, never fights per-track level drift.
//
// Pure functions (chain builders, parsers, static-run analysis) are exported
// for the offline unit suite; ffmpeg-touching helpers are thin wrappers.

import { execFile } from "child_process";
import { promisify } from "util";
import { runProcess } from "./proc";

const _execFileAsync = promisify(execFile);

// ---------- delivery targets ----------

export const MIX_TARGETS = {
  /** Final integrated loudness (LUFS) — stereo web video. */
  integratedLUFS: -16,
  /** True-peak ceiling (dBTP) — leaves headroom for lossy encode overshoot. */
  truePeakDBTP: -1.0,
  /** Loudness-range gate for the normalization filter (LU). */
  lra: 11,
} as const;

/** QC pass window around the target — linear loudnorm lands well inside it. */
export const LUFS_PASS_WINDOW: readonly [number, number] = [-19.5, -13.0];
/** QC ceiling for loudness range — above this, volume feels inconsistent. */
export const LRA_WARN = 18;

// ---------- ducking ----------

export type DuckIntensity = "off" | "subtle" | "standard" | "strong";

export const DUCK_INTENSITIES: readonly { id: DuckIntensity; label: string; desc: string }[] = [
  { id: "off", label: "Off", desc: "Constant bed level — no ducking under narration" },
  { id: "subtle", label: "Subtle", desc: "Gentle 4-6 dB dip while the narrator speaks" },
  { id: "standard", label: "Standard", desc: "Broadcast-style duck — clear room for the voice" },
  { id: "strong", label: "Strong", desc: "Deep duck — the bed almost disappears under speech" },
];

const DUCK_IDS = new Set<string>(DUCK_INTENSITIES.map((d) => d.id));

/** Coerce anything (API body, DB row, settings) into a valid intensity. */
export function sanitizeDuckIntensity(v: unknown): DuckIntensity {
  return typeof v === "string" && DUCK_IDS.has(v) ? (v as DuckIntensity) : "standard";
}

/** Is this string a valid intensity id? (PATCH validation) */
export function isDuckIntensity(v: unknown): v is DuckIntensity {
  return typeof v === "string" && DUCK_IDS.has(v);
}

/**
 * sidechaincompress parameters per intensity. The sidechain is the VOICE:
 * when it crosses `threshold`, the bed is compressed by `ratio` with the
 * given attack/release envelope. `null` means ducking is disabled.
 */
export function duckParams(intensity: DuckIntensity): {
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
} | null {
  switch (intensity) {
    case "off":
      return null;
    case "subtle":
      return { threshold: 0.06, ratio: 4, attack: 35, release: 650 };
    case "strong":
      return { threshold: 0.015, ratio: 14, attack: 15, release: 300 };
    case "standard":
    default:
      return { threshold: 0.03, ratio: 9, attack: 25, release: 450 };
  }
}

/**
 * The [music][sc] → [mduck] link for one intensity. "off" is a passthrough —
 * but the sidechain label is still CONSUMED (anullsink) so the caller's
 * asplit graph binds; an unconnected [sc] aborts the whole filter_complex.
 */
export function duckChain(intensity: DuckIntensity, musicLabel = "music", scLabel = "sc", outLabel = "mduck"): string {
  const p = duckParams(intensity);
  if (!p) return `[${scLabel}]anullsink;[${musicLabel}]anull[${outLabel}]`;
  return (
    `[${musicLabel}][${scLabel}]sidechaincompress=threshold=${p.threshold}:ratio=${p.ratio}:` +
    `attack=${p.attack}:release=${p.release}[${outLabel}]`
  );
}

// ---------- mix chain builders ----------
//
// Input contract (matches the finalizer's -i order):
//   input 0 — the stitched base MP4 (voice [+ SFX] on its audio track)
//   input 1 — the music source: library track file (looped) or lavfi drone

/** Split the base audio into the dry voice stem and the duck sidechain. */
export function voiceSplitChain(): string {
  return "[0:a]aformat=channel_layouts=stereo,asplit=2[voice][sc]";
}

/**
 * Library-track bed chain: trim to length, apply the user's gain + fades.
 * `fadeIn/fadeOut` must already be clamped to the video length by the caller.
 */
export function bedChain(o: {
  totalSec: number;
  gain: number;
  fadeInSec: number;
  fadeOutSec: number;
}): string {
  const fadeOutStart = Math.max(o.totalSec - o.fadeOutSec, 0);
  return (
    `[1:a]aformat=channel_layouts=stereo,atrim=duration=${o.totalSec.toFixed(3)},asetpts=N/SR/TB,` +
    `volume=${o.gain.toFixed(3)},afade=t=in:d=${Math.max(o.fadeInSec, 0).toFixed(2)},` +
    `afade=t=out:st=${fadeOutStart.toFixed(2)}:d=${o.fadeOutSec.toFixed(2)}[music]`
  );
}

/** Synthesized-drone bed chain (render.ts inline niche drone fallback). */
export function droneBedChain(o: { totalSec: number; lowpassHz: number; fadeInSec: number; fadeOutSec: number }): string {
  const fadeOutStart = Math.max(o.totalSec - o.fadeOutSec, 0);
  return (
    `[1:a]aformat=channel_layouts=stereo,lowpass=f=${o.lowpassHz},afade=t=in:d=${o.fadeInSec.toFixed(2)},` +
    `afade=t=out:st=${fadeOutStart.toFixed(2)}:d=${o.fadeOutSec.toFixed(2)}[music]`
  );
}

/** Voice + ducked bed → one stereo pre-normalization mix. */
export function mixTail(voiceWeight = 1, musicWeight = 1): string {
  return `[voice][mduck]amix=inputs=2:duration=first:normalize=0:weights='${voiceWeight} ${musicWeight}'[mix]`;
}

// ---------- per-scene music bed automation (Timeline Studio S2) ----------

/**
 * Per-scene music-bed level automation: a `volume` expression riding the
 * bed at factor[i] over segment i's window on the BLENDED timeline,
 * inserted between bedChain and duckChain (label [music] → [mvol]).
 *
 * Window rule — PRIORITY, not coverage: term i is active from segment i's
 * start to segment (i+1)'s start. Blended-timeline windows OVERLAP at each
 * seam (that's the blend), and simple gte/lt coverage would double-fire in
 * the overlap; priority windows give the seam to the incoming scene, which
 * is both gapless and single-valued. Past the last window the expression is
 * 0 — the bed is already trimmed to the video length, so nothing is lost.
 *
 * Returns null when the factors are uniform (a no-op volume filter would
 * cost a re-encode for nothing) or the input is malformed — callers skip
 * the chain entirely and keep the plain [music] label.
 */
export function musicLevelAutomation(
  segments: { start: number; duration: number }[],
  factors: number[]
): string | null {
  if (segments.length === 0 || factors.length !== segments.length) return null;
  const f = factors.map((x) => (Number.isFinite(x) ? Math.min(Math.max(x, 0), 8) : 1));
  if (f.every((x) => Math.abs(x - f[0]) < 0.001)) return null;
  const terms = segments.map((seg, i) => {
    const start = Math.max(0, seg.start);
    const next = segments[i + 1];
    const end = next
      ? Math.max(next.start, start + 0.05)
      : start + Math.max(seg.duration, 0.05);
    return `${f[i].toFixed(3)}*gte(t,${start.toFixed(3)})*lt(t,${end.toFixed(3)})`;
  });
  // eval=frame — the volume filter evaluates its expression ONCE at init by
  // default (t=0 → the first window's factor, frozen for the whole stream).
  // Per-frame eval is what makes the automation actually move with t.
  return `[music]volume='${terms.join("+")}':eval=frame[mvol]`;
}

// ---------- S167 — the transcript-driven duck automation lanes ----------
//
// The audit's borrow (Part 3.6 + the HyperFrames receipt, Part 2.4): the
// live sidechaincompress duck above reacts to the MIX; a transcript-driven
// render instead lays the duck down as a KEYFRAMED gain envelope — word /
// segment timestamps → automation (attack 0.15s / release 0.4s / duck 0.25,
// the measured HyperFrames numbers), rendered into the mix deterministically.
// These lanes are the deterministic form: PURE math (no ffmpeg, no clock),
// the envelope is a straight-line ramp per edge (attack down, hold at the
// depth, release up), and the chain compiles to ONE volume expression with
// eval=frame (the same per-frame-eval seam musicLevelAutomation proved).
// The legacy sidechain path is untouched — absent windows ⇒ no lane, the
// existing mix byte-for-byte.

/** The measured automation constants (the audit's Part 2.4 numbers). */
export const DUCK_AUTOMATION = {
  /** Seconds from window start to full depth — the attack ramp. */
  attackSec: 0.15,
  /** Seconds from window end back to unity — the release ramp. */
  releaseSec: 0.4,
  /** The held gain inside a window (0.25 ≈ −12 dB — the measured duck). */
  depth: 0.25,
} as const;

/** One transcript window the bed ducks under. startSec/endSec are seconds
 *  on the mix clock (the blended timeline's t). */
export interface DuckWindow {
  startSec: number;
  endSec: number;
}

/** The envelope gain at time t: unity outside every window, a straight
 *  attack ramp (1 → depth over attackSec) into a hold, then a straight
 *  release ramp (depth → 1 over releaseSec). Overlapping windows take the
 *  DEEPEST dip (a duck never duckles). A window shorter than the attack
 *  never reaches full depth — the two ramps cross where they cross. Pure,
 *  deterministic — the keyframe pins hold it. */
export function duckGainAt(
  windows: readonly DuckWindow[],
  t: number,
  opts: { attackSec?: number; releaseSec?: number; depth?: number } = {}
): number {
  const attack = Number.isFinite(opts.attackSec) && (opts.attackSec as number) > 0
    ? (opts.attackSec as number)
    : DUCK_AUTOMATION.attackSec;
  const release = Number.isFinite(opts.releaseSec) && (opts.releaseSec as number) > 0
    ? (opts.releaseSec as number)
    : DUCK_AUTOMATION.releaseSec;
  const depth = Number.isFinite(opts.depth) && (opts.depth as number) > 0
    ? (opts.depth as number)
    : DUCK_AUTOMATION.depth;
  let deepest = 0;
  for (const w of windows) {
    const start = Number(w?.startSec);
    const end = Number(w?.endSec);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    // The dip shape: rise over the attack, fall over the release — the
    // ramps cross for a too-short window (min of the two shapes).
    const rise = (t - start) / attack;
    const fall = (end + release - t) / release;
    const dip = Math.min(1, Math.max(0, rise), Math.max(0, Math.min(1, fall)));
    deepest = Math.max(deepest, dip);
  }
  return 1 - (1 - depth) * deepest;
}

/** The KEYFRAMED envelope: the envelope sampled at the mix fps — the
 *  automation lane's deliverable, the thing the pins read and a consumer
 *  can lay down as literal keyframes. Times ascend, gains in [depth, 1]. */
export function duckEnvelopeKeyframes(
  windows: readonly DuckWindow[],
  fps: number,
  opts: { attackSec?: number; releaseSec?: number; depth?: number; totalSec?: number } = {}
): { tSec: number; gain: number }[] {
  const rate = Number.isFinite(fps) && fps > 0 ? fps : 30;
  const total = Number.isFinite(opts.totalSec) && (opts.totalSec as number) > 0
    ? (opts.totalSec as number)
    : windows.reduce((m, w) => Math.max(m, (w?.endSec ?? 0) + DUCK_AUTOMATION.releaseSec), 0);
  const frames = Math.max(0, Math.ceil(total * rate));
  const out: { tSec: number; gain: number }[] = [];
  for (let i = 0; i <= frames; i++) {
    const tSec = i / rate;
    out.push({ tSec, gain: duckGainAt(windows, tSec, opts) });
  }
  return out;
}

/**
 * The automation chain for one ducked bed: the KEYFRAMED envelope compiled
 * into a `volume` expression riding eval=frame — the same per-frame seam
 * musicLevelAutomation uses. The expression is 1 − (1−depth)·max(dips):
 * each window contributes min(clip((t−s)/attack,0,1), clip((e+release−t)/
 * release,0,1)) — the exact shape duckGainAt evaluates. Returns null when
 * the windows are malformed/absent (callers keep the plain [music] label —
 * the legacy duck path or no duck at all, byte-for-byte).
 */
export function duckAutomationChain(
  windows: readonly DuckWindow[],
  musicLabel = "music",
  outLabel = "mduck",
  opts: { attackSec?: number; releaseSec?: number; depth?: number } = {}
): string | null {
  const attack = Number.isFinite(opts.attackSec) && (opts.attackSec as number) > 0
    ? (opts.attackSec as number)
    : DUCK_AUTOMATION.attackSec;
  const release = Number.isFinite(opts.releaseSec) && (opts.releaseSec as number) > 0
    ? (opts.releaseSec as number)
    : DUCK_AUTOMATION.releaseSec;
  const depth = Number.isFinite(opts.depth) && (opts.depth as number) > 0
    ? (opts.depth as number)
    : DUCK_AUTOMATION.depth;
  const clean = (windows ?? [])
    .map((w) => ({ start: Number(w?.startSec), end: Number(w?.endSec) }))
    .filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > w.start && w.start >= 0);
  if (clean.length === 0) return null;
  const dip = (w: { start: number; end: number }): string =>
    `min(clip((t-${w.start.toFixed(3)})/${attack.toFixed(3)},0,1),clip((${(w.end + release).toFixed(3)}-t)/${release.toFixed(3)},0,1))`;
  // max() in ffmpeg expressions is two-arg — nest for multiple windows.
  const deepest = clean
    .map(dip)
    .reduce((acc, d) => (acc ? `max(${acc},${d})` : d), "");
  return (
    `[${musicLabel}]volume='1-${(1 - depth).toFixed(3)}*${deepest}':eval=frame[${outLabel}]`
  );
}

// ---------- loudness measurement (pass 1) ----------

export interface LoudnessMeasurement {
  integratedLUFS: number;
  truePeakDBTP: number;
  lra: number;
  /** Loudness threshold loudnorm measured — required by the linear pass. */
  threshLUFS: number;
  /** target_offset loudnorm computed for the delivery targets. */
  offsetLU: number;
}

/**
 * Parse the JSON block a `loudnorm=print_format=json` analysis pass appends
 * to stderr. Pure — unit-tested against -inf / malformed / happy paths.
 */
export function parseLoudnormJson(stderr: string): LoudnessMeasurement | null {
  const start = stderr.lastIndexOf("{");
  const end = stderr.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let raw: Record<string, string>;
  try {
    raw = JSON.parse(stderr.slice(start, end + 1)) as Record<string, string>;
  } catch {
    return null;
  }
  const num = (v: string | undefined): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  };
  const out: LoudnessMeasurement = {
    integratedLUFS: num(raw.input_i),
    truePeakDBTP: num(raw.input_tp),
    lra: num(raw.input_lra),
    threshLUFS: num(raw.input_thresh),
    offsetLU: num(raw.target_offset),
  };
  // -inf / NaN integrated loudness (pure silence) cannot drive a linear pass.
  if (!Number.isFinite(out.integratedLUFS)) return null;
  return out;
}

/**
 * Measure one audio-bearing file against the delivery targets.
 * Returns null when the file can't be decoded or is fully silent.
 * (Zombie-aware runner — see proc.ts.)
 */
export async function measureLoudness(file: string): Promise<LoudnessMeasurement | null> {
  try {
    const { stderr } = await runProcess(
      "ffmpeg",
      [
        "-hide_banner", "-nostats",
        "-i", file,
        "-af", `loudnorm=I=${MIX_TARGETS.integratedLUFS}:TP=${MIX_TARGETS.truePeakDBTP}:LRA=${MIX_TARGETS.lra}:print_format=json`,
        "-f", "null", "-",
      ],
      { timeoutMs: 8 * 60 * 1000 }
    );
    return parseLoudnormJson(stderr);
  } catch {
    return null;
  }
}

// ---------- normalization (pass 2) ----------

/**
 * The normalization tail applied to the measured mix: LINEAR two-pass
 * loudnorm (pure gain when headroom allows — no dynamic pumping) plus a
 * safety limiter and the pipeline's 48 kHz. Falls back to dynamic single-pass
 * loudnorm when no measurement is available, so the output is never raw.
 */
export function normalizationFilter(m: LoudnessMeasurement | null): string {
  const base = `loudnorm=I=${MIX_TARGETS.integratedLUFS}:TP=${MIX_TARGETS.truePeakDBTP}:LRA=${MIX_TARGETS.lra}`;
  const measured =
    m !== null
      ? `:measured_I=${m.integratedLUFS.toFixed(2)}:measured_TP=${m.truePeakDBTP.toFixed(2)}` +
        `:measured_LRA=${m.lra.toFixed(2)}:measured_thresh=${m.threshLUFS.toFixed(2)}` +
        `:offset=${m.offsetLU.toFixed(2)}:linear=true`
      : "";
  // loudnorm upsamples internally (up to 192 kHz) — aresample returns the
  // track to 48 kHz before the AAC encode.
  // The limiter ceiling is −1.5 dBFS (0.841 linear), NOT the delivery −1.0
  // dBTP: alimiter caps SAMPLE peaks, but the QC gate measures TRUE
  // (inter-sample) peaks on the encoded AAC, which overshoot sample peaks by
  // up to ~0.5 dB. Capping samples at −1.5 keeps the measured true peak
  // inside the −1.0 dBTP delivery target (Battle Yamuk shipped −0.5 dBTP
  // with the old 0.891 ceiling).
  return `${base}${measured},alimiter=limit=0.841:level=false,aresample=48000`;
}

// ---------- visual pacing (static-shot detection) ----------
//
// freezedetect catches EXACT frozen frames; a still image with a barely
// moving Ken Burns crop (or Smart Motion off, or static stock) evades it
// while still reading as "nothing happens on screen". This pass samples the
// video at low resolution + fixed fps and flags runs where consecutive
// samples are visually identical — the editor's "this shot holds too long".

export const STATIC_SAMPLE = {
  fps: 2,
  width: 160,
  height: 90,
  /** Mean |Δluma| (0..255) below which two samples count as identical. */
  diffThreshold: 0.9,
  /** A static stretch must last this long before it's flagged. */
  minRunSec: 6,
} as const;

export interface StaticRun {
  startSec: number;
  endSec: number;
}

/** Mean absolute per-byte difference between two equal-length frames. */
export function frameMeanDiff(a: Uint8Array, b: Uint8Array): number {
  if (a.length === 0 || a.length !== b.length) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/**
 * Collapse a sampled frame stream into static runs. Pure — regression-tested
 * with synthetic buffers. `frameBytes` = one sample's byte length.
 */
export function staticRunsFromFrames(
  frames: Uint8Array,
  frameBytes: number,
  opts: {
    fps: number;
    diffThreshold: number;
    minRunSec: number;
  } = STATIC_SAMPLE
): StaticRun[] {
  const count = frameBytes > 0 ? Math.floor(frames.length / frameBytes) : 0;
  if (count < 2) return [];
  const runs: StaticRun[] = [];
  // A static run starts at sample i when sample i..j are pairwise-identical;
  // `start` is the index of the FIRST sample of the identical stretch.
  let start = 0;
  for (let i = 1; i <= count; i++) {
    const prev = frames.subarray((i - 1) * frameBytes, i * frameBytes);
    const cur = i < count ? frames.subarray(i * frameBytes, (i + 1) * frameBytes) : null;
    const identical =
      cur !== null && frameMeanDiff(prev, cur) < opts.diffThreshold;
    if (!identical) {
      // samples [start .. i-1] were one pairwise-identical stretch; it is
      // "static" when it spans at least minRunSec of wall time.
      const runSec = (i - 1 - start) / opts.fps;
      if (runSec >= opts.minRunSec && start < i - 1) {
        runs.push({ startSec: start / opts.fps, endSec: (i - 1) / opts.fps });
      }
      start = i;
    }
  }
  return runs;
}

/**
 * Sample the video and return flagged static runs. Never throws — a failed
 * analysis returns [] (the QC check reports "not measured" instead).
 */
export async function detectStaticRuns(file: string): Promise<{ runs: StaticRun[]; measured: boolean }> {
  const { fps, width, height } = STATIC_SAMPLE;
  const frameBytes = width * height;
  try {
    // Zombie-aware runner with raw luma bytes on stdout — read the temp
    // output back as a Buffer (utf8 decoding would corrupt binary data).
    const { stdoutBuf } = await runProcess(
      "ffmpeg",
      [
        "-hide_banner", "-nostats",
        "-i", file,
        "-vf", `fps=${fps},scale=${width}:${height},format=gray`,
        "-f", "rawvideo", "-",
      ],
      { timeoutMs: 8 * 60 * 1000 }
    );
    const frames = new Uint8Array(stdoutBuf.buffer, stdoutBuf.byteOffset, stdoutBuf.length);
    return { runs: staticRunsFromFrames(frames, frameBytes), measured: true };
  } catch {
    return { runs: [], measured: false };
  }
}

/** Format a static-run list for a QC check detail line. */
export function staticRunsDetail(runs: StaticRun[]): string {
  return runs
    .slice(0, 4)
    .map((r) => `${r.startSec.toFixed(0)}–${r.endSec.toFixed(0)}s`)
    .join(", ");
}

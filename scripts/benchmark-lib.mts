// benchmark-lib.mts — the SHARED DETERMINISTIC-BENCHMARK HELPERS (master plan
// Phase 8: "for classic/Ken Burns, story, character, and slides, add fixed
// benchmark projects and scripts").
//
// Before this module the four Phase-8 lane benchmarks would each re-implement
// the same measurement plumbing (ffprobe metadata, frame QC, thumbnails,
// cross-run PSNR). This module owns it ONCE, under the repo's laws:
//
//   · THE CODEC TOLERANCE LAW — libx264 output is NOT byte-stable across
//     runs/environments (the S165 golden-metadata law: "codec/build drift
//     lands far above the PSNR floor"). Determinism is therefore pinned at
//     two planes, never at the byte plane:
//       1. the CONTAINER — ffprobe metadata (codec, geometry, fps, frame
//          count, duration within the committed tolerance) must be
//          IDENTICAL across two consecutive runs of the same fixture;
//       2. the PIXELS — the per-frame PSNR between two independent runs of
//          the same fixture must clear the committed floor (30 dB, the
//          s165 harness floor). A pixel change that matters lands far
//          below it; codec drift lands far above it.
//   · FAIL-VISIBLE QC — a sampled frame that decodes black or empty is a
//     named failure, never a silent pass (the contact-sheet law, mirrored).
//   · NO DB, NO NETWORK — every helper here is pure ffmpeg/ffprobe + fs;
//     the benchmarks that use it never touch the database or a provider.
//
// Pure helpers only — no src imports, no env reads at module load.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function die(script: string, msg: string): never {
  console.error(`${script}: FAIL — ${msg}`);
  process.exit(1);
}

// --- ffprobe metadata (the container plane of the codec tolerance law) ------

export interface ProbeMeta {
  codec: string;
  width: number;
  height: number;
  /** Container duration in seconds (format.duration). */
  durationSec: number;
  /** Stream average frame rate, rounded to 3 dp ("30000/1001" → 29.97). */
  fps: number;
  /** Decoded frame count (nb_read_frames — the container's real payload). */
  frames: number | null;
  sizeBytes: number;
  hasAudio: boolean;
}

interface ProbeJson {
  streams?: Array<{
    codec_name?: string;
    codec_type?: string;
    width?: number;
    height?: number;
    avg_frame_rate?: string;
    nb_read_frames?: string;
  }>;
  format?: { duration?: string; size?: string };
}

function rateToFps(rate: string | undefined): number {
  if (!rate) return NaN;
  const [num, den] = rate.split("/");
  const n = Number(num);
  const d = den === undefined ? 1 : Number(den);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return NaN;
  return Math.round((n / d) * 1000) / 1000;
}

export function ffprobeMeta(file: string): ProbeMeta {
  const res = spawnSync("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-count_frames",
    "-show_entries",
    "stream=codec_name,width,height,avg_frame_rate,nb_read_frames:format=duration,size",
    "-of", "json",
    file,
  ], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (res.status !== 0) throw new Error(`ffprobe cannot read ${file}: ${res.stderr.trim().slice(0, 200)}`);
  const json = JSON.parse(res.stdout || "{}") as ProbeJson;
  const v = json.streams?.[0] ?? {};
  const dur = Number.parseFloat(json.format?.duration ?? "nan");
  const size = Number.parseInt(json.format?.size ?? "0", 10);
  const meta: ProbeMeta = {
    codec: v.codec_name ?? "unknown",
    width: v.width ?? 0,
    height: v.height ?? 0,
    durationSec: Number.isFinite(dur) ? dur : NaN,
    fps: rateToFps(v.avg_frame_rate),
    frames: v.nb_read_frames ? Number.parseInt(v.nb_read_frames, 10) : null,
    sizeBytes: Number.isFinite(size) ? size : 0,
    hasAudio: false,
  };
  // The audio stream presence — probed separately (the s87 hasAudioStream shape).
  const ares = spawnSync("ffprobe", [
    "-v", "error", "-select_streams", "a",
    "-show_entries", "stream=codec_type", "-of", "csv=p=0", file,
  ], { encoding: "utf8" });
  meta.hasAudio = ares.status === 0 && (ares.stdout ?? "").includes("audio");
  return meta;
}

export interface MetaDiff {
  field: string;
  a: unknown;
  b: unknown;
}

/** The container-plane determinism comparison (the codec tolerance law):
 *  codec, geometry, fps and frame count must be EXACT; duration rides the
 *  committed tolerance (container duration drifts a frame at the boundaries). */
export function compareMeta(a: ProbeMeta, b: ProbeMeta, durationTolSec = 0.06): MetaDiff[] {
  const diffs: MetaDiff[] = [];
  if (a.codec !== b.codec) diffs.push({ field: "codec", a: a.codec, b: b.codec });
  if (a.width !== b.width) diffs.push({ field: "width", a: a.width, b: b.width });
  if (a.height !== b.height) diffs.push({ field: "height", a: a.height, b: b.height });
  if (Math.abs(a.fps - b.fps) > 0.001) diffs.push({ field: "fps", a: a.fps, b: b.fps });
  if (a.frames !== null && b.frames !== null && a.frames !== b.frames) {
    diffs.push({ field: "frames", a: a.frames, b: b.frames });
  }
  if (!(Math.abs(a.durationSec - b.durationSec) <= durationTolSec)) {
    diffs.push({ field: "durationSec", a: Number(a.durationSec.toFixed(3)), b: Number(b.durationSec.toFixed(3)) });
  }
  return diffs;
}

// --- the pixel plane: PSNR between two videos ------------------------------

/** Per-frame PSNR average between two videos (the psnr filter's summary,
 *  parsed from stderr — the s87 part-D shape, one reading here). */
export function psnrAverageDb(a: string, b: string): number | null {
  const res = spawnSync("ffmpeg", [
    "-hide_banner", "-i", a, "-i", b,
    "-filter_complex", "[0:v][1:v]psnr", "-f", "null", "-",
  ], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  // The summary rides stderr even on rejection — parse whatever arrived.
  const err = `${res.stderr ?? ""}`;
  const m = /average:(inf|\d+(?:\.\d+)?)/.exec(err);
  if (!m) return null;
  return m[1] === "inf" ? Number.POSITIVE_INFINITY : Number.parseFloat(m[1]);
}

// --- frame QC (fail-visible: black/empty frames are named failures) --------

/** One decoded frame as raw gray bytes (w*h) — the QC numbers' source. */
export function frameGray(file: string, atSec: number): Buffer {
  const res = spawnSync("ffmpeg", [
    "-v", "error", "-ss", atSec.toFixed(3), "-i", file,
    "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1",
  ], { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
  const buf = Buffer.from(res.stdout ?? []);
  if (res.status !== 0 || buf.length === 0) {
    throw new Error(`frame decode failed for ${file} @ ${atSec.toFixed(3)}s (exit ${res.status})`);
  }
  return buf;
}

/** Mean luma (0-255) of one decoded frame — the non-black QC gate's number. */
export function frameMeanLuma(file: string, atSec: number): number {
  const buf = frameGray(file, atSec);
  let sum = 0;
  for (const byte of buf) sum += byte;
  return sum / buf.length;
}

/** Mean absolute per-pixel difference between two decoded gray frames of the
 *  SAME geometry — the "the cut actually happened" QC number. Two frames of
 *  different content sit far above 2; codec noise sits far below. */
export function framesMeanAbsDiff(a: Buffer, b: Buffer): number {
  if (a.length !== b.length || a.length === 0) {
    throw new Error(`gray frames disagree in size (${a.length} vs ${b.length})`);
  }
  let acc = 0;
  for (let i = 0; i < a.length; i++) acc += Math.abs(a[i] - b[i]);
  return acc / a.length;
}

/** The WORST tile's mean absolute difference (tileSize x tileSize gray grid)
 *  — the parity metric's tile shape, so a SMALL moving element (a rig's
 *  mouth inside a wide frame) is measurable where the whole-frame mean would
 *  dilute it away. Two frames of identical content sit near 0; a genuinely
 *  moved element drives its own tile far above the codec-noise band. */
export function tilesMaxMeanAbsDiff(a: Buffer, b: Buffer, width: number, height: number, tileSize = 16): number {
  if (a.length !== b.length || a.length !== width * height) {
    throw new Error(`gray frames disagree in geometry (${a.length} vs ${b.length}, expected ${width * height})`);
  }
  let worst = 0;
  for (let ty = 0; ty + tileSize <= height; ty += tileSize) {
    for (let tx = 0; tx + tileSize <= width; tx += tileSize) {
      let acc = 0;
      for (let y = 0; y < tileSize; y++) {
        const row = (ty + y) * width + tx;
        for (let x = 0; x < tileSize; x++) acc += Math.abs(a[row + x] - b[row + x]);
      }
      const mean = acc / (tileSize * tileSize);
      if (mean > worst) worst = mean;
    }
  }
  return worst;
}

/** One frame extracted as a PNG thumbnail (fixed timestamp — deterministic). */
export function extractFrame(file: string, atSec: number, out: string): string {
  const res = spawnSync("ffmpeg", [
    "-v", "error", "-ss", atSec.toFixed(3), "-i", file,
    "-frames:v", "1", "-y", out,
  ], { encoding: "utf8" });
  if (res.status !== 0 || !fs.existsSync(out)) {
    throw new Error(`thumbnail extraction failed for ${file} @ ${atSec.toFixed(3)}s: ${res.stderr.trim().slice(0, 200)}`);
  }
  return out;
}

/** A ladder of fixed-timestamp thumbnails, 10%..90% of the run (the
 *  contact-sheet sampling law — deterministic, never wall-clock). */
export function extractThumbs(file: string, outDir: string, count: number, prefix: string): string[] {
  fs.mkdirSync(outDir, { recursive: true });
  const meta = ffprobeMeta(file);
  const outs: string[] = [];
  for (let i = 0; i < count; i++) {
    const frac = 0.1 + (0.8 * i) / Math.max(1, count - 1);
    const at = Math.min(Math.max(0.05, meta.durationSec * frac), Math.max(0.05, meta.durationSec - 0.05));
    outs.push(extractFrame(file, at, path.join(outDir, `${prefix}-${String(i + 1).padStart(2, "0")}.png`)));
  }
  return outs;
}

/** sha256 of a file — the receipt line for every committed artifact. */
export function fileSha256(file: string): string {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

/** Write a JSON receipt with the trailing newline (the manifest's shape). */
export function writeJson(file: string, obj: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
}

/** A tiny check ledger — every benchmark prints and exits on it. */
export class Ledger {
  passed = 0;
  failed = 0;
  readonly rows: { name: string; ok: boolean; detail: string }[] = [];
  check(name: string, ok: boolean, detail: string): boolean {
    this.rows.push({ name, ok, detail });
    if (ok) this.passed++;
    else this.failed++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
    return ok;
  }
  finish(script: string): void {
    console.log(`\n${script}: ${this.passed} passed, ${this.failed} failed`);
    if (this.failed > 0) process.exit(1);
  }
}

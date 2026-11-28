#!/usr/bin/env node
// contact-sheet.mts — the CONTACT-SHEET GENERATOR (master plan Phase 7:
// "six lane benchmark MP4 / contact-sheet / parity"). Before this module
// the repo had NO contact-sheet machinery anywhere (verified: zero
// matches) — scorers and reviewers had only markdown text sheets and
// per-frame JSON. This closes the artifact gap.
//
// WHAT IT MAKES: a tiled PNG contact sheet from sampled frames of one or
// more MP4s — the human-review artifact the blind scorers and the lane
// benchmarks were missing. ffmpeg does the decode + tile (one filter
// graph per input video, one output sheet per invocation).
//
// LAWS:
//   · DETERMINISTIC — sampling is by fixed timestamps, never by wall
//     clock; the same MP4 + the same grid → the same sheet (the battery
//     pins a stable sha256 across two builds).
//   · FAIL-VISIBLE — a missing input, an unreadable stream, or an empty
//     sample set is a hard, named failure (never a blank sheet).
//   · REUSABLE — the whole flow is one exported function
//     (buildContactSheet), so the blind-rescore kit (Phase 10) and the
//     lane benchmarks can call it instead of shelling out ad hoc.
//
// Run: node --import tsx scripts/contact-sheet.mts <video.mp4> [more.mp4 ...] --out sheet.png [--cols 4] [--per-video 6]
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function die(msg: string): never {
  console.error(`contact-sheet: FAIL — ${msg}`);
  process.exit(1);
}

function ffprobeDuration(file: string): number {
  const res = spawnSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file,
  ], { encoding: "utf8" });
  if (res.status !== 0) die(`ffprobe cannot read ${file}: ${res.stderr.trim().slice(0, 200)}`);
  const dur = Number.parseFloat((res.stdout ?? "").trim());
  if (!Number.isFinite(dur) || dur <= 0) die(`no measurable duration in ${file}`);
  return dur;
}

/** Extract one PNG frame at a fixed timestamp. Deterministic by law. */
function extractFrame(file: string, atSec: number, out: string): void {
  const res = spawnSync("ffmpeg", [
    "-v", "error", "-ss", atSec.toFixed(3), "-i", file,
    "-frames:v", "1", "-y", out,
  ], { encoding: "utf8" });
  if (res.status !== 0 || !fs.existsSync(out)) {
    die(`frame at ${atSec.toFixed(3)}s from ${file} failed: ${res.stderr.trim().slice(0, 200)}`);
  }
}

export interface ContactSheetOptions {
  /** Frames sampled per input video (default 6). */
  perVideo?: number;
  /** Columns in the tile grid (default 4). */
  cols?: number;
  /** Output PNG path. */
  out: string;
  /** Label rows under the sheet (default: the input basenames). */
}

/**
 * Build one tiled contact-sheet PNG from the sampled frames of the given
 * videos. Deterministic: fixed timestamp sampling (10%..90% of duration),
 * the tile filter with a fixed padding/margin, one output.
 */
export function buildContactSheet(videos: readonly string[], opts: ContactSheetOptions): string {
  if (videos.length === 0) die("no input videos");
  const perVideo = opts.perVideo ?? 6;
  const cols = opts.cols ?? 4;
  const scratch = fs.mkdtempSync(path.join(path.dirname(opts.out), ".contact-sheet-"));
  try {
    const frames: string[] = [];
    for (const video of videos) {
      if (!fs.existsSync(video)) die(`input missing: ${video}`);
      const dur = ffprobeDuration(video);
      // Fixed sample ladder: perVideo points spread 10%..90% of the run.
      for (let i = 0; i < perVideo; i++) {
        const frac = 0.1 + (0.8 * i) / Math.max(1, perVideo - 1);
        const at = Math.max(0.05, dur * frac);
        const frame = path.join(scratch, `${path.basename(video, ".mp4")}-${String(frames.length).padStart(3, "0")}.png`);
        extractFrame(video, at, frame);
        frames.push(frame);
      }
    }
    // The tile: one ffmpeg graph, inputs chained, scaled to a uniform
    // cell, padded into cols columns. -1 keeps the aspect.
    const args = ["-v", "error", "-y"];
    for (const f of frames) args.push("-i", f);
    const rows = Math.ceil(frames.length / cols);
    const filter = frames
      .map((_, i) => `[${i}:v]scale=320:-1,pad=324:200:2:2:black[t${i}]`)
      .join(";") + ";" +
      frames.map((_, i) => `[t${i}]`).join("") +
      `xstack=inputs=${frames.length}:layout=` +
      Array.from({ length: frames.length }, (_, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        return `${c * 324}_${r * 200}`;
      }).join("|") +
      // Explicit dimensions (the grid is known in JS) — no comma-bearing
      // expressions in the graph (a bare comma splits filter args).
      `,pad=${cols * 324}:${rows * 200}:0:0:black`;
    args.push("-filter_complex", filter, "-frames:v", "1", opts.out);
    const res = spawnSync("ffmpeg", args, { encoding: "utf8" });
    if (res.status !== 0 || !fs.existsSync(opts.out)) {
      die(`tile build failed: ${res.stderr.trim().slice(0, 300)}`);
    }
    return opts.out;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

/** sha256 of a file — the sheet's receipt line. */
export function fileSha256(file: string): string {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

// --- CLI ------------------------------------------------------------------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const flagValueSlots = new Set<number>();
  for (let i = 0; i < argv.length; i++) {
    if (["--out", "--per-video", "--cols"].includes(argv[i])) flagValueSlots.add(i + 1);
  }
  const outIdx = argv.indexOf("--out");
  const out = outIdx >= 0 ? argv[outIdx + 1] : undefined;
  const videos = argv.filter((a, i) => !flagValueSlots.has(i) && !a.startsWith("--"));
  if (!out || videos.length === 0) {
    console.log("usage: contact-sheet.mts <video.mp4> [more.mp4 ...] --out sheet.png [--per-video N] [--cols N]");
    process.exit(2);
  }
  const perVideoIdx = argv.indexOf("--per-video");
  const colsIdx = argv.indexOf("--cols");
  const sheet = buildContactSheet(videos, {
    out,
    perVideo: perVideoIdx >= 0 ? Number(argv[perVideoIdx + 1]) : undefined,
    cols: colsIdx >= 0 ? Number(argv[colsIdx + 1]) : undefined,
  });
  console.log(`contact-sheet: ${sheet} (${fileSha256(sheet).slice(0, 16)}…)`);
}

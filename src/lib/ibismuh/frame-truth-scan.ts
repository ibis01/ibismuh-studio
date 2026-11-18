// S165 — the generalized non-determinism scan for the engine frame-truth
// modules (the audit's staging: "lint-rule port: non-deterministic-code scan
// for engine modules — no Date.now/Math.random in frame-truth modules;
// several already exist as pins; this generalizes them").
//
// Before this slice the purity law lived as one-off source pins: the S164
// banned-token scan over the whiteboard tree, the transitions.ts purity
// pin, the applier-page-string token pins. Each holds ONE module (or one
// tree) against a hand-written token list — every new frame-truth module
// had to remember to add its own pin, and a forgotten pin was a silent gap.
// THIS module is the superset: ONE declared frame-truth walk (the pure
// motion/geometry/clock-math trees) against ONE rule table — the wall clock
// (Date.now), the Date constructor, ambient randomness (Math.random), and
// the high-resolution host clock (performance.now). The existing pins stay
// green untouched — the scan ADDS coverage, it replaces nothing.
//
// Design laws:
//   • CALL SITES, not commentary — comments are stripped (string-aware)
//     before the token scan, so a law's own prose ("no Date.now here")
//     can never trip it (the S157 usage-scan pattern, generalized).
//   • STRING CONTENT IS SCANNED — an applier page is a JS-in-string payload
//     rendered by chromium; a banned token inside that string IS a live
//     call site. The existing applier pins are thereby subsumed too.
//   • FAIL-LOUD, FAIL-CLOSED — every violation carries file, line, rule,
//     and the offending excerpt; an unscannable tree (a manifest entry
//     that went missing) throws rather than quietly passing.
//   • DETERMINISTIC — the walk sorts; the same tree always yields the same
//     violation order, so the scan itself cannot be the nondeterminism.
//
// This module is TOOLING (node:fs), not frame truth: it stays OUT of its
// own walk manifest, and its rule patterns are written escaped so the raw
// source never contains a live banned call site.

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// The rule table — the audit's four banned pattern classes.
// ---------------------------------------------------------------------------

export interface FrameTruthRule {
  /** The greppable rule name a violation reports. */
  name: string;
  /** The call-site pattern (matched per line of comment-stripped source). */
  pattern: RegExp;
  /** Why the pattern is banned in frame truth — printed with the violation. */
  why: string;
}

export const FRAME_TRUTH_RULES: readonly FrameTruthRule[] = [
  {
    name: "Date.now",
    pattern: /\bDate\.now\s*\(/,
    why: "the wall clock makes a frame depend on WHEN it was rendered — farm workers would diverge",
  },
  {
    name: "Date constructor",
    pattern: /\bnew\s+Date\s*\(/,
    why: "a constructed date reads the host clock — the same nondeterminism through another door",
  },
  {
    name: "Math.random",
    pattern: /\bMath\.random\s*\(/,
    why: "ambient randomness breaks replay byte-identity — motion must ride the one seeded stream",
  },
  {
    name: "performance.now",
    pattern: /\bperformance\.now\s*\(/,
    why: "the high-resolution host clock is scheduling truth, never frame truth",
  },
];

// ---------------------------------------------------------------------------
// The comment stripper — string-aware, line-count-preserving.
// ---------------------------------------------------------------------------

/** Strip line + block comments from JS/TS source while leaving string and
 *  template-literal content byte-identical. Newlines inside stripped block
 *  comments are preserved so violation LINE NUMBERS stay true to the
 *  original file. Imperfect at exotic corners (a regex literal containing
 *  a quote or a divider), where it degrades toward NOT stripping — the
 *  safe direction for a scanner whose failure mode is an honest false
 *  positive, never a silent pass. */
export function stripComments(source: string): string {
  let out = "";
  let i = 0;
  let inStr: string | null = null; // the opening quote char, or null
  while (i < source.length) {
    const c = source.charAt(i);
    const n = source.charAt(i + 1);
    if (inStr !== null) {
      out += c;
      if (c === "\\") {
        out += n;
        i += 2;
        continue;
      }
      if (c === inStr) inStr = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inStr = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === "/" && n === "/") {
      while (i < source.length && source.charAt(i) !== "\n") i += 1;
      continue;
    }
    if (c === "/" && n === "*") {
      i += 2;
      while (i < source.length && !(source.charAt(i) === "*" && source.charAt(i + 1) === "/")) {
        if (source.charAt(i) === "\n") out += "\n";
        i += 1;
      }
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The scan core — pure source → violations.
// ---------------------------------------------------------------------------

export interface FrameTruthViolation {
  file: string;
  line: number;
  rule: string;
  why: string;
  excerpt: string;
}

/** Scan ONE module's source against the rule table. `file` is carried into
 *  every violation (defaults to the fixture placeholder). Call sites only:
 *  comments are stripped first; string content stays scanned (an applier
 *  page is a string, and a banned call inside it is LIVE code). */
export function scanFrameTruthSource(source: string, file: string = "<source>"): FrameTruthViolation[] {
  const stripped = stripComments(source);
  const lines = stripped.split("\n");
  const out: FrameTruthViolation[] = [];
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li] ?? "";
    for (const rule of FRAME_TRUTH_RULES) {
      if (rule.pattern.test(line)) {
        out.push({
          file,
          line: li + 1,
          rule: rule.name,
          why: rule.why,
          excerpt: line.trim().slice(0, 140),
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The walk — the DECLARED frame-truth tree.
// ---------------------------------------------------------------------------

/**
 * The frame-truth manifest. Directories are walked whole (.ts files); the
 * file list names the modules in mixed trees — a tree that mixes frame
 * truth with legitimate clock users (orchestrators carry ready-gate
 * budgets, retry backoff, log stamps — the CLOCK is theirs to use; the
 * FRAME MATH is not) is entered file-by-file so the walk stays exact.
 *
 * The scanner module itself is deliberately absent (tooling, not frame
 * truth); render.ts/render3d.ts/whiteboard render.ts/qc.ts/slides.ts are
 * orchestrators whose clocks the ready gates legitimately spend.
 */
export const FRAME_TRUTH_WALK: { dirs: readonly string[]; files: readonly string[] } = {
  dirs: ["src/lib/ibismuh/anim", "src/lib/ibismuh/characters"],
  files: [
    // graphics — the frame truth (frameAt is THE motion source), the camera
    // math, the transition engine, the dedup law, the narration ms math.
    "src/lib/ibismuh/graphics/frame.ts",
    "src/lib/ibismuh/graphics/transitions.ts",
    "src/lib/ibismuh/graphics/static-dedup.ts",
    "src/lib/ibismuh/graphics/camera.ts",
    "src/lib/ibismuh/graphics/compose.ts",
    "src/lib/ibismuh/graphics/tracks.ts",
    "src/lib/ibismuh/graphics/vo-ms.ts",
    // whiteboard — the pure geometry (the S164 four) + the stroke/text
    // math + the timing tables (the mixed render tree is entered by file).
    "src/lib/ibismuh/whiteboard/roughen.ts",
    "src/lib/ibismuh/whiteboard/fills.ts",
    "src/lib/ibismuh/whiteboard/svg.ts",
    "src/lib/ibismuh/whiteboard/sketch.ts",
    "src/lib/ibismuh/whiteboard/glyphs.ts",
    "src/lib/ibismuh/whiteboard/text-draw.ts",
    "src/lib/ibismuh/whiteboard/timing.ts",
    "src/lib/ibismuh/whiteboard/beat-plan.ts",
    // the engine-level pure contracts — the kenburns planner, the 3D doc +
    // camera evaluation.
    "src/lib/ibismuh/motion.ts",
    "src/lib/ibismuh/scene3d.ts",
  ],
};

/** The declared walk materialized under `root`: every manifest file plus
 *  every .ts under the manifest dirs. Sorted — the walk is deterministic. */
export function collectFrameTruthFiles(root: string = process.cwd()): string[] {
  const files = new Set<string>();
  for (const f of FRAME_TRUTH_WALK.files) files.add(path.join(root, f));
  for (const d of FRAME_TRUTH_WALK.dirs) {
    const abs = path.join(root, d);
    const entries = fs.readdirSync(abs, { recursive: true }) as string[];
    for (const entry of entries) {
      if (entry.endsWith(".ts")) files.add(path.join(abs, entry));
    }
  }
  return [...files].sort();
}

/** Scan ONE directory's .ts files (non-recursive, sorted) — the walk's
 *  integration seam. The deliberate-nondeterminism fixture lands through
 *  HERE in the scan's own test scaffolding: a planted file is caught by
 *  the same readdir→read→scan path the real tree rides, and the temp dir
 *  it lived in dies before anything ships. */
export function scanFrameTruthDir(dir: string): FrameTruthViolation[] {
  const out: FrameTruthViolation[] = [];
  const names = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".ts"))
    .sort();
  for (const name of names) {
    const file = path.join(dir, name);
    out.push(...scanFrameTruthSource(fs.readFileSync(file, "utf8"), file));
  }
  return out;
}

/** The full scan: the declared frame-truth tree under `root`, every module
 *  walked and scanned. Empty output = the tree is frame-truth pure. A
 *  missing manifest entry throws (fail-loud — a walk that silently shrank
 *  would be a scan lying by omission). */
export function scanFrameTruthTree(root: string = process.cwd()): FrameTruthViolation[] {
  const out: FrameTruthViolation[] = [];
  for (const file of collectFrameTruthFiles(root)) {
    out.push(...scanFrameTruthSource(fs.readFileSync(file, "utf8"), file));
  }
  return out;
}

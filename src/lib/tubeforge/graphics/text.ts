// S150 — the C1 typography stack's pure helpers (docs/design/s150-typography.md §2.1).
//
// The audit's Phase C1: "font-family per payload … per-word/per-char ranges
// … auto-wrap (measure via the composed page, deterministic at write time)".
// The RENDER half of that law is estimator-only: no live measurement ever
// touches the frame path (the W1 getBBox lesson — the applier reads no
// layout), so the wrap decision and the reveal unit counts come from THIS
// module's deterministic, total, pure functions. The studio's write-time
// refinement (C2) may measure through the composed page and write explicit
// `\n` or a tuned `wrapPx` through the validated PUT; the grammar never
// measures on its own.
//
// ONE TRUTH: the validator counts reveal units through `countRevealUnits`
// and the composer lays them out through `revealUnitsPerLine` — the same
// tokenizer, so the wall's count and the render's markup can never drift.
//
// PURE — no fs, no DOM, no clock, no randomness (the S64 law): same inputs →
// identical strings, always. Leaf-module law: this file imports NOTHING from
// the grammar (types.ts imports it — the cycle must not exist).

/** The house char-width estimate — the SAME discipline the callout bubble's
 *  `bubbleCharW` has used since G1.3 (compose.ts reads THIS constant for
 *  that table now — one source, value-identical). All glyphs are estimated
 *  at `sizePx × TEXT_WRAP_CHAR_W` scene px; the estimate is deliberately
 *  coarse and CONSTANT — a proportional-font fudge would make the wrap
 *  font-metric-dependent and unpinnable. */
export const TEXT_WRAP_CHAR_W = 0.6;

/** Deterministic greedy word wrap, per explicit `\n` line.
 *
 *  - The input's `\n` lines wrap INDEPENDENTLY (an author's break is never
 *    merged away).
 *  - Char width = `sizePx × TEXT_WRAP_CHAR_W`; a joined line's width is its
 *    (chars + single separating spaces) × char width.
 *  - A word wider than the whole budget stays WHOLE on its own line — honest
 *    overflow, never a mid-word break (the no-silent-rewrite law's layout
 *    half).
 *  - Total on junk: empty text → [""]; non-finite/≤0 width or size → the
 *    line comes back unwrapped (the compose caller clamps wrapPx upstream —
 *    this total-shape guard is the estimator's own law, not a second
 *    validator).
 */
export function wrapTextToWidth(text: string, maxWidthPx: number, sizePx: number): string[] {
  if (text === "") return [""];
  const charW = sizePx * TEXT_WRAP_CHAR_W;
  const budget =
    Number.isFinite(maxWidthPx) && maxWidthPx > 0 && Number.isFinite(charW) && charW > 0
      ? maxWidthPx
      : Infinity; // junk width/size → every word fits (honest passthrough)
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const words = line.split(" ");
    let current = "";
    let currentChars = 0; // chars + separators in `current`
    for (const word of words) {
      const wordChars = Array.from(word).length;
      const joinedChars = current === "" ? wordChars : currentChars + 1 + wordChars;
      if (current !== "" && joinedChars * charW > budget) {
        out.push(current);
        current = word;
        currentChars = wordChars;
      } else {
        current = current === "" ? word : current + " " + word;
        currentChars = joinedChars;
      }
    }
    out.push(current);
  }
  return out;
}

/** The reveal unit modes — the composer's and the validator's shared
 *  vocabulary (the grammar's closed table lives in types.ts; this module
 *  owns the TOKENIZER only). */
export type RevealMode = "word" | "char";

/** The ONE reveal tokenizer — per `\n` line, the unit strings in order.
 *
 *  - word mode: split on single spaces, empty tokens dropped (multi-space
 *    runs collapse in the REVEAL MARKUP's spacing — the payload string is
 *    never rewritten, only the cascade's separators).
 *  - char mode: every non-space char is a unit (Array.from — astral chars
 *    are one unit each); spaces ride back as separators.
 */
export function revealUnitsPerLine(text: string, mode: RevealMode): string[][] {
  return text.split("\n").map((line) => {
    if (mode === "word") return line.split(" ").filter((w) => w.length > 0);
    return Array.from(line).filter((ch) => ch !== " ");
  });
}

/** The wall's unit of account — the total unit count across all lines.
 *  The validator (textRevealUnitsMax) and the composer (data-count) read
 *  THIS function — one truth. */
export function countRevealUnits(text: string, mode: RevealMode): number {
  let n = 0;
  for (const line of revealUnitsPerLine(text, mode)) n += line.length;
  return n;
}

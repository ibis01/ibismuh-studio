# S150 — the C1 typography stack — RECORD

| | |
|---|---|
| Stage | **S150** — the motion-graphics audit's Phase C, item C1: the graphics text payload gains the font face, the deterministic wrap, and the per-word/per-char reveal cascade |
| Design record | `docs/design/s150-typography.md` (Rev 1) |
| Audit basis | `2026-11-16-motion-graphics-engineering-audit.md` §7 Phase C, item C1 (executed per the plan; the sequencing law: A → B → **C1** → C2 → D1/D2/D5 → E1–E4 → C3–C6 → F → G → E5) |
| Result | **LANDED.** Battery **869 passed, 0 failed** (860 + the S150 suite's nine tests). typecheck + changed-file lint clean. The real-render proof **GATE GREEN — 41 assertions** (`scripts/s150-typography-proof.mts`, receipt in gitignored `validation/s150/`). |
| Law | Additive optional fields at version 1 (the S126 precedent — a version bump would strand every stored v1 doc, since the graphics reader ERRORS on `version < GRAPHICS_VERSION`); the one-applier law holds (the cascade rides the element's EXISTING progress channel — no new frame field, no clock); no layout reads at frame time (the W1 lesson); warn-drop for junk; budget walls precede features (`textRevealUnitsMax: 256`, the new named wall). |

## 1. What landed

- **`graphics/text.ts` (NEW, pure)** — the typography helpers:
  - `TEXT_WRAP_CHAR_W = 0.6` — the house char-width estimate, ONE constant
    (the callout bubble's `bubbleCharW` now reads it — value-identical);
  - `wrapTextToWidth` — greedy word wrap per explicit `\n` line, total on
    junk, an oversized word stays whole (honest overflow, never a mid-word
    break);
  - `revealUnitsPerLine` / `countRevealUnits` — the ONE tokenizer: the
    validator's wall count and the composer's `data-count` read the same
    function, so the wall and the markup can never drift. Astral-safe
    (`Array.from`), spaces are separators never units.
- **`graphics/types.ts`** — the grammar extension (closed tables; absent ≡
  byte-identical; junk warn-drops):
  - `TextPayload.font?: "system" | "caveat"` — the closed face table
    ("system" ≡ the page CSS Arial stack; "caveat" is the repo's one
    committed licensed face — OFL, the whiteboard glyph table's own source);
  - `TextPayload.reveal?: "none" | "word" | "char"` — the per-unit cascade;
  - `TextPayload.wrapPx?: number` — max line width (scene px), clamped
    12..4096 with a warning on clamp;
  - `GRAPHICS_BUDGETS.textRevealUnitsMax = 256` — the cascade's named wall
    (the applier loops per unit per frame); over the wall the reveal
    warn-drops and the text stays whole (content is never dropped);
  - `parseTextPayload` parses all three with named warnings;
    `serializePayload` writes them present-only, appended after the existing
    five fields — existing payloads round-trip byte-identically.
- **`graphics/compose.ts`** — the ONE composer:
  - `textInner` gains wrap (only when the payload asks — the no-silent-
    rewrite law) and the face/reveal branches; the plain path is the same
    code as before (pinned: a no-new-fields doc emits no `data-reveal`, no
    `style="font-family"`, no extra `<style>` block);
  - `revealedTextBlock` — each line's positioned tspan carries nested unit
    tspans (`data-ui`, the global index continuous across wrapped lines);
    the `<text>` carries `data-reveal` + `data-count`; NO fill-opacity is
    baked — the poster (progress 1) shows every unit, which IS the placed
    state; separators walk the RAW line so the original spacing rides the
    markup;
  - the face rides an INLINE `style="font-family:Caveat,cursive"` — an
    inline style beats the page CSS `text{font-family:…}` rule (a
    presentation attribute would lose the cascade — the rejected route,
    recorded);
  - `composeGraphicsScene` opts gains `fontCss?: string` — the caller-built
    `@font-face` block appended as its own `<style>`; absent → the template
    is byte-identical;
  - `TEXT_FONT_FAMILY_CSS`, `caveatFontFaceCss(src)`, `docUsesFont(doc,
    face)` — the ONE face table, the ONE @font-face builder, the ONE doc
    scan the renderer and the editor share.
- **The applier (`APPLY_GRAPHICS_FRAME_FN`)** — one new branch in the
  set-only idempotence shape: `:scope > text[data-reveal]`, per-unit
  `fill-opacity = clamp(prog·n − i, 0, 1)` — sequential, total, no magic
  constants; at progress 1 every unit is 1 (the poster's truth), at 0 every
  unit is 0. No clock, no randomness, no layout reads (the ban list
  re-asserted over the grown string).
- **`graphics/render.ts`** — the render seam: when `docUsesFont(doc,
  "caveat")`, the face bytes ride the page as a data-URI `@font-face` (the
  render context aborts ALL network — a URL face could never load there);
  a missing face file is a NAMED failure before chromium (fail-closed — a
  fallback-font render would be a silent lie); after `setContent` the
  render awaits `document.fonts.ready` (a half-loaded webfont must never
  rasterize fallback glyphs into a pinned frame). A faceless doc gains no
  style block.
- **`graphics-canvas.tsx`** — the editor seat: the srcdoc compose passes
  the same-origin URL fontCss when the doc carries the face (CSP
  `font-src 'self' data:` allows both routes).

## 2. The pins (the S150 suite, nine tests)

1. The wrap estimator: hand-computed greedy packing; determinism; the
   wider-budget monotone; explicit `\n` independence; the oversized word
   stays whole; total on junk (empty/zero/NaN).
2. The ONE tokenizer: count = the per-line sum; word vs char counts;
   spaces never units; an astral char is ONE unit.
3. The compose reveal structure: nested unit tspans, global `data-ui`,
   `data-count` = the tokenizer's truth, the poster bakes no fill-opacity,
   the inline face style.
4. The cascade crosses wrapped lines with a continuous global index; no
   phantom unit beyond the count.
5. The byte-identity pin: a no-new-fields doc emits NONE of the new
   surfaces and exactly one style block.
6. The font seam: `docUsesFont` true/false, the CSS builder's shape, the
   `fontCss` slot lands/absent, the face table mapping.
7. The validator: closed-table junk warn-drops; the clamp band (12/4096);
   the reveal wall drops the reveal and KEEPS the text; `textCharsMax`
   required-reject unchanged (2001 chars still refuses).
8. The three fields round-trip byte-stable (parse→write→parse→write
   identity).
9. The applier's construction laws: the scoped queries, the exact cascade
   expression, the set-only write, the ban list.

## 3. The proof (the real engine, `scripts/s150-typography-proof.mts`)

Three scenes × 24 fps, 312 delivered frames, 16:9: wrap-only, word-cascade,
char-cascade in the Caveat face. **GATE GREEN — 41 assertions:**

- structural: the doc round-trips byte-stable; the budget wall admits it
  (312/25920); the G1 QC matrix passes 7/7 BEFORE the spend (the fixture
  first FAILED the readcheck lens — "31 chars needs 1330ms, holds 1000ms" —
  and the FIXTURE was fixed, never the lens);
- pipeline: every scene lands H.264 with the contract's frame count
  (96/120/96), the probed total = delivered;
- reveal moves pixels: mid-cascade vs settled = **90,492 differing bytes**
  (PNG-decoded from the ENCODED MP4 — the deliverable's own pixels); the
  start/end states differ by 91,407;
- the face rasterizes: Caveat vs the "system" twin at the same settled
  frame = **128,404 differing bytes** — a failed face load would render
  the fallback and read identical;
- determinism: BOTH renders' scene MP4s are byte-identical (the encode is
  pinned too), plus five decoded frames per scene hash-identical per scene
  (survives any future muxer metadata drift). The `fonts.ready` gate is
  inside that pin.

## 4. The honest boundary (what S150 deliberately does NOT do)

- **No stroke-drawn text**: the whiteboard's glyph-outline route (pre-
  generated outlines + a per-glyph pen schedule) is a W4-sized slice of its
  own — the word/char cascade is this slice's text reveal; the outline
  route stays a named follow-up (C1.5) riding the SAME machinery concept,
  a fresh clean-room build.
- **No planner emission changes**: scaffolds keep producing plain text
  payloads (byte-identical planning); the vocabulary choices belong to the
  C2 seat.
- **No studio UX**: the face picker / wrap button / tween list is C2
  verbatim (the audit's own sequencing).
- **No write-time measurement yet**: the render grammar is estimator-only;
  the studio's measure-and-write refinement (explicit `\n` or a tuned
  `wrapPx` through the validated PUT) rides C2.

## 5. Where this leaves the audit's phases

Phase A: A3 + A4 landed; A1/A2 remain the humans' gates. Phase B: closed
(S148 + S149). Phase C: **C1 LANDED** — next per the audit's sequencing:
**C2 (the tween/camera/event authoring UX)**, then D1/D2/D5, E1–E4, C3–C6,
F, G, E5.

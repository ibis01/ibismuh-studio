# S150 — the C1 typography stack — design record

| | |
|---|---|
| Stage | **S150** — the motion-graphics audit's Phase C, item C1: the graphics text payload gains a font face, a deterministic wrap, and the per-word/per-char reveal — the typography stack the C2 authoring seat will drive |
| Audit basis | `2026-11-16-motion-graphics-engineering-audit.md` §7 Phase C, item C1 (file-by-file plan, verbatim): "font-family per payload (additive optional `font`), per-word/per-char ranges as new optional payload fields compiled to tspan groups animated through existing tween channels (grammar minor version bump), auto-wrap (measure via the composed page, deterministic at write time), optional text-draw reveal … reusing whiteboard glyph machinery *as a concept*." |
| Predecessor | S149 (B4 substrate wiring) — Phase B closed B1–B5; the audit's sequencing law: **C1 → C2**, then D1/D2/D5, E1–E4, C3–C6, F, G, E5 |
| Result | see `docs/audits/s150-typography.md` (written after the battery runs) |

## 1. The laws this slice obeys (inherited, restated)

1. **Additive optional fields, version stays 1** (the S126 precedent, verbatim):
   every new payload field is optional, absent changes NOTHING (byte-identity),
   junk drops with warnings (tolerant parse), and `GRAPHICS_VERSION` stays `1`.
   The audit's "grammar minor version bump" is the S126 kind — a minor
   EXTENSION of the syntax, not an integer bump: the graphics version law
   ERRORS on `version < GRAPHICS_VERSION` ("predates — nothing to read"), so
   a bump would strand every stored v1 doc with no migration machinery. S126
   shipped the sprite payload at version 1; S150 follows that precedent.
2. **The one-applier law (wb-page.ts seam, S120 §5)**: the renderer
   (page.evaluate) and the editor (iframe eval) share the ONE
   `APPLY_GRAPHICS_FRAME_FN` string. The per-word/char cascade is applier-side
   math over the EXISTING per-element `progress` channel — no new frame field,
   no new clock, `frame.ts` untouched.
3. **No layout reads at frame time** (the W1 getBBox lesson): the applier
   reads only baked attributes (`data-ui`, `data-count`, `data-reveal`); the
   wrap decision is made at COMPOSE time from a deterministic char-width
   estimate, never from live measurement. The audit's "measure via the
   composed page, deterministic at write time" is the C2 seat's refinement
   (the studio may measure and write explicit `\n` or a tuned `wrapPx`
   through the validated PUT); the RENDER grammar is estimator-only — pure,
   total, same inputs → same lines.
4. **No silent rewrite of authored text** (the S124 editor law): wrap fires
   ONLY when the payload asks for it (`wrapPx` present); an absent field
   keeps today's exact line splitting. The estimator never rewrites the
   payload string — it computes the RENDER's line layout.
5. **The closed-table law**: `font` is `"system" | "caveat"` and `reveal` is
   `"none" | "word" | "char"` — closed tables like every motion/element
   vocabulary; junk drops with a named warning. "caveat" is the repo's one
   committed licensed face (public/fonts/caveat/Caveat[wght].ttf, SIL OFL —
   the whiteboard glyph table's own source, glyphs.ts header).
6. **Purity (S64) + leaf-module law**: `graphics/text.ts` (NEW) is PURE — no
   fs, no DOM, no clock, no randomness. Layering: `text.ts` ← `types.ts` ←
   `compose.ts` ← render/studio. `compose.ts` stays fs-free; the font BYTES
   ride the callers (the `spriteAssets` ctx precedent): the renderer injects
   a base64 data-URI `@font-face` (the render context aborts ALL network —
   a URL face could never load there), the editor iframe injects the
   same-origin public URL form.
7. **Budget walls precede features** (the audit's Phase-C risk note): the
   new named wall `textRevealUnitsMax = 256` bounds the per-element unit
   cascade (the applier loops per unit per frame); a text whose unit count
   exceeds the wall loses the reveal (warning + text stays whole) — the
   warn-drop law, never a refusal. The existing walls (textCharsMax
   required-reject, iconPathCommandBudget) are untouched and re-pinned.
8. **One truth per formula**: the wrap estimator and the reveal tokenizer
   live in `graphics/text.ts` and are imported by the validator (count for
   the wall) and the composer (layout) — the count and the render can never
   drift.

## 2. File-by-file plan (the audit's C1, executed)

### 2.1 `graphics/text.ts` (NEW — pure, the typography helpers)

- **`TEXT_WRAP_CHAR_W = 0.6`** — the house char-width estimate (the same
  discipline the callout bubble's `bubbleCharW` has used since G1.3; the
  compose table now reads THIS constant — value-identical, one source).
- **`wrapTextToWidth(text, maxWidthPx, sizePx)`**: greedy word wrap per
  explicit `\n` line. Char width = `sizePx × TEXT_WRAP_CHAR_W`; a word wider
  than the whole budget stays whole on its own line (honest overflow — no
  mid-word breaking); lines come back deterministic and total.
- **`revealUnitsPerLine(text, mode)`**: the ONE tokenizer — word mode splits
  on single spaces (empty tokens dropped), char mode takes every non-space
  char (Array.from, astral-safe); both per `\n` line. Separators are emitted
  by the composer as plain spaces (visually exact for char mode; word mode
  normalizes multi-space runs to single separators — the payload string
  itself is never rewritten, only the reveal markup's spacing).
- **`countRevealUnits(text, mode)`**: the wall's unit of account — the sum
  over `revealUnitsPerLine`. The validator and the composer read the same
  function.

### 2.2 `graphics/types.ts` — the grammar extension

- `TextPayload` gains:
  - `font?: "system" | "caveat"` — the closed face table ("system" renders
    exactly as today: the page CSS Arial stack; explicit "system" ≡ absent).
  - `reveal?: "none" | "word" | "char"` — the per-unit cascade ("none" ≡
    absent; the closed table keeps honest authoring).
  - `wrapPx?: number` — max line width in scene px; finite > 0, clamped
    12..4096 with a warning on clamp, junk drops with a warning.
- `TEXT_PAYLOAD_KEYS` gains the three names (the unknown-key warn-drop list).
- `GRAPHICS_BUDGETS.textRevealUnitsMax = 256` — the named wall.
- `parseTextPayload`: closed-table parses for `font`/`reveal`, the clamp
  band for `wrapPx`, and the reveal wall — count over the payload text via
  `countRevealUnits`; over the wall → warning + reveal dropped.
- `serializePayload` (strict write): the three fields appended AFTER the
  existing five, in declared order, present-only — existing payloads
  round-trip byte-identically.

### 2.3 `graphics/compose.ts` — the ONE composer

- `GRAPHICS_COMPOSE_DEFAULTS.bubbleCharW` now reads `TEXT_WRAP_CHAR_W`
  (value-identical; one source).
- `textBlock` gains an optional `fontFamily` — emitted as an inline
  `style="font-family:Caveat,cursive"` (an inline style BEATS the page CSS
  `text{font-family:Arial…}` rule; a presentation attribute would lose —
  the CSS cascade is why the attribute route was rejected). Only the
  TextPayload kinds pass it; counter/callout/bar labels stay default.
- `textInner`:
  - lines = `p.wrapPx !== undefined ? wrapTextToWidth(p.text, p.wrapPx, sizePx) : p.text.split("\n")`;
  - reveal absent ("none"/undefined) → the EXISTING tspan path, byte for
    byte;
  - reveal word/char → each line's positioned tspan carries nested unit
    tspans (`<tspan data-ui="i">unit</tspan>`, global index across lines,
    space separators); the `<text>` carries `data-reveal="word|char"` and
    `data-count="N"`; NO fill-opacity is baked — the poster (progress 1)
    shows every unit, which is exactly the placed state.
- `composeGraphicsScene` opts gains `fontCss?: string` — a caller-built
  `@font-face` block appended as its own `<style>` in `<head>`; absent →
  the template is byte-identical to today.
- **`docUsesFont(doc, face)`** — the ONE scan the renderer and the studio
  share (only TextPayload kinds carry the field).
- **`caveatFontFaceCss(src)`** — the ONE @font-face builder (pure; callers
  pass the src: data URI or same-origin URL). The family name `"Caveat"` is
  the contract.

### 2.4 `graphics/render.ts` — the render seam

- Before the scene loop: when `docUsesFont(doc, "caveat")`, read the face
  once (path.join(process.cwd(), "public/fonts/caveat/Caveat[wght].ttf"),
  the glyphs.ts-pinned source) and build the data-URI fontCss; a missing
  file is a NAMED failure before any chromium work (fail-closed — a
  fallback-font render would be a silent lie).
- After `page.setContent`: `await page.evaluate("document.fonts.ready…")` —
  the deterministic gate (a webfont that has not finished loading must never
  rasterize as a fallback glyph in a pinned frame). A no-op for
  non-webfont docs.

### 2.5 `graphics-canvas.tsx` — the editor seat

- The srcdoc compose passes the same-origin URL fontCss when
  `docUsesFont(doc, "caveat")` (the srcdoc iframe inherits the app origin;
  CSP `font-src 'self' data:` already allows both routes).

### 2.6 The applier (`APPLY_GRAPHICS_FRAME_FN`)

One new branch, in the set-only idempotence shape:

```js
const rev = g.querySelector(":scope > text[data-reveal]");
if (rev) {
  const n = Number(rev.getAttribute("data-count")) || 0;
  for (const t of rev.querySelectorAll("tspan[data-ui]")) {
    const i = Number(t.getAttribute("data-ui"));
    const lp = Math.max(0, Math.min(1, prog * n - i));
    t.setAttribute("fill-opacity", String(lp));
  }
}
```

- The cascade law: unit `i` of `n` becomes visible when element progress
  crosses `i/n` and completes at `(i+1)/n` — `lp = clamp(prog·n − i, 0, 1)`.
  Sequential, total, no magic constants; at progress 1 every unit is 1 (the
  poster's own truth), at progress 0 every unit is 0.
- Absolute set → apply-twice-≡-once; scoped to the element's own text; no
  layout, no clock, no randomness (the construction-law ban list holds).

## 3. What the slice deliberately does NOT do (the honest boundary)

- **No stroke-drawn text** (the audit's optional "text-draw reveal"): the
  whiteboard route is pre-generated glyph OUTLINES (glyphs.ts, one face,
  generated charset) with a per-glyph pen schedule — a W4-sized slice of its
  own. The graphics word/char cascade IS this slice's text reveal; the
  outline route stays a named follow-up (C1.5 if the operator wants the
  handwriting mode inside graphics), riding the SAME glyph-machinery
  concept but a fresh clean-room build.
- **No planner emission changes**: scaffolds keep producing plain text
  payloads — byte-identical planning. `reveal`/`wrapPx`/`font` are
  author/planner-OPTIONAL fields; wiring the planner's vocabulary choices is
  the C2 seat's decision surface.
- **No studio UX**: the picker/wrap-button/tween-list seat is C2 verbatim.
- **No graph/chart/transition/mask/event work**: C3–C6 stay sequenced.

## 4. The pins (the S150 suite)

1. **Wrap determinism**: same input+width → identical lines; wider budget →
   monotonically fewer-or-equal lines; explicit `\n` lines wrap
   independently; a word wider than the budget stays whole; greedy packing
   matches hand-computed layouts; the estimator is total on junk (empty
   text, zero/negative width).
2. **The ONE tokenizer**: `countRevealUnits` equals the sum of
   `revealUnitsPerLine`'s units; word vs char counts on mixed text;
   astral chars count as one unit each.
3. **Compose — reveal structure**: unit tspans carry `data-ui` 0..n−1 with
   the global index continuous across wrapped lines; the text carries
   `data-reveal` + `data-count`; the poster bakes no fill-opacity; a
   no-new-fields doc emits NO `data-reveal`, NO `style="font-family"`, and
   NO extra `<style>` block (the byte-identity pin at the compose surface).
4. **Compose — font**: `font:"caveat"` → the inline font-family style;
   `"system"`/absent → none; `fontCss` present → the `<style>` block rides;
   absent → absent.
5. **Validator**: closed-table junk (`font`, `reveal`) drops with warnings;
   `wrapPx` clamps/drops per the band; the `textRevealUnitsMax` wall drops
   the reveal (text stays whole) with a named warning; `textCharsMax`
   required-reject unchanged; the strict write round-trips the three fields
   byte-stably (parse → write → parse identity).
6. **The applier's construction laws**: the reveal branch is set-only
   (fill-opacity), scoped queries, the exact cascade expression, no clock/
   randomness/layout reads (the ban list re-asserted over the grown string).
7. **docUsesFont + caveatFontFaceCss**: the scan sees text kinds only; the
   CSS builder's shape is stable.
8. **The real-render proof** (`scripts/s150-typography-proof.mts`): a
   three-scene doc (wrap-only · word-reveal · char-reveal+caveat) through
   the REAL engine — render twice, per-frame sha256 identical (the
   determinism sweep), ffprobe reads a valid H.264 MP4 with the expected
   frame count, and a mid-cascade frame's pixel content differs from the
   settled poster frame (the reveal moves pixels — the W4 lesson: schedule
   rows that move nothing are the bug class).

# S151 — the sketch-trace import pass — RECORD

| | |
|---|---|
| Stage | **S151** — the whiteboard lane closes "THE GAP": uploaded PNG/JPEG/WebP are traced into ordered stroke geometry and ride the existing upload gates verbatim |
| Audit basis | `docs/design/whiteboard-external-repos-audit.md` §3.3 row "Raster→line-art skeleton tracing" (**THE GAP** — "the engine cannot draw an uploaded PNG/JPG/AI-illustration; uploads must be stroke-authored SVG … lands as an upload-lane preprocessing step producing `Stroke[]` → grammar unchanged") and row "Trace-map raster draw-in" → R6; implemented from the whiteboard-animator study port (MIT), the suite the audit's tracing row prescribes |
| Result | **LANDED.** Battery **876 passed, 0 failed** (869 + the S151 suite's seven tests). typecheck + changed-file lint clean. |
| Law | Timeline-as-projection holds (the reference's per-pixel reveal-time painters are deliberately NOT ported — `timing.ts` owns scheduling); ONE gate stack (the traced document rides `validateUploadedSvg` verbatim — no second vocabulary); the W3 geometry laws hold by construction; determinism with NO RNG (coordinate tie-breaks only — same bytes in, byte-identical document out); budgets by construction (RDP escalation inside the 512/path and 2,048/asset walls); no new dependencies (sharp was already in). |

## 1. What landed

- **`whiteboard/raster-trace.ts` (NEW, pure)** — the tracer:
  - ink mask pass (the study's mask pass, trimmed): adaptive threshold,
    despeckle, morphological close, exact Felzenszwalb EDT, 4-connected
    components, stroke/fill/text classification, the marker-stroke override,
    residual-free emission;
  - skeleton pass (the study's skeleton pass): Zhang–Suen thinning with a
    **deterministic stop-floor** (closed rings collapse to a point under an
    unguarded ZS — the floor halts thinning while a shape-proportional
    amount of ink remains), junction-aware path extraction, junction branch
    pairing into continuous pen strokes (a plus draws as TWO through-strokes,
    not four branches), Moore external contours with **Jacob's stopping
    criterion done right** (the boundary closes on a repeated
    (pixel, out-direction) state — a naive arrival check fragments thin
    protrusions into caps);
  - ordering pass (the study's ordering pass): containers before contents,
    reading order via visual-line buckets, dots attached to their glyphs,
    text merged into word/line blocks — the emitted DOCUMENT order is the
    human draw order, and the engine's length-weighted draw budget turns it
    into the animation;
  - emission pass (NEW): Ramer–Douglas–Peucker simplification with
    deterministic per-path + per-asset escalation inside
    `WB_TRACE_PATH_COMMANDS = 500` / `WB_TRACE_TOTAL_COMMANDS = 2040`
    (headroom under the gates' 512 / 2,048); region outlines emitted as
    closed pen paths followed by their pure fills seeded at the EDT core
    (the fill's first point is strictly inside its outline — the W3
    fill-after-outline probe holds by construction); house ink `#1d3557`,
    pen width scaled 3–7 by image size;
  - two ZS/contour port bugs were caught by the fixtures and fixed at the
    source: a format mix (raw pixel INDICES reaching the trail builder as
    (y,x) PAIRS — every junction stroke's geometry was corrupted) and the
    crop-border thinning blind spot (a component's bbox is tight by
    construction, so border ink could never thin — crops are padded before
    thinning and shifted back on emission).
- **`api/videos/[id]/whiteboard/asset/route.ts`** — the S151 branch: magic-byte
  sniff (PNG/JPEG/WebP; content-type headers stay advisory), 8 MB raster cap,
  sharp decode (EXIF-orient, flatten onto white, sRGB, ≤1280px long side,
  33 MP input ceiling), `traceRasterToSvgDoc`, then **gates 2–7 UNCHANGED** —
  the traced SVG DOCUMENT goes through the same sniff/sanitize/budget/W3
  battery, the same rasterize probe, the same quota and storage. The TRACED
  SVG is stored, never the raster. Readable 400s for decode/trace refusals
  (blank paper, under-dimensioned, over-budget ink).
- **`scripts/test-unit.mts`** — the S151 suite (seven tests): the junction
  pairing law (plus → exactly two continuous strokes, one M per path), the
  fill-after-outline law (outline precedes its pure fill), the reading-order
  law (a container's paths all precede its contents'), the determinism law
  (double-run byte equality), gates integration (the traced doc passes
  `validateUploadedSvg` with the command total inside the wall), the budget
  law (a dense page fits the walls; a ~2,000-point spiral stroke collapses
  inside the per-path headroom), and readable refusal + magic-byte sniffing.

## 2. Honest gaps

- **No stroke-authored text**: glyph ink traces as skeleton strokes (the
  writing motion) — the `<text>`/glyph-outline route stays named C1.5/C2 as
  before; no planner emission changes. **The Studio raster picker** landed
  as this program's second commit: the palette accepts PNG/JPEG/WebP with
  client-side transport walls (8 MB raster / 256 KB SVG — fast refusals that
  avoid a doomed POST) and trace-aware feedback ("Traced … N strokes, M
  fills"); the server gates stay the only truth.
- **The escalation loop's refusal branch** (over-wall ink at the coarsest
  tolerance) is implemented and maps to a readable 400, but the battery pins
  the per-path collapse and the walls, not a >2,040-command fixture — the
  honest refusal is exercised by construction, not by a pinned test.
- **Animated WebP** traces its first frame (sharp's default); noted, not
  gated.
- **Fidelity bound**: a filled region whose boundary walk degenerates falls
  back to the row-run silhouette (monotone in y — real winding by
  construction, slightly coarser outline); the fallback is deterministic and
  law-compliant, and the disc fixture pins the primary path.

## 3. Sequencing

Per the motion-graphics audit's sequencing law the next stage is **C2 (the
tween/camera/event authoring UX)** — S151 is the whiteboard lane's own
roadmap item (R6) and does not displace it.

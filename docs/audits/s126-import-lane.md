# S126 — the external import lane: the close record

Stage: the external import lane (S126 in the sN release order), the
third-party evaluation's Projects A/D/F corrected to ONE lane at the
reception. Design record: `docs/design/s126-import-lane.md`.

## 1. What shipped

| Concern | The slice |
| --- | --- |
| The ONE syntax minor extension | `graphics/types.ts` — the `"sprite"` element kind (the closed grammar's 11th), `SpritePayload` (assetKey/layout/frames/fps/frameW/frameH), the motion compatibility row (fade/slide/pop only), the `spriteFramesMax` wall; the payload parses strictly, serializes byte-stably, and the planner tables satisfy the closed sets (the scaffold/LLM never propose sprites — they die with reasons) |
| The runtime seats | `graphics/frame.ts` — the sprite frame-index channel (bounded [0, frames−1], scene-local at the payload's fps — no second clock); `graphics/compose.ts` — the sheet's nested-svg viewBox window + the sequence's stacked display-toggled images (the mouth-swap discipline), the compose ctx (resolved data URIs) + the additive `missingAssets` field; `graphics/compose.ts` applier — absolute viewBox/display writes (idempotent); `graphics/render.ts` — the `spriteAssets` option + the fail-closed refusal on unresolved keys |
| The seven gates | `graphics/import-validate.ts` (pure) — magic-byte sniff, the PNG IHDR color-type/tRNS alpha law, the WebP VP8X alpha-flag parse, the sheet even-division + decode walls, the sequence uniformity law, the fps snap (24/30 nearest rail, ties down), the provenance sanitizer; the route — the seven gates IN ORDER with named refusals, the WebM decode-as-raster-probe (wall-clocked ffmpeg → alpha PNG frames) + the alphaextract/signalstats alpha check |
| The ONE quota surface | per-video (8) + per-org (24) COUNT walls; per-org BYTES through storage.put's assertQuota |
| Provenance | the `GraphicsImport` manifest row carries user-declared source/license (the reception record's binding rule) + the measured facts; the migration `20261122000000_s126_graphics_imports` + the SQLite mirror sync |
| The ONE resolution seam | `graphics/import-store.ts` — `resolveSpriteAssets` (assetKey → per-frame data URIs), consumed by the render job (fail-closed), the editor's `?resolve=1` endpoint, and the studio canvas (the graphics-canvas prop + the honest missing-imports strip) |
| The ONE QC lens set | `graphics/qc.ts` — **G1-IMP-1** (sprite self-consistency: shared-timebase fps, frames wall, strip decode wall; vacuous pass spriteless) + its enforcement half (the render/job fail-closed refusals) |

## 2. The acceptance evidence (machine-verified)

- **Unit battery: 734 → 743, 0 failed** — 9 new pins: the sprite grammar
  (validation + byte-stable round-trip), the compatibility table (fade/
  slide/pop only), the payload walls, the frame-index channel (bounded,
  scene-local, deterministic), the compose seats (sheet window, sequence
  toggle, missing-asset honesty), the payload/applier source pins, the
  G1-IMP lens (vacuous pass + the fail row), the pure gates (sniff, PNG/
  WebP headers incl. the tRNS scan, the sheet/sequence laws, the fps snap,
  provenance), and the lane wiring (the seven gates, the one-seam
  resolution, the fail-closed render, the manifest model).
- The existing pins held: the compile-total table count 10 → 11, the S123
  round-trip/skeleton pins byte-identical for spriteless docs (the compose
  ctx is additive — a no-ctx compose matches the pre-S126 bytes).

## 3. Scope decisions of record

- WebM never reaches the runtime: decoded to alpha PNG frames at admission
  (a video playback clock would fork the ONE applier law — the design §0
  table). Frame cap 48: a longer source refuses (trim or slow it) — no
  silent truncation.
- Opaque rasters refuse at the alpha gate — the lane exists for alpha
  compositing; the vector grammar stays the house path for shapes.
- WebP sheets ride the VP8X alpha flag; simple lossy/lossless WebP has no
  alpha stream and refuses with the named reason.
- No Lottie/Rive (a dependency + a second runtime — the
  no-new-dependencies law); no new RENDER_MODES/JobKind (imports ride the
  graphics lane's existing surfaces).

## 4. Rollback

No import rows → the doc validates exactly as before, the QC lens passes
vacuously, the route lists empty, the render resolves nothing and refuses
nothing. The grammar extension is additive-parse safe by the validator's
unknown-field law.

## 5. Open tails

- The Graphics Studio's import-upload UI (the lane is fully usable via the
  API today; the palette panel is the polish slice).
- Grid sheets (rows) — a design-doc slice; v1 is the horizontal strip law.
- Loop semantics for sprites (the index currently bounds to frames−1) — a
  future flag, not a drive-by.

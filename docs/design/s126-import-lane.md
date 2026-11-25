# S126 — the external import lane (one lane, one syntax extension, one QC lens set, one quota surface)

Design record for the **external import lane** (S126 in the sN release order;
the third-party evaluation's Projects A/D/F corrected to ONE lane at the
reception — `docs/audits/external-six-repo-reception.md` §3). Executed on
S125's tip.

## 0. The one-lane law

Three accepted import FORMATS, ONE runtime representation, ONE grammar
extension, ONE QC lens set, ONE quota surface. No parallel pipelines (the
shared-contract law).

| Import format (in) | Runtime representation (stored + rendered) |
| --- | --- |
| sprite sheet (PNG/WebP, horizontal strip or grid) | layout `"sheet"` — one image, the frame window moves through it |
| PNG alpha sequence (numbered frames) | layout `"sequence"` — stacked `<image>` nodes, display-toggled |
| WebM-VP9 alpha video | **decoded at admission** to an alpha PNG frame sequence (ffmpeg, rgba) → layout `"sequence"` — a video playback clock would fork the ONE applier law, so the lane normalizes at the gate, never at render |

The fps normalization law: every stored import carries `fps ∈ {24, 30}`
(the shared timebase — D3). A WebM's measured fps snaps to the nearest of
24|30; a sequence declares its own. Playback frame index is derived from the
SCENE clock (`floor(sceneTMs / 1000 * fps)`, bounded — no second clock).

## 1. The grammar extension (the ONE syntax minor change)

`GRAPHICS_ELEMENT_KINDS` gains `"sprite"`; `SpritePayload`:

```text
assetKey — the import row's key (resolved through the import store, not free text)
layout   — "sheet" | "sequence" (matches the import row)
frames   — 1..48 (the named wall)
fps      — 24 | 30
frameW, frameH — 1..4096 each
```

Motions: `["fade", "slide", "pop"]` (visual moves only — no draw/grow/count
semantics exist for raster frames). Everything else in the grammar is
UNTOUCHED (byte-stability of existing docs preserved — the round-trip pin
extends to sprite-bearing docs).

## 2. The seven gates (the E11 spec, mirrored — `import-validate.ts` + route)

1. Transport — multipart POST, per-kind byte caps (sheet 8 MB, WebM source
   48 MB, sequence frames 2 MB each, ≤ 48 files).
2. Sniff — magic bytes (PNG/WebP/WEBM/ZIP), never extension trust.
3. Alpha presence — PNG header color-type law (types 4/6 or a tRNS chunk);
   WebM via ffmpeg `alphaextract,signalstats` (YMIN < 255 = alpha present).
   **A fully opaque import is refused** — the lane exists for alpha
   compositing; an opaque raster is the graphics `shape`/image problem, not
   an import.
4. Budget — dimension walls (1..4096), frame-count wall (≤ 48), sequence
   frame-size uniformity (all frames match frame 0's dimensions).
5. Rasterize-before-trust — the WebM decode IS the raster probe (wall-clocked
   ffmpeg); sheets/sequences ride the header checks + the alpha probe.
6. Quota — ONE surface: per-video import count (8), per-org count (24),
   per-org BYTES through storage.put's assertQuota.
7. Storage + provenance — `{videoId}/graphics/imports/<importId>/…` + the
   `GraphicsImport` manifest row carrying user-declared provenance
   (`source`, `license` — the reception record's binding rule: imported
   assets are provenance-tagged per asset) + the measured facts.

## 3. The runtime (compose / frame / applier)

- The composer resolves sprite bytes from an ASSET MAP passed by the caller
  (the whiteboard `loadVideoLibrary` one-seam law; the render job and the
  editor resolve imports through the SAME store). A missing key = the
  composer records it in `missingAssets` (the returned shape gains the
  additive field) and renders NOTHING for that element — and the RENDER
  REFUSES fail-closed on a non-empty missing set (a silently missing sprite
  is the exact lie the QC lens exists to catch).
- layout "sheet": one nested `<svg viewBox>` over one data-URI `<image>`;
  the applier moves the viewBox window (x = index·frameW).
- layout "sequence": stacked `<image>` nodes (one per frame, ≤ 48), the
  applier display-toggles (the mouth-swap discipline).
- `GraphicsElementFrame` gains `frameIndex?: number` — derived in `frameAt`
  from the scene-local clock and the payload's fps (bounded, deterministic).
- The payload/applier serialize twins extend; byte-identical for equal
  frames (the pin extends).

## 4. The QC lens set (ONE set)

`qc.ts` gains the import lens block, fail-closed, three-state like every
row:
- **G1-IMP-1** — sprite payloads are self-consistent: sheet frames ≤
  cols·rows declared, fps ∈ {24,30}, dimensions inside the walls; sequence
  frames ≤ the wall. (Pure on the doc — the manifest resolution is the
  render job's fail-closed refusal, §3.)

## 5. Non-goals

No video playback clock (webm normalizes at admission); no arbitrary opaque
image imports (the graphics lane's shape/image grammar stays vector); no
Lottie/Rive (a dependency + a second runtime — the no-new-dependencies law);
no per-frame re-encoding of sheets (stored bytes ship verbatim); no new
RENDER_MODES/JobKind (imports ride the graphics lane's existing surfaces).

## 6. Rollback

No import rows → the graphics doc validates exactly as before (the "sprite"
kind exists but no doc references it; the QC lens passes vacuously; the
route returns an empty list). The grammar extension is additive-parse safe
by the validator's existing unknown-field law.

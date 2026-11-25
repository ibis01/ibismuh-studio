# The Stock Library — real footage and real photos, downloaded when a scene needs them

Every scene-based ("story") video has two visual slots per scene: the
**motion slot** (what plays — a b-roll clip, an AI-animated clip, or the art
with a camera move) and the **art slot** (the still image the camera moves
over). The stock library fills both slots with **real, licensed media
downloaded from free provider APIs at the moment the scene needs them** —
no generation spend, no bundled media, no manual sourcing.

Two lanes share one architecture:

| | The footage lane (S89) | The photo lane |
| --- | --- | --- |
| Provider APIs | Pexels Videos · Pixabay Videos | Pexels Photos (`/v1/search`) · Pixabay Photos (`/api/`) |
| What it fills | the scene's motion slot (`scene.stock` → `stock-XX.mp4`) | the scene's art slot fallback (`scene.stockImage` → `stockimg-XX.jpg`) |
| Verification | multi-frame VLM relevance + measured motion | ffprobe decode + ONE VLM relevance inspection |
| Render behavior | the clip PLAYS when present | the photo covers the art GAP when the AI art is missing |

Both lanes activate from one place: **Settings → Stock footage** — paste a
free Pexels key, a free Pixabay key, or both (each user's keys are encrypted
at rest, per-user). Press **Find footage** on the storyboard (all scenes, or
one scene). One run then works both lanes:

1. **Clips first** — every scene is searched for footage; matched scenes
   download a verified clip.
2. **Then photos** — every scene the clip search left uncovered gets a real
   photo downloaded as its art-slot fallback.

A scene that ends up with neither simply keeps its AI art / gradient board —
a no-match is an honest empty result, never an error.

## The architecture (both lanes, one shape)

```
scene → queries (stock-query.ts, derived from the scene's visual + narration + title)
      → SOURCES  (the adapter registry — stock-index.ts / stock-image-index.ts)
      → INDEX    (all queries × all configured sources, deduped by source:id,
                  matchedQueries unioned per candidate)
      → RANK     (the pure ranker — hard floors, weighted factors, the
                  cross-scene duplicate penalty)
      → DOWNLOAD (safeFetch: bounded bytes, bounded time, provider-returned
                  URLs only; the file lands through the storage driver)
      → VERIFY   (the never-silent gate — every ref states its evidence)
      → REF      (scene.stock / scene.stockImage — provenance + verification
                  ride the scene doc; the render picks them up by construction)
```

A future source (Wikimedia, NASA, Internet Archive — each evaluated
individually, never batched in) is a one-file adapter addition plus its key
wiring. The LICENSE LAW holds across the registry: **a candidate without a
license label never enters the index**.

## Ranking (deterministic, pinned)

Hard floors drop unusable candidates outright (they are never merely
down-ranked): no license label, no stable id or download URL, below 1280×720,
portrait (the 16:9 delivery frame is the target; a portrait photo
letterboxes or crops visibly).

Weighted factors score the rest (each 0..1):

- **Footage:** duration fit 40 (a clip that covers the scene needs no loop) ·
  resolution 20 · aspect 10 · tag semantics 30.
- **Photos:** resolution 40 (a still is rendered frame-by-frame — its pixels
  ARE the video's pixels) · aspect 20 · tag semantics 40.

Tag semantics are NEUTRAL (never a penalty) for sources that return no tags.
The duplicate policy is the same in both lanes: a `source:id` already placed
on another scene of this video is not banned — it takes a fixed penalty
(1000) so every fresh candidate outranks it; the breakdown shows it. The
walk order is deterministic (score desc, then key asc): the same index always
produces the same picks.

## Verification (the never-silent law)

A ref NEVER claims more evidence than was gathered:

- **Clips:** ffprobe the real duration → sample interior frames → judge them
  sequentially with early exit (2 passing frames accept, 2 failing reject, a
  VLM outage stops after 2 unchecked) → measure the motion between the first
  and last frame (a still in an mp4 is the art lane's job). Verdict "pass"
  requires ≥2 passing frames BY CONSTRUCTION; anything else is stamped
  "unverified" — recorded, visible, never silent.
- **Photos:** decode first (ffprobe — garbage bytes never reach the
  inspector and no dimensions are claimed), then ONE relevance inspection
  (a still has nothing to move). The inspector's own bands decide: score ≥ 8
  passes, score ≤ 3 rejects (the classic "market crash → grocery market"
  failure is caught before the photo ships), anything between — and any
  inspector outage — keeps the photo stamped "unverified".

Rejected media is removed from storage before the walk moves on. The
verification record rides the ref (`scene.stock.verification` /
`scene.stockImage.verification`) and surfaces through the API.

## The keys

Both lanes read the SAME two credentials (capability `stock`, provider
`pexels` / `pixabay`) — Settings → Stock footage, one key each, encrypted at
rest. Zero configured keys is the pinned operator error: *"No stock provider
is configured — add a free Pexels or Pixabay key in Settings → Stock
footage"*. Free keys: <https://www.pexels.com/api/> and
<https://pixabay.com/api/docs/#api_key>.

Search runs fail-soft per (source, query): a bad key or a rate-limited
source never blocks the other lane or the other query. The run is
crash-resumable — progress persists scene-by-scene (each persist IS a
revision commit), so an interrupted run resumes where it stopped.

## Where the media lands and who consumes it

- `stock-XX.mp4` / `stockimg-XX.jpg` live in the video's storage dir (through
  the driver: local scratch or S3 — quota counts both).
- **The compositor** plays `scene.stock` for `mode: "stock"` /
  `assetSource: "stock"` scenes whose clip is on disk; everything else
  degrades honestly to the Ken Burns executor.
- **The Ken Burns executor** resolves the art FIRST (the look the creator
  chose) and falls back to `scene.stockImage` only when the art file is
  missing — a failed AI generation, no image provider configured, a re-roll
  that hasn't landed. The photo never repaints an approved scene. When the
  photo substitutes, the Director shot list is skipped (its crops were
  composed against the approved art) and the single-image Smart Motion graph
  plays over the photo.
- The storyboard-art render gate accepts a downloaded photo exactly like
  scene art: a scene with a photo HAS a visual.
- Renders invalidate when the stock stage lands clips or photos — the next
  render rebuilds against the new media.

## The HTTP surface (all tenant-scoped, session or Bearer)

| Route | What it does |
| --- | --- |
| `GET /api/videos/{id}/stock` | per-scene clip + photo refs, verification state, provider config truth, fleet job status |
| `POST /api/videos/{id}/stock` | the full run (clips, then photos) as a 202 job — `{ force?: boolean }` re-searches and replaces |
| `DELETE /api/videos/{id}/stock` | removes every clip AND every photo + refs |
| `GET /api/videos/{id}/stock/{n}` | streams one scene's clip |
| `POST /api/videos/{id}/stock/{n}` | re-picks ONE scene — `{ query?: string }` searches the user's exact words (no fallbacks: an override that finds nothing is an honest no-match); clip first, then photo |
| `GET /api/videos/{id}/stock-images/{n}` | streams one scene's downloaded photo |

## How this relates to the Whiteboard visual library

The Whiteboard Engine has its OWN asset library (`src/lib/ibismuh/whiteboard/`)
and it is a different system with different laws:

- The built-in library is a hand-authored stroke vector set (stable ids,
  tags, roles, draw order, pen groups) — grown deliberately, one asset at a
  time, each one validated for hand-drawability (W3).
- Uploads extend it per-video: SVG uploads pass the seven gates
  (transport → sniff → sanitize → budget → validator → probe → quota), and
  raster uploads (PNG/JPEG line art) are TRACED into drawable strokes.
- Photographs are deliberately NOT traceable into the whiteboard library:
  the tracer rejects photo-like images with a named, actionable reason
  ("the image reads as a photograph — the tracer draws line art; use an
  outline drawing, a diagram, or generate one through the AI-illustration
  bridge"). A photo traced into strokes is unreadable scribble — the gate
  is the honesty, not a limitation to remove.
- The whiteboard planner consumes the merged library (built-ins + per-video
  uploads) through `loadVideoLibrary` — the one seam every consumer shares.

The stock PHOTO lane serves the STORY pipeline's scene imagery; it does not
feed the whiteboard stroke library. Growing the whiteboard vocabulary is an
authored/validated/traceable-geometry problem, not a download problem.

## The pins

The offline unit suite (`npm run test`) carries the lane's laws as executable
pins: adapter normalization + the license law + the index dedupe (both
lanes), the ranker floors/factors/weights/duplicate penalty/deterministic
order, the relevance-band reducer, the file-name law, and REAL decode
fixtures — a real ffmpeg-generated JPEG through the verifier (pass / reject /
unverified / throwing inspector / garbage bytes) and the scene-doc round-trip
(provenance + verification survive parse; junk refs and bad records drop by
the tolerant-parse law).

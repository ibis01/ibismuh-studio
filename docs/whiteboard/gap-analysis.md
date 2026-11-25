# Whiteboard Lane — Gap Analysis (verified against source)

Every gap below was verified against `main` @ `73d92ec` before acceptance.
Ordering follows impact on production readiness, per the engineering master plan.

## G1 — No formal Drawable IR

The lane has the ingredients (asset metadata, SVG paths, animation events, trace
receipts, placements) but no single versioned, immutable, serializable drawable
representation with provenance, semantic roles, deterministic serialization, and
a reproducible hash. Consequences: editing, caching, diffing, and cross-lane
parity all work through loosely related fragments instead of one contract.

**Target:** `src/lib/ibismuh/whiteboard/drawable-ir.ts` built AROUND the existing
asset/trace types (the engine is not replaced).

## G2 — No immutable versioned render-plan document

Timing, frame plans, manifests, and receipts exist, but there is no one canonical
plan object binding storyboard version + IR hashes + audio receipt + beat plan +
camera plan + profile + renderer version + QC policy + final fingerprint.
Cache invalidation, replay, and preview/final comparison remain fragmented.

**Target:** the shared plan envelope (platform-wide, commit group 3) consumed by
the whiteboard lane; the lane's `planVersion` already seats in the lane registry.

## G3 — Measured audio is consumed, not contracted

`timing.ts` consumes measured voiceover duration and word anchors, but the lane
does not receive a versioned shared AudioReceipt (source hash, duration, sample
rate, channels, loudness, silence/sentence/word spans, normalization result).
Each consumer re-derives timing facts instead of sharing one measured document.

**Target:** the shared `audio-receipt.ts` contract (commit group 4) with the
declared timing-priority chain (manual > word > sentence > estimate).

## G4 — Stage fingerprints do not cover the whiteboard lane

`stage-cache.ts` (P3) already provides fingerprint-scoped scene-level reuse for
the story/compositor lanes. The whiteboard lane does not yet participate: its
normalized assets, beat plans, camera plans, and scene rasters are not
independently cacheable, and cache entries are not bound to approved scene
revisions for this lane.

**Target:** declare whiteboard stage inputs over the existing stage-cache
mechanism; a caption-only edit must not retrace a whiteboard asset.

## G5 — Concept-to-visual mapping is heuristic

The planner selects assets against narration, but the mapping chain
(concept → visual intent → asset → semantic role → draw order → camera emphasis
→ confidence) is not explicit, so a loosely-related asset can ship silently.

**Target:** extend planner output with intent + confidence + reason; flag or
reject narration without a defensible visual representation.

## G6 — Current independent visual evidence does not exist

`benchmark-scenarios.ts` implements the W1 harness (fixed scene types, three
aspects, blind MP4s, sampled frames, rubric, determinism), but `validation/w1/`
holds zero artifacts and the previously cited receipt was phantom. The renderer's
visual quality is therefore currently unprovable from the checkout.

**Target:** re-run W1 for all fixed scene types at 16:9 / 9:16 / 1:1, archive
MP4s + contact sheets + blind scores, and publish the report.

## G7 — Text authoring and draw-speed calibration

Glyph-level drawing, punctuation handling, multi-line layout, font fallback, and
readable-minimum-size validation are partial; draw duration does not yet weight
path length, complexity, semantic importance, and pen-up travel distinctly.

**Target:** calibration table + validation gates in the timing/beat layer.

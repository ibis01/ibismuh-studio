# Phase B slice 1 — placement identity: repeated placement, end to end

Date: 2026-11-25
Scope: the re-audit's Phase B first slice (audit §3.5, Priority 3) — the fix the Phase A doc named as the honest remainder's first item.
Status: IMPLEMENTED — placement battery green (27 laws), unit suite green (1064/0), typecheck clean, lint clean, lint:budget clean, all check-chain suites green, alert probe HEALTH 0.

## The defect this slice removes

The whiteboard engine addressed every placement instance by its ASSET id: two
placements of one asset collided in the scheduler's FrameState maps (one
draw key per asset, whichever instance scheduled last won), duplicated DOM
element ids at the page seam (`g-<assetId>` twice), and were refused by the
validator outright ("placed twice — move_object instead"). Repeated
placement — two coins on one board, a carried coin plus a fresh one — was
impossible everywhere below the planner.

## The design: placement identity with a derived-legacy law

`WhiteboardAssetPlacement` gains an optional `placementId`; ONE derivation
(`placementKey` in storyboard.ts) turns it into the per-scene instance
address — the explicit id when authored, else the assetId. Every consumer
reads identity through that one function:

- the validator's key-uniqueness law (the derived key set must be unique
  per scene — the legacy shape reduces to the old one-per-asset rule with
  the same pinned message);
- the scheduler's claimed keys and emitted events (`draw_path` /
  `write_text` / `reveal_color` / `move_object` carry `placementId` ONLY
  when it differs from the assetId — every legacy schedule stays
  byte-identical on the wire);
- the FrameState maps (draws/texts/colors/placements keyed
  `placementKey::pathId`);
- the page seam (one group per instance, `g-<key>`, inner namespacing
  `<key>--<pathId>`, frame keys `<key>::<pathId>`; the compose pass
  registers key → assetId so the setup and dash passes resolve geometry
  without re-parsing keys);
- the carry plan (keyed by placement identity; `carryPlacements` names
  resolve by KEY first, assetId second — an assetId name carries ALL
  instances of that asset, unchanged for legacy single placements);
- the beat compiler + camera director (per-instance beat grouping, key-
  scoped claims and onset matching, per-instance bboxes);
- the editor (the one-placement-per-asset guard is GONE — the palette adds
  a fresh instance each click with `derivePlacementId` (`coin`, `coin-2`,
  …), the canvas drags/selects by key, the event editor addresses
  instances, removing one instance leaves the other's events alone).

### The byte-identity guarantee (the re-pin promise)

A doc without placementIds anywhere derives key = assetId in every layer:
frame keys, DOM ids, event wire format, carry plans — all byte-identical to
the pre-slice engine. No golden re-pin of rendered pixels was needed; the
two unit fixtures that rode the old `placementAt(scene, assetId, base, t)`
and a hand-rolled carry plan without the new `assetIds` map were updated to
the new contracts (their assertions unchanged). `CarriedInkPlan` gained the
key → assetId map ADDITIVELY — the placements wire shape is untouched.

### Fail-closed addressing

An animation naming an unknown placementId is refused; an event WITHOUT an
explicit id in a scene that places its asset more than once is AMBIGUOUS
and refused ("name the placementId") — never a silent first-instance pick.
Carried-key re-placement is still refused; re-placing the same ASSET under
a different key is the whole Phase B win and validates.

## What landed (files)

- `src/lib/ibismuh/whiteboard/storyboard.ts` — the identity contract:
  `placementId`, `placementKey`, `eventPlacementKey`,
  `derivePlacementId`; the validator's key-uniqueness / charset /
  ambiguity / carry-key laws.
- `src/lib/ibismuh/whiteboard/timing.ts` — key-scoped scheduler, frames,
  traced cap per INSTANCE, carry plan + injection, instance-addressed
  `placementAt` / `handAt`.
- `src/lib/ibismuh/whiteboard/wb-page.ts` — per-instance compose +
  registration + applier loops (`pathAssetIds` on `ComposedScene`).
- `src/lib/ibismuh/whiteboard/render.ts` — the setup pass resolves
  geometry through the compose-registered map (no key re-parsing).
- `src/lib/ibismuh/whiteboard/beat-plan.ts` — key-scoped claims, per-
  instance beat buckets, `WhiteboardBeat.placementKeys`, instance-
  addressed compile + fade.
- `src/lib/ibismuh/whiteboard/camera-director.ts` — key-addressed bboxes
  and onset ownership.
- `src/components/ibismuh/whiteboard/whiteboard-studio.tsx` — repeatable
  palette, key-addressed patch/remove/reorder/inspector, instance-addressed
  event editor.
- `src/components/ibismuh/whiteboard/wb-canvas.tsx` — the editing contract
  addresses placements by identity key.
- `src/lib/ibismuh/whiteboard/llm-planner.ts` — the one-concept-per-scene
  dedupe stays (the LLM lane plans single placements for now); the drop
  reason states the engine's new capability honestly.
- `scripts/test-whiteboard-placement.mts` — 27 laws across eight suites
  (validator, legacy identity, schedule + frames, page seam, carry, beats,
  traced cap, wire round-trip). Joins `npm run check` and the CI check job
  (`test:whiteboard-placement` step after test:catalog).

## What deliberately did NOT land (the honest remainder)

- **Planner lanes emitting repeats** — the scaffold and LLM planners keep
  one placement per concept per scene (their anti-repeat exclusions stay);
  the ENGINE and the EDITOR enable repeats. Multi-pick layouts (the
  scheduler placing two coins FROM the narration) are the next Phase B
  slice, now unblocked.
- **Compound asset graphs** — Phase B, after placement identity (this
  slice) and the catalog browser adoption.
- **The catalog browser UI** — the Phase A search engine still needs its
  palette surface.
- **Per-instance sketch seeds** — the sketch pass seeds per ASSET
  (`fnv1a(assetId::pathId)`), so two instances of one asset draw identical
  jitter. Correct-by-construction for now; a per-instance seed nonce is a
  deliberate follow-up if boards want it.

## Verification receipts (this slice)

- `npm run test:whiteboard-placement` — 27/27.
- `npm run test` — 1064/0 (two fixtures updated to the new contracts, zero
  assertion changes).
- `test:whiteboard-trace` 25/0 · `test:whiteboard-profiles` 22/0 ·
  `test:catalog` 24/0 · the full check chain green · `lint:budget` 0/0 ·
  `alert:probe` HEALTH 0.
- `npx tsc --noEmit` clean; eslint clean on every touched file.

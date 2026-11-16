-- S123 (G1) P3 — the motion-graphics engine's doc column (the eleventh
-- JSON doc column; the whiteboardProject/scene3d house pattern).
--
-- Video.graphicsDoc carries the VALIDATED GraphicsDoc v1 JSON
-- (graphics/types.ts — the closed grammar, writeGraphicsDoc's strict
-- byte-stable write): the declarative motion-graphics project the engine
-- renders natively at $0 — kinetic text, counters, bars/charts, icons,
-- shapes, staged reveals — through the ONE compositor contract (the S87
-- projection + the frame-quantized clock at doc.fps). Null = the video
-- never opened the graphics Studio.
--
-- Concurrency: last-write-wins (the house rule for `scenes` and every
-- engine doc column) — the doc's own `version` field is the grammar
-- contract, not a concurrency token.
--
-- Additive on both sides; no backfill.

ALTER TABLE "Video" ADD COLUMN "graphicsDoc" TEXT;

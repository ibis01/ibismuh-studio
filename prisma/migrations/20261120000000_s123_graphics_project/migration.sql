-- S123 — the motion-graphics engine's doc column (the peer-lane landing,
-- the whiteboardProject mirror).
--
-- Video.graphicsProject carries the {rev, doc} envelope: doc is the
-- versioned GraphicsDoc v1 grammar (graphics/types.ts) — scenes of kinetic
-- text, counters, bars, icons, shapes the Graphics lane animates through
-- the frame truth (frameAt) and the composer (composeGraphicsScene).
-- Concurrency: last-write-wins with an advisory rev integer INSIDE the
-- envelope the editor echoes on save (the whiteboard doc's contract,
-- mirrored). null = the video never opened the graphics editor.
--
-- Additive on both sides; no backfill.

ALTER TABLE "Video" ADD COLUMN "graphicsProject" TEXT;

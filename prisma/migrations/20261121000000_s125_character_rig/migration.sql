-- S125 (K1) — the 2D character rig columns (the twelfth/thirteenth JSON
-- doc columns; the graphicsDoc house pattern — TEXT, not Json).
--
-- Character.rigDoc carries the VALIDATED CharacterRigDoc v1 JSON
-- (characters/rig2d.ts — the closed grammar, writeRigDoc's strict
-- byte-stable write): the puppet rig the native character lane renders
-- natively at $0 — FK parts, pivots, the standard slot vocabulary (the
-- five-shape mouth set, the brow pair, the arm 3-way), the pose sheet.
-- Character.parts carries the parts library (RigPartArt rows —
-- stage-coordinate SVG fragments the rig's parts reference by id).
--
-- Null = the character has no rig: the S93 still-portrait path renders
-- byte-identical (additive parse — the rollback law).
--
-- Concurrency: last-write-wins (the house rule for every engine doc
-- column) — the doc's own `version` field is the grammar contract, not a
-- concurrency token.
--
-- Additive on both sides; no backfill.

ALTER TABLE "Character" ADD COLUMN "rigDoc" TEXT;
ALTER TABLE "Character" ADD COLUMN "parts" TEXT;

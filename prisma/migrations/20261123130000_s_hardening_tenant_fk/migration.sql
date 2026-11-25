-- Hardening (2026-11-23): tenant-bound relational integrity — the database
-- now enforces that a Video's channel / character / music-track references
-- belong to the SAME organization as the video (finding F-02: the routes
-- validated character/music but channelId rode through unvalidated).
--
-- REPAIR PRELUDE (visible, minimal, non-destructive to valid data): sever
-- cross-organization references so the constraints can be added. These rows
-- are integrity violations under the domain model — they could only exist
-- via the (now fixed) unvalidated write paths. No rows are deleted; only
-- the invalid LINK is nulled. Nothing is rewritten silently at startup: this
-- is a versioned, operator-visible migration step.

UPDATE "Video" SET "channelId" = NULL
WHERE "channelId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "Channel" c
  WHERE c."id" = "Video"."channelId" AND c."organizationId" = "Video"."organizationId"
);

UPDATE "Video" SET "characterId" = NULL
WHERE "characterId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "Character" c
  WHERE c."id" = "Video"."characterId" AND c."organizationId" = "Video"."organizationId"
);

UPDATE "Video" SET "musicTrackId" = NULL
WHERE "musicTrackId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "MusicTrack" m
  WHERE m."id" = "Video"."musicTrackId" AND m."organizationId" = "Video"."organizationId"
);

-- DropForeignKey
ALTER TABLE "Video" DROP CONSTRAINT "Video_channelId_fkey";

-- DropForeignKey
ALTER TABLE "Video" DROP CONSTRAINT "Video_characterId_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "Channel_id_organizationId_key" ON "Channel"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Character_id_organizationId_key" ON "Character"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "MusicTrack_id_organizationId_key" ON "MusicTrack"("id", "organizationId");

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_channelId_organizationId_fkey" FOREIGN KEY ("channelId", "organizationId") REFERENCES "Channel"("id", "organizationId") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "Video" ADD CONSTRAINT "Video_characterId_organizationId_fkey" FOREIGN KEY ("characterId", "organizationId") REFERENCES "Character"("id", "organizationId") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "Video" ADD CONSTRAINT "Video_musicTrackId_organizationId_fkey" FOREIGN KEY ("musicTrackId", "organizationId") REFERENCES "MusicTrack"("id", "organizationId") ON DELETE NO ACTION ON UPDATE CASCADE;

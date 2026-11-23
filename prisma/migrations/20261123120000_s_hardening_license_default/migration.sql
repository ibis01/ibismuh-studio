-- Hardening pass (2026-11-23): the MusicTrack.licenseType default was the
-- last user-visible legacy brand string ("TubeForge Original" in the seed
-- data model). New rows default to the current identity; EXISTING rows keep
-- their stored value (this migration changes the column DEFAULT only — no
-- data rewrite, no destructive change).

-- DropIndex for the old default is not needed (defaults are not indexes).
ALTER TABLE "MusicTrack" ALTER COLUMN "licenseType" SET DEFAULT 'Ibismuh Studio Original';

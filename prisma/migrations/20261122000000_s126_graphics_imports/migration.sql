-- S126 — the external import lane's manifest (docs/design/s126-import-lane.md
-- §2 gate 7). One row per import; the storage objects live under
-- {videoId}/graphics/imports/{importId}/. layout "sheet" stores one object
-- (sheet.png); layout "sequence" stores f0000.png..fNNNN.png (a WebM source
-- is decoded to alpha PNG frames at admission — the runtime never sees a
-- video clock). source/license are the user-declared provenance (the
-- reception record's binding rule).
--
-- Additive; no backfill.

CREATE TABLE "GraphicsImport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "layout" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "frames" INTEGER NOT NULL,
    "fps" INTEGER NOT NULL,
    "frameW" INTEGER NOT NULL,
    "frameH" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT,
    "license" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GraphicsImport_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "GraphicsImport_videoId_importId_key" ON "GraphicsImport"("videoId", "importId");
CREATE INDEX "GraphicsImport_organizationId_idx" ON "GraphicsImport"("organizationId");
CREATE INDEX "GraphicsImport_videoId_idx" ON "GraphicsImport"("videoId");

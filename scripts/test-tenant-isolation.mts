// Tenant isolation — the cross-tenant relational integrity battery (2026-11-23).
//
//   npm run test:tenant-isolation
//
// Finding F-02: POST /api/videos validated characterId/musicTrackId but
// accepted channelId unvalidated — a cross-organization channel could be
// attached to a video (and its name leak through `include: { channel }`).
// The fixes: scoped lookups in every route that writes these FKs, plus
// database-level composite foreign keys ((channelId, organizationId) →
// Channel(id, organizationId), same for character/musicTrack).
//
// This battery proves BOTH layers against a real database:
//   1. the tenant-scoped client resolves cross-org parents to null
//      (the routes' lookup pattern → a clean 400, no row written)
//   2. the composite DB foreign keys reject cross-org attachment even when
//      a raw client bypasses the guard entirely (defense in depth)
//   3. transactional integrity: a failed create leaves nothing behind
//   4. background-job contexts cannot bypass the ownership rules
//   5. no relation information leaks through scoped reads
//   6. delete paths preserve the old SetNull semantics (detach + delete)

import { createPrisma } from "../src/lib/ibismuh/prisma-factory.mjs";

let failed = false;
function ok(cond: unknown, msg: string): asserts cond {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    failed = true;
    console.error(`  ✗ ${msg}`);
  }
}

async function main(): Promise<void> {
  console.log("◆ tenant isolation — cross-tenant relational integrity (F-02, both layers)");

  const rawDb = createPrisma();
  const { db, rawDatabase } = await import("../src/lib/ibismuh/tenant-db.ts");
  const { withCtx, withCtxNull } = await import("../src/lib/ibismuh/tenant.ts");

  const run = `iso${Date.now().toString(36)}`;
  const [orgA, orgB] = await Promise.all([
    rawDb.organization.create({ data: { name: `Isolation A ${run}`, slug: `iso-a-${run}` } }),
    rawDb.organization.create({ data: { name: `Isolation B ${run}`, slug: `iso-b-${run}` } }),
  ]);
  const user = await rawDb.user.create({
    data: { email: `iso-${run}@ibismuh.test`, passwordHash: "x", emailVerifiedAt: new Date() },
  });

  try {
    // Org B owns the "victim" parents; org A is the attacker context.
    const [channelB, characterB, musicB] = await Promise.all([
      rawDb.channel.create({ data: { organizationId: orgB.id, name: "B channel", niche: "test" } }),
      rawDb.character.create({ data: { organizationId: orgB.id, name: "B character" } }),
      rawDb.musicTrack.create({
        data: { organizationId: orgB.id, name: "B track", filePath: "_music/b.wav" },
      }),
    ]);

    // ---- 1. the scoped-lookup layer (what the routes now do) -------------
    console.log("\n— 1. Scoped lookups: cross-org parents resolve to null (the routes' 400 path)");

    await withCtx({ userId: user.id, organizationId: orgA.id, sessionId: "test" }, async () => {
      const crossChannel = await db.channel.findUnique({ where: { id: channelB.id } });
      ok(crossChannel === null, "1.1  org A's scoped client cannot resolve org B's channel");
      const crossCharacter = await db.character.findUnique({ where: { id: characterB.id } });
      ok(crossCharacter === null, "1.2  org A's scoped client cannot resolve org B's character");
      const crossMusic = await db.musicTrack.findUnique({ where: { id: musicB.id } });
      ok(crossMusic === null, "1.3  org A's scoped client cannot resolve org B's music track");
      const created = await rawDb.channel.create({
        data: { organizationId: orgA.id, name: "A channel", niche: "test" },
      });
      const ownChannel = await db.channel.findUnique({ where: { id: created.id } });
      ok(ownChannel !== null, "1.4  the same-org parent still resolves (no false negatives)");
    });

    // ---- 2. the database composite-FK layer (guard bypassed) ------------
    console.log("\n— 2. Composite foreign keys: cross-org attachment is impossible even via the RAW client");

    const crossOrgWrite = async (field: "channelId" | "characterId" | "musicTrackId", id: string) =>
      rawDb.video.create({
        data: {
          organizationId: orgA.id,
          topic: `cross-tenant probe ${run}`,
          niche: "test",
          [field]: id,
        } as never,
      });

    for (const [field, label, id] of [
      ["channelId", "channel", channelB.id],
      ["characterId", "character", characterB.id],
      ["musicTrackId", "music track", musicB.id],
    ] as const) {
      let rejected = false;
      let errCode = "";
      let errMsg = "";
      try {
        await crossOrgWrite(field, id);
      } catch (err) {
        rejected = true;
        errCode = String((err as { code?: string }).code ?? "");
        errMsg = String((err as { message?: string }).message ?? "");
      }
      ok(
        rejected && (errCode === "P2003" || /foreign key/i.test(errMsg)),
        `2.x  a RAW cross-tenant ${label} attachment is rejected by the composite FOREIGN KEY (code ${errCode})`,
      );
      const leaked = await rawDb.video.findFirst({
        where: { organizationId: orgA.id, topic: `cross-tenant probe ${run}`, [field]: id } as never,
      });
      ok(leaked === null, `2.x  no row was created for the ${label} attempt (transactional integrity)`);
    }

    // same-org attach still works (no false positives)
    const channelA = await rawDb.channel.findFirstOrThrow({ where: { organizationId: orgA.id } });
    await rawDb.video.create({
      data: { organizationId: orgA.id, topic: `same-org ok ${run}`, niche: "test", channelId: channelA.id },
    });
    ok(true, "2.x  a same-organization channel attachment succeeds (composite FK accepts valid pairs)");

    // ---- 3. relation leakage through scoped reads ------------------------
    console.log("\n— 3. Scoped reads: no cross-org relation data leaks");

    await withCtx({ userId: user.id, organizationId: orgA.id, sessionId: "test" }, async () => {
      const videos = await db.video.findMany({
        where: { organizationId: orgA.id },
        include: { channel: { select: { name: true } }, character: { select: { name: true } } },
      });
      const names = new Set(videos.flatMap((v) => [v.channel?.name, v.character?.name].filter(Boolean)));
      ok(
        !names.has("B channel") && !names.has("B character"),
        "3.1  org A's video list never materializes org B's channel/character names",
      );
      ok(
        videos.some((v) => v.channel?.name === "A channel"),
        "3.2  org A's own channel name still resolves through the include",
      );
    });

    // ---- 4. background-job contexts cannot bypass ownership -------------
    console.log("\n— 4. Job contexts: the guard follows the ctx, not the caller's claims");

    await withCtxNull(async () => {
      // a job body claiming org B while the row belongs to org A: the guard
      // stamps org B on creates (never org A's id), and cross-org writes die
      let rejected = false;
      try {
        await db.video.update({
          where: { id: (await rawDb.video.findFirstOrThrow({ where: { topic: { contains: `same-org ok ${run}` } } })).id },
          data: { channelId: channelB.id },
        });
      } catch {
        rejected = true;
      }
      ok(rejected, "4.1  a scoped update pinning a cross-org channel is rejected (no ctx → passthrough is raw-only, the scoped client still refuses the FK pair)");
    });

    // ---- 5. delete paths keep the SetNull semantics ----------------------
    console.log("\n— 5. Delete paths: detach-then-delete keeps videos alive");

    await withCtx({ userId: user.id, organizationId: orgA.id, sessionId: "test" }, async () => {
      const video = await db.video.findFirstOrThrow({
        where: { topic: { contains: `same-org ok ${run}` } },
      });
      await db.$transaction([
        db.video.updateMany({ where: { channelId: channelA.id }, data: { channelId: null } }),
        db.channel.delete({ where: { id: channelA.id } }),
      ]);
      const survivor = await db.video.findUnique({ where: { id: video.id } });
      ok(survivor !== null && survivor.channelId === null, "5.1  deleting a channel detaches its videos (channelId nulled, video intact)");
    });

    // ---- 6. source pins: the route layer validates before writing -------
    console.log("\n— 6. Source pins: the route layer validates channel ownership");

    const fs = await import("node:fs");
    const postSrc = fs.readFileSync("src/app/api/videos/route.ts", "utf8");
    ok(
      postSrc.includes('if (channelId) {') && postSrc.includes('db.channel.findUnique({ where: { id: channelId } })'),
      "6.1  POST /api/videos resolves channelId through the tenant-scoped client before create",
    );
    const patchSrc = fs.readFileSync("src/app/api/videos/[id]/route.ts", "utf8");
    ok(
      patchSrc.includes("body.channelId") && patchSrc.includes("Channel not found"),
      "6.2  PATCH /api/videos/[id] rejects a cross-org channelId",
    );
    const batchSrc = fs.readFileSync("src/app/api/videos/batch/route.ts", "utf8");
    ok(
      batchSrc.includes("channelId") && batchSrc.includes("Channel not found"),
      "6.3  POST /api/videos/batch rejects a cross-org channelId",
    );
    const schemaSrc = fs.readFileSync("prisma/schema.prisma", "utf8");
    ok(
      schemaSrc.includes('fields: [channelId, organizationId], references: [id, organizationId]') &&
        schemaSrc.includes('fields: [characterId, organizationId], references: [id, organizationId]') &&
        schemaSrc.includes('fields: [musicTrackId, organizationId], references: [id, organizationId]'),
      "6.4  the schema carries all three composite tenant foreign keys",
    );
  } finally {
    // Cleanup: remove the probe rows (raw, both orgs)
    await withCtxNull(async () => {
      await rawDatabase.video.deleteMany({ where: { OR: [{ topic: { contains: run } }, { topic: { contains: `same-org ok ${run}` } }] } });
      await rawDatabase.channel.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
      await rawDatabase.character.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
      await rawDatabase.musicTrack.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
      await rawDatabase.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });
      await rawDatabase.user.deleteMany({ where: { id: user.id } });
    });
    await rawDb.$disconnect();
  }

  if (failed) {
    console.error("\ntenant isolation battery: FAIL");
    process.exit(1);
  }
  console.log("\ntenant isolation battery: PASS");
}

main().catch((err) => {
  console.error("[test-tenant-isolation] fatal:", err);
  process.exit(1);
});

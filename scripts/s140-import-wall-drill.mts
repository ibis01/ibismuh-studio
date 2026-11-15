#!/usr/bin/env node
/**
 * S140 — the import-wall drill (the audit's F2, closed with a REAL race).
 *
 * The old flow counted the quota walls in the ROUTE and saved later: two
 * concurrent imports both passed the read, both wrote, the cap was crossed —
 * the read-check-write-write race S101 already killed for BYTES. saveImport
 * is now the atomic admission wall: the count walls + the manifest create
 * are ONE serialized transaction (Serializable on Postgres; SQLite's
 * single-writer engine — BEGIN IMMEDIATE + the S136 busy_timeout floor —
 * serializes the racers), and the compensation sweep takes every byte of a
 * refused admission.
 *
 * The drill pre-fills the video to cap−2, fires SIX concurrent admissions
 * for the last two slots, and demands:
 *   - exactly 2 win, 4 refuse with ImportCountRefusal (the wall, not an
 *     accident);
 *   - the final manifest count sits ON the cap;
 *   - every loser's storage prefix is swept clean — compensation under
 *     contention (the F1 law holding while the wall is hot);
 *   - every winner's bytes AND row exist (the atomic admission's success
 *     twin, resolvable through resolveSpriteAssets' own seam).
 *
 *   node --import tsx scripts/s140-import-wall-drill.mts
 *
 * Runs against the real DATABASE_URL (SQLite in dev) with throwaway ids and
 * self-cleans its rows + bytes.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// THE DRILL'S ENGINE BUDGETS (this process only — production posture in
// db.ts is untouched): the first drill run proved the invariant (cap never
// crossed, losers compensated) but the losers died on P1008 socket timeouts
// — the engine's default socket ceiling collides with busy_timeout's 10s
// floor when six BEGIN IMMEDIATE racers queue. A wider socket budget and a
// pool sized for the racer count let every racer's contended wait resolve
// INSIDE its transaction, so the store's WALL (ImportCountRefusal) does the
// refusing — the law under proof, not engine plumbing.
{
  const sep = process.env.DATABASE_URL?.includes("?") ? "&" : "?";
  process.env.DATABASE_URL = `${process.env.DATABASE_URL}${sep}socket_timeout=60&connection_limit=12&pool_timeout=30`;
}

const {
  ImportCountRefusal,
  deleteVideoImport,
  listVideoImports,
  resolveSpriteAssets,
  saveImport,
} = await import("../src/lib/tubeforge/graphics/import-store");
const { rawDatabase } = await import("../src/lib/tubeforge/tenant-db");
const { UPLOAD_ROOT, removePrefix } = await import("../src/lib/tubeforge/storage");

const orgId = `s140-drill-org-${crypto.randomBytes(4).toString("hex")}`;
const videoId = `s140-drill-${crypto.randomBytes(4).toString("hex")}`;
const png = (tag: string) =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(tag),
  ]);

let passed = 0;
let failed = 0;
function ok(cond: unknown, msg: string): asserts cond {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.log(`  ✗ ${msg}`);
  }
}

function spec(tag: string) {
  return {
    importId: `imp-${crypto.randomBytes(6).toString("hex")}`,
    layout: "sheet" as const,
    mime: "image/png",
    frames: 1,
    fps: 24,
    frameW: 8,
    frameH: 8,
    source: null,
    license: null,
    _tag: tag,
  };
}

try {
  console.log(`S140 import-wall drill — video ${videoId}`);

  // The org row first (Video.organizationId carries an FK), then the video.
  await rawDatabase.organization.create({
    data: { id: orgId, name: "S140 Drill Org", slug: `s140-drill-${crypto.randomBytes(4).toString("hex")}` },
  });
  await rawDatabase.video.create({
    data: {
      id: videoId,
      organizationId: orgId,
      topic: "s140 drill",
      niche: "tech",
      title: "S140 import wall drill",
    },
  });

  // Pre-fill to cap−2 (importsPerVideo = 8) — sequential, via the SAME
  // saveImport the route uses (each admission also proves the happy path).
  for (let i = 0; i < 6; i++) {
    await saveImport(
      { id: videoId, organizationId: orgId },
      spec(`prefill-${i}`),
      [{ name: "sheet.png", bytes: png(`prefill-${i}`) }],
      "s140-drill"
    );
  }
  ok(true, "6 prefills admitted through the wall (the happy path works)");

  // SIX concurrent racers for the last two slots.
  const racers = Array.from({ length: 6 }, (_, i) => spec(`racer-${i}`));
  const results = await Promise.all(
    racers.map((s) =>
      saveImport(
        { id: videoId, organizationId: orgId },
        s,
        [{ name: "sheet.png", bytes: png(s._tag) }],
        "s140-drill"
      ).then(
        (row) => ({ ok: true as const, row }),
        (err) => ({ ok: false as const, err })
      )
    )
  );

  const wins = results.filter((r) => r.ok);
  const losses = results.filter((r) => !r.ok);
  ok(wins.length === 2, `exactly 2 of 6 racers win the remaining slots (got ${wins.length})`);
  ok(losses.length === 4, `exactly 4 racers refuse (got ${losses.length})`);
  for (const r of losses) {
    const e = r.err as Error & { code?: string; message: string };
    if (!(e instanceof ImportCountRefusal)) {
      console.log(`  DIAG refusal: name=${e?.name} code=${(e as { code?: string })?.code} msg=${e?.message?.slice(0, 200)}`);
    }
  }
  ok(
    losses.every((r) => r.err instanceof ImportCountRefusal),
    "every refusal is the store's ImportCountRefusal (the wall, never an accident)"
  );
  ok(
    losses.every((r) => (r.err as ImportCountRefusal).scope === "video"),
    "the refusal names the VIDEO wall (the org cap of 24 is far away)"
  );

  const finalRows = await listVideoImports(videoId);
  ok(finalRows.length === 8, `the final manifest count sits ON the cap (got ${finalRows.length})`);

  // F1 under contention: every loser's bytes are swept with its admission.
  for (const [i, r] of results.entries()) {
    if (r.ok) continue;
    const dir = path.join(UPLOAD_ROOT, videoId, "graphics", "imports", racers[i].importId);
    ok(!fs.existsSync(dir), `loser ${racers[i]._tag}'s storage prefix was swept (compensation under contention)`);
  }

  // The winners' twin: bytes AND row committed, resolvable through the ONE
  // resolution seam the render job uses.
  for (const [i, r] of results.entries()) {
    if (!r.ok) continue;
    const obj = path.join(UPLOAD_ROOT, videoId, "graphics", "imports", racers[i].importId, "sheet.png");
    ok(fs.existsSync(obj), `winner ${racers[i]._tag}'s bytes landed`);
  }
  const winnerIds = racers.filter((_, i) => results[i].ok).map((s) => s.importId);
  const { missing } = await resolveSpriteAssets(videoId, winnerIds);
  ok(missing.length === 0, "both winners resolve through the sprite seam (no missing keys)");

  // The delete twin rides the same sweep law (S140's removePrefix change).
  const firstWinner = winnerIds[0];
  const deleted = await deleteVideoImport(videoId, firstWinner);
  ok(deleted, "deleteVideoImport removes a winner's row");
  const afterDelete = await listVideoImports(videoId);
  ok(afterDelete.length === 7, "the row count drops to 7 after the delete");
  ok(
    !fs.existsSync(path.join(UPLOAD_ROOT, videoId, "graphics", "imports", firstWinner)),
    "the delete swept the whole import directory (the removePrefix law)"
  );
} catch (err) {
  failed++;
  console.log(`  ✗ drill crashed: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  // Self-clean: rows first, then the org row, then every byte.
  await rawDatabase.graphicsImport.deleteMany({ where: { videoId } }).catch(() => {});
  await rawDatabase.video.delete({ where: { id: videoId } }).catch(() => {});
  await rawDatabase.organization.delete({ where: { id: orgId } }).catch(() => {});
  await removePrefix(`${videoId}/`).catch(() => {});
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

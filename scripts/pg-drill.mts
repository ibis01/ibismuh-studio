/**
 * pg-drill.mts — the real-PostgreSQL release drill (M2, infrastructure &
 * recovery verification, 2026-11-23).
 *
 * The SQLite drill (restore-drill.mts) proves the backup machinery on the
 * development lane. This drill proves the PRODUCTION lane end to end against
 * a real PostgreSQL server:
 *
 *   client  — the release lane's prisma client, generated from
 *             prisma/schema.prisma BEFORE any prisma import resolves (a
 *             machine that last ran setup:local holds the sqlite-generated
 *             client; the pg adapter is rejected against it — observed live
 *             2026-11-23). The teardown restores the dev lane's client.
 *   boot    — a scratch PostgreSQL 17 cluster (embedded-postgres, no docker,
 *             no root) on a random port, scratch data dir, scram auth
 *   migrate — the REAL release path: scripts/migrate-release.mjs
 *             (preflight → session-scoped advisory lock → migrate-stage2
 *             baseline+deploy of the full chain — including the S60
 *             Setting_pkey wedge repair, which fires on every fresh
 *             full-chain deploy — → prisma migrate status)
 *   seed    — org/user/video/jobs through the app's own prisma-factory
 *             (the @prisma/adapter-pg lane)
 *   dump    — scripts/backup-postgres.sh's exact conventions: pg_dump
 *             --format=custom --no-owner --no-privileges, verified with
 *             pg_restore --list (TABLE DATA count), sha256 sidecar
 *   destroy — DROP DATABASE (the lost-database scenario, not a polite delete)
 *   restore — pg_restore --no-owner --no-privileges --clean --if-exists
 *             (the runbook §3 command, verbatim)
 *   verify  — row parity vs the seed, a real query, the applied
 *             _prisma_migrations history, and `prisma migrate status`
 *             exit-0 on the restored DB (a restored database that is not
 *             release-ready is not restored)
 *   lock    — the advisory-lock concurrency law: a live session holding
 *             pg_try_advisory_lock(0x494249534d5548) makes migrate-release
 *             FAIL FAST; releasing it lets a second run succeed (idempotent)
 *
 * pg_dump/pg_restore/psql are NOT bundled with embedded-postgres (server
 * binaries only). Resolve them via PG_BIN_DIR or PATH — e.g. on a Debian
 * box without root:
 *   apt-get download postgresql-client-17 && dpkg -x postgresql-client-17*.deb pgtools/
 *   PG_BIN_DIR=$PWD/pgtools/usr/lib/postgresql/17/bin npm run test:drill:pg
 * The server/client major versions must MATCH (runbook §5, the
 * "could not execute query" failure class) — enforced below as an assertion.
 *
 * Exit 0 = the drill held. Exit 1 = a production-lane finding.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import type { PrismaClient } from "@prisma/client";
import EmbeddedPostgresDefault from "embedded-postgres";
// NOTE: prisma-factory (and therefore @prisma/client) is imported DYNAMICALLY
// in main(), AFTER the postgres-schema client is generated — see the header.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_NAME = "drill";
const ADVISORY_LOCK_KEY = 0x494249534d5548; // "IBISMUH" — must match migrate-release.mjs
let failures = 0;
let completed = false;

function check(name: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/** Find the pg client tools (pg_dump/pg_restore). embedded-postgres ships
 * server binaries only — the drill refuses to fake a dump with anything
 * other than the real tool. */
function resolveClientBin(name: string): string {
  const dir = process.env.PG_BIN_DIR?.trim();
  if (dir) {
    const p = path.join(dir, name);
    if (existsSync(p)) return p;
    throw new Error(`PG_BIN_DIR is set but ${p} does not exist`);
  }
  const which = spawnSync("which", [name], { encoding: "utf8" });
  const p = (which.stdout ?? "").trim();
  if (!p) {
    throw new Error(
      `${name} not found — set PG_BIN_DIR to a postgresql-client bin dir (see the header of scripts/pg-drill.mts for the no-root recipe)`,
    );
  }
  return p;
}

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv): { code: number; out: string } {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", env });
  return { code: r.status ?? -1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

let DRILL_URL = ""; // set in main once the port is known
let createPrismaFn: typeof import("../src/lib/ibismuh/prisma-factory.mjs").createPrisma;

/** The REAL release runner, exactly as an operator invokes it. stdout and
 * stderr are echoed in order with a marker between (spawnSync cannot
 * interleave them; the assertions are order-independent). */
function runRelease(): { code: number; out: string } {
  const r = spawnSync(process.execPath, ["scripts/migrate-release.mjs"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: DRILL_URL },
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  for (const line of (r.stdout ?? "").split("\n")) if (line.trim()) console.log(`    | ${line.replace(/\r/g, "")}`);
  if ((r.stderr ?? "").trim()) {
    console.log("    | --- stderr ---");
    for (const line of (r.stderr ?? "").split("\n")) if (line.trim()) console.log(`    | ${line.replace(/\r/g, "")}`);
  }
  return { code: r.status ?? -1, out };
}

function pgClient(url: string): PrismaClient {
  return createPrismaFn({ adapter: new PrismaPg(url) });
}

type Counts = { videos: number; users: number; orgs: number; jobs: number };

async function counts(url: string): Promise<Counts> {
  const db = pgClient(url);
  try {
    return {
      videos: await db.video.count(),
      users: await db.user.count(),
      orgs: await db.organization.count(),
      jobs: await db.job.count(),
    };
  } finally {
    await db.$disconnect().catch(() => {});
  }
}

async function main(): Promise<void> {
  const pgDump = resolveClientBin("pg_dump");
  const pgRestore = resolveClientBin("pg_restore");
  const prismaBin = path.join(ROOT, "node_modules", ".bin", "prisma");

  const port = await freePort();
  DRILL_URL = `postgres://postgres:drill-pw@127.0.0.1:${port}/${DB_NAME}`;
  const workDir = mkdtempSync(path.join(os.tmpdir(), "tf-pgdrill-"));
  const dataDir = path.join(workDir, "cluster");
  console.log(`[pg-drill] work dir: ${workDir}`);
  console.log(`[pg-drill] scratch cluster: 127.0.0.1:${port} (data ${dataDir})`);

  const pg = new EmbeddedPostgresDefault({
    databaseDir: dataDir,
    port,
    user: "postgres",
    password: "drill-pw",
    authMethod: "scram-sha-256",
    persistent: true,
    autoRehydrateSymlinks: true, // npm blocks the platform postinstall; hydrate at boot
    onLog: () => {},
    onError: () => {},
  });

  let lockConn: import("pg").Client | undefined;
  let seeded: { orgId: string; counts: Counts } | undefined;

  // --- 0. The release lane's prisma client — BEFORE any prisma import ------
  // The generated client must match the postgres schema or every pg adapter
  // is rejected ("not compatible with the provider sqlite" — observed live
  // 2026-11-23, twice: once inside migrate-release on a setup:local machine,
  // once in this drill's own process when the client was imported before the
  // regen). Generate first, import prisma-factory second.
  const gen = run(prismaBin, ["generate", "--schema", "prisma/schema.prisma"], process.env);
  check("prisma client generated from the postgres schema (the release lane's client)", gen.code === 0);
  const factory = await import("../src/lib/ibismuh/prisma-factory.mjs");
  createPrismaFn = factory.createPrisma;

  try {
    const tBoot = Date.now();
    await pg.initialise();
    await pg.start();
    await pg.createDatabase(DB_NAME);
    const boot = await pg
      .getPgClient(DB_NAME)
      .connect()
      .then(async (c) => {
        const v = await c.query("SELECT version()");
        await c.end();
        return v.rows[0].version as string;
      });
    check(
      "scratch PostgreSQL 17 booted (embedded-postgres, scram auth)",
      /PostgreSQL 17\./.test(boot),
      boot.split(" on ")[0],
    );
    const bootMs = Date.now() - tBoot;

    // --- client/server major-version match (runbook §5, enforced) ----------
    const dumpVer = run(pgDump, ["--version"], process.env).out.trim();
    check(
      "pg_dump major matches the server major (the §5 restore-wedge guard)",
      /17\./.test(dumpVer) && /PostgreSQL 17\./.test(boot),
      `server: ${boot.match(/PostgreSQL [\d.]+/)?.[0]} · client: ${dumpVer}`,
    );

    // --- 1. MIGRATE: the real release path, full chain ----------------------
    console.log("[pg-drill] leg 1 — migrate:release (preflight → lock → deploy → verify)");
    const tMigrate = Date.now();
    const rel1 = runRelease();
    const migrateMs = Date.now() - tMigrate;
    check("migrate:release exited 0", rel1.code === 0);
    check("preflight saw postgres", rel1.out.includes("provider: postgres"));
    check("advisory lock acquired (session-scoped)", rel1.out.includes("advisory lock acquired"));
    check(
      "the S60 Setting_pkey wedge fired AND self-repaired (every fresh full-chain deploy)",
      rel1.out.includes("clean-chain deploy wedged at auth_setting") &&
        rel1.out.includes('repair: renaming the surviving "Setting_pkey"') &&
        rel1.out.includes("All migrations have been successfully applied"),
    );
    check("the full chain deployed", rel1.out.includes("release migration verified"));
    const chainLen = readdirSync(path.join(ROOT, "prisma", "migrations"), { withFileTypes: true })
      .filter((e) => e.isDirectory()).length;
    const hist = await pg
      .getPgClient(DB_NAME)
      .connect()
      .then(async (c) => {
        // APPLIED rows only — the S60 repair deliberately leaves the failed
        // attempt as a rolled_back history row, so raw count = chain + 1.
        const r = await c.query(
          "SELECT count(*)::int AS n FROM _prisma_migrations WHERE rolled_back_at IS NULL AND finished_at IS NOT NULL",
        );
        const rb = await c.query("SELECT count(*)::int AS n FROM _prisma_migrations WHERE rolled_back_at IS NOT NULL");
        await c.end();
        return { applied: r.rows[0].n as number, rolledBack: rb.rows[0].n as number };
      });
    check(
      "applied _prisma_migrations == chain length (plus the repair's rolled_back residue)",
      hist.applied === chainLen,
      `applied ${hist.applied}/${chainLen} · rolled_back ${hist.rolledBack} (the S60 repair's history row)`,
    );

    // --- 2. SEED through the app's own factory (adapter-pg lane) ------------
    const seedDb = pgClient(DRILL_URL);
    const org = await seedDb.organization.create({ data: { name: "PG Drill Prod", slug: `pg-drill-${Date.now()}` } });
    await seedDb.user.create({
      data: { email: `pg-drill-${Date.now()}@example.com`, passwordHash: "drill$not$a$real$hash" },
    });
    const video = await seedDb.video.create({
      data: { organizationId: org.id, topic: "the restore drill", niche: "drill", title: "pg-drill" },
    });
    await seedDb.job.createMany({
      data: [
        { organizationId: org.id, kind: "render", entityId: video.id },
        { organizationId: org.id, kind: "thumbnail", entityId: video.id },
      ],
    });
    seeded = { orgId: org.id, counts: await counts(DRILL_URL) };
    await seedDb.$disconnect();
    check(
      "seed landed (org/user/video/2 jobs through prisma-factory)",
      seeded.counts.orgs >= 1 && seeded.counts.users >= 1 && seeded.counts.videos >= 1 && seeded.counts.jobs >= 2,
      `orgs ${seeded.counts.orgs} · users ${seeded.counts.users} · videos ${seeded.counts.videos} · jobs ${seeded.counts.jobs}`,
    );

    // --- 3. DUMP — backup-postgres.sh conventions, verbatim ------------------
    console.log("[pg-drill] leg 2 — pg_dump (the nightly-dump format) + verification");
    const tDump = Date.now();
    const dumpPath = path.join(workDir, `${DB_NAME}.dump`);
    const d = run(pgDump, ["--format=custom", `--file=${dumpPath}`, "--no-owner", "--no-privileges", DRILL_URL], process.env);
    check("pg_dump --format=custom exited 0", d.code === 0 && existsSync(dumpPath));
    const dumpBytes = statSync(dumpPath).size;
    const toc = run(pgRestore, ["--list", dumpPath], process.env);
    const tableData = (toc.out.match(/TABLE DATA/g) ?? []).length;
    check("pg_restore --list verifies the archive", toc.code === 0 && tableData > 0, `${tableData} tables with data, ${dumpBytes} bytes`);
    writeFileSync(`${dumpPath}.sha256`, `${sha256(dumpPath)}  ${path.basename(dumpPath)}\n`);
    const sidecar = readFileSync(`${dumpPath}.sha256`, "utf8").split(/\s+/)[0];
    check("sha256 sidecar matches the artifact", sidecar === sha256(dumpPath), sidecar.slice(0, 12) + "…");
    const dumpMs = Date.now() - tDump;

    // --- 4. DESTROY — the lost-database scenario ------------------------------
    console.log("[pg-drill] leg 3 — destroy + restore (the runbook §3 command)");
    const tRestore = Date.now();
    await pg.dropDatabase(DB_NAME);
    await pg.createDatabase(DB_NAME);
    // the recreated shell has NO schema — assert via information_schema
    // (prisma model counts would throw: the tables themselves are gone)
    const tables = await pg
      .getPgClient(DB_NAME)
      .connect()
      .then(async (c) => {
        const r = await c.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'");
        await c.end();
        return r.rows[0].n as number;
      });
    check("casualty destroyed (DROP DATABASE — schema really gone)", tables === 0, `${tables} tables left in public`);

    // --- 5. RESTORE — the runbook's exact pg_restore invocation ---------------
    const r = run(
      pgRestore,
      ["--dbname", DRILL_URL, "--no-owner", "--no-privileges", "--clean", "--if-exists", dumpPath],
      process.env,
    );
    check("pg_restore exited 0", r.code === 0);

    // --- 6. VERIFY parity + release-readiness ----------------------------------
    const restored = await counts(DRILL_URL);
    const parity =
      restored.orgs === seeded.counts.orgs &&
      restored.users === seeded.counts.users &&
      restored.videos === seeded.counts.videos &&
      restored.jobs === seeded.counts.jobs;
    check(
      "row counts match the pre-destroy baseline (parity)",
      parity,
      `orgs ${restored.orgs} · users ${restored.users} · videos ${restored.videos} · jobs ${restored.jobs}`,
    );

    const qdb = pgClient(DRILL_URL);
    const found = await qdb.organization.findFirst({ where: { id: seeded.orgId } });
    await qdb.$disconnect();
    check("a real query finds the seeded org by id", found?.id === seeded.orgId);

    const status = run(prismaBin, ["migrate", "status", "--schema", "prisma/schema.prisma"], {
      ...process.env,
      DATABASE_URL: DRILL_URL,
    });
    check("prisma migrate status clean on the RESTORED database", status.code === 0, "restored DB is release-ready");
    const restoreMs = Date.now() - tRestore;

    // --- 7. The advisory-lock concurrency law ----------------------------------
    console.log("[pg-drill] leg 4 — the advisory-lock concurrency law");
    lockConn = pg.getPgClient(DB_NAME);
    await lockConn.connect();
    const got = await lockConn.query(`SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) AS locked`);
    check("scratch session acquired the release advisory lock", got.rows[0].locked === true);
    const refused = runRelease();
    check(
      "a concurrent migrate:release FAILS FAST while the lock is held",
      refused.code !== 0 && refused.out.includes("another migration runner holds the advisory lock"),
      `exit ${refused.code}`,
    );
    await lockConn.query(`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`);
    await lockConn.end();
    lockConn = undefined;
    const rel2 = runRelease();
    check(
      "after release, migrate:release succeeds again (idempotent)",
      rel2.code === 0 && rel2.out.includes("release migration verified"),
    );

    console.log(`\n[pg-drill] RTO scratch cluster boot: ${bootMs}ms`);
    console.log(`[pg-drill] RTO migrate:release (full chain, preflight→verify): ${migrateMs}ms`);
    console.log(`[pg-drill] RTO pg_dump + verify + sidecar: ${dumpMs}ms`);
    console.log(`[pg-drill] RTO destroy + pg_restore + parity + migrate status: ${restoreMs}ms`);
    console.log(
      failures === 0
        ? "\npg-drill: the production lane held — the release path and the backup are controls, not hypotheses"
        : `\npg-drill: ${failures} assertion(s) FAILED — production-lane findings: fix before the release decision`,
    );
    completed = true;
  } finally {
    await lockConn?.end().catch(() => {});
    await pg.stop().catch(() => {});
    // restore the dev lane's generated client (the drill ran against the
    // postgres schema's client; local dev and the unit suite expect sqlite's)
    const back = run(prismaBin, ["generate", "--schema", "prisma/schema.sqlite.prisma"], process.env);
    if (back.code !== 0) console.error("[pg-drill] WARNING: failed to restore the sqlite-lane prisma client — run `npm run setup:local`");
    if (completed && failures === 0) rmSync(workDir, { recursive: true, force: true });
    else console.error(`[pg-drill] work dir kept for forensics: ${workDir}`);
    // NOTE: no process.exit HERE — an in-flight exception must reach main()'s
    // catch and report. The terminal exits live in the then/catch below
    // (explicit on purpose: the embedded-postgres exit hook otherwise keeps
    // the process alive after a clean run).
  }
}

main()
  .then(() => process.exit(failures === 0 ? 0 : 1))
  .catch((err) => {
    console.error("pg-drill: fatal:", err?.message ?? err);
    process.exit(1);
  });

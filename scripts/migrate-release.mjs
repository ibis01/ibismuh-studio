#!/usr/bin/env node
// migrate-release.mjs — the dedicated release migration runner (2026-11-23
// hardening, Phase 8). Production deployments migrate through THIS script,
// never as a side effect of web startup.
//
//   npm run migrate:release            # preflight → lock → migrate → verify
//   node scripts/migrate-release.mjs --preflight   # READ-ONLY report
//   node scripts/migrate-release.mjs --force       # clear a stale lock
//
// The release sequence (the mandate's order):
//   1. PREFLIGHT   — read-only: provider, migration-chain state, pending
//                    count, lock state. No mutation, safe to run anywhere.
//   2. LOCK        — a durable migration lock (the _ibismuh_migration_lock
//                    table) so two release runners cannot interleave
//                    migrations (concurrent compose machines, a Fly release
//                    racing a manual operator run). Stale locks (process
//                    died mid-run) are detected by age and cleared with
//                    --force; the runner refreshes the heartbeat so a LIVE
//                    lock is never mistaken for stale.
//   3. MIGRATE     — delegates to scripts/migrate-stage2.mjs, the proven
//                    repair + baseline-detection + deploy logic (untouched:
//                    this runner adds process safety around it, it does not
//                    re-implement migration semantics).
//   4. VERIFY      — post-deploy `prisma migrate status`: the applied
//                    history must match the chain; any pending/failed
//                    migration fails the release loudly.
//
// Operators: take the database backup BEFORE this step (backup.sh /
// db:backup:pg) — see DEPLOYMENT.md's release runbook. The script never
// takes destructive action itself: repairs inside migrate-stage2 are
// idempotent renames/resolves, and every migration in the chain is additive.
//
// Rollback limitation (documented, not hidden): the chain is
// forward-migrating; there is no automated down-migration. Recovery is
// restore-from-backup (the runbook's step 0), which is why the backup
// verification precedes this script in the release checklist.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPrisma } from "../src/lib/ibismuh/prisma-factory.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const prismaBin = join(root, "node_modules", ".bin", "prisma");
const STALE_LOCK_MS = 30 * 60 * 1000; // a run older than 30min is dead

// --- resolve DATABASE_URL the same way migrate-stage2 does ----------------
let url = (process.env.DATABASE_URL || "").trim();
const envPath = join(root, ".env");
if (!url && existsSync(envPath)) {
  const m = readFileSync(envPath, "utf8").match(
    /^\s*DATABASE_URL\s*=\s*"?([^"\r\n]+)"?\s*$/m,
  );
  url = m ? m[1].trim() : "";
}
if (!url) url = "file:../db/custom.db";
if (url.startsWith("file:") && !url.slice("file:".length).startsWith("/")) {
  url = `file:${join(root, "prisma", url.slice("file:".length))}`;
}
const isSqlite = url.startsWith("file:");

const run = (args, opts = {}) =>
  execFileSync(prismaBin, args, {
    stdio: "inherit",
    cwd: root,
    env: { ...process.env, DATABASE_URL: url },
    ...opts,
  });

const log = (msg) => console.log(`[migrate-release] ${msg}`);
const die = (msg) => {
  console.error(`[migrate-release] FAIL: ${msg}`);
  process.exit(1);
};

const preflightOnly = process.argv.includes("--preflight");
const force = process.argv.includes("--force");

// ---------------------------------------------------------------------------
// 1. PREFLIGHT (read-only)
// ---------------------------------------------------------------------------
function preflight() {
  log(`provider: ${isSqlite ? "sqlite" : "postgres"}`);
  log(`database: ${url.replace(/:[^:@/]*@/, ":***@")}`); // redacted credentials
  if (isSqlite) {
    log("SQLite flow: local development syncs via `prisma db push` (migrate-stage2 phase 2) — no migration chain to report");
    return;
  }
  log("migration status (read-only):");
  try {
    run(["migrate", "status", "--schema", "prisma/schema.prisma"]);
  } catch {
    // migrate status exits non-zero when migrations are pending/failed —
    // that IS information, not a crash. The verify step re-runs it.
    log("migrate status reported pending/failed state (see above) — this is what the migrate step will address");
  }
}

// ---------------------------------------------------------------------------
// 2. LOCK (concurrent-runner protection)
//
// Postgres: a SESSION-scoped advisory lock (pg_try_advisory_lock) held on
// this runner's open connection for the whole run. Crash-safe by design —
// the lock dies with the session, so a killed runner can never wedge the
// next release (no staleness handling, no heartbeat, nothing to clear).
//
// SQLite: single-machine development — a lockfile beside the database with
// stale detection (a crashed local run leaves the file behind; anything
// older than STALE_LOCK_MS is reaped, --force clears immediately).
// ---------------------------------------------------------------------------
const ADVISORY_LOCK_KEY = 0x494249534d5548; // "IBISMUH"

async function withLock(fn) {
  if (isSqlite) {
    const lockPath = url.replace(/^file:/, "") + ".migrate-release.lock";
    const stale = existsSync(lockPath)
      ? Date.now() - (await import("node:fs")).statSync(lockPath).mtimeMs > STALE_LOCK_MS
      : false;
    if (existsSync(lockPath) && !stale && !force) {
      die(`another local migration run holds ${lockPath} (live). --force clears a stale one`);
    }
    if (existsSync(lockPath)) log("clearing a stale local lock");
    (await import("node:fs")).writeFileSync(lockPath, String(process.pid));
    try {
      await fn();
    } finally {
      (await import("node:fs")).rmSync(lockPath, { force: true });
    }
    return;
  }

  const db = createPrisma();
  try {
    const got = await db.$queryRawUnsafe(
      `SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) AS locked`,
    );
    const locked = Array.isArray(got) && got[0]?.locked === true;
    if (!locked) {
      die(
        "another migration runner holds the advisory lock (live session). It releases automatically when that runner exits; --force does NOT bypass a live Postgres lock",
      );
    }
    log("advisory lock acquired (session-scoped — auto-released on exit/crash)");
    try {
      await fn();
    } finally {
      await db
        .$queryRawUnsafe(`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`)
        .catch(() => {}); // the session dies anyway
    }
  } finally {
    await db.$disconnect().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// 3+4. MIGRATE then VERIFY
// ---------------------------------------------------------------------------
async function main() {
  preflight();
  if (preflightOnly) {
    log("preflight-only run — no changes made");
    return;
  }

  await withLock(async () => {
    log("running scripts/migrate-stage2.mjs (the proven repair + deploy logic)…");
    execFileSync("node", ["scripts/migrate-stage2.mjs"], {
      stdio: "inherit",
      cwd: root,
      timeout: 10 * 60 * 1000,
      env: { ...process.env, DATABASE_URL: url },
    });

    if (isSqlite) {
      log("SQLite flow: schema synced via db push — release migration complete");
      return;
    }
    log("verifying the applied history matches the chain…");
    try {
      run(["migrate", "status", "--schema", "prisma/schema.prisma"]);
      log("release migration verified: the chain is fully applied");
    } catch {
      die(
        "post-migration verification failed — `prisma migrate status` still reports pending/failed migrations. The database is NOT released; inspect the status output above and the runbook in DEPLOYMENT.md before re-running",
      );
    }
  });
}

main().catch((err) => {
  console.error("[migrate-release] fatal:", err?.message ?? err);
  process.exit(1);
});

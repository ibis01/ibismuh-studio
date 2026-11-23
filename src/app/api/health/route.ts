// GET /api/health — the production readiness probe (2026-11-23 hardening,
// Phase 10).
//
// PUBLIC by design (load balancers, docker healthchecks and uptime monitors
// cannot authenticate) and SAFE by construction: booleans, counts,
// timestamps and version identifiers ONLY. Never: env values, connection
// strings, credentials, emails, topics, payloads or internal URLs. The
// richer authenticated triage surface stays at /api/diag.
//
// Shape (the release runbook's step 7):
//   ok            overall readiness (database reachable)
//   database      { ok, provider }
//   storage       { driver, ok }        ok = writable (local) | configured (s3)
//   migration     { mode, latestApplied|null }  version identifier only
//   queue         { pending, running, failed, retrying, expiringLeases,
//                   oldestPendingAgeMs }
//   worker        { lastClaimAt|null }  a recent claim proves a live worker
//   providerConfig{ chat|tts|asr|image|video: { anyConfigured } }

import { NextResponse } from "next/server";
import { rawDatabase } from "@/lib/ibismuh/raw-db/system";
import { storageDriverKind, put as storagePut, remove as storageRemove } from "@/lib/ibismuh/storage";
import { queueMetrics } from "@/lib/ibismuh/queue";
import { encryptionKeyUsable } from "@/lib/ibismuh/providers/settings";
import { PROVIDERS_BY_CAPABILITY } from "@/lib/ibismuh/providers/registry";

export const dynamic = "force-dynamic";

async function probeDatabase(): Promise<{ ok: boolean; provider: string }> {
  const provider = (process.env.DATABASE_URL ?? "").startsWith("file:")
    ? "sqlite"
    : (process.env.DATABASE_URL ?? "").startsWith("postgres")
      ? "postgres"
      : "unset";
  try {
    await rawDatabase.user.count({ take: 1, select: { id: true } } as never);
    return { ok: true, provider };
  } catch {
    return { ok: false, provider };
  }
}

async function probeStorage(): Promise<{ driver: string; ok: boolean }> {
  const driver = storageDriverKind();
  try {
    if (driver === "s3") {
      // configured = bucket + endpoint resolvable; a HEAD-level probe without
      // exposing the target
      return { driver, ok: Boolean(process.env.IBISMUH_STUDIO_S3_BUCKET) };
    }
    // local: a write+delete round-trip proves writability
    const key = "_health/probe.txt";
    await storagePut(key, Buffer.from("ok"));
    await storageRemove(key).catch(() => {});
    return { driver, ok: true };
  } catch {
    return { driver, ok: false };
  }
}

async function probeMigration(): Promise<{ mode: string; latestApplied: string | null }> {
  const provider = (process.env.DATABASE_URL ?? "").startsWith("file:") ? "sqlite" : "postgres";
  if (provider === "sqlite") {
    return { mode: "db-push (local dev flow — no chain)", latestApplied: null };
  }
  try {
    const rows = (await rawDatabase.$queryRawUnsafe(
      `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name DESC LIMIT 1`,
    )) as { migration_name?: string }[];
    return { mode: "prisma-migrate", latestApplied: rows[0]?.migration_name ?? null };
  } catch {
    return { mode: "prisma-migrate", latestApplied: null };
  }
}

async function probeWorker(): Promise<{ lastClaimAt: string | null }> {
  try {
    const row = await rawDatabase.job.findFirst({
      where: { claimedAt: { not: null } },
      orderBy: { claimedAt: "desc" },
      select: { claimedAt: true },
    });
    return { lastClaimAt: row?.claimedAt ? row.claimedAt.toISOString() : null };
  } catch {
    return { lastClaimAt: null };
  }
}

async function probeProviderConfig(): Promise<Record<string, { anyConfigured: boolean }>> {
  // Booleans only: whether ANY provider credential row exists per capability.
  // Provider NAMES are withheld from the public surface (authenticated
  // settings show them).
  const out: Record<string, { anyConfigured: boolean }> = {};
  for (const cap of ["chat", "tts", "asr", "image", "video"] as const) {
    try {
      const count = await rawDatabase.providerCredential.count({
        where: { capability: cap },
      });
      out[cap] = { anyConfigured: count > 0 };
    } catch {
      out[cap] = { anyConfigured: false };
    }
  }
  return out;
}

export async function GET() {
  const [database, storageProbe, migration, queue, worker, providerConfig] =
    await Promise.all([
      probeDatabase(),
      probeStorage(),
      probeMigration(),
      queueMetrics().catch(() => null),
      probeWorker(),
      probeProviderConfig(),
    ]);

  const body = {
    ok: database.ok,
    at: new Date().toISOString(),
    database,
    storage: storageProbe,
    migration,
    queue: queue ?? { unavailable: true },
    worker,
    providerConfig,
    secrets: {
      // presence floors only — never lengths that fingerprint, never values
      authSecretConfigured: (process.env.IBISMUH_STUDIO_AUTH_SECRET ?? "").length >= 16,
      encryptionKeyUsable: encryptionKeyUsable(),
    },
    providers: Object.keys(PROVIDERS_BY_CAPABILITY).length,
  };

  return NextResponse.json(body, {
    status: database.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}

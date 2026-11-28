#!/usr/bin/env node
// webhook-redrive.mts — Phase 9: the Stripe dead-letter REDRIVE tool.
//
// The webhook route answers 500 on a handler failure (the contract Stripe
// retries on) and persists the raw event to the WebhookDeadLetter store
// (billing.ts recordWebhookDeadLetter). Stripe's retry budget is finite;
// when it gives up, the dead-letter row is the ONLY copy of the event and
// this script is its way back into the pipeline.
//
// THE ONE-HANDLER LAW: the replay calls processStripeEvent in
// src/lib/ibismuh/billing.ts — the SAME function the webhook route calls.
// There is no second handler, so a redriven event goes through exactly the
// idempotency + grant-upsert machinery a live delivery went through (the
// event-id record was freed when the handler threw, so the replay runs for
// real; an event that had already succeeded somewhere else acks as a
// duplicate and is redeemed as stale).
//
// OUTCOMES, per row:
//   replay succeeded ("processed" or "duplicate") → status "redeemed",
//     redeemedAt stamped (the last failure message stays on the row — the
//     forensic trail of WHY it was dead);
//   replay threw → attempts incremented, status stays "dead", the error
//     column refreshed — the row remains queued for the next redrive.
//
// NPM-LESS RUN (operator tooling — no package.json script; run it directly,
// DATABASE_URL resolves from the platform env or the project .env):
//
//   node --import tsx scripts/webhook-redrive.mts                     # list + redrive every dead row (oldest first)
//   node --import tsx scripts/webhook-redrive.mts --limit 20          # at most 20 rows this pass
//   node --import tsx scripts/webhook-redrive.mts --dry-run           # list only — replay nothing
//   node --import tsx scripts/webhook-redrive.mts --prune-redeemed 30 # drop redeemed rows older than 30 days (retention)
//   node --import tsx scripts/webhook-redrive.mts --json              # machine-readable report
//
// Exit code: 0 when every replayed row redeemed (or nothing to do),
// 1 when any row stayed dead (CI/alerting can page on it).
//
// PRIVACY (the provider-status law, mirrored): the payload column holds
// exactly what Stripe sent — this tool never enriches rows with key-shaped
// material, and the printed report carries event ids + types only.

import path from "node:path";
import { pathToFileURL } from "node:url";
import { createPrisma } from "../src/lib/ibismuh/prisma-factory.mjs";

const db = createPrisma();

export interface DeadLetterSummary {
  id: string;
  eventId: string;
  provider: string;
  type: string | null;
  attempts: number;
  status: string;
  createdAt: Date;
  organizationId: string | null;
  error: string | null;
}

function typeOf(payload: string): string | null {
  try {
    const parsed = JSON.parse(payload) as { type?: unknown };
    return typeof parsed.type === "string" ? parsed.type : null;
  } catch {
    return null;
  }
}

/** The dead rows, oldest first — the operator's queue view. */
export async function listDeadLetters(limit = 100): Promise<DeadLetterSummary[]> {
  const rows = await db.webhookDeadLetter.findMany({
    where: { status: "dead" },
    orderBy: { createdAt: "asc" },
    take: Math.min(500, Math.max(1, limit)),
  });
  return rows.map((row) => ({
    id: row.id,
    eventId: row.eventId,
    provider: row.provider,
    type: typeOf(row.payload),
    attempts: row.attempts,
    status: row.status,
    createdAt: row.createdAt,
    organizationId: row.organizationId,
    error: row.error,
  }));
}

export interface RedriveReport {
  scanned: number;
  redeemed: number;
  failed: number;
  failures: { eventId: string; error: string }[];
}

/**
 * Replay dead rows through processStripeEvent — the route's one handler.
 * Each row is independent: one row's failure never stops the batch. The
 * event id is NOT pre-freed here — processStripeEvent owns the idempotency
 * protocol (create-then-handle, free-on-failure), which is exactly the
 * point of calling it instead of re-implementing any of it.
 */
export async function redriveDeadLetters(opts: { limit?: number } = {}): Promise<RedriveReport> {
  const billing = await import("../src/lib/ibismuh/billing");
  const rows = await db.webhookDeadLetter.findMany({
    where: { status: "dead" },
    orderBy: { createdAt: "asc" },
    take: Math.min(500, Math.max(1, opts.limit ?? 100)),
  });

  const report: RedriveReport = { scanned: rows.length, redeemed: 0, failed: 0, failures: [] };

  for (const row of rows) {
    let event: unknown;
    try {
      event = JSON.parse(row.payload);
    } catch {
      // A truncated/corrupt payload can never replay — keep the row dead
      // with an honest error instead of pretending to have tried.
      const message = "stored payload is not valid JSON — the row cannot be replayed (restore the event from Stripe's dashboard or logs)";
      await db.webhookDeadLetter
        .update({ where: { id: row.id }, data: { attempts: { increment: 1 }, error: message } })
        .catch(() => {});
      report.failed += 1;
      report.failures.push({ eventId: row.eventId, error: message });
      console.error(`  ✗ ${row.eventId} — ${message}`);
      continue;
    }

    try {
      const outcome = await billing.processStripeEvent(event as Parameters<typeof billing.processStripeEvent>[0]);
      await db.webhookDeadLetter.update({
        where: { id: row.id },
        data: { status: "redeemed", redeemedAt: new Date() },
      });
      report.redeemed += 1;
      // "duplicate" = the work was already done somewhere else (the event id
      // had succeeded) — redeemed is still the honest state for the row.
      console.log(`  ✓ ${row.eventId} — ${outcome === "duplicate" ? "redeemed (duplicate — already processed elsewhere)" : "redeemed (handler ran)"}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db.webhookDeadLetter
        .update({ where: { id: row.id }, data: { attempts: { increment: 1 }, error: message.slice(0, 2000) } })
        .catch(() => {});
      report.failed += 1;
      report.failures.push({ eventId: row.eventId, error: message });
      console.error(`  ✗ ${row.eventId} — still dead: ${message.slice(0, 200)}`);
    }
  }
  return report;
}

/** Retention for the redeemed tail — the dead rows stay (they are the work). */
export async function pruneRedeemed(olderThanDays: number, now: number = Date.now()): Promise<number> {
  const cutoff = new Date(now - Math.max(1, olderThanDays) * 24 * 60 * 60 * 1000);
  const gone = await db.webhookDeadLetter.deleteMany({
    where: { status: "redeemed", redeemedAt: { lt: cutoff } },
  });
  return gone.count;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const has = (name: string): boolean => args.includes(name);
  const asJson = has("--json");
  const dryRun = has("--dry-run");
  const limit = Number(flag("--limit") ?? 100);
  const pruneDays = flag("--prune-redeemed");

  console.log("◆ webhook redrive — the dead-letter store (WebhookDeadLetter)");

  if (pruneDays !== undefined) {
    const pruned = await pruneRedeemed(Number(pruneDays) || 30);
    console.log(`  pruned ${pruned} redeemed row(s) older than ${pruneDays} day(s)`);
  }

  const dead = await listDeadLetters(Number.isFinite(limit) ? limit : 100);
  if (dead.length === 0) {
    console.log("  nothing dead — the queue is clean");
    return 0;
  }
  for (const row of dead) {
    console.log(
      `  • ${row.eventId}  type=${row.type ?? "?"}  attempts=${row.attempts}  org=${row.organizationId ?? "(unresolved)"}  dead-since=${row.createdAt.toISOString()}  last-error=${(row.error ?? "").slice(0, 120)}`
    );
  }

  if (dryRun) {
    console.log(`\n${dead.length} dead row(s) listed — dry run, nothing replayed`);
    return 1;
  }

  const report = await redriveDeadLetters({ limit: Number.isFinite(limit) ? limit : 100 });
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  }
  console.log(
    `\nredrive pass: scanned=${report.scanned} redeemed=${report.redeemed} still-dead=${report.failed}`
  );
  return report.failed > 0 ? 1 : 0;
}

// Run only when invoked directly (the dead-letter battery imports the
// functions above and must not trigger a second main()).
const invokedDirectly =
  !!process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  main()
    .then((code) => {
      void db.$disconnect();
      process.exit(code);
    })
    .catch((err) => {
      console.error("[webhook-redrive] fatal:", err);
      void db.$disconnect();
      process.exit(1);
    });
}

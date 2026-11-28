import { createPrisma } from "../src/lib/ibismuh/prisma-factory.mjs";

// Phase 9 — the webhook DEAD-LETTER STORE battery.
//
// Pins the full life of one failing Stripe event, end to end, through the
// REAL route handler (in-process) and the REAL redrive tool:
//
//   1. THE THROW → THE STORE — an authenticated event whose handler throws
//      lands in WebhookDeadLetter: status "dead", attempts 1, the payload
//      column BYTE-FAITHFUL (exactly the raw request body — the store
//      transforms nothing), a non-empty error, and the best-effort tenant
//      enrichment resolved (the event names a fixture user → its org).
//   2. THE IDEMPOTENT eventId — Stripe redelivers the same failing event:
//      still exactly ONE row, attempts incremented (no duplicate rows).
//   3. THE REDRIVE REPLAY — scripts/webhook-redrive.mts's redriveDeadLetters
//      replays the stored payload through the SAME one-handler function the
//      route calls (processStripeEvent): while the failure condition stands,
//      the handler really runs and really fails again (attempts grow, status
//      stays dead, no side effect landed).
//   4. THE REDEEM — once the operator fixes the condition, the same redrive
//      pass succeeds: the handler's real side effect lands (the Subscription
//      row exists), the event id is recorded in ProcessedWebhookEvent, and
//      the dead-letter row flips to "redeemed" with redeemedAt stamped.
//   5. THE REDEEMED TAIL IS IDLE — a second redrive pass does not touch
//      redeemed rows (attempts frozen — no double replay, no double apply).
//   6. THE PRIVACY LAW — no key-shaped material anywhere in the store
//      (payload + error scanned; the same law sentence the provider-status
//      battery pins: "no key-shaped material in the payload").
//
// The failure condition is REAL, not mocked: checkout.session.completed with
// metadata.planTier unknown to PLAN_DEFAULTS makes the handler's plan-row
// fallback create a Plan with tier "starter" — a P2002 against the unique
// tier once a starter row exists. The operator's fix is the honest one:
// create the Plan row for the tier the event actually names.
//
// Run (needs a DB whose schema includes WebhookDeadLetter):
//   node --import tsx scripts/test-webhook-dead-letter.mts
// (against a throwaway fixture DB: DATABASE_URL=file:/abs/path/scratch/<fixture>.db)

import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";

const _root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const db = createPrisma();

let passed = 0;
let failed = 0;
const failures: string[] = [];
let suite = "";

function suiteStart(name: string) {
  suite = name;
  console.log(`\n◆ ${name}`);
}

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    failures.push(`[${suite}] ${name} — ${msg}`);
    console.error(`  ✗ ${name} — ${msg}`);
  }
}

function ok(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function eq<T>(actual: T, expected: T, label = "value") {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label}: expected ${b}, got ${a}`);
}

// --- fixtures -------------------------------------------------------------

const MARK = `p9dl_${Date.now().toString(36)}`;
const USER_IDS: string[] = [];
const ORG_IDS: string[] = [];
const PLAN_IDS: string[] = [];
const EVENT_IDS: string[] = [];

async function makeUserWithOrg(email: string) {
  const org = await db.organization.create({ data: { name: `dead-letter fixture ${MARK}`, slug: `dl-${MARK}-${Math.random().toString(36).slice(2, 8)}` } });
  ORG_IDS.push(org.id);
  const user = await db.user.create({
    data: { email, passwordHash: `pbkdf2$1$s$${MARK}`, name: "Phase 9 dead-letter fixture" },
  });
  USER_IDS.push(user.id);
  await db.membership.create({ data: { userId: user.id, organizationId: org.id, role: "owner" } });
  return { user, org };
}

async function ensurePlan(tier: string, monthlyCredits: number): Promise<{ id: string; created: boolean }> {
  const standing = await db.plan.findUnique({ where: { tier } });
  if (standing) return { id: standing.id, created: false };
  const plan = await db.plan.create({
    data: {
      name: tier === "starter" ? "Starter" : `Fixture ${tier}`,
      tier,
      monthlyCredits,
      maxResolution: "1080p",
      priorityRendering: false,
      teamMembers: 1,
    },
  });
  PLAN_IDS.push(plan.id);
  return { id: plan.id, created: true };
}

async function cleanup() {
  // Children first (subscription/ledger/dead-letter rows reference the
  // fixtures), then the parents — mirrors test-billing's teardown order.
  for (const id of USER_IDS) await db.user.delete({ where: { id } }).catch(() => {});
  for (const id of ORG_IDS) await db.organization.delete({ where: { id } }).catch(() => {});
  for (const id of PLAN_IDS) await db.plan.delete({ where: { id } }).catch(() => {});
  if (EVENT_IDS.length) {
    await db.processedWebhookEvent.deleteMany({ where: { id: { in: EVENT_IDS } } });
  }
  await db.webhookDeadLetter.deleteMany({ where: { eventId: { startsWith: `evt_${MARK}` } } }).catch(() => {});
}

/** POST to the REAL route handler in-process (test-billing's pattern). */
async function postWebhook(body: string, headers: Record<string, string> = {}): Promise<{ status: number; json: Record<string, unknown> }> {
  const { POST } = await import("../src/app/api/billing/webhook/route");
  const req = new NextRequest("http://localhost:3000/api/billing/webhook", {
    method: "POST",
    body,
    headers: { "content-type": "application/json", ...headers },
  });
  const res = await POST(req);
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    /* error bodies may be empty */
  }
  return { status: res.status, json };
}

/** Build a Stripe-signed payload with node crypto (mirrors the SDK). */
function stripeSign(secret: string, body: string): string {
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

const SECRET = "whsec_p9dl_test";
process.env.IBISMUH_STUDIO_STRIPE_WEBHOOK_SECRET = SECRET;

const { redriveDeadLetters } = await import("./webhook-redrive.mts");

// The unknown tier the fixture event names — the failure condition.
const UNKNOWN_TIER = `phase9_unknown_${MARK}`;

// ===========================================================================
suiteStart("the throw lands in the store — byte-faithful payload, tenant resolved");

const { user, org } = await makeUserWithOrg(`p9dl-owner-${MARK}@fixture.local`);

// The failure condition: a starter Plan row must exist so the handler's
// fallback (PLAN_DEFAULTS.starter → tier "starter") collides with the
// unique tier and P2002s.
await ensurePlan("starter", 1000);

const RAW_BODY = JSON.stringify({
  id: `evt_${MARK}_throw`,
  type: "checkout.session.completed",
  data: {
    object: {
      client_reference_id: user.id,
      customer: `cus_${MARK}`,
      subscription: `sub_${MARK}`,
      metadata: { planTier: UNKNOWN_TIER },
    },
  },
});
EVENT_IDS.push(`evt_${MARK}_throw`);

await test("the failing event answers the contract 500 and lands in the store", async () => {
  const res = await postWebhook(RAW_BODY, { "stripe-signature": stripeSign(SECRET, RAW_BODY) });
  eq(res.status, 500, "a handler failure still answers 500 (Stripe retries)");
  eq(res.json.error, "Handler failed", "the 500 body is unchanged by the dead-letter write");
  const row = await db.webhookDeadLetter.findUnique({ where: { eventId: `evt_${MARK}_throw` } });
  ok(row, "the dead-letter row exists");
  eq(row?.status, "dead", "status starts dead");
  eq(row?.attempts, 1, "attempts starts at 1");
  eq(row?.provider, "stripe", "the provider is stamped");
  eq(row?.payload, RAW_BODY, "the payload column is BYTE-FAITHFUL — the raw event JSON, transformed by nobody");
  ok(row && row.error.length > 0, "the error column carries the handler's verdict");
  eq(row?.organizationId, org.id, "the best-effort tenant enrichment resolved the event's org (client_reference_id → membership)");
  eq(row?.redeemedAt, null, "a dead row has no redemption stamp");
});

// ===========================================================================
suiteStart("the idempotent eventId — a redelivered failing event is ONE row");

await test("the same event again → still one row, attempts incremented", async () => {
  const res = await postWebhook(RAW_BODY, { "stripe-signature": stripeSign(SECRET, RAW_BODY) });
  eq(res.status, 500, "the redelivery fails the same way");
  const rows = await db.webhookDeadLetter.findMany({ where: { eventId: `evt_${MARK}_throw` } });
  eq(rows.length, 1, "exactly ONE row per eventId (the unique index is the law)");
  eq(rows[0]?.attempts, 2, "the standing row's attempts incremented");
  eq(rows[0]?.status, "dead", "still dead");
});

// ===========================================================================
suiteStart("the redrive replay — the SAME handler runs, and honestly fails");

await test("redrive before the fix: the handler re-runs and re-throws (no side effect lands)", async () => {
  const report = await redriveDeadLetters({ limit: 50 });
  ok(report.scanned >= 1, "the redrive saw the dead row");
  ok(report.failed >= 1, "the replay failed while the condition stands");
  const row = await db.webhookDeadLetter.findUnique({ where: { eventId: `evt_${MARK}_throw` } });
  eq(row?.attempts, 3, "the replay incremented attempts (2 route failures + 1 redrive)");
  eq(row?.status, "dead", "the row stays dead");
  const subscription = await db.subscription.findUnique({ where: { userId: user.id } });
  eq(subscription, null, "the handler REALLY ran and REALLY failed — no subscription was written");
  const processed = await db.processedWebhookEvent.findUnique({ where: { id: `evt_${MARK}_throw` } });
  eq(processed, null, "the event id was freed again — Stripe's own retry would still run the handler");
});

// ===========================================================================
suiteStart("the redeem — the operator fix + one redrive pass");

await test("after the Plan row exists, the redrive replays the SAME payload and the handler succeeds", async () => {
  const plan = await ensurePlan(UNKNOWN_TIER, 10000); // THE OPERATOR FIX
  ok(plan.created, "the operator fix created the tier's Plan row");
  const report = await redriveDeadLetters({ limit: 50 });
  ok(report.redeemed >= 1, "the replay succeeded");
  const row = await db.webhookDeadLetter.findUnique({ where: { eventId: `evt_${MARK}_throw` } });
  eq(row?.status, "redeemed", "the row flipped to redeemed");
  ok(row?.redeemedAt, "redeemedAt is stamped");
  ok(row && row.error.length > 0, "the forensic trail (why it was dead) stays on the row");
  const subscription = await db.subscription.findUnique({ where: { userId: user.id } });
  ok(subscription, "the handler's REAL side effect landed (the Subscription row exists)");
  eq(subscription?.planId, plan.id, "the subscription rides the tier the event named");
  eq(subscription?.status, "active", "the subscription is active");
  const processed = await db.processedWebhookEvent.findUnique({ where: { id: `evt_${MARK}_throw` } });
  ok(processed, "the event id is recorded in ProcessedWebhookEvent (exactly-once, like a live delivery)");
});

await test("a second redrive pass leaves redeemed rows idle", async () => {
  const before = await db.webhookDeadLetter.findUnique({ where: { eventId: `evt_${MARK}_throw` } });
  const report = await redriveDeadLetters({ limit: 50 });
  eq(report.redeemed, 0, "the redeemed row is not replayed");
  const after = await db.webhookDeadLetter.findUnique({ where: { eventId: `evt_${MARK}_throw` } });
  eq(after?.attempts, before?.attempts, "attempts frozen — no double replay");
  const subs = await db.subscription.findMany({ where: { userId: user.id } });
  eq(subs.length, 1, "no double apply — the subscription was not re-created");
});

// ===========================================================================
suiteStart("the privacy law — the store never carries key-shaped material");

await test("no key-shaped material in the stored payload or error (the provider-status sentence, mirrored)", async () => {
  const rows = await db.webhookDeadLetter.findMany({ where: { eventId: { startsWith: `evt_${MARK}` } } });
  ok(rows.length >= 1, "the fixture's rows are present");
  for (const row of rows) {
    const hay = `${row.payload}\n${row.error}`;
    ok(!/sk-[A-Za-z0-9]{8,}/.test(hay), `row ${row.eventId} carries no key-shaped material`);
    ok(!row.payload.includes("whsec_"), "the signing secret never leaks into the stored payload");
  }
});

// ===========================================================================

await cleanup();

if (failed > 0) {
  console.error(`\ndead-letter battery: FAIL (${passed} passed, ${failed} failed)`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`\ndead-letter battery: PASS (${passed} passed, ${failed} failed)`);

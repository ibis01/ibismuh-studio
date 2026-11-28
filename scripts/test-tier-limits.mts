import { createPrisma } from "../src/lib/ibismuh/prisma-factory.mjs";

// Phase 9 — the PER-TIER ADMISSION battery (tier-limits.ts).
//
//   1. THE POLICY LAW (pure) — the documented numbers are the contract and
//      are pinned verbatim: full renders per org per UTC day (starter 3,
//      creator 20, studio unmetered) and expensive-lane requests per minute
//      per org (starter 6, creator 30, studio 90). Unknown tiers fall back
//      to the starter ceilings (fail toward the tightest policy).
//   2. THE TIER RESOLUTION (DB) — resolveUserTier mirrors the billing
//      enforcement's derivation EXACTLY: no subscription → starter, active/
//      trialing/past_due → the plan's tier, canceled (and any unknown
//      status) → starter (a stale plan row never keeps entitlement-shaped
//      limits after the access is gone).
//   3. THE DAILY QUOTA (DB) — the guarded upsert: N concurrent racers
//      against a limit of 3 admit exactly 3 (the DB serializes them), a
//      REFUSED attempt never consumes quota (the standing count stays
//      honest), the quota is keyed per UTC day so "tomorrow" admits again
//      (the structural reset), and the retention sweep prunes stale days
//      while fresh ones survive. Through gateTierRenderQuota: a starter org
//      is refused with the honest used/limit/resetsAt payload and a creator
//      org sails past the starter limit (the tier differentiation).
//   4. THE PER-MINUTE CEILING (DB) — the tier keys ride the SHARED limiter's
//      counter table (no key collision with the r:/w: IP buckets): N racers
//      admit exactly the tier's limit, the NEXT window admits again (the
//      fixed-window reset — full reset at the epoch minute boundary, never
//      gradual), and a creator-tier bucket admits past the starter ceiling.
//   5. THE SEAM PINS (source) — the admission gates ride the expensive
//      routes in the documented order: the render route gates BEFORE the
//      lane dispatch and before any write; the graphics/whiteboard routes
//      ceiling every POST and quota only the full-render branches; the
//      script and hook-panel routes ceiling their LLM work (hook-panel's
//      pure score mode stays ungated); the webhook route's catch persists
//      the dead letter.
//
// Run (needs a DB whose schema includes TierRenderCounter):
//   node --import tsx scripts/test-tier-limits.mts
// (against a throwaway fixture DB: DATABASE_URL=file:/abs/path/scratch/<fixture>.db)

let failed = false;
function ok(cond: unknown, msg: string): asserts cond {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    failed = true;
    console.error(`  ✗ ${msg}`);
  }
}
function eq<T>(actual: T, expected: T, label = "value") {
  ok(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${label} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`
  );
}

const db = createPrisma();
const fs = await import("node:fs");
const run = Date.now().toString(36); // the battery's row marker — cleanup targets only these

async function main(): Promise<void> {
  console.log("◆ Phase 9 — per-tier admission (policy + quota + ceiling + seams)");

  // ---- 1. THE POLICY LAW ----------------------------------------------------
  const { TIER_RENDER_DAY_LIMITS, TIER_REQUEST_PER_MIN, tierRenderDayLimit, tierRequestPerMin, tierMinuteKey, bumpTierRenderCounter, gateTierRenderQuota, sweepTierRenderCounters, nextUtcMidnight } =
    await import("../src/lib/ibismuh/tier-limits");

  eq(TIER_RENDER_DAY_LIMITS, { starter: 3, creator: 20, studio: 0 }, "the daily render policy is the documented one (studio 0 = unmetered)");
  eq(TIER_REQUEST_PER_MIN, { starter: 6, creator: 30, studio: 90 }, "the per-minute ceilings are the documented ones");
  eq(tierRenderDayLimit("creator"), 20, "the daily limit resolves per tier");
  eq(tierRenderDayLimit("not-a-tier"), 3, "an unknown tier falls back to the starter ceiling (fail toward the tightest policy)");
  eq(tierRequestPerMin("studio"), 90, "the per-minute ceiling resolves per tier");
  eq(tierRequestPerMin("not-a-tier"), 6, "an unknown per-minute tier falls back to starter too");
  ok(!tierMinuteKey("render", "org").startsWith("r:") && !tierMinuteKey("render", "org").startsWith("w:"), "tier keys never collide with the shared limiter's r:/w: IP buckets");
  ok(tierMinuteKey("render", "org1") !== tierMinuteKey("script", "org1"), "each lane scope meters its own bucket");

  // ---- 2. THE TIER RESOLUTION (DB) ------------------------------------------
  const { resolveUserTier } = await import("../src/lib/ibismuh/billing");
  const MARK = `p9tl_${Date.now().toString(36)}`;
  const ORG_IDS: string[] = [];
  const USER_IDS: string[] = [];
  const PLAN_IDS: string[] = [];

  async function makeTierFixture(tier: string | null, status: string | null) {
    const org = await db.organization.create({
      data: { name: `tier fixture ${MARK}`, slug: `tl-${MARK}-${Math.random().toString(36).slice(2, 8)}` },
    });
    ORG_IDS.push(org.id);
    const user = await db.user.create({
      data: { email: `p9tl-${Math.random().toString(36).slice(2)}@fixture.local`, passwordHash: `pbkdf2$1$s$${MARK}` },
    });
    USER_IDS.push(user.id);
    if (tier && status) {
      let plan = await db.plan.findUnique({ where: { tier } });
      if (!plan) {
        plan = await db.plan.create({
          data: { name: tier, tier, monthlyCredits: 1000, maxResolution: "1080p", priorityRendering: false, teamMembers: 1 },
        });
        PLAN_IDS.push(plan.id);
      }
      await db.subscription.create({
        data: {
          userId: user.id,
          planId: plan.id,
          stripeCustomerId: `cus_${MARK}_${user.id.slice(-6)}`,
          stripeSubscriptionId: `sub_${MARK}_${user.id.slice(-6)}`,
          status,
        },
      });
    }
    return { org, user };
  }

  try {
    console.log("\n◆ the tier resolution — the billing derivation, reused verbatim");
    const noSub = await makeTierFixture(null, null);
    eq(await resolveUserTier(noSub.user.id), "starter", "no subscription → starter (the resolver's default plan)");
    const canceledCreator = await makeTierFixture("creator", "canceled");
    eq(await resolveUserTier(canceledCreator.user.id), "starter", "a canceled creator subscription is gated as STARTER (access-based, never the stale plan row)");
    const pastDue = await makeTierFixture("creator", "past_due");
    eq(await resolveUserTier(pastDue.user.id), "creator", "past_due keeps the paid tier on grace");
    const trialing = await makeTierFixture("studio", "trialing");
    eq(await resolveUserTier(trialing.user.id), "studio", "trialing buys the full tier");
    const active = await makeTierFixture("creator", "active");
    eq(await resolveUserTier(active.user.id), "creator", "active buys the plan's tier");

    // ---- 3. THE DAILY QUOTA (DB) ----------------------------------------------
    console.log("\n◆ the daily render quota — guarded upsert, structural reset, retention");

    const quotaFixture = await makeTierFixture("creator", "canceled"); // canceled → gated as starter
    const quotaOrg = quotaFixture.org;
    const day = new Date().toISOString().slice(0, 10);

    const results = await Promise.all(
      Array.from({ length: 12 }, () => bumpTierRenderCounter(quotaOrg.id, day, 3))
    );
    const admitted = results.filter((r) => r.admitted).length;
    eq(admitted, 3, "12 concurrent racers against a 3-per-day quota: exactly 3 admitted");
    const standingRow = await db.$queryRaw<{ count: number }[]>`
      SELECT "count" FROM "TierRenderCounter" WHERE "organizationId" = ${quotaOrg.id} AND "day" = ${day}
    `;
    eq(Number(standingRow[0]?.count ?? 0), 3, "the standing count is exactly 3 — REFUSED attempts never consumed quota (used stays honest, an upgrade unblocks mid-day)");

    // The structural reset: a new UTC day is a NEW key — the old row is
    // untouched and the fresh day starts at 1.
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    ok(tomorrow !== day, "the fixture crossed a UTC day boundary (injected)");
    const fresh = await bumpTierRenderCounter(quotaOrg.id, tomorrow, 3, Date.now() + 24 * 60 * 60 * 1000);
    eq(fresh.admitted, true, "the NEXT UTC day admits again (the structural reset — no mutation of yesterday's row)");
    eq(fresh.used, 1, "the fresh day starts from zero");
    const yesterdayRow = await db.$queryRaw<{ count: number }[]>`
      SELECT "count" FROM "TierRenderCounter" WHERE "organizationId" = ${quotaOrg.id} AND "day" = ${day}
    `;
    eq(Number(yesterdayRow[0]?.count ?? 0), 3, "yesterday's row is untouched by today's reset");

    // The gate end-to-end: a starter org hits the wall with an honest body;
    // the refusal reported used = limit, never inflated by refused clicks.
    const refused = await gateTierRenderQuota({ organizationId: quotaOrg.id, userId: quotaFixture.user.id });
    ok(!refused.ok && "status" in refused && refused.status === 429, "an over-quota starter org is refused with 429");
    if (!refused.ok) {
      eq(refused.body.code, "tier_render_quota", "the refusal carries the machine-readable code");
      eq(refused.body.limit, 3, "the refusal carries the limit");
      eq(refused.body.used, 3, "the refusal reports the HONEST used (= limit, not inflated by refused attempts)");
      ok(typeof refused.body.resetsAt === "string" && (refused.body.resetsAt as string).endsWith("Z"), "the refusal carries the UTC reset instant");
      eq(refused.body.resetsAt, nextUtcMidnight(Date.now()), "resetsAt is the next UTC midnight");
    }

    // Tier differentiation: a creator org admits past the starter limit.
    const creatorFixture = await makeTierFixture("creator", "active");
    const creatorBumps = await Promise.all(
      Array.from({ length: 5 }, () => bumpTierRenderCounter(creatorFixture.org.id, day, 20))
    );
    eq(creatorBumps.filter((r) => r.admitted).length, 5, "a creator org's counter runs past the starter limit (20/day, the tier differentiation)");

    // The retention sweep: stale day rows go, fresh ones survive.
    await db.$executeRaw`
      INSERT INTO "TierRenderCounter" ("organizationId", "day", "count", "updatedAt")
      VALUES (${quotaOrg.id}, ${"2026-01-01"}, 9, ${new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)})
      ON CONFLICT ("organizationId", "day") DO NOTHING
    `;
    const swept = await sweepTierRenderCounters();
    ok(swept >= 1, `the sweep pruned the stale day rows (${swept})`);
    const freshSurvives = await db.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*) AS n FROM "TierRenderCounter" WHERE "organizationId" = ${quotaOrg.id} AND "day" = ${tomorrow}
    `;
    ok(Number(freshSurvives[0]?.n ?? 0) === 1, "the fresh day row survives the sweep (8-day forensics horizon)");

    // ---- 4. THE PER-MINUTE CEILING (DB) ----------------------------------------
    console.log("\n◆ the per-minute tier ceiling — the shared counter, tier-keyed");

    const { hitSharedBucket } = await import("../src/lib/ibismuh/shared-rate-limit");
    const run = Date.now().toString(36);
    const starterKey = tierMinuteKey("render", `starter-org-${run}`);
    const starterResults = await Promise.all(
      Array.from({ length: 12 }, () => hitSharedBucket(starterKey, 6))
    );
    eq(starterResults.filter((r) => r.ok).length, 6, "12 racers against the starter ceiling: exactly 6 admitted");
    const blocked = starterResults.filter((r) => !r.ok);
    ok(
      blocked.length === 6 && blocked.every((r) => r.retryAfterSec >= 1 && r.retryAfterSec <= 60),
      "every blocked hit carries an honest retryAfterSec to the window boundary"
    );
    const windowStart = Math.floor(Date.now() / 60_000);
    const nextWindow = (windowStart + 1) * 60_000 + 500;
    const freshWindow = await hitSharedBucket(starterKey, 6, nextWindow);
    ok(freshWindow.ok, "the NEXT window admits again — the reset is FULL at the epoch minute boundary (fixed window, never gradual)");
    const creatorKey = tierMinuteKey("render", `creator-org-${run}`);
    const creatorResults = await Promise.all(
      Array.from({ length: 8 }, () => hitSharedBucket(creatorKey, 30))
    );
    eq(creatorResults.filter((r) => r.ok).length, 8, "a creator-tier bucket admits past the starter ceiling (30/min — the tier differentiation)");
    const counterRows = await db.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*) AS n FROM "RateLimitCounter" WHERE "key" LIKE ${`tiermin:%${run}%`}
    `;
    ok(Number(counterRows[0]?.n ?? 0) >= 2, "the tier buckets live in the SHARED RateLimitCounter table (one law, one sweep)");

    // ---- 5. THE SEAM PINS (source) ---------------------------------------------
    console.log("\n◆ the seam pins — the gates ride the expensive routes in the documented order");

    const renderRoute = fs.readFileSync("src/app/api/videos/[id]/render/route.ts", "utf8");
    const gateAt = renderRoute.indexOf("await gateTierRequest({");
    const laneAt = renderRoute.indexOf("resolveRenderLane(bodyMode");
    ok(gateAt > 0 && laneAt > gateAt, "the render route gates BEFORE the lane contract dispatches");
    const pinAt = renderRoute.indexOf("lane.pinRenderMode");
    ok(pinAt > gateAt, "the render route gates BEFORE any write (a quota-refused click must not flip the render mode)");
    ok(renderRoute.includes("sceneScopedRender"), "the render route exempts the scene-scoped grammars from the daily quota (preview-class work)");
    ok(renderRoute.includes("tier: tierGate.tier"), "the render route resolves the tier ONCE and reuses it (one read per request)");

    const graphicsRoute = fs.readFileSync("src/app/api/videos/[id]/graphics/render/route.ts", "utf8");
    const fullAt = graphicsRoute.indexOf("---- the full render ----");
    const gGateAt = graphicsRoute.indexOf("await gateTierRequest({");
    const gQuotaAt = graphicsRoute.indexOf("await gateTierRenderQuota({");
    ok(gGateAt > 0 && gQuotaAt > fullAt && gQuotaAt > gGateAt, "the graphics route ceilings every POST and quotas ONLY the full-render branch (drafts are looks, not renders)");

    const whiteboardRoute = fs.readFileSync("src/app/api/videos/[id]/whiteboard/render/route.ts", "utf8");
    ok(whiteboardRoute.includes('scope: "whiteboard"'), "the whiteboard route ceilings its lane");
    ok(whiteboardRoute.includes("if (!sceneId)") && whiteboardRoute.indexOf("await gateTierRenderQuota({") > whiteboardRoute.indexOf("if (!sceneId)"), "the whiteboard route quotas only the FULL render (single-scene previews stay quota-free)");

    const scriptRoute = fs.readFileSync("src/app/api/videos/[id]/script/route.ts", "utf8");
    const scriptGateAt = scriptRoute.indexOf('scope: "script"');
    const handlerStart = scriptRoute.indexOf("export async function POST");
    const firstHandlerWrite = scriptRoute.indexOf("await db.video.update", handlerStart);
    ok(
      scriptGateAt > handlerStart && firstHandlerWrite > scriptGateAt,
      "the script route gates before the handler's first video write (a refused call leaves no write)"
    );

    const hookPanel = fs.readFileSync("src/app/api/videos/[id]/script/hook-panel/route.ts", "utf8");
    const panelGateAt = hookPanel.indexOf('scope: "hook-panel"');
    const modeGateAt = hookPanel.indexOf('if (mode === "panel")');
    ok(modeGateAt > 0 && panelGateAt > modeGateAt, "the hook-panel ceiling is bound to the LLM mode (the pure score mode stays ungated)");

    const webhookRoute = fs.readFileSync("src/app/api/billing/webhook/route.ts", "utf8");
    const catchAt = webhookRoute.indexOf("} catch (err) {");
    const deadAt = webhookRoute.indexOf("await recordWebhookDeadLetter({");
    ok(catchAt > 0 && deadAt > catchAt, "the webhook route persists the dead letter in the handler-failure catch");
    ok(webhookRoute.includes("payload: raw"), "the dead letter stores the RAW request body (byte-faithful replay source)");

    const billingSrc = fs.readFileSync("src/lib/ibismuh/billing.ts", "utf8");
    ok(billingSrc.includes("export async function recordWebhookDeadLetter"), "the dead-letter write lives in billing.ts (one writer, the route is a thin wrapper)");
    ok(billingSrc.includes("export async function resolveUserTier"), "the tier resolution lives in billing.ts (the module every tier answer comes from)");
  } finally {
    // cleanup — the battery's rows only
    for (const id of USER_IDS) await db.user.delete({ where: { id } }).catch(() => {});
    for (const id of ORG_IDS) await db.organization.delete({ where: { id } }).catch(() => {});
    for (const id of PLAN_IDS) await db.plan.delete({ where: { id } }).catch(() => {});
    await db.tierRenderCounter.deleteMany({ where: { organizationId: { in: [...ORG_IDS] } } }).catch(() => {});
    await db.rateLimitCounter.deleteMany({ where: { key: { contains: run } } }).catch(() => {});
    await db.$disconnect();
  }

  if (failed) {
    console.error("\ntier admission battery: FAIL");
    process.exit(1);
  }
  console.log("\ntier admission battery: PASS");
}

main().catch((err) => {
  console.error("[test-tier-limits] fatal:", err);
  process.exit(1);
});

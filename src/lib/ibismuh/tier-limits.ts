// tier-limits.ts — Phase 9: PER-TIER THROUGHPUT ADMISSION (master plan:
// "enforce per-tier resolution and capability restrictions at render
// admission, not only in data" + "add per-tier rate limits with reset").
//
// Until this module existed, the tier model lived ONLY at the billing layer
// (billing.ts: reservationEnforcement / planSupportsResolution / hasCredits)
// and both limiters were tier-blind — rate-limit.ts and shared-rate-limit.ts
// ceiling per-IP per-method, the same for a free organization as for Studio.
// Nothing stopped a free org from driving every expensive lane at a paid
// plan's request rate. This module is the missing layer: per-TIER ceilings,
// keyed per ORGANIZATION (the plan's billing unit — every member of an org
// shares its plan and therefore its budget), enforced at the expensive-lane
// admission seams:
//
//   * POST /api/videos/[id]/render            — full renders, all lanes
//   * POST /api/videos/[id]/whiteboard/render — engine renders + previews
//   * POST /api/videos/[id]/graphics/render   — engine renders + drafts
//   * POST /api/videos/[id]/script            — script generation jobs
//   * POST /api/videos/[id]/script/hook-panel — the LLM panel (panel mode)
//
// TWO LAWS, ONE MODULE:
//
// LAW 1 — THE PER-MINUTE TIER CEILING (gateTierRequest)
//   A fixed 60-second, epoch-aligned window per (lane scope, organization),
//   enforced through the SHARED limiter's counter table — hitSharedBucket
//   from shared-rate-limit.ts is the primitive (the same DB upsert that
//   serializes multi-instance racers, the same fail-open-on-DB-error posture
//   with a once-per-process announcement, the same 5-window forensics sweep).
//   The ceiling is per TIER, not per IP: the IP limiters shed floods; this
//   one meters the expensive lanes by what the org's plan pays for.
//
//   RESET LAW — the window is FIXED, not sliding: every hit lands in the
//   window floor(epoch_seconds / 60). A window ROLLS OVER into a fresh
//   (key, windowStart) row, so the budget resets IN FULL at the next epoch
//   minute boundary — never gradually. A blocked caller receives an honest
//   retryAfterSec measured to that boundary, and the next window admits
//   again from zero. Ceilings (requests/min/organization):
//     starter 6, creator 30, studio 90 — overridable per tier via env
//     (IBISMUH_STUDIO_TIER_PER_MIN_<TIER>, 0 disables a tier's ceiling).
//     The shared per-IP write ceiling (90/min) still bounds every caller
//     above this; the two limiters stack.
//
// LAW 2 — THE DAILY RENDER QUOTA (gateTierRenderQuota)
//   The full render is the platform's most expensive work. Per plan, per
//   ORGANIZATION, per UTC day:
//     starter (free) = 3 full renders/day, creator = 20/day, studio =
//     unmetered. Overridable per tier via env
//     (IBISMUH_STUDIO_TIER_RENDER_DAY_<TIER>, 0 = unmetered).
//   What COUNTS as a render — the policy's honest boundary:
//     - counted: every FULL render admission (the story-lane final render,
//       and the whiteboard / graphics engine lanes' full renders — they are
//       $0 on the provider ledger, but billing.ts's credit-gate exemption
//       is about MONEY, not throughput, and the compositor/encode work is
//       the same shape);
//     - NOT counted: scene-scoped grammars (sceneLimit / sceneIndex /
//       boundaryAfter previews), whiteboard single-scene previews and
//       graphics labelled drafts — the studios' working-doc looks, bounded
//       by Law 1 instead. The seam routes enforce this split; this module
//       only counts what it is told to.
//   Counted ONLY ON ADMISSION: the counter's guarded upsert increments
//   UNDER the limit and returns no row when the org is over quota — a
//   refused attempt never consumes quota, so a burst of over-quota clicks
//   cannot inflate `used` past `limit`, and a mid-day upgrade immediately
//   unblocks the org.
//
//   RESET LAW — the counter is keyed (organizationId, UTC day) on the
//   TierRenderCounter table; the reset is STRUCTURAL: a new UTC day is a new
//   key, so every day starts at zero without mutating anything. Refusals
//   carry `resetsAt` (the next UTC midnight) so the UI can show the honest
//   wait. Rows older than 8 days are pruned by sweepTierRenderCounters in
//   the queue tick's lazy sweep slot (the same slot the shared limiter uses).
//
//   WHY NOT the RateLimitCounter table for the daily quota: that table is a
//   60-second fixed window swept after five windows (5 minutes) — a daily
//   counter stored there would be silently wiped minutes after the last hit,
//   reopening the quota. Hence the dedicated TierRenderCounter table with
//   its own retention (documented on the model in prisma/schema.prisma).
//
// FAILURE POSTURE — deliberately split, mirroring the house laws:
//   * Law 1 (per-minute ceiling) fails OPEN on DB errors — it is a damper,
//     not a security control (shared-rate-limit.ts's posture; the middleware
//     shed keeps flooding).
//   * Law 2 (daily quota) fails CLOSED on DB errors — it is an entitlement
//     wall, and billing.ts's reservation posture is the house law: a render
//     never runs on an unverifiable budget. A failed quota check answers a
//     503 with a readable retry message.
//   * A tier-resolution failure (resolveUserTier) surfaces as the route's
//     own 500 — the honest failure of a broken DB, not a silently-free gate.

import { hitSharedBucket } from "./shared-rate-limit";
import { PLAN_DEFAULTS, resolveUserTier } from "./billing";
import { rawDatabase as rawDb } from "./raw-db/billing";
import { log } from "./log";

const tierLog = log.child({ mod: "tier-limits" });

// ---------- policy constants (the receipt's contract — pinned by
// scripts/test-tier-limits.mts) ----------

/** Full renders per organization per UTC day, by plan tier. 0 = unmetered.
 *  Unknown tiers fall back to the starter limits (fail toward the tightest
 *  documented policy — a new tier is not entitled to a looser ceiling until
 *  it is added here). */
export const TIER_RENDER_DAY_LIMITS: Record<string, number> = {
  starter: 3,
  creator: 20,
  studio: 0, // unmetered
};

/** Expensive-lane requests per minute per organization, by plan tier.
 *  0 disables the ceiling for that tier. */
export const TIER_REQUEST_PER_MIN: Record<string, number> = {
  starter: 6,
  creator: 30,
  studio: 90,
};

function envInt(name: string, dflt: number): number {
  const raw = process.env[name];
  if (!raw) return dflt;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : dflt;
}

/** The daily render quota for a tier (env-overridable; unknown → starter). */
export function tierRenderDayLimit(tier: string): number {
  const base = TIER_RENDER_DAY_LIMITS[tier] ?? TIER_RENDER_DAY_LIMITS.starter;
  return envInt(`IBISMUH_STUDIO_TIER_RENDER_DAY_${tier.toUpperCase()}`, base);
}

/** The per-minute expensive-lane ceiling for a tier (env-overridable). */
export function tierRequestPerMin(tier: string): number {
  const base = TIER_REQUEST_PER_MIN[tier] ?? TIER_REQUEST_PER_MIN.starter;
  return envInt(`IBISMUH_STUDIO_TIER_PER_MIN_${tier.toUpperCase()}`, base);
}

// ---------- shapes ----------

/** The expensive lanes that carry a per-minute tier ceiling. The key is part
 *  of the limiter key, so each lane meters its own org budget (an org's
 *  render clicks and script clicks do not compete for one bucket; the
 *  shared per-IP limiter still bounds the total). */
export type TierScope = "render" | "whiteboard" | "graphics" | "script" | "hook-panel";

export type TierGate =
  | { ok: true; tier: string }
  | { ok: false; status: number; body: Record<string, unknown> };

const SCOPE_LABELS: Record<TierScope, string> = {
  render: "render",
  whiteboard: "whiteboard render",
  graphics: "graphics render",
  script: "script generation",
  "hook-panel": "hook panel",
};

function planName(tier: string): string {
  return PLAN_DEFAULTS[tier]?.name ?? tier;
}

/** The fixed 60s window's limiter key — exported for the battery (the
 *  prefix deliberately does not collide with the shared limiter's `r:`/`w:`
 *  IP keys: a tier bucket and an IP bucket are different laws). */
export function tierMinuteKey(scope: TierScope, organizationId: string): string {
  return `tiermin:${scope}:${organizationId}`;
}

// ---------- LAW 1: the per-minute tier ceiling ----------

/**
 * The per-minute expensive-lane ceiling for one organization. Resolves the
 * caller's tier (one indexed read via resolveUserTier — the SAME derivation
 * the billing enforcement uses: access-based, canceled → starter), then
 * records one hit against the shared fixed-window counter. Fails OPEN on
 * counter DB errors (a damper, not a security control).
 *
 * When refused, the decision is a 429 whose body carries code + plan + the
 * honest retryAfterSec (measured to the window boundary) — the repo's
 * admission-failure taxonomy (the render plan gate's 402 shape, mapped onto
 * the shared limiter's 429 semantics).
 */
export async function gateTierRequest(opts: {
  organizationId: string;
  userId: string;
  scope: TierScope;
  /** Pre-resolved tier (the render seam resolves once and reuses it);
   *  resolved here when omitted. */
  tier?: string;
  now?: number;
}): Promise<TierGate> {
  const now = opts.now ?? Date.now();
  const tier = opts.tier ?? (await resolveUserTier(opts.userId));
  const limit = tierRequestPerMin(tier);
  if (limit <= 0) return { ok: true, tier };

  const hit = await hitSharedBucket(tierMinuteKey(opts.scope, opts.organizationId), limit, now);
  if (!hit.ok) {
    return {
      ok: false,
      status: 429,
      body: {
        error: `Too many ${SCOPE_LABELS[opts.scope]} requests on the ${planName(tier)} plan — the per-minute ceiling resets in ${hit.retryAfterSec}s`,
        code: "tier_rate_limited",
        scope: opts.scope,
        plan: tier,
        limit,
        retryAfterSec: hit.retryAfterSec,
      },
    };
  }
  return { ok: true, tier };
}

// ---------- LAW 2: the daily render quota ----------

/** The UTC calendar day of `now` — the quota's reset boundary. */
function utcDayOf(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** The next UTC midnight after `now` — what a refusal tells the UI to wait for. */
export function nextUtcMidnight(now: number): string {
  const d = new Date(now);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return new Date(next).toISOString();
}

/**
 * The guarded admission upsert — THE atomic quota increment. One statement:
 * insert (count 1) when the (org, day) row is fresh; on conflict, increment
 * ONLY when the standing count is still under `limit` (the WHERE is the
 * "refused attempts never consume quota" law), returning the count. An empty
 * result means refused-and-uncounted; the caller then reads the standing
 * count for the honest `used` figure. The DB serializes concurrent racers —
 * exactly the shared limiter's multi-instance law, at day scale.
 *
 * Exported for scripts/test-tier-limits.mts (the concurrency + reset pins).
 */
export async function bumpTierRenderCounter(
  organizationId: string,
  day: string,
  limit: number,
  now: number = Date.now()
): Promise<{ admitted: boolean; used: number }> {
  const rows = await rawDb.$queryRaw<{ count: number }[]>`
    INSERT INTO "TierRenderCounter" ("organizationId", "day", "count", "updatedAt")
    VALUES (${organizationId}, ${day}, 1, ${new Date(now)})
    ON CONFLICT ("organizationId", "day")
    DO UPDATE SET "count" = "TierRenderCounter"."count" + 1, "updatedAt" = ${new Date(now)}
    WHERE "TierRenderCounter"."count" < ${limit}
    RETURNING "count"
  `;
  if (rows.length > 0) return { admitted: true, used: Number(rows[0].count) };
  // Refused (over quota) — the attempt was NOT counted. Read the standing
  // count for the refusal payload (an org at its limit reports used = limit,
  // never used = limit + spam).
  const standing = await rawDb.$queryRaw<{ count: number }[]>`
    SELECT "count" FROM "TierRenderCounter"
    WHERE "organizationId" = ${organizationId} AND "day" = ${day}
  `;
  return { admitted: false, used: Number(standing[0]?.count ?? 0) };
}

/** Retention: drop day rows older than the forensics horizon. Raw SQL (the
 *  $queryRaw path is not tenant-scoped — the sweep is global housekeeping,
 *  while a scoped deleteMany inside a request ctx would silently only prune
 *  the acting org's rows). Wired into the queue tick's lazy sweep slot, the
 *  same slot the shared limiter's sweep uses. Exported for the battery. */
export async function sweepTierRenderCounters(now: number = Date.now()): Promise<number> {
  const cutoff = new Date(now - 8 * 24 * 60 * 60 * 1000);
  const gone = await rawDb.$executeRaw`
    DELETE FROM "TierRenderCounter" WHERE "updatedAt" < ${cutoff}
  `;
  return Number(gone);
}

/**
 * The daily per-tier render quota for one organization (full renders only —
 * the calling seam decides what counts; see the module header's boundary).
 * Fails CLOSED on DB errors (an entitlement wall — billing.ts's reservation
 * posture: a render never runs on an unverifiable budget), answering a 503
 * with a readable retry message.
 */
export async function gateTierRenderQuota(opts: {
  organizationId: string;
  userId: string;
  /** Pre-resolved tier; resolved here when omitted. */
  tier?: string;
  now?: number;
}): Promise<TierGate> {
  const now = opts.now ?? Date.now();
  const tier = opts.tier ?? (await resolveUserTier(opts.userId));
  const limit = tierRenderDayLimit(tier);
  if (limit <= 0) return { ok: true, tier }; // unmetered tier — studio

  const day = utcDayOf(now);
  let bump: { admitted: boolean; used: number };
  try {
    bump = await bumpTierRenderCounter(opts.organizationId, day, limit, now);
  } catch (err) {
    // Fail CLOSED, loudly: the quota could not be verified, so the render
    // does not run (billing.ts's reservation posture).
    tierLog.error("tier render quota check failed — refusing fail-closed", {
      organizationId: opts.organizationId,
      err: err instanceof Error ? err.message : err,
    });
    return {
      ok: false,
      status: 503,
      body: {
        error: "Could not verify the daily render quota — the render was not admitted. Try again shortly.",
        code: "tier_quota_unverified",
        plan: tier,
        scope: "render",
      },
    };
  }

  if (!bump.admitted) {
    return {
      ok: false,
      status: 429,
      body: {
        error: `Daily render limit reached — ${bump.used} of ${limit} full renders used on the ${planName(tier)} plan. The quota resets at midnight UTC (${nextUtcMidnight(now)}); upgrade for a higher limit.`,
        code: "tier_render_quota",
        plan: tier,
        scope: "render",
        limit,
        used: bump.used,
        resetsAt: nextUtcMidnight(now),
      },
    };
  }
  return { ok: true, tier };
}

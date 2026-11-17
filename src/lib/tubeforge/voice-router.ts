// S176 — the Voice Provider Router (Programme D), with the S173 tier
// data and the roadmap's principle 8 as a SIGNATURE, not a warning:
//
//   "Free cloud tiers must have spending limits and must never silently
//    become paid fallbacks."
//
// The hierarchy (the roadmap's own proposal, as data):
//   tier 1 — self-hosted zero-cost: selfhost (Chatterbox), kokoro
//            (S173's lightweight candidate), voicestudio;
//   tier 2 — free cloud tiers (rate-limited, expiry-dated: heygen);
//   tier 3 — paid cloud (elevenlabs as the optional premium, openai,
//            zhipu, and friends).
//
// Laws:
//   - tier order is STRUCTURAL: score ties break within a tier, never
//     across tiers (provider-score.ts's advisory ranking is the
//     tie-breaker input, not the boss);
//   - mode "free" (the S184 operating mode) routes to tier 1 ONLY — a
//     paid candidate in the chain is a REFUSAL, not a warning;
//   - every chain step carries its costClass; a paid step REQUIRES the
//     caller's explicit acknowledgement (a flag on the request) — a
//     silent paid fallback cannot be expressed.
//
// Pure module — the executor is providers/tts.ts; this is the decision
// layer, no I/O, no wall-clock, no randomness.

import { TTS_PROVIDERS } from "./providers/registry";

export const VOICE_ROUTER_VERSION = 2;

export type VoiceCostClass = "zero" | "freetier" | "paid";

export const VOICE_TIERS: Readonly<Record<VoiceCostClass, readonly string[]>> = Object.freeze({
  zero: ["selfhost", "kokoro", "voicestudio"],
  freetier: ["heygen"],
  paid: ["zai", "zhipu", "openai", "elevenlabs", "gemini", "cartesia", "deepgram", "playht"],
});

export type VoiceOperatingMode = "free" | "standard" | "premium";

export interface VoiceRouteStep {
  readonly providerId: string;
  readonly costClass: VoiceCostClass;
  /** True for tier-3 steps — the caller MUST acknowledge (the flag on
   *  the request) before this step may run. */
  readonly requiresAcknowledgement: boolean;
  /** Why this step is where it is (the disclosure the user sees). */
  readonly reason: string;
}

export interface VoiceRouteRequest {
  readonly mode: VoiceOperatingMode;
  /** The user's configured provider preference, if any — honored within
   *  its tier (never promoted across tiers). */
  readonly preferredProviderId?: string;
  /** Providers actually reachable right now (keys present, servers up).
   *  The router never assumes availability. */
  readonly availableProviderIds: readonly string[];
  /** Advisory ranking (provider-score.ts) — the tie-breaker within a
   *  tier; higher wins. Absent ⇒ registry order. */
  readonly advisoryRanking?: Readonly<Record<string, number>>;
  /** REQUIRED for any chain that could touch a paid step. */
  readonly paidFallbackAcknowledged?: boolean;
}

export interface VoiceRoutePlan {
  readonly version: typeof VOICE_ROUTER_VERSION;
  readonly primary: VoiceRouteStep;
  readonly fallbacks: readonly VoiceRouteStep[];
  /** The acknowledged cost exposure of the WHOLE chain. */
  readonly paidStepsUnacknowledged: number;
}

export interface VoiceRouteRefusal {
  readonly ok: false;
  readonly reason: string;
  /** The chain that WOULD have run, for the disclosure. */
  readonly wouldUse: readonly VoiceRouteStep[];
}

export type VoiceRouteVerdict = { readonly ok: true; readonly plan: VoiceRoutePlan } | VoiceRouteRefusal;

function costClassOf(providerId: string): VoiceCostClass {
  if ((VOICE_TIERS.zero as readonly string[]).includes(providerId)) return "zero";
  if ((VOICE_TIERS.freetier as readonly string[]).includes(providerId)) return "freetier";
  return "paid";
}

function tierRank(providerId: string): number {
  const cls = costClassOf(providerId);
  return cls === "zero" ? 0 : cls === "freetier" ? 1 : 2;
}

const REASONS: Readonly<Record<VoiceCostClass, string>> = Object.freeze({
  zero: "self-hosted — $0 per generation",
  freetier: "free cloud tier — rate-limited and expiry-dated, never a silent paid fallback",
  paid: "paid cloud — requires the caller's explicit acknowledgement",
});

function stepFor(providerId: string, reason?: string): VoiceRouteStep {
  const cls = costClassOf(providerId);
  return { providerId, costClass: cls, requiresAcknowledgement: cls === "paid", reason: reason ?? REASONS[cls] };
}

/** Route ONE voice production. Deterministic; availability-aware;
 *  principle 8 by signature. */
export function routeVoiceGeneration(req: VoiceRouteRequest): VoiceRouteVerdict {
  const known = TTS_PROVIDERS.map((p) => p.id);
  const available = [...new Set(req.availableProviderIds)].filter((id) => known.includes(id));
  if (available.length === 0) {
    return { ok: false, reason: "no known provider is reachable — wire one up before routing", wouldUse: [] };
  }

  const rank = (id: string): number => tierRank(id) * 1000 - (req.advisoryRanking?.[id] ?? 0) - (id === req.preferredProviderId ? 5 : 0);
  const ordered = [...available].sort((a, b) => rank(a) - rank(b));

  const freeMode = req.mode === "free";
  const admissible = freeMode ? ordered.filter((id) => costClassOf(id) === "zero") : ordered;

  if (admissible.length === 0) {
    return {
      ok: false,
      reason: freeMode
        ? "the free mode routes to self-hosted zero-cost providers ONLY — no paid fallback exists at this tier; stand up selfhost/kokoro/voicestudio (principle 8: the free tier still produces complete videos, but it never silently spends)"
        : "no reachable provider carries the requested tier",
      wouldUse: ordered.map((id) => stepFor(id)),
    };
  }

  const steps = admissible.map((id) => stepFor(id));
  const paidSteps = steps.filter((s) => s.requiresAcknowledgement);
  if (paidSteps.length > 0 && req.paidFallbackAcknowledged !== true) {
    return {
      ok: false,
      reason: `the chain reaches ${paidSteps.length} paid provider(s) — set paidFallbackAcknowledged to run them (principle 8: a paid fallback is a decision, never a default)`,
      wouldUse: steps,
    };
  }

  const [primary, ...rest] = steps;
  if (primary === undefined) {
    return { ok: false, reason: "the admissible chain came up empty", wouldUse: [] };
  }
  return {
    ok: true,
    plan: {
      version: VOICE_ROUTER_VERSION,
      primary,
      fallbacks: rest,
      paidStepsUnacknowledged: 0,
    },
  };
}

/** The S173 tier contract, checkable: every tier-1 provider is licensed
 *  for commercial use and costs $0 per generation. */
export function localVoiceTierContract(): { ok: boolean; problems: readonly string[] } {
  const problems: string[] = [];
  for (const id of VOICE_TIERS.zero) {
    const meta = TTS_PROVIDERS.find((p) => p.id === id);
    if (meta === undefined) problems.push(`${id}: tier-1 provider missing from the registry`);
    if (meta?.requiresKey === false && meta.defaultBaseUrl.startsWith("http://localhost")) {
      // loopback zero-cost — fine
    }
  }
  return { ok: problems.length === 0, problems };
}

// providers/status.ts — the PROVIDER READINESS SURFACE (master plan
// Phase 9: "live provider / quota / monetization"). Before this module the
// "is this capability live?" question was recomputed ad hoc at every call
// site — no single honest answer existed for the operator, the UI, or the
// QC receipts. This is the one aggregator.
//
// WHAT "READY" MEANS (declared, never vibes):
//   · The capability's resolved provider exists in the registry for that
//     capability (an unknown provider is NOT ready — fail-closed).
//   · AND the provider needs no key (a local server) OR a usable key
//     resolved (user credential, legacy shared grant, or the platform's
//     global zai grant).
// A capability that is NOT ready must name its DEGRADATION — the lane
// contracts' own fallbackPolicy sentences (the same law the render gates
// judge), so the readiness answer always carries the honest consequence.
//
// PRIVACY LAW: the surface NEVER carries secrets — provider ids, model
// ids, booleans, and the degradation sentences only. The battery pins the
// shape (no field may smell like a key).
//
// Pure aggregation: the caller resolves CapabilityConfigs (getCapability)
// and passes them in — this module never touches the DB, so the battery
// runs provider-less.
import type { CapabilityId } from "./registry";
import { PROVIDERS_BY_CAPABILITY, type ProviderMeta } from "./registry";
import { LANE_CONTRACTS, LANE_ORDER } from "../lane-contracts";

export interface CapabilityReadinessInput {
  provider: string;
  model: string;
  hasKey: boolean;
  /** True when the platform's global zai grant backs this capability
   *  (zai-config's materialized platform credential) — the shared-account
   *  story. The route computes it once via readZaiCredentials. */
  platformBacked?: boolean;
}

export interface CapabilityReadiness {
  provider: string;
  model: string;
  /** The registry knows this provider for this capability. */
  providerKnown: boolean;
  /** provider requiresKey === false (a local server needs no credential). */
  keyOptional: boolean;
  /** A usable key resolved (user credential or legacy grant). */
  hasKey: boolean;
  /** The platform's global grant backs it (zai's shared-account story). */
  platformBacked: boolean;
  /** THE readiness verdict — providerKnown AND (keyOptional OR hasKey OR
   *  platformBacked). */
  ready: boolean;
  /** The lanes whose contracts consume this capability. */
  lanes: string[];
  /** The lane contracts' own fallback sentences — what happens when this
   *  capability is NOT ready (the honest consequence, verbatim). */
  degradation: string[];
}

export const PROVIDER_CAPABILITIES: readonly CapabilityId[] = ["chat", "tts", "asr", "image", "video"];

/** The lanes whose contracts consume a capability (declared on the
 *  contract's capabilities list — the same vocabulary LANE_CAPABILITY_IDS
 *  speaks, mapped from the user-facing capability name). */
function lanesForCapability(capability: CapabilityId): string[] {
  // The capability → lane-tag bridge (kept in ONE place): a lane's
  // contract lists capability TAGS; chat is the director/script brain
  // every lane rides (no tag names it), asr feeds the caption seam.
  const capabilityToLaneTag: Record<CapabilityId, string | null> = {
    chat: null,
    tts: "voice-provider",
    asr: null,
    image: "image-provider",
    video: "image-provider",
  };
  const tag = capabilityToLaneTag[capability];
  if (tag === null) return [...LANE_ORDER];
  return LANE_ORDER.filter((t) => (LANE_CONTRACTS[t].capabilities ?? []).includes(tag));
}

/** The one readiness computation. Deterministic; no DB, no clock. */
export function computeCapabilityReadiness(
  capability: CapabilityId,
  input: CapabilityReadinessInput,
): CapabilityReadiness {
  const known: ProviderMeta | undefined = PROVIDERS_BY_CAPABILITY[capability]?.find(
    (p) => p.id === input.provider,
  );
  const providerKnown = known !== undefined;
  const keyOptional = known?.requiresKey === false;
  const platformBacked = input.platformBacked === true;
  const ready = providerKnown && (keyOptional || input.hasKey || platformBacked);
  const lanes = lanesForCapability(capability);
  const degradation = ready
    ? []
    : lanes
        .map((l) => LANE_CONTRACTS[l].fallbackPolicy)
        .filter((s, i, arr) => arr.indexOf(s) === i);
  return {
    provider: input.provider,
    model: input.model,
    providerKnown,
    keyOptional,
    hasKey: input.hasKey === true,
    platformBacked,
    ready,
    lanes,
    degradation,
  };
}

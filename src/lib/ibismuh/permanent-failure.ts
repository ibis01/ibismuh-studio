// Permanent-failure classification — the never-retry contract (2026-11-23).
//
// The queue retries transient failures with exponential backoff (30s → 10
// min, jittered). Retrying a PERMANENT failure is waste at best and harm at
// worst (re-sending dead credentials, hammering a quota wall, looping a
// policy refusal). This module is the single classification point:
//
//   · PermanentJobError   — thrown by producers that KNOW the failure is
//                           terminal (bad credentials, quota exhaustion,
//                           policy rejection, tenant-ownership refusal)
//   · isPermanentFailure() — the heuristic net for wrapped/mapped errors
//                           (ProviderHttpError 401/403, UrlGuard policy
//                           blocks, quota walls, Prisma FK violations)
//
// The queue consults this before deciding "retry" vs "failed" (dead-letter):
// a permanent failure lands in the terminal state on the FIRST attempt.

import { UploadTooLargeError } from "./upload-limits";

/** A failure that no retry can fix. Carries the operator-facing reason. */
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentJobError";
  }
}

/** Message-shape heuristics for errors that arrive wrapped or re-thrown.
 *  Ordered most-specific first; all case-insensitive. */
const PERMANENT_PATTERNS: RegExp[] = [
  // authentication / authorization at the provider
  /invalid api key/i,
  /incorrect api key/i,
  /unauthorized\b/i,
  /\b401\b/,
  /\b403\b/,
  // quota + billing walls
  /quota/i,
  /insufficient credits?/i,
  /storage quota/i,
  // policy + network-policy refusals
  /blocked by the network policy/i,
  /content policy/i,
  /policy rejection/i,
  // tenant integrity (the composite FK class from Phase 3)
  /foreign key constraint violated/i,
  /cross-tenant/i,
  /refusing the cross-tenant write/i,
  // malformed media that ffprobe/probeAudio already rejected
  /not a valid audio|does not look like an audio/i,
  /no audio stream/i,
  /too small to be real audio/i,
];

/** Upload quota walls are permanent for THIS job (the quota may free up
 *  later, but re-running the same upload against the same wall cannot
 *  succeed — the operator/user must act). */
export function isPermanentFailure(err: unknown): boolean {
  if (err instanceof PermanentJobError) return true;
  if (err instanceof UploadTooLargeError && /quota/i.test(err.message)) return true;
  if (!(err instanceof Error)) return false;
  // Provider transport: 401/403 answers never recover on retry
  const status = (err as { status?: number }).status;
  if (typeof status === "number" && (status === 401 || status === 403 || status === 402)) return true;
  const prismaCode = (err as { code?: string }).code;
  if (prismaCode === "P2003") return true; // FK violation — tenant integrity
  return PERMANENT_PATTERNS.some((re) => re.test(err.message));
}

// jobs.ts — THE UNIFIED JOB STATE MACHINE (master plan §4.7).
//
// Standardized lane state transitions over the queue infrastructure:
//
//   queued -> leased -> running -> validating -> ready
//   running -> retryable-failure -> retry
//   running -> quality-failure -> needs-repair
//   running -> failed
//   running -> cancelled
//
// Error classes are closed: each maps to exactly one recovery policy.
// THE LAW: a QC failure is `needs-repair`, NEVER a blind retry; user
// cancellation preserves completed stages; unknown states fail closed.

import { canonicalStringify, sha256Hex } from "./canonical";

export const JOB_STATES = [
  "queued",
  "leased",
  "running",
  "validating",
  "ready",
  "retryable-failure",
  "retry",
  "quality-failure",
  "needs-repair",
  "failed",
  "cancelled",
] as const;

export type JobState = (typeof JOB_STATES)[number];

export function isJobState(v: string): v is JobState {
  return (JOB_STATES as readonly string[]).includes(v);
}

/** The failure classes (master plan §4.7) — closed vocabulary. */
export const FAILURE_CLASSES = [
  "invalid-input",
  "authz",
  "provider-auth",
  "provider-stale-asset",
  "provider-rate-limit",
  "provider-timeout",
  "worker-crash",
  "user-cancelled",
  "qc-failure",
  "plan-fingerprint-mismatch",
  "storage",
] as const;

export type FailureClass = (typeof FAILURE_CLASSES)[number];

export function isFailureClass(v: string): v is FailureClass {
  return (FAILURE_CLASSES as readonly string[]).includes(v);
}

export type RecoveryPolicy =
  | "permanent"
  | "repair"
  | "delayed-retry"
  | "bounded-retry"
  | "lease-recovery"
  | "preserve-stages"
  | "needs-repair";

export interface FailureClassPolicy {
  recovery: RecoveryPolicy;
  maxRetries: number;
  /** Human-facing classification (operator runbook vocabulary). */
  label: string;
  detail: string;
}

/** The error-class → recovery law (master plan §4.7). One table, no drift. */
export const FAILURE_POLICIES: Record<FailureClass, FailureClassPolicy> = {
  "invalid-input": {
    recovery: "permanent",
    maxRetries: 0,
    label: "Invalid input",
    detail: "permanent failure — the brief or plan is structurally invalid; fix the input",
  },
  authz: {
    recovery: "permanent",
    maxRetries: 0,
    label: "Authentication / authorization",
    detail: "permanent failure — the caller may not act on this resource",
  },
  "provider-auth": {
    recovery: "permanent",
    maxRetries: 0,
    label: "Provider credentials",
    detail: "permanent until credentials change — provider returned 401/403",
  },
  "provider-stale-asset": {
    recovery: "repair",
    maxRetries: 1,
    label: "Stale asset",
    detail: "repairable — provider returned 404 or the asset hash moved; regenerate the asset",
  },
  "provider-rate-limit": {
    recovery: "delayed-retry",
    maxRetries: 3,
    label: "Rate limited",
    detail: "delayed retry with backoff — provider returned 429",
  },
  "provider-timeout": {
    recovery: "bounded-retry",
    maxRetries: 2,
    label: "Timeout",
    detail: "bounded retry — the provider did not answer in time",
  },
  "worker-crash": {
    recovery: "lease-recovery",
    maxRetries: 2,
    label: "Worker crash",
    detail: "lease recovery — the lease expired; completed stages are preserved",
  },
  "user-cancelled": {
    recovery: "preserve-stages",
    maxRetries: 0,
    label: "Cancelled",
    detail: "user cancellation — completed stages are preserved for resume",
  },
  "qc-failure": {
    recovery: "needs-repair",
    maxRetries: 0,
    label: "QC failure",
    detail: "needs-repair, never blind retry — the output failed its quality gate",
  },
  "plan-fingerprint-mismatch": {
    recovery: "repair",
    maxRetries: 1,
    label: "Plan fingerprint mismatch",
    detail: "resume refuses a fingerprint mismatch — recompile the plan",
  },
  storage: {
    recovery: "bounded-retry",
    maxRetries: 2,
    label: "Storage failure",
    detail: "bounded retry — a storage read or write failed",
  },
};

export function classifyFailure(value: unknown): FailureClass {
  if (typeof value === "string" && isFailureClass(value)) return value;
  // Unknown failures are conservative: a bounded retry, never permanent,
  // never silent.
  return "provider-timeout";
}

/** Legal transitions of the state machine. Anything else fails closed. */
const TRANSITIONS: Record<JobState, readonly JobState[]> = {
  queued: ["leased", "cancelled"],
  leased: ["running", "queued", "cancelled"],
  running: ["validating", "retryable-failure", "quality-failure", "failed", "cancelled"],
  validating: ["ready", "quality-failure", "retryable-failure", "failed", "cancelled"],
  ready: [],
  "retryable-failure": ["retry", "failed", "cancelled"],
  retry: ["queued"],
  "quality-failure": ["needs-repair"],
  "needs-repair": ["queued", "cancelled"],
  failed: ["queued"],
  cancelled: ["queued"],
};

export function canTransition(from: JobState, to: JobState): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export class IllegalTransitionError extends Error {
  constructor(from: JobState, to: JobState) {
    super(`jobs: illegal transition ${from} -> ${to}`);
    this.name = "IllegalTransitionError";
  }
}

export function assertTransition(from: JobState, to: JobState): void {
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to);
}

/** Terminal / rest states where no worker owns the job. */
export function isRestState(state: JobState): boolean {
  return state === "ready" || state === "failed" || state === "cancelled" || state === "needs-repair";
}

export function isTerminalFailure(state: JobState): boolean {
  return state === "failed" || state === "cancelled";
}

/** Deterministic idempotency key for a logical unit of work (master plan:
 *  "a retry of the SAME request resolves to the standing row"). */
export function idempotencyKey(parts: Record<string, string | number | boolean>): string {
  return sha256Hex(canonicalStringify(parts)).slice(0, 32);
}

/** Structured progress event (master plan §9 observability vocabulary). */
export interface RenderEvent {
  at: number;
  stage: string;
  sceneRef?: string;
  status: "start" | "cache-hit" | "done" | "skipped" | "failed";
  failureClass?: FailureClass;
  detail?: string;
}

// failpoints.ts — the ENV-GATED FAULT-INJECTION SEAM (master plan Phase 8:
// "Docker / PostgreSQL / fault injection"). Before this module the repo had
// NO failpoint machinery (verified: zero matches for fault/chaos/inject/
// killpoint/failpoint in src) — failure behavior was exercised only by
// whole-process drills (compose stop/start, the pg wedge replay). This
// module adds the missing in-process seam for the seams that matter.
//
// THE CONTRACT (fail-closed, like everything here):
//   · OFF BY DEFAULT — the env var absent/empty means ZERO behavior
//     change (one env read per process, then a cheap boolean check).
//   · CLOSED NAMESPACE — a failpoint name must be in FAILOPOINTS (the
//     declared injection sites). An unknown name in the spec THROWS AT
//     PARSE — a typo must never silently disable the chaos you thought
//     you armed.
//   · NAMED ACTIONS — error (throw a named FaultInjectionError), hang
//     (block the caller N ms), off (explicit no-op for overrides).
//   · DECLARED SITES — each name is wired at exactly one call site in
//     src; the battery pins the wiring textually (a removed wiring fails
//     the battery, not the incident review).
//
// SPEC FORMAT (IBISMUH_STUDIO_FAILPOINTS):
//   "queue.claim:error=Queue claim drill;storage.put:hang=250"
//   name:action[=arg][;...] — arg for error = the message suffix, for
//   hang = milliseconds (default 1000, hard cap 10_000).
//
// Pure per-process state: no fs, no clock reads beyond hang sleeps, no
// randomness. Test reset is explicit (resetFailpointsForTests).
export const FAILOPOINT_ENV = "IBISMUH_STUDIO_FAILPOINTS";

/** The declared injection sites (closed — one wiring each in src). */
export const FAILOPOINTS = ["queue.claim", "queue.lease.renew", "storage.put"] as const;
export type FailpointName = (typeof FAILOPOINTS)[number];

export const FAILOPOINT_ACTIONS = ["error", "hang", "off"] as const;
export type FailpointAction = (typeof FAILOPOINT_ACTIONS)[number];

const HANG_DEFAULT_MS = 1000;
const HANG_MAX_MS = 10_000;

export class FaultInjectionError extends Error {
  readonly failpoint: string;
  constructor(failpoint: string, arg?: string) {
    super(`fault injection at "${failpoint}"${arg ? `: ${arg}` : ""}`);
    this.name = "FaultInjectionError";
    this.failpoint = failpoint;
  }
}

interface ArmedSpec {
  action: FailpointAction;
  arg?: string;
  hangMs?: number;
}

const armed = new Map<FailpointName, ArmedSpec>();
let parsed = false;

function parseSpec(raw: string): void {
  armed.clear();
  const trimmed = raw.trim();
  if (trimmed === "") return;
  for (const part of trimmed.split(";")) {
    const spec = part.trim();
    if (spec === "") continue;
    const colon = spec.indexOf(":");
    if (colon <= 0) throw new Error(`failpoints: malformed spec part "${spec}" — expected name:action[=arg]`);
    const name = spec.slice(0, colon).trim();
    if (!(FAILOPOINTS as readonly string[]).includes(name)) {
      throw new Error(`failpoints: unknown failpoint "${name}" — the declared sites are ${FAILOPOINTS.join(", ")}`);
    }
    const body = spec.slice(colon + 1);
    const eq = body.indexOf("=");
    const action = (eq < 0 ? body : body.slice(0, eq)).trim();
    if (!(FAILOPOINT_ACTIONS as readonly string[]).includes(action)) {
      throw new Error(`failpoints: unknown action "${action}" for "${name}" — actions are ${FAILOPOINT_ACTIONS.join(", ")}`);
    }
    const arg = eq >= 0 ? body.slice(eq + 1).trim() : undefined;
    const entry: ArmedSpec = { action: action as FailpointAction, arg };
    if (action === "hang") {
      const ms = arg === undefined || arg === "" ? HANG_DEFAULT_MS : Number(arg);
      if (!Number.isFinite(ms) || ms <= 0) throw new Error(`failpoints: hang arg must be a positive ms count, got "${arg}"`);
      entry.hangMs = Math.min(Math.round(ms), HANG_MAX_MS);
    }
    armed.set(name as FailpointName, entry);
  }
}

function ensureParsed(): void {
  if (parsed) return;
  parsed = true;
  parseSpec(process.env[FAILOPOINT_ENV] ?? "");
}

/** The ONE check every wired site calls. Off → returns. hang → sleeps the
 *  armed window. error → throws the named FaultInjectionError. */
export function failpointCheck(name: FailpointName): void {
  ensureParsed();
  const spec = armed.get(name);
  if (spec === undefined || spec.action === "off") return;
  if (spec.action === "error") throw new FaultInjectionError(name, spec.arg);
  if (spec.action === "hang") {
    const end = Date.now() + (spec.hangMs ?? HANG_DEFAULT_MS);
    while (Date.now() < end) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(50, end - Date.now()));
    }
    return;
  }
}

/** True when the site is armed with error/hang (receipts + drills ask). */
export function failpointArmed(name: FailpointName): boolean {
  ensureParsed();
  const spec = armed.get(name);
  return spec !== undefined && spec.action !== "off";
}

/** Re-read the env and re-arm (tests + a fresh spec without a reboot). */
export function resetFailpointsForTests(): void {
  parsed = false;
  armed.clear();
}

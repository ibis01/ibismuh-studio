// Shared fetch plumbing for the non-Z.ai provider adapters — URL joining,
// per-capability timeouts (Stage 3, D-09), and readable errors (status + body
// snippet) so users can debug 401s / wrong endpoints straight from the feed.
//
// 2026-11-23 hardening: providerFetch now routes EVERY request through the
// net-guard safeFetch transport (SSRF protection) — protocol allowlist, DNS
// resolution validation, private/reserved address rejection, per-hop
// redirect revalidation, DNS-rebinding-pinned connections, response byte
// caps and timeouts. There is no un-guarded outbound provider call left.

import { redactText } from "../redact";
import { log } from "../log";
import {
  safeFetch,
  UrlGuardError,
} from "../net-guard";

// S57/T-57.2 — the module's logger (the old [http] prefix became a binding).
const httpLog = log.child({ mod: "http" });

/**
 * Per-capability timeout matrix (ms). Replaces the flat 5-minute universal
 * timeout the audit flagged (D-09): a YouTube metadata call should fail fast,
 * a CogVideoX generation may legitimately run 10 minutes.
 *
 * Every value is overridable via env: IBISMUH_STUDIO_TIMEOUT_<CAPABILITY> (ms),
 * e.g. IBISMUH_STUDIO_TIMEOUT_LLM=60000. Invalid env values fall back to the
 * default and warn once.
 */
export type ProviderCapability =
  | "llm" // chat completions (GLM etc.)
  | "tts" // speech synthesis
  | "image" // image generation
  | "video-gen" // image/video generation models
  | "vision" // image understanding
  | "asr" // transcription
  | "download" // binary result downloads (fal/Replicate/HF)
  | "youtube-api" // OAuth + Data API metadata calls — fail fast
  | "youtube-upload" // resumable video PUT — can legitimately take an hour
  | "generic"; // everything unclassified (300s — the old universal timeout)

const DEFAULT_TIMEOUT_MS: Record<ProviderCapability, number> = {
  llm: 120_000,
  tts: 180_000,
  image: 300_000,
  "video-gen": 600_000,
  vision: 120_000,
  asr: 180_000,
  download: 600_000,
  "youtube-api": 30_000,
  "youtube-upload": 3_600_000,
  generic: 300_000,
};

const g = globalThis as typeof globalThis & { __ibismuhTimeouts?: Record<string, number>; __ibismuhTimeoutWarned?: Set<string> };
const overrides = (g.__ibismuhTimeouts ??= {});
const warned = (g.__ibismuhTimeoutWarned ??= new Set());

export function timeoutFor(capability: ProviderCapability = "generic"): number {
  // Only valid env overrides are cached; defaults recompute so tests can
  // flip env vars without a stale cache.
  if (capability in overrides) return overrides[capability];
  const raw = process.env[`IBISMUH_STUDIO_TIMEOUT_${capability.toUpperCase().replace(/-/g, "_")}`];
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed >= 1_000) {
    overrides[capability] = parsed;
    return parsed;
  }
  if (raw && !warned.has(capability)) {
    warned.add(capability);
    httpLog.warn("ignoring invalid IBISMUH_STUDIO_TIMEOUT (need >= 1000 ms)", { capability, raw });
  }
  return DEFAULT_TIMEOUT_MS[capability];
}

/** Test hook — forget cached env overrides. */
export function resetTimeoutOverrides(): void {
  for (const k of Object.keys(overrides)) delete overrides[k];
  warned.clear();
}

/** The matrix as a read-only snapshot (surfaced by GET /api/status diagnostics). */
export function timeoutMatrix(): Record<ProviderCapability, number> {
  return { ...DEFAULT_TIMEOUT_MS };
}

/**
 * Race a promise against a deadline. The bundled Z.ai SDK issues its own
 * fetches with no timeout — one hung image/vision call would otherwise
 * stall an entire background job (storyboard loop, quality gate) forever.
 * The losing call keeps running but its result is discarded; the budget.ts
 * retry layer re-attempts the work.
 */
export function withTimeout<T>(
  ms: number,
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s — will retry`)),
      ms
    );
    fn().then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

export function joinUrl(baseUrl: string, ...path: string[]): string {
  let url = baseUrl.trim().replace(/\/+$/, "");
  for (const p of path) url += `/${p.replace(/^\/+/, "")}`;
  return url;
}

/**
 * Local-first escape hatch (mirrors net-guard.ts): when Ibismuh Studio is
 * intentionally pointed at a self-hosted AI server (Ollama, LM Studio, …)
 * set IBISMUH_STUDIO_ALLOW_PRIVATE_HOSTS=1 AND
 * IBISMUH_STUDIO_PRIVATE_PROVIDER_ALLOWLIST=ollama.internal,10.0.0.0/8 in
 * the environment. The allowlist is REQUIRED (fail-closed): without it the
 * master switch alone grants nothing, so a flipped env var can never become
 * a global SSRF bypass. Applies to PROVIDER calls only — voice imports and
 * media downloads stay locked to public hosts regardless.
 */
export function allowPrivateProviderHosts(): boolean {
  if (process.env.IBISMUH_STUDIO_ALLOW_PRIVATE_HOSTS !== "1") return false;
  // Master switch on but no destinations named → fail closed (and say so,
  // once per process, loudly — a silent no-op here reads like a bug).
  if (!privateProviderAllowlist().length) {
    warnNoAllowlistOnce();
    return false;
  }
  return true;
}

/** The operator's restricted destination policy (hostnames / IPs / CIDRs),
 *  or [] when unset. Fail-closed pairing with allowPrivateProviderHosts(). */
export function privateProviderAllowlist(): string[] {
  return (process.env.IBISMUH_STUDIO_PRIVATE_PROVIDER_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

let warnedNoAllowlist = false;
function warnNoAllowlistOnce(): void {
  if (warnedNoAllowlist) return;
  warnedNoAllowlist = true;
  httpLog.warn(
    "IBISMUH_STUDIO_ALLOW_PRIVATE_HOSTS=1 is set but IBISMUH_STUDIO_PRIVATE_PROVIDER_ALLOWLIST is empty — " +
      "private provider destinations remain BLOCKED (fail-closed). List the exact hostnames/IPs/CIDRs " +
      "your self-hosted providers live on, e.g. IBISMUH_STUDIO_PRIVATE_PROVIDER_ALLOWLIST=ollama.internal,10.0.0.5",
  );
}

/**
 * URL stripped of credentials, query string and fragment, for safe display
 * inside error messages. Query strings routinely carry secrets
 * (?api_key=…, ?token=…) and errors end up in the activity feed and logs —
 * so only protocol + host + path are shown.
 */
export function sanitizeUrlForError(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`.slice(0, 160);
  } catch {
    return "<unparsable url>";
  }
}

export class ProviderHttpError extends Error {
  constructor(
    public provider: string,
    public status: number,
    body: string
  ) {
    super(
      `${provider} request failed (HTTP ${status}): ${redactText(body).slice(0, 300)}`
    );
    this.name = "ProviderHttpError";
  }
}

export interface ProviderFetchOpts {
  /** Capability whose timeout applies (default "generic" — 300s). */
  capability?: ProviderCapability;
  /** Explicit override wins over the capability matrix. */
  timeoutMs?: number;
  /** Explicit byte-cap override (default: the capability matrix below). */
  maxBytes?: number;
}

/**
 * Per-capability response byte caps. Providers can lie about (or omit)
 * content-length, so the cap is enforced on the STREAM — an oversized or
 * attacker-controlled response is cut off mid-flight instead of buffering
 * unbounded bytes. Env override: IBISMUH_STUDIO_MAX_BYTES_<CAPABILITY>.
 */
const DEFAULT_MAX_BYTES: Record<ProviderCapability, number> = {
  llm: 10 * 1024 * 1024,
  tts: 64 * 1024 * 1024,
  image: 64 * 1024 * 1024,
  "video-gen": 256 * 1024 * 1024,
  vision: 20 * 1024 * 1024,
  asr: 20 * 1024 * 1024,
  download: 256 * 1024 * 1024,
  "youtube-api": 10 * 1024 * 1024,
  "youtube-upload": 16 * 1024 * 1024,
  generic: 256 * 1024 * 1024,
};

const gBytes = globalThis as typeof globalThis & {
  __ibismuhMaxBytes?: Record<string, number>;
  __ibismuhMaxBytesWarned?: Set<string>;
};
const byteOverrides = (gBytes.__ibismuhMaxBytes ??= {});
const byteWarned = (gBytes.__ibismuhMaxBytesWarned ??= new Set<string>());

export function maxBytesFor(capability: ProviderCapability = "generic"): number {
  if (capability in byteOverrides) return byteOverrides[capability];
  const raw =
    process.env[
      `IBISMUH_STUDIO_MAX_BYTES_${capability.toUpperCase().replace(/-/g, "_")}`
    ];
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed >= 1024) {
    byteOverrides[capability] = parsed;
    return parsed;
  }
  if (raw && !byteWarned.has(capability)) {
    byteWarned.add(capability);
    httpLog.warn("ignoring invalid IBISMUH_STUDIO_MAX_BYTES (need >= 1024 bytes)", {
      capability,
      raw,
    });
  }
  return DEFAULT_MAX_BYTES[capability];
}

/** Test hook — forget cached byte-cap overrides. */
export function resetMaxBytesOverrides(): void {
  for (const k of Object.keys(byteOverrides)) delete byteOverrides[k];
  byteWarned.clear();
}

/**
 * Save-time provider base-URL validation. A base URL is USER-CONFIGURED and
 * becomes the destination of every future provider call (credentials ride
 * those requests), so it must be a plain http(s) origin-ish URL: no embedded
 * credentials, no fragments, bounded length, host present. Returns a
 * normalized string or throws with an operator/actionable message.
 */
export function validateProviderBaseUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (value.length > 300)
    throw new UrlGuardError("Base URL is too long (300 char max)");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UrlGuardError(
      `That is not a valid base URL (got "${value.slice(0, 80)}")`,
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new UrlGuardError(
      `Blocked protocol "${url.protocol.replace(":", "")}" — provider base URLs must be http(s)`,
    );
  if (url.username || url.password)
    throw new UrlGuardError(
      "The base URL embeds credentials (user:pass@host) — send the API key in the key field instead",
    );
  if (url.hash)
    throw new UrlGuardError("The base URL must not contain a fragment (#…)");
  return url.toString().replace(/\/$/, "");
}

export async function providerFetch(
  provider: string,
  url: string,
  init: RequestInit,
  opts: ProviderFetchOpts = {}
): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? timeoutFor(opts.capability);
  const maxBytes = opts.maxBytes ?? maxBytesFor(opts.capability);

  // The restricted private-destination policy (fail-closed without an
  // explicit operator allowlist — see allowPrivateProviderHosts).
  const privateDestinations = allowPrivateProviderHosts()
    ? privateProviderAllowlist()
    : undefined;

  // Normalize headers for the guarded transport (Record / Headers / entries
  // all accepted; plain objects pass through with their original casing —
  // HTTP headers are case-insensitive on the wire).
  let headers: Record<string, string> | undefined;
  if (init.headers) {
    if (init.headers instanceof Headers) {
      headers = {};
      for (const [k, v] of init.headers) headers[k] = v;
    } else if (Array.isArray(init.headers)) {
      headers = Object.fromEntries(init.headers as string[][]);
    } else {
      headers = { ...(init.headers as Record<string, string>) };
    }
  }

  let response: Response;
  try {
    response = await safeFetch(url, {
      method: init.method,
      headers,
      body: init.body as BodyInit | undefined,
      timeoutMs,
      maxBytes,
      privateDestinations,
    });
  } catch (err) {
    if (err instanceof UrlGuardError) {
      // Destination rejected by policy — the request never left the process,
      // so no credentials were sent. Keep the reason actionable.
      throw new Error(
        `${provider} request blocked by the network policy: ${err.message} (${sanitizeUrlForError(url)})`,
      );
    }
    if (
      err instanceof Error &&
      (err.name === "TimeoutError" || err.message.includes("timed out"))
    ) {
      throw new Error(
        `${provider} request timed out after ${Math.round(timeoutMs / 1000)}s (${sanitizeUrlForError(url)})`
      );
    }
    throw new Error(
      redactText(
        `${provider} request failed: ${err instanceof Error ? err.message : String(err)} (${sanitizeUrlForError(url)})`
      )
    );
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ProviderHttpError(provider, response.status, body);
  }
  return response;
}

export async function providerFetchJson<T>(
  provider: string,
  url: string,
  init: RequestInit,
  opts: ProviderFetchOpts = {}
): Promise<T> {
  const response = await providerFetch(provider, url, init, opts);
  return (await response.json()) as T;
}

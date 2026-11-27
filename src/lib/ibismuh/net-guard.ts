// net-guard.ts — outbound-fetch hardening for Ibismuh Studio (server-side only).
//
// Every server-side fetch of a REMOTE url goes through safeFetch():
//   • http/https only
//   • DNS-resolves the host and REJECTS private / loopback / link-local /
//     reserved addresses (SSRF protection — cloud metadata, LAN services, …)
//   • follows redirects MANUALLY and re-validates every hop
//     (redirect: "follow" would happily hop from a public url to 169.254.169.254)
//   • enforces a total byte cap even when the server lies about content-length
//   • enforces a timeout via AbortSignal
//
// Local-first escape hatch: when Ibismuh Studio is intentionally pointed at a
// self-hosted AI server (Ollama, LM Studio, …) set
//   IBISMUH_STUDIO_ALLOW_PRIVATE_HOSTS=1
// in .env to permit private addresses for PROVIDER calls only. Voice imports
// and media downloads stay locked to public hosts regardless.
//
// S75 — Turbopack build fix: undici is loaded LAZILY (await import) so that
// Next.js's static page-data collection phase never evaluates undici's
// module init (which requires runtime bindings that don't exist in the
// build-time edge sandbox). The types stay as `import type` (erased at
// compile time). The Agent instance is also lazily constructed, since
// `new Agent(...)` requires the freshly-imported constructor.

import dns from "node:dns/promises";
import net, { type LookupFunction } from "node:net";
import type { Agent, RequestInit as UndiciRequestInit } from "undici";

// ------------------------------------------------------- lazy undici loader
//
// Import at module top-level breaks `next build`: Turbopack evaluates every
// route's module graph during page-data collection, and undici's init touches
// APIs that aren't bound in the build sandbox. Deferring the import to first
// use keeps the build green while keeping the runtime behaviour identical.

type UndiciModule = typeof import("undici");
let undiciPromise: Promise<UndiciModule> | null = null;
function getUndici(): Promise<UndiciModule> {
  if (!undiciPromise) undiciPromise = import("undici");
  return undiciPromise;
}

// ------------------------------------------------------------ test transport
//
// TEST SEAM — scripts/test-unit.mts (and only the test batteries) install a
// hermetic fetch here to exercise PROVIDER LOGIC without the network. While
// installed, safeFetch skips destination validation and the pinned
// dispatcher: stubbed URLs like http://127.0.0.1:9/ are deliberate test
// fixtures, not policy questions. The network policy itself is verified
// against REAL sockets by scripts/test-net-guard-provider.mts. No production
// code path may install a transport.

type TestTransport = (
  url: URL | string,
  init?: import("undici").RequestInit,
) => Promise<Response>;
const gSeam = globalThis as typeof globalThis & {
  __ibismuhTestTransport?: TestTransport | null;
};

/** Test-only: install/remove the hermetic transport override. */
export function __installTestTransport(
  fn: TestTransport | null,
): void {
  gSeam.__ibismuhTestTransport = fn;
}

function activeTestTransport(): TestTransport | null {
  return gSeam.__ibismuhTestTransport ?? null;
}

// ---------------------------------------------------------------- IP ranges

const V4_BLOCKED: [number, number][] = [
  [0x00000000, 0x00ffffff], // 0.0.0.0/8         "this network"
  [0x0a000000, 0x0affffff], // 10.0.0.0/8        private
  [0x64400000, 0x647fffff], // 100.64.0.0/10     CGNAT
  [0x7f000000, 0x7fffffff], // 127.0.0.0/8       loopback
  [0xa9fe0000, 0xa9feffff], // 169.254.0.0/16    link-local (cloud metadata!)
  [0xac100000, 0xac1fffff], // 172.16.0.0/12     private
  [0xc0000000, 0xc00000ff], // 192.0.0.0/24      IETF protocol assignments
  [0xc0000200, 0xc00002ff], // 192.0.2.0/24      TEST-NET-1
  [0xc0a80000, 0xc0a8ffff], // 192.168.0.0/16    private
  [0xc6120000, 0xc613ffff], // 198.18.0.0/15     benchmarking
  [0xc6336400, 0xc63364ff], // 198.51.100.0/24   TEST-NET-2
  [0xcb007100, 0xcb0071ff], // 203.0.113.0/24    TEST-NET-3
  [0xe0000000, 0xefffffff], // 224.0.0.0/4       multicast
  [0xf0000000, 0xffffffff], // 240.0.0.0/4       reserved + broadcast
];

function v4ToLong(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let out = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    out = out * 256 + n;
  }
  return out >>> 0;
}

function isBlockedV4(ip: string): boolean {
  const long = v4ToLong(ip);
  if (long === null) return true; // unparsable → treat as hostile
  return V4_BLOCKED.some(([lo, hi]) => long >= lo && long <= hi);
}

/** Expand an IPv6 string to its 8 hextets ("::" filled with zeros). */
function v6Hextets(ip: string): bigint[] | null {
  if (!ip.includes(":")) return null;
  const clean = ip.split("%")[0];
  const halves = clean.split("::");
  if (halves.length > 2) return null;
  const parseSide = (side: string) =>
    side === "" ? [] : side.split(":").filter(Boolean);
  let head = parseSide(halves[0] ?? "");
  let tail = parseSide(halves[1] ?? "");

  const last = tail[tail.length - 1] ?? head[head.length - 1] ?? "";
  if (last.includes(".")) {
    const long = v4ToLong(last);
    if (long === null) return null;
    const hi = Math.floor(long / 0x10000);
    const lo = long % 0x10000;
    const v4Hextets = [hi.toString(16), lo.toString(16)];
    if (tail.length && tail[tail.length - 1].includes(".")) {
      tail = [...tail.slice(0, -1), ...v4Hextets];
    } else {
      head = [...head.slice(0, -1), ...v4Hextets];
    }
  }

  const missing = 8 - (head.length + tail.length);
  if (missing < 0) return null;
  const full = [
    ...head,
    ...Array(halves.length === 2 ? missing : 0).fill("0"),
    ...tail,
  ];
  if (full.length !== 8) return null;
  const out: bigint[] = [];
  for (const h of full) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(h)) return null;
    out.push(BigInt(parseInt(h, 16)));
  }
  return out;
}

function isBlockedV6(ip: string): boolean {
  const h = v6Hextets(ip);
  if (!h) return true;
  const asBig = h.reduce((acc, v) => (acc << 16n) | v, 0n);
  const top16 = h[0];
  if (asBig === 0n) return true;
  if (asBig === 1n) return true;
  if (
    h[0] === 0n &&
    h[1] === 0n &&
    h[2] === 0n &&
    h[3] === 0n &&
    h[4] === 0n &&
    h[5] === 0xffffn
  )
    return isBlockedV4(
      `${h[6] >> 8n}.${(h[6] & 0xffn) >> 0n}.${h[7] >> 8n}.${h[7] & 0xffn}`,
    );
  if (
    h[0] === 0x64n &&
    h[1] === 0xff9bn &&
    h[2] === 0n &&
    h[3] === 0n &&
    h[4] === 0n &&
    h[5] === 0n
  )
    return isBlockedV4(
      `${h[6] >> 8n}.${h[6] & 0xffn}.${h[7] >> 8n}.${h[7] & 0xffn}`,
    );
  if ((top16 & 0xfe00n) === 0xfc00n) return true;
  if ((top16 & 0xffc0n) === 0xfe80n) return true;
  if ((top16 & 0xff00n) === 0xff00n) return true;
  if (top16 === 0x2001n && h[1] === 0xdb8n) return true;
  if (top16 === 0x100n) return true;
  return false;
}

export function isIpLiteral(host: string): boolean {
  if (net.isIP(host)) return true;
  return host.includes(":") || /^\d+\.\d+\.\d+\.\d+$/.test(host);
}

export function isPrivateHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!isIpLiteral(host)) return false;
  return host.includes(":") ? isBlockedV6(host) : isBlockedV4(host);
}

// ------------------------------------------------------------ URL validation

export class UrlGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UrlGuardError";
  }
}

function friendlyBlockReason(host: string): string {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h.startsWith("127.") || h === "::1") return "loopback (this machine)";
  if (h.startsWith("169.254.")) return "link-local (cloud metadata)";
  if (h.startsWith("10.") || h.startsWith("192.168.")) return "private network";
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return "private network";
  return "a private or reserved address range";
}

export interface GuardOptions {
  allowPrivateHosts?: boolean;
  /** Restricted private-destination policy (SSRF-safe self-hosting):
   *
   *  When set (and allowPrivateHosts is NOT set), private/reserved
   *  addresses and non-standard ports are permitted ONLY for destinations
   *  matching an entry. Each entry is one of:
   *
   *    - an exact hostname           ("ollama.internal")
   *    - an exact IP                 ("10.1.2.3", "fd00::1")
   *    - an IPv4/IPv6 CIDR block     ("10.0.0.0/8", "fd00::/8")
   *
   *  Hostname entries match the URL hostname; IP/CIDR entries match any
   *  address the host resolves to (and the pinned connection lookup, so
   *  DNS-rebinding cannot pivot an allowlisted name to a different
   *  private target). Public destinations keep the strict rules
   *  (public addresses, standard ports). */
  privateDestinations?: string[];
}

// --------------------------------------------- private-destination parsing

export type ParsedDestination =
  | { kind: "host"; host: string }
  | { kind: "ip"; ip: string; isV6: boolean }
  | { kind: "cidr"; isV6: boolean; lo: bigint; hi: bigint };

function v6ToBig(ip: string): bigint | null {
  const h = v6Hextets(ip);
  if (!h) return null;
  return h.reduce((acc, v) => (acc << 16n) | v, 0n);
}

function parseV4Cidr(addr: string, bits: number): { lo: bigint; hi: bigint } | null {
  const long = v4ToLong(addr);
  if (long === null) return null;
  const size = 2 ** (32 - bits);
  const lo = Math.floor(long / size) * size;
  return { lo: BigInt(lo), hi: BigInt(lo + size - 1) };
}

function parseV6Cidr(addr: string, bits: number): { lo: bigint; hi: bigint } | null {
  const base = v6ToBig(addr);
  if (base === null) return null;
  const size = 1n << BigInt(128 - bits);
  const lo = (base / size) * size;
  return { lo, hi: lo + size - 1n };
}

/** Parse operator allowlist entries. Invalid entries throw — a typo must
 *  surface loudly, not silently narrow the policy. */
export function parsePrivateDestinations(
  entries: readonly string[],
): ParsedDestination[] {
  const out: ParsedDestination[] = [];
  for (const raw of entries) {
    const entry = String(raw).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!entry) continue;
    // A trailing ":port" on a hostname-shaped entry (ollama.internal:11434,
    // 10.0.0.5:8443) is an ACCIDENTAL PORT, not an IPv6 literal — the
    // allowlist names DESTINATIONS and admits every port on a covered host,
    // so the port strips here and the entry parses as the bare host. The
    // shape test must run BEFORE the IPv6 branch below: that branch claims
    // every colon-bearing entry, and a hostname:port can never be a valid
    // v6 (its port strips to a hex-free charset) — without this guard the
    // port-strip law at the hostname branch was unreachable dead code and
    // a perfectly ordinary self-hosted entry threw "invalid IPv6 address".
    // Genuinely ambiguous shapes stay loud: `dead:beef` (digits-free port)
    // and `[fd00::1]:8443` (bracketed v6) still ride the IPv6 branch.
    const hostPortShape = /^([a-z0-9.-]+):(\d+)$/.exec(entry);
    if (entry.includes("/") && !entry.includes(":")) {
      // IPv4 CIDR
      const [addr, bitsRaw] = entry.split("/");
      const bits = Number(bitsRaw);
      if (!Number.isInteger(bits) || bits < 0 || bits > 32)
        throw new UrlGuardError(`Bad private-destination allowlist entry "${raw}" — invalid IPv4 CIDR mask`);
      const range = parseV4Cidr(addr, bits);
      if (!range)
        throw new UrlGuardError(`Bad private-destination allowlist entry "${raw}" — invalid IPv4 CIDR base`);
      out.push({ kind: "cidr", isV6: false, ...range });
      continue;
    }
    if (entry.includes(":") && !hostPortShape) {
      // IPv6 literal or CIDR (a colon can only appear in v6, or in the
      // hostname:port shape already peeled off above)
      const [addr, bitsRaw] = entry.split("/");
      const base = v6ToBig(addr.replace(/^\[|\]$/g, ""));
      if (base === null)
        throw new UrlGuardError(`Bad private-destination allowlist entry "${raw}" — invalid IPv6 address`);
      if (bitsRaw === undefined) {
        out.push({ kind: "ip", ip: addr.replace(/^\[|\]$/g, ""), isV6: true });
      } else {
        const bits = Number(bitsRaw);
        if (!Number.isInteger(bits) || bits < 0 || bits > 128)
          throw new UrlGuardError(`Bad private-destination allowlist entry "${raw}" — invalid IPv6 CIDR mask`);
        const range = parseV6Cidr(addr.replace(/^\[|\]$/g, ""), bits);
        if (!range)
          throw new UrlGuardError(`Bad private-destination allowlist entry "${raw}" — invalid IPv6 CIDR base`);
        out.push({ kind: "cidr", isV6: true, ...range });
      }
      continue;
    }
    if (/^\d+\.\d+\.\d+\.\d+$/.test(entry)) {
      if (v4ToLong(entry) === null)
        throw new UrlGuardError(`Bad private-destination allowlist entry "${raw}" — invalid IPv4 address`);
      out.push({ kind: "ip", ip: entry, isV6: false });
      continue;
    }
    // hostname entry — strip any accidental port (the hostPortShape peel
    // already removed it; this also catches a port that reached the branch
    // another way. The digit class must be "\d" — a doubled "\\d" matches a
    // literal backslash and could never match a port, which is how the
    // strip sat dead even where it was reachable).
    const host = (hostPortShape ? hostPortShape[1] : entry).replace(/:\d+$/, "");
    if (!/^[a-z0-9.-]+$/.test(host) || !host.includes("."))
      throw new UrlGuardError(`Bad private-destination allowlist entry "${raw}" — expected a hostname, IPv4/IPv6 literal, or CIDR`);
    out.push({ kind: "host", host });
  }
  return out;
}

function addressToBig(address: string): bigint | null {
  return address.includes(":") ? v6ToBig(address) : (v4ToLong(address) === null ? null : BigInt(v4ToLong(address) as number));
}

/** Does the destination (URL hostname + every resolved address) match an
 *  allowlist entry? */
export function matchesPrivateDestination(
  destinations: readonly ParsedDestination[],
  urlHostname: string,
  addresses: readonly string[],
): boolean {
  const host = urlHostname.replace(/^\[|\]$/g, "").toLowerCase();
  for (const d of destinations) {
    if (d.kind === "host" && d.host === host) return true;
    for (const a of addresses) {
      if (d.kind === "ip" && a.toLowerCase() === d.ip) return true;
      if (d.kind === "cidr") {
        const v = addressToBig(a);
        if (v === null) continue;
        // An IPv4 address compared against a v6 CIDR (and vice versa) can
        // never match: v4 lives below 2^32, v6 ranges (except ::/x traps
        // which are already blocked ranges) do not meaningfully overlap.
        const isAddrV6 = a.includes(":");
        if (isAddrV6 === d.isV6 && v >= d.lo && v <= d.hi) return true;
      }
    }
  }
  return false;
}

export async function assertSafeRemoteUrl(
  rawUrl: string | URL,
  opts: GuardOptions = {},
): Promise<URL> {
  let url: URL;
  try {
    url = rawUrl instanceof URL ? new URL(rawUrl.toString()) : new URL(rawUrl);
  } catch {
    throw new UrlGuardError("That is not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new UrlGuardError(
      `Blocked protocol "${url.protocol.replace(":", "")}" — only http(s) links are allowed`,
    );
  if (!url.hostname) throw new UrlGuardError("The URL has no host");
  // Credentials embedded in the URL (user:pass@host) would be sent as basic
  // auth by most clients — reject at the boundary; use headers instead.
  if (url.username || url.password)
    throw new UrlGuardError(
      "Blocked — the URL embeds credentials (user:pass@host). Send credentials via request headers instead",
    );

  const port = url.port
    ? Number(url.port)
    : url.protocol === "https:"
      ? 443
      : 80;
  const standardPort = port === 80 || port === 443;

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const allowlist = opts.privateDestinations?.length
    ? parsePrivateDestinations(opts.privateDestinations)
    : [];
  const useAllowlist = !opts.allowPrivateHosts && allowlist.length > 0;

  let addresses: string[];
  if (isIpLiteral(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await dns.lookup(host, { all: true, verbatim: true })).map(
        (a) => a.address,
      );
    } catch {
      throw new UrlGuardError(
        `Could not resolve the host "${host}" — check the link`,
      );
    }
    if (addresses.length === 0)
      throw new UrlGuardError(`Could not resolve the host "${host}"`);
  }

  const allowlisted =
    useAllowlist && matchesPrivateDestination(allowlist, host, addresses);

  if (!opts.allowPrivateHosts) {
    // Non-standard ports: only for operator-allowlisted self-hosted
    // destinations (or the explicit open mode).
    if (!standardPort && !allowlisted)
      throw new UrlGuardError(
        `Blocked non-standard port ${port} — only 80/443 are allowed (self-hosted services must be listed in the private-destination allowlist)`,
      );
    // Private / reserved destinations: only when allowlisted.
    for (const address of addresses) {
      if (isPrivateHostname(address) && !allowlisted)
        throw new UrlGuardError(
          `Blocked — ${host === address ? host : `"${host}" resolves to ${address}`} is ${friendlyBlockReason(address)}`,
        );
    }
  }
  return url;
}

// ----------------------------------------------------------------- safeFetch

export interface SafeFetchOptions extends GuardOptions {
  headers?: Record<string, string>;
  method?: string;
  body?: BodyInit;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

// ------------------------------------------------------- DNS-rebinding pinning

/** Build a connection-time lookup that re-validates every address against
 *  the private-range blocklist — and, when a restricted policy is active,
 *  the operator allowlist. This is the DNS-rebinding defense: even if the
 *  resolver flips an allowlisted or public name to a different address
 *  between validation and connection, the PINNED lookup refuses to connect
 *  to an address the policy does not cover. */
function makePinnedLookup(
  destinations: readonly ParsedDestination[],
): LookupFunction {
  return (hostname, _options, callback) => {
    const host = String(hostname)
      .replace(/^\[|\]$/g, "")
      .toLowerCase()
      .split("%")[0];
    dns
      .lookup(host, { all: true, verbatim: true })
      .then((addrs) => {
        if (addrs.length === 0) {
          callback(
            new Error(`DNS rebinding guard: no addresses for "${host}"`),
            "",
            0,
          );
          return;
        }
        const addresses = addrs.map((a) => a.address);
        for (const address of addresses) {
          if (
            isPrivateHostname(address) &&
            !matchesPrivateDestination(destinations, host, addresses)
          ) {
            callback(
              new Error(
                `DNS rebinding guard: "${host}" resolves to ${address}, a private or reserved address not covered by the destination policy — blocked`,
              ),
              "",
              0,
            );
            return;
          }
        }
        const pick = addrs.find((a) => a.family === 4) ?? addrs[0];
        callback(null, pick.address, pick.family);
      })
      .catch((err: Error) => callback(err, "", 0));
  };
}

// Lazy Agent construction — the constructor comes from the lazily-loaded
// undici module, so we can't `new Agent(...)` at module scope either. One
// dispatcher per policy shape, cached by the canonical allowlist key so a
// policy change (tests, config reload) gets a fresh pinned lookup.
const dispatcherCache = new Map<string, Promise<Agent>>();
function getValidatingDispatcher(
  destinations: readonly ParsedDestination[] = [],
): Promise<Agent> {
  const key = destinations
    .map((d) =>
      d.kind === "host" ? `h:${d.host}` : d.kind === "ip" ? `i:${d.ip}` : `c:${d.isV6 ? 6 : 4}:${d.lo}-${d.hi}`,
    )
    .sort()
    .join("|");
  let agent = dispatcherCache.get(key);
  if (!agent) {
    agent = getUndici().then(
      ({ Agent }) =>
        new Agent({
          connect: {
            autoSelectFamily: false,
            lookup: makePinnedLookup(destinations),
          } as never,
        }),
    );
    dispatcherCache.set(key, agent);
  }
  return agent;
}

export async function safeFetch(
  rawUrl: string | URL,
  opts: SafeFetchOptions = {},
): Promise<Response> {
  const {
    timeoutMs = 120_000,
    maxBytes = 100 * 1024 * 1024,
    maxRedirects = 5,
    allowPrivateHosts = false,
    privateDestinations,
    headers,
  } = opts;

  // Test seam: hermetic transport for the provider batteries.
  const testTransport = activeTestTransport();
  if (testTransport) {
    let current = new URL(String(rawUrl));
    let method = opts.method;
    let body = opts.body;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const res = await testTransport(current, {
        method,
        headers,
        body: body as import("undici").RequestInit["body"],
        redirect: "manual",
        // The no-hang law stays observable through the seam: every call is
        // abortable on the timeout budget (the production path uses the same
        // signal on the real transport).
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (REDIRECT_STATUSES.has(res.status)) {
        const location = res.headers.get("location");
        if (!location) return res;
        if (hop === maxRedirects)
          throw new UrlGuardError(`Too many redirects (>${maxRedirects})`);
        res.body?.cancel().catch(() => {});
        const next = new URL(location, current);
        if (
          res.status === 303 ||
          ((res.status === 301 || res.status === 302) && method === "POST")
        ) {
          method = "GET";
          body = undefined;
        }
        current = next;
        continue;
      }
      return res;
    }
    throw new UrlGuardError(`Too many redirects (>${maxRedirects})`);
  }

  const undici = await getUndici();

  // Policy shape: open mode (operator-configured, e.g. storage endpoints) →
  // no pinned dispatcher; restricted mode → allowlist-aware dispatcher;
  // strict mode (default) → block-all-private dispatcher.
  const allowlist = privateDestinations?.length
    ? parsePrivateDestinations(privateDestinations)
    : [];
  const dispatcher = allowPrivateHosts
    ? undefined
    : await getValidatingDispatcher(allowlist);

  let current = await assertSafeRemoteUrl(rawUrl, {
    allowPrivateHosts,
    privateDestinations,
  });
  let method = opts.method;
  let body = opts.body;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const init: UndiciRequestInit = {
      method,
      headers,
      body: body as UndiciRequestInit["body"],
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    };
    const res = await (dispatcher
      ? undici.fetch(current, { ...init, dispatcher })
      : undici.fetch(current, init));

    if (REDIRECT_STATUSES.has(res.status)) {
      const location = res.headers.get("location");
      if (!location) return res as unknown as Response;
      if (hop === maxRedirects)
        throw new UrlGuardError(`Too many redirects (>${maxRedirects})`);
      res.body?.cancel().catch(() => {});
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        throw new UrlGuardError("The server sent a malformed redirect target");
      }
      if (
        res.status === 303 ||
        ((res.status === 301 || res.status === 302) && method === "POST")
      ) {
        method = "GET";
        body = undefined;
      }
      current = await assertSafeRemoteUrl(next, {
        allowPrivateHosts,
        privateDestinations,
      });
      continue;
    }

    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > maxBytes)
      throw new UrlGuardError(
        `Response is ${(declared / 1024 / 1024).toFixed(0)} MB — the limit is ${(maxBytes / 1024 / 1024).toFixed(0)} MB`,
      );

    const finish = (stream: ReadableStream<Uint8Array> | null): Response => {
      const out = new Response(stream, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers as unknown as Headers,
      });
      try {
        Object.defineProperty(out, "url", {
          value: current.toString(),
          configurable: true,
        });
      } catch {
        /* cosmetic only */
      }
      return out;
    };

    if (!res.body) return finish(null);
    let received = 0;
    const source = res.body as unknown as ReadableStream<Uint8Array>;
    const capped = source.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          received += chunk.byteLength;
          if (received > maxBytes) {
            controller.error(
              new UrlGuardError(
                `Download exceeded the ${(maxBytes / 1024 / 1024).toFixed(0)} MB limit`,
              ),
            );
            return;
          }
          controller.enqueue(chunk);
        },
      }),
    );
    return finish(capped);
  }
  throw new UrlGuardError(`Too many redirects (>${maxRedirects})`);
}

export async function safeFetchBuffer(
  url: string | URL,
  opts: SafeFetchOptions = {},
) {
  const res = await safeFetch(url, opts);
  if (!res.ok)
    throw new UrlGuardError(
      `The site answered ${res.status} ${res.statusText}`,
    );
  return Buffer.from(await res.arrayBuffer());
}

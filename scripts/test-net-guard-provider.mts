// Net-guard + provider transport — the SSRF security battery (2026-11-23).
//
//   npm run test:net-guard
//
// Covers the hardening mandate's provider-network requirements:
//   1. URL VALIDATION — protocol allowlist, loopback/private/link-local/
//      reserved IPv4 + IPv6 rejection, IPv4-mapped + NAT64 protection,
//      non-standard ports, credentials-in-URL, DNS-resolution validation
//      (a public NAME that resolves to a private ADDRESS is blocked).
//   2. RESTRICTED PRIVATE POLICY — the operator allowlist (exact IP / CIDR /
//      hostname): private destinations pass ONLY when covered, a hostname
//      entry cannot pivot to a different private address, invalid entries
//      throw loudly.
//   3. END-TO-END TRANSPORT — a real local HTTP server proves: blocked
//      destinations are never connected to (zero requests = credentials
//      never sent), allowlisted destinations work through the pinned
//      dispatcher, redirects to non-covered private addresses are rejected
//      at the hop, byte caps cut oversized streams, declared content-length
//      over the cap is rejected pre-stream, timeouts fire.
//   4. PROVIDER POLICY — fail-closed master switch (allowlist REQUIRED),
//      save-time base-URL validation.
//   5. SOURCE PINS — providerFetch routes through safeFetch; no un-guarded
//      server-side fetch remains in the provider layer.
//
// Environment limits (documented): a full DNS-rebinding drill (a resolver
// that alternates answers between validation and connection) needs a
// controlled authoritative DNS server — the pinned-lookup path itself is
// exercised end-to-end by §3.2 (allowlisted connect) and §1.12/§2.4 (the
// resolution-side checks the lookup re-runs).

import http from "node:http";

let failed = false;
function ok(cond: unknown, msg: string): asserts cond {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    failed = true;
    console.error(`  ✗ ${msg}`);
  }
}

async function rejects(
  fn: () => Promise<unknown>,
  msg: string,
  pattern?: RegExp,
): Promise<void> {
  try {
    await fn();
    failed = true;
    console.error(`  ✗ ${msg} — the call was expected to throw, it resolved instead`);
  } catch (err) {
    if (pattern && err instanceof Error && !pattern.test(err.message)) {
      failed = true;
      console.error(`  ✗ ${msg} — threw the WRONG error: ${err.message}`);
      return;
    }
    console.log(`  ✓ ${msg}`);
  }
}

/** Spin a throwaway HTTP server on 127.0.0.1 and hand back its URL parts. */
function startServer(
  handler: http.RequestListener,
): Promise<{ server: http.Server; port: number; close: () => Promise<void>; requests: () => number }> {
  return new Promise((resolve) => {
    let count = 0;
    const server = http.createServer((req, res) => {
      count++;
      handler(req, res);
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      resolve({
        server,
        port: addr.port,
        requests: () => count,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

async function main(): Promise<void> {
  console.log("◆ net-guard + provider transport — the SSRF security battery");

  const mod = await import("../src/lib/ibismuh/net-guard");
  const { assertSafeRemoteUrl, safeFetch, parsePrivateDestinations } = mod;
  const http2 = await import("../src/lib/ibismuh/providers/http");
  const { providerFetch, validateProviderBaseUrl, allowPrivateProviderHosts, resetMaxBytesOverrides } = http2;

  // ---------- 1. URL VALIDATION -------------------------------------------
  console.log("\n— 1. URL validation: every private / reserved shape is rejected");

  await rejects(() => assertSafeRemoteUrl("http://localhost/x"), "1.1  localhost by name is blocked", /private or reserved|loopback/);
  await rejects(() => assertSafeRemoteUrl("http://127.0.0.1/x"), "1.2  IPv4 loopback is blocked", /loopback/);
  await rejects(() => assertSafeRemoteUrl("http://127.8.8.8/x"), "1.2b the whole 127.0.0.0/8 block is blocked", /loopback/);
  await rejects(() => assertSafeRemoteUrl("http://10.1.2.3/x"), "1.3a 10.0.0.0/8 is blocked", /private/);
  await rejects(() => assertSafeRemoteUrl("http://192.168.0.9/x"), "1.3b 192.168.0.0/16 is blocked", /private/);
  await rejects(() => assertSafeRemoteUrl("http://172.16.0.1/x"), "1.3c 172.16.0.0/12 is blocked", /private/);
  await rejects(() => assertSafeRemoteUrl("http://172.31.255.255/x"), "1.3d the top of 172.16/12 is blocked", /private/);
  await rejects(() => assertSafeRemoteUrl("http://169.254.169.254/latest/meta-data/"), "1.4  cloud metadata (169.254.169.254) is blocked", /link-local|metadata/);
  await rejects(() => assertSafeRemoteUrl("http://0.0.0.0/x"), "1.5a 0.0.0.0 is blocked", /private or reserved/);
  await rejects(() => assertSafeRemoteUrl("http://100.64.0.1/x"), "1.5b CGNAT 100.64.0.0/10 is blocked", /private or reserved/);
  await rejects(() => assertSafeRemoteUrl("http://224.0.0.1/x"), "1.5c multicast is blocked", /private or reserved/);
  await rejects(() => assertSafeRemoteUrl("http://[::1]/x"), "1.6a IPv6 loopback is blocked", /loopback/);
  await rejects(() => assertSafeRemoteUrl("http://[fd00::1]/x"), "1.6b IPv6 ULA is blocked", /private or reserved/);
  await rejects(() => assertSafeRemoteUrl("http://[fe80::1]/x"), "1.6c IPv6 link-local is blocked", /private or reserved/);
  await rejects(() => assertSafeRemoteUrl("http://[::ffff:127.0.0.1]/x"), "1.7a IPv4-mapped IPv6 loopback is blocked", /loopback|private/);
  await rejects(() => assertSafeRemoteUrl("http://[::ffff:169.254.169.254]/x"), "1.7b IPv4-mapped metadata is blocked", /link-local|private/);
  await rejects(() => assertSafeRemoteUrl("http://[64:ff9b::127.0.0.1]/x"), "1.8  NAT64-mapped loopback is blocked", /loopback|private/);
  await rejects(() => assertSafeRemoteUrl("http://example.com:8080/x"), "1.9  non-standard port on a public host is blocked", /non-standard port/);
  await rejects(() => assertSafeRemoteUrl("http://user:pass@example.com/x"), "1.10 credentials embedded in the URL are blocked", /credentials/);
  await rejects(() => assertSafeRemoteUrl("ftp://example.com/x"), "1.11a ftp:// is blocked", /protocol/);
  await rejects(() => assertSafeRemoteUrl("file:///etc/passwd"), "1.11b file:// is blocked", /protocol|valid URL/);
  await rejects(() => assertSafeRemoteUrl("http://localtest.me/x"), "1.12 DNS-resolved SSRF: a public NAME resolving to loopback is blocked (localtest.me → 127.0.0.1/::1)", /loopback|private/);
  {
    const u = await assertSafeRemoteUrl("https://example.com/ok");
    ok(u.toString().startsWith("https://example.com/ok"), "1.13 a genuine public https URL passes");
  }

  // ---------- 2. RESTRICTED PRIVATE POLICY --------------------------------
  console.log("\n— 2. Restricted private policy: the operator allowlist");

  {
    // Exact-IP entries
    await rejects(
      () => assertSafeRemoteUrl("http://10.0.0.6/x", { privateDestinations: ["10.0.0.5"] }),
      "2.1a an exact-IP entry does NOT cover a neighbouring private address",
      /private/,
    );
    const u = await assertSafeRemoteUrl("http://10.0.0.5:8443/x", { privateDestinations: ["10.0.0.5"] });
    ok(u.port === "8443", "2.1b the covered address is allowed, non-standard port included");
  }
  {
    // CIDR entries
    await rejects(
      () => assertSafeRemoteUrl("http://192.168.1.1/x", { privateDestinations: ["10.0.0.0/8"] }),
      "2.2a a v4 CIDR entry does not cover other ranges",
      /private/,
    );
    await assertSafeRemoteUrl("http://10.77.7.7:9000/x", { privateDestinations: ["10.0.0.0/8"] });
    ok(true, "2.2b the covered CIDR is allowed with its port");
  }
  {
    // Hostname entries cannot pivot to a different private target
    await rejects(
      () => assertSafeRemoteUrl("http://localtest.me/x", { privateDestinations: ["my-ollama.internal"] }),
      "2.4  an allowlisted HOSTNAME cannot pivot to a different private-resolving name",
      /loopback|private/,
    );
    const u = await assertSafeRemoteUrl("http://localtest.me/x", { privateDestinations: ["localtest.me"] });
    ok(Boolean(u), "2.3  the allowlisted hostname itself is allowed (resolves to loopback, is covered)");
  }
  {
    // IPv6 CIDR
    await rejects(
      () => assertSafeRemoteUrl("http://[fe80::1]/x", { privateDestinations: ["fd00::/8"] }),
      "2.6a a v6 CIDR entry does not cover link-local",
      /private/,
    );
    await assertSafeRemoteUrl("http://[fd12::1]:9000/x", { privateDestinations: ["fd00::/8"] });
    ok(true, "2.6b the covered v6 CIDR is allowed");
  }
  {
    // Public hosts keep the strict rules even in allowlist mode
    await rejects(
      () => assertSafeRemoteUrl("http://example.com:8080/x", { privateDestinations: ["10.0.0.0/8"] }),
      "2.5  a public host on a non-standard port stays blocked (the allowlist names private destinations, not open season)",
      /non-standard port/,
    );
  }
  {
    // Invalid entries throw loudly
    let threw = false;
    try {
      parsePrivateDestinations(["not a valid entry!!"]);
    } catch {
      threw = true;
    }
    ok(threw, "2.7  an invalid allowlist entry throws (a typo surfaces, never narrows the policy silently)");
    threw = false;
    try {
      parsePrivateDestinations(["10.0.0.0/99"]);
    } catch {
      threw = true;
    }
    ok(threw, "2.7b an invalid CIDR mask throws");
  }

  // ---------- 3. END-TO-END TRANSPORT ------------------------------------
  console.log("\n— 3. End-to-end transport: a real local server (allowlisted vs blocked)");

  const echo = await startServer((req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(`served:${req.url}`);
  });
  try {
    // 3.1 Blocked destination: zero connections (credentials never sent)
    let sawAuth = "";
    const authSpy = await startServer((req, res) => {
      sawAuth = String(req.headers.authorization ?? "");
      res.writeHead(200);
      res.end("leak");
    });
    await rejects(
      () =>
        providerFetch("spy-test", `http://127.0.0.1:${authSpy.port}/x`, {
          headers: { Authorization: "Bearer NEVER-SEND-ME" },
        }),
      "3.1  a private destination without an allowlist is refused",
      /network policy/,
    );
    ok(authSpy.requests() === 0, "3.1b the blocked request NEVER connected — the credential was never transmitted");
    ok(sawAuth === "", "3.1c no Authorization header reached any listener");
    await authSpy.close();

    // 3.2 Allowlisted destination works end-to-end (pinned dispatcher path)
    {
      const prevMaster = process.env.IBISMUH_STUDIO_ALLOW_PRIVATE_HOSTS;
      const prevList = process.env.IBISMUH_STUDIO_PRIVATE_PROVIDER_ALLOWLIST;
      process.env.IBISMUH_STUDIO_ALLOW_PRIVATE_HOSTS = "1";
      process.env.IBISMUH_STUDIO_PRIVATE_PROVIDER_ALLOWLIST = "127.0.0.1";
      resetMaxBytesOverrides();
      const res = await providerFetch(
        "allowlist-test",
        `http://127.0.0.1:${echo.port}/hello`,
        {},
        { timeoutMs: 5_000 },
      );
      ok((await res.text()) === "served:/hello", "3.2  an allowlisted private destination is served through the pinned dispatcher");
      // 3.3 fail-closed: master switch without an allowlist grants nothing
      process.env.IBISMUH_STUDIO_PRIVATE_PROVIDER_ALLOWLIST = "";
      resetMaxBytesOverrides();
      await rejects(
        () => providerFetch("fail-closed", `http://127.0.0.1:${echo.port}/x`, {}, { timeoutMs: 5_000 }),
        "3.3  the master switch WITHOUT an allowlist grants nothing (fail-closed)",
        /network policy|private/,
      );
      // 3.3b the neighbouring port is not covered by an exact-IP entry
      process.env.IBISMUH_STUDIO_PRIVATE_PROVIDER_ALLOWLIST = "10.0.0.5";
      await rejects(
        () => providerFetch("not-covered", `http://127.0.0.1:${echo.port}/x`, {}, { timeoutMs: 5_000 }),
        "3.3b an allowlist entry for a different host does not cover this one",
        /network policy|private/,
      );
      process.env.IBISMUH_STUDIO_ALLOW_PRIVATE_HOSTS = prevMaster;
      process.env.IBISMUH_STUDIO_PRIVATE_PROVIDER_ALLOWLIST = prevList;
      resetMaxBytesOverrides();
    }

    // 3.4 Redirect to a non-covered private address is rejected at the hop.
    // First hop: 127.0.0.1 (covered). Redirect target: 127.0.0.2 (NOT covered
    // by the exact-IP entry) — the second hop must be refused.
    {
      const redir = await startServer((req, res) => {
        res.writeHead(302, { location: `http://127.0.0.2:${echo.port}/pivot` });
        res.end();
      });
      await rejects(
        () =>
          safeFetch(`http://127.0.0.1:${redir.port}/start`, {
            privateDestinations: ["127.0.0.1"],
            timeoutMs: 5_000,
          }),
        "3.4  a redirect from a covered private host to a NON-covered private address is blocked at the hop",
        /loopback|private|Blocked/,
      );
      await redir.close();
    }

    // 3.5 Byte cap cuts an oversized stream mid-flight
    {
      const big = await startServer((req, res) => {
        res.writeHead(200, { "content-type": "application/octet-stream" });
        res.write(Buffer.alloc(64 * 1024).fill(0x41)); // 64 KB …
        res.write(Buffer.alloc(64 * 1024).fill(0x42)); // … 128 KB total
        res.end();
      });
      await rejects(
        async () => {
          // The cap trips when the body is CONSUMED (a lying/absent
          // content-length cannot be trusted) — read it to the wire.
          const res = await safeFetch(`http://127.0.0.1:${big.port}/big`, {
            privateDestinations: ["127.0.0.1"],
            maxBytes: 100 * 1024,
            timeoutMs: 5_000,
          });
          return await res.arrayBuffer();
        },
        "3.5  a stream exceeding the byte cap is cut off mid-read",
        /limit|exceeded/i,
      );
      await big.close();
    }

    // 3.6 Declared content-length over the cap is rejected pre-stream
    {
      const liar = await startServer((req, res) => {
        res.writeHead(200, { "content-length": String(10 * 1024 * 1024) });
        res.end(Buffer.alloc(1024)); // body smaller than declared — the cap must still trip on the DECLARED size
      });
      await rejects(
        () => safeFetch(`http://127.0.0.1:${liar.port}/x`, { privateDestinations: ["127.0.0.1"], maxBytes: 1024 * 1024, timeoutMs: 5_000 }),
        "3.6  a declared content-length over the cap is rejected before streaming",
        /limit|MB/i,
      );
      await liar.close();
    }

    // 3.8 Timeout behavior
    {
      const slow = await startServer((req, res) => {
        setTimeout(() => {
          res.writeHead(200);
          res.end("late");
        }, 900);
      });
      const t0 = Date.now();
      await rejects(
        () => safeFetch(`http://127.0.0.1:${slow.port}/slow`, { privateDestinations: ["127.0.0.1"], timeoutMs: 100 }),
        "3.8  a server that never answers is cut off by the timeout",
        /timed? ?out|timeout|abort/i,
      );
      ok(Date.now() - t0 < 5_000, "3.8b the timeout fired promptly (no hang)");
      await slow.close();
    }
  } finally {
    await echo.close();
  }

  // ---------- 4. PROVIDER POLICY + SAVE-TIME VALIDATION -------------------
  console.log("\n— 4. Provider policy functions + save-time base-URL validation");

  {
    const prevMaster = process.env.IBISMUH_STUDIO_ALLOW_PRIVATE_HOSTS;
    const prevList = process.env.IBISMUH_STUDIO_PRIVATE_PROVIDER_ALLOWLIST;
    try {
      delete process.env.IBISMUH_STUDIO_ALLOW_PRIVATE_HOSTS;
      ok(allowPrivateProviderHosts() === false, "4.1  master switch off → private providers disabled");
      process.env.IBISMUH_STUDIO_ALLOW_PRIVATE_HOSTS = "1";
      process.env.IBISMUH_STUDIO_PRIVATE_PROVIDER_ALLOWLIST = "";
      ok(allowPrivateProviderHosts() === false, "4.2  master switch on + EMPTY allowlist → still disabled (fail-closed)");
      process.env.IBISMUH_STUDIO_PRIVATE_PROVIDER_ALLOWLIST = "ollama.internal,10.0.0.0/8";
      ok(allowPrivateProviderHosts() === true, "4.3  master switch on + allowlist → enabled (restricted destinations only)");
    } finally {
      if (prevMaster === undefined) delete process.env.IBISMUH_STUDIO_ALLOW_PRIVATE_HOSTS;
      else process.env.IBISMUH_STUDIO_ALLOW_PRIVATE_HOSTS = prevMaster;
      if (prevList === undefined) delete process.env.IBISMUH_STUDIO_PRIVATE_PROVIDER_ALLOWLIST;
      else process.env.IBISMUH_STUDIO_PRIVATE_PROVIDER_ALLOWLIST = prevList;
    }
  }

  ok(validateProviderBaseUrl("https://api.example.com/v1") === "https://api.example.com/v1", "4.4a a valid https base URL passes (normalized)");
  ok(validateProviderBaseUrl("") === "", "4.4b an empty base URL passes as empty (unset)");
  await rejects(() => Promise.resolve().then(() => validateProviderBaseUrl("ftp://api.example.com")), "4.4c ftp:// base URLs are rejected", /protocol/);
  await rejects(() => Promise.resolve().then(() => validateProviderBaseUrl("https://key:secret@api.example.com")), "4.4d credentials embedded in the base URL are rejected", /credentials/);
  await rejects(() => Promise.resolve().then(() => validateProviderBaseUrl("https://api.example.com/#frag")), "4.4e fragments in the base URL are rejected", /fragment/);
  await rejects(() => Promise.resolve().then(() => validateProviderBaseUrl(`https://api.example.com/${"a".repeat(400)}`)), "4.4f over-long base URLs are rejected", /long/);
  await rejects(() => Promise.resolve().then(() => validateProviderBaseUrl("not a url")), "4.4g garbage base URLs are rejected", /valid/);

  // ---------- 5. SOURCE PINS ----------------------------------------------
  console.log("\n— 5. Source pins: the transport seams stay closed");

  {
    const fs = await import("node:fs");
    const providerHttp = fs.readFileSync("src/lib/ibismuh/providers/http.ts", "utf8");
    ok(
      providerHttp.includes("await safeFetch(url, {") && !/=\s*await fetch\(/.test(providerHttp),
      "5.1  providerFetch routes through safeFetch — no native fetch call remains in the provider transport",
    );
    const netGuard = fs.readFileSync("src/lib/ibismuh/net-guard.ts", "utf8");
    ok(netGuard.includes("url.username || url.password"), "5.2  the guard rejects credentials embedded in URLs");
    ok(netGuard.includes("matchesPrivateDestination"), "5.3  the restricted private-destination policy is wired into the guard");

    // No un-guarded server-side fetch in the provider layer
    const providerFiles = [
      "src/lib/ibismuh/providers/asr.ts",
      "src/lib/ibismuh/providers/chat.ts",
      "src/lib/ibismuh/providers/image.ts",
      "src/lib/ibismuh/providers/tts.ts",
      "src/lib/ibismuh/providers/video.ts",
      "src/lib/ibismuh/providers/vision.ts",
      "src/lib/ibismuh/providers/voicestudio-extra.ts",
    ];
    for (const f of providerFiles) {
      const src = fs.readFileSync(f, "utf8");
      ok(
        !/await fetch\(/.test(src) && !/return fetch\(/.test(src),
        `5.4  ${f.split("/").pop()} has no native fetch (all calls ride providerFetch/safeFetch)`,
      );
    }
  }

  if (failed) {
    console.error("\nnet-guard + provider battery: FAIL");
    process.exit(1);
  }
  console.log("\nnet-guard + provider battery: PASS");
}

main().catch((err) => {
  console.error("[test-net-guard-provider] fatal:", err);
  process.exit(1);
});

#!/usr/bin/env node
// Phase 3 (master plan after 941a6ee) — the standalone packaging smoke.
//
// WHY: the plan's verdict was that production packaging was NOT VERIFIED —
// `npm run build` assembling .next/standalone was never booted and walked.
// This script boots the REAL standalone assembly (not a dev server, not a
// re-read of the build log) on its own port, walks the plan's checklist, and
// writes a receipt. Docker and PostgreSQL topology stay CI-owned (the
// sandbox has neither daemon); this smoke is the locally-provable half.
//
// The walk (plan Phase 3, standalone smoke):
//   1. assembly exists (server.js + copied static + public);
//   2. DISPOSABLE database — the live SQLite db is backed up with
//      better-sqlite3's .backup (WAL-safe) into the assembly, and the smoke
//      only ever touches the copy. The live db's hash is taken before and
//      after: any change is residue and fails the run.
//   3. boot with explicit runtime roots (cwd = the assembly; DATABASE_URL
//      pointed at the disposable copy; a smoke-only random auth secret that
//      is never printed);
//   4. /api/health readiness; /api/auth/status public behavior; anonymous
//      API default-deny (the 401 law);
//   5. nonce CSP (raw headers — duplicate CSP headers are the footgun) and
//      security headers recorded;
//   6. static asset + route load (a real /_next/static chunk fetched);
//   7. boot-log scan: no dynamic-fs tracing warnings, no convention
//      deprecations, no unhandled rejections, no missing modules;
//   8. graceful shutdown on SIGTERM within the budget;
//   9. zero residue on the live database.
//
// Receipt: scratch/standalone-smoke.json (+ .txt). Exit 1 on any FAIL.

import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import http from "node:http";
import crypto from "node:crypto";
import path from "node:path";

const PORT = Number(process.env.IBISMUH_SMOKE_PORT ?? 3100);
const BASE = `http://127.0.0.1:${PORT}`;
const ASSEMBLY = ".next/standalone";
const SERVER = path.join(ASSEMBLY, "server.js");
const LIVE_DB = "db/custom.db";
const SMOKE_DB = path.join(ASSEMBLY, "db", "smoke.db");
const SERVER_LOG = "scratch/standalone-smoke-server.log";
const RECEIPT_JSON = "scratch/standalone-smoke.json";
const RECEIPT_TXT = "scratch/standalone-smoke.txt";

const checks = [];
function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function sha256(file) {
  const h = crypto.createHash("sha256");
  h.update(readFileSync(file));
  return h.digest("hex");
}

function getRaw(urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${BASE}${urlPath}`, { timeout: 15_000 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () =>
        resolve({
          status: res.statusCode,
          rawHeaders: res.rawHeaders,
          headers: res.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        }),
      );
    });
    req.on("timeout", () => {
      req.destroy(new Error(`timeout GET ${urlPath}`));
    });
    req.on("error", reject);
  });
}

async function waitReady(deadlineMs) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    try {
      const res = await getRaw("/api/health");
      if (res.status === 200) return res;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

function cspValuesFrom(rawHeaders) {
  const values = [];
  for (let i = 0; i < rawHeaders.length; i += 2) {
    if (rawHeaders[i].toLowerCase() === "content-security-policy") values.push(rawHeaders[i + 1]);
  }
  return values;
}

async function main() {
  mkdirSync("scratch", { recursive: true });
  const require = createRequire(import.meta.url);

  // 1. assembly
  const assemblyOk =
    existsSync(SERVER) &&
    existsSync(path.join(ASSEMBLY, ".next/static")) &&
    existsSync(path.join(ASSEMBLY, "public"));
  record(
    "assembly-exists",
    assemblyOk,
    assemblyOk ? `${SERVER} + static + public` : "run npm run build first (the build script assembles standalone)",
  );
  if (!assemblyOk) process.exit(1);

  // 2. disposable db copy (WAL-safe via better-sqlite3 .backup)
  let dbCopyOk = false;
  try {
    const liveShaBefore = sha256(LIVE_DB);
    const Database = require("better-sqlite3");
    const src = new Database(LIVE_DB, { readonly: true, fileMustExist: true });
    mkdirSync(path.dirname(SMOKE_DB), { recursive: true });
    rmSync(SMOKE_DB, { force: true });
    await src.backup(SMOKE_DB);
    src.close();
    dbCopyOk = existsSync(SMOKE_DB) && statSync(SMOKE_DB).size > 0;
    record("disposable-db-copy", dbCopyOk, `${SMOKE_DB} (${statSync(SMOKE_DB).size} bytes)`);
    globalThis.__liveShaBefore = liveShaBefore;
  } catch (error) {
    record("disposable-db-copy", false, error.message);
    process.exit(1);
  }

  // 3. boot
  const secret = crypto.randomBytes(32).toString("hex");
  const logFd = writeFileSync(SERVER_LOG, "");
  const child = spawn(process.execPath, [path.resolve(SERVER)], {
    cwd: path.resolve(ASSEMBLY),
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
      DATABASE_URL: `file:${path.resolve(SMOKE_DB)}`,
      IBISMUH_STUDIO_AUTH_SECRET: secret,
      IBISMUH_STUDIO_LOG_QUERIES: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logStream = (await import("node:fs")).createWriteStream(SERVER_LOG, { flags: "a" });
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);
  void logFd;

  const booted = await waitReady(60_000);
  record("boot-and-health-ready", Boolean(booted), booted ? `/api/health 200` : "no 200 within 60s — see " + SERVER_LOG);

  if (booted) {
    // 4a. auth/status public behavior
    try {
      const res = await getRaw("/api/auth/status");
      const snippet = res.body.slice(0, 160).replace(/\s+/g, " ");
      record("auth-status-public", res.status === 200, `${res.status} body: ${snippet}`);
    } catch (e) {
      record("auth-status-public", false, e.message);
    }

    // 4b. anonymous API default-deny (the 401 law)
    try {
      const res = await getRaw("/api/videos");
      record("anonymous-default-deny", res.status === 401, `GET /api/videos -> ${res.status}`);
    } catch (e) {
      record("anonymous-default-deny", false, e.message);
    }

    // 5. document CSP (raw headers — duplicates are the footgun) + security headers
    try {
      const doc = await getRaw("/");
      const csps = cspValuesFrom(doc.rawHeaders);
      const oneCsp = csps.length === 1;
      const csp = csps[0] ?? "";
      const hasNonce = csp.includes("'nonce-") && csp.includes("'strict-dynamic'");
      record("document-csp-single", oneCsp, `${csps.length} Content-Security-Policy header(s)`);
      record("document-csp-nonce", hasNonce, hasNonce ? "nonce + strict-dynamic present" : csp.slice(0, 120));
      const securityHeaders = {};
      for (const name of ["x-content-type-options", "x-frame-options", "referrer-policy", "x-request-id"]) {
        if (doc.headers[name]) securityHeaders[name] = doc.headers[name];
      }
      record("security-headers-present", Object.keys(securityHeaders).length > 0, JSON.stringify(securityHeaders));

      // 6a. static asset load (a real chunk from the served HTML)
      const src = [...doc.body.matchAll(/\/_next\/static\/[^"'\s>]+\.(?:js|css)/g)].map((m) => m[0])[0];
      if (src) {
        const asset = await getRaw(src);
        const looksStatic = asset.status === 200;
        record("static-asset-load", looksStatic, `${src} -> ${asset.status}`);
      } else {
        record("static-asset-load", false, "no /_next/static asset reference found in the served HTML");
      }

      // 6b. route load (a real page route; /login is the anonymous-legal
      // page — /settings is a view inside /, not a route)
      try {
        const route = await getRaw("/login");
        record("route-load", route.status === 200, `GET /login -> ${route.status}`);
      } catch (e) {
        record("route-load", false, e.message);
      }
    } catch (e) {
      record("document-csp-single", false, e.message);
    }
  }

  // 7. boot-log scan (also covers runtime scratch/artifact/font discovery:
  // a tracing failure or missing-module crash prints here)
  await new Promise((r) => setTimeout(r, 300));
  const logText = existsSync(SERVER_LOG) ? readFileSync(SERVER_LOG, "utf8") : "";
  const forbidden = [
    ["dynamic-fs tracing warning", "Dynamic filesystem access"],
    ["convention deprecation", "file convention is deprecated"],
    ["unhandled rejection", "unhandledRejection"],
    ["missing module", "Cannot find module"],
  ];
  for (const [label, needle] of forbidden) {
    record(`log-clean:${label}`, !logText.includes(needle), logText.includes(needle) ? needle : "absent");
  }

  // 8. graceful shutdown
  const exited = new Promise((resolve) => child.on("exit", (code) => resolve(code)));
  child.kill("SIGTERM");
  const exitCode = await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(() => resolve("SIGKILL-TIMEOUT"), 12_000)),
  ]);
  if (exitCode === "SIGKILL-TIMEOUT") {
    child.kill("SIGKILL");
    await exited;
  }
  record(
    "graceful-shutdown",
    exitCode !== "SIGKILL-TIMEOUT",
    `SIGTERM -> exit ${exitCode === "SIGKILL-TIMEOUT" ? "TIMEOUT (SIGKILL fallback)" : exitCode}`,
  );

  // 9. zero residue on the live db
  try {
    const liveShaAfter = sha256(LIVE_DB);
    record(
      "live-db-zero-residue",
      liveShaAfter === globalThis.__liveShaBefore,
      liveShaAfter === globalThis.__liveShaBefore ? "sha256 unchanged" : "LIVE DB CHANGED during the smoke",
    );
  } catch (e) {
    record("live-db-zero-residue", false, e.message);
  }

  const failed = checks.filter((c) => !c.ok);
  const verdict = failed.length === 0 ? "PASS" : "FAIL";
  const receipt = {
    smoke: "standalone",
    auditedAt: new Date().toISOString(),
    verdict,
    checks,
    assembly: SERVER,
    port: PORT,
    serverLog: SERVER_LOG,
  };
  writeFileSync(RECEIPT_JSON, JSON.stringify(receipt, null, 2));
  const lines = [
    `# Standalone smoke — ${receipt.auditedAt} — verdict: ${verdict}`,
    ...checks.map((c) => `  ${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.detail ? ` — ${c.detail}` : ""}`),
  ];
  writeFileSync(RECEIPT_TXT, lines.join("\n") + "\n");
  console.log(`\nSTANDALONE SMOKE ${verdict} — receipt: ${RECEIPT_JSON}`);
  process.exit(verdict === "PASS" ? 0 : 1);
}

main().catch((e) => {
  console.error("standalone smoke crashed:", e);
  process.exit(1);
});

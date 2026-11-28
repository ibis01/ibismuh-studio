import { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { expect, test, type APIRequestContext } from "@playwright/test";

// Phase 1 (master plan after 646c79c) — the usage-record and MusicTrack
// integrity probes, with FK enforcement ON everywhere. These close the two
// named E2E foreign-key defects at their cause:
//
//   1.1  UsageRecord metering: the row is fire-and-forget (budget.ts) and
//        the historical E2E noise was a P2003 when the insert landed after
//        the account teardown deleted its user. The contract here: the
//        fixture graph (org + user) lives for the whole worker lifetime,
//        every metering insert is VERIFIED to have landed (score-endpoint
//        poll) BEFORE any cleanup runs, and the server log must never
//        carry a foreign-key failure. No-provider degradation and
//        successful-provider success are SEPARATE proofs — a graceful
//        fallback is never treated as provider validation.
//
//   1.2  MusicTrack seeding: the seed path writes seedCtx.organizationId
//        (music.ts) — the focused lifecycle proves seed → list → intended
//        flow (attach to a video) → explicit delete all hold their FKs
//        inside one signed-in tenant, with the row graph retained until
//        the deterministic end-of-worker cleanup.
//
// Cleanup law: the ONLY deletion is the account's own front door
// (login → POST /api/account/delete), run in afterAll AFTER every metering
// insert this suite caused has been proven landed. The org cascade then
// removes the retained graph in one deterministic step.

const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const EMAIL = `integrity-${RUN}@ibismuh.test`;
const PASSWORD = "integrity-probe-123";
const LOG_PATH = process.env.E2E_SERVER_LOG || "test-results/e2e-server.log";

let cookie = "";
let videoId = "";

async function register(request: APIRequestContext): Promise<void> {
  const res = await request.post("/api/auth/register", {
    data: { name: "Integrity Probe", email: EMAIL, password: PASSWORD },
  });
  expect(res.status(), "registration must succeed").toBe(201);
  const d = (await res.json()) as { verification?: { url?: string } };
  if (d.verification?.url) await request.get(d.verification.url);
  const setCookie = res.headers()["set-cookie"];
  const raw = (Array.isArray(setCookie) ? setCookie[0] : setCookie) ?? "";
  const c = raw.split(";")[0];
  expect(c.startsWith("ibismuh_session="), "registration must set a session cookie").toBe(true);
  cookie = c;
}

async function createVideo(request: APIRequestContext): Promise<string> {
  const res = await request.post("/api/videos", {
    headers: { cookie },
    data: {
      topic: `Integrity probe ${RUN}`,
      niche: "Motivation",
      format: "script",
      script: "A short integrity probe script. It exists to meter FK integrity.",
      approved: true,
    },
  });
  expect(res.status(), "custom-script create must be < 300").toBeLessThan(300);
  const d = (await res.json()) as { video?: { id?: string }; videoId?: string };
  const id = d.video?.id ?? d.videoId;
  expect(id, "create must return a video id").toBeTruthy();
  return id as string;
}

interface ChatObservation {
  provider: string;
  calls: number;
  ok: number; // okRate 0..1 (null rate reads as 0 — an unproven row is not an ok row)
}

/** Read the org's OWN UsageRecord aggregates off the provider-score surface
 *  (the same rows the FK noise used to surface around). The observations
 *  ride the scored provider's `evidence` block: { calls, okRate, … }. */
async function chatObservations(request: APIRequestContext): Promise<ChatObservation[]> {
  const res = await request.get("/api/settings/ai/score", { headers: { cookie } });
  expect(res.status(), "score endpoint must be readable").toBeLessThan(300);
  const d = (await res.json()) as {
    capabilities?: Record<string, Array<Record<string, unknown>>>;
  };
  return (d.capabilities?.chat ?? []).map((p) => {
    const ev = (p.evidence ?? p) as Record<string, unknown>;
    return {
      provider: String(p.provider ?? ev.provider ?? ""),
      calls: Number(ev.calls ?? 0),
      ok: Number(ev.okRate ?? 0),
    };
  });
}

async function assertNoForeignKeyLinesInServerLog(): Promise<void> {
  let log: string | null = null;
  try {
    log = readFileSync(LOG_PATH, "utf8");
  } catch {
    // No harness-owned log (external reused server) — the teardown receipt
    // records the skip; the FK assertion rides the classifier there.
    return;
  }
  const fk = log.match(/P2003|foreign key|Foreign key constraint/gi) ?? [];
  expect(fk, "the server log must never carry a Prisma FK failure").toHaveLength(0);
}

test.beforeAll(async ({ request }) => {
  await register(request);
  videoId = await createVideo(request);
});

test.describe.serial("usage metering integrity (Phase 1.1)", () => {
  test("a no-provider call degrades honestly AND its UsageRecord row lands", async ({ request }) => {
    const res = await request.post(`/api/videos/${videoId}/script/hook-panel`, {
      headers: { cookie },
      data: { mode: "panel", candidates: 2 },
    });
    // The no-provider environment fails the LLM half — the route must
    // degrade with a controlled, honestly-labeled 4xx (never a 5xx).
    expect([200, 400], `hook-panel must degrade cleanly (got ${res.status()})`).toContain(res.status());
    if (res.status() === 400) {
      const d = (await res.json()) as { degraded?: unknown; error?: string };
      expect(d.degraded, "the degraded payload must be present and labeled").toBeTruthy();
    }
    // The metering insert is fire-and-forget — wait until the row has
    // LANDED before anything may clean up. This poll is the settle law.
    await expect
      .poll(async () => (await chatObservations(request)).reduce((n, o) => n + o.calls, 0), {
        timeout: 30_000,
        intervals: [1_000, 2_000, 5_000],
      })
      .toBeGreaterThan(0);
  });

  test("a successful provider call meters REAL tokens (stubbed transport)", async ({ request }) => {
    test.setTimeout(120_000);
    // Local OpenAI-compatible stub — the harness env allowlists 127.0.0.1
    // for exactly this purpose (trusted single-tenant load, same precedent
    // as the S68 rate ceilings). Returns a real usage shape so the row
    // carries the provider's REPORTED tokens.
    const stub = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
      let body = "";
      req.on("data", (c: Buffer) => (body += c));
      req.on("end", () => {
        if (!req.url?.includes("/chat/completions")) {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            id: "stub-completion-1",
            choices: [{ message: { content: "stub opener for integrity probe" } }],
            usage: { prompt_tokens: 123, completion_tokens: 45 },
          })
        );
      });
    });
    await new Promise<void>((r) => stub.listen(0, "127.0.0.1", r));
    const port = (stub.address() as AddressInfo).port;

    try {
      const put = await request.put("/api/settings/ai", {
        headers: { cookie },
        data: {
          capability: "chat",
          provider: "openai",
          model: "stub-model",
          baseUrl: `http://127.0.0.1:${port}`,
          apiKey: "stub-key-not-real",
        },
      });
      expect(put.status(), `the harness must be able to point chat at its stub (got ${put.status()})`).toBeLessThan(300);

      const panel = await request.post(`/api/videos/${videoId}/script/hook-panel`, {
        headers: { cookie },
        data: { mode: "panel", candidates: 2 },
      });
      expect(panel.status(), `the stubbed LLM call must SUCCEED (got ${panel.status()})`).toBeLessThan(300);

      // The row lands ok=true for the stub provider — and only the stub
      // provider proves success; the zai gateway's absence proves nothing.
      await expect
        .poll(async () => {
          const rows = await chatObservations(request);
          const stubRow = rows.find((o) => o.provider === "openai");
          return stubRow ? stubRow.calls : 0;
        }, { timeout: 30_000, intervals: [1_000, 2_000, 5_000] })
        .toBeGreaterThan(0);
      const rows = await chatObservations(request);
      const stubRow = rows.find((o) => o.provider === "openai");
      expect(stubRow?.ok ?? 0, "the stubbed call's UsageRecord must record ok (okRate > 0)").toBeGreaterThan(0);

      // Deterministic restore — the capability goes back to the platform
      // default so later specs see the stock dispatch surface.
      const restore = await request.put("/api/settings/ai", {
        headers: { cookie },
        data: { capability: "chat", provider: "zai" },
      });
      expect(restore.status(), "provider restore must succeed").toBeLessThan(300);
    } finally {
      stub.close();
    }
  });
});

test.describe.serial("original music library integrity (Phase 1.2)", () => {
  test("seed → list → intended flow → delete holds every FK", async ({ request }) => {
    test.setTimeout(120_000);
    // Seed (signed-in ctx writes seedCtx.organizationId — the exact line
    // the FK claim named). Synthesis is local sine work — no provider.
    const seed = await request.post("/api/music", { headers: { cookie }, data: { action: "seed" } });
    expect(seed.status(), `seed must succeed (got ${seed.status()})`).toBeLessThan(300);
    const sd = (await seed.json()) as { created?: number; skipped?: number };
    expect((sd.created ?? 0) + (sd.skipped ?? 0), "seed must produce the original library").toBeGreaterThan(0);

    // List: the originals are visible in the org's own library.
    const list = await request.get("/api/music", { headers: { cookie } });
    expect(list.status()).toBeLessThan(300);
    const ld = (await list.json()) as { tracks?: Array<Record<string, unknown>>; library?: Array<Record<string, unknown>> };
    const library = ld.tracks ?? ld.library ?? [];
    const original = library.find((t) => t.isOriginal === true);
    expect(original, "at least one seeded original must be listed").toBeTruthy();
    const trackId = String(original?.id);

    // The intended flow: a video project carries the track from creation.
    const vres = await request.post("/api/videos", {
      headers: { cookie },
      data: {
        topic: `Music flow probe ${RUN}`,
        niche: "Motivation",
        format: "script",
        script: "The music lifecycle probe script.",
        approved: true,
        musicTrackId: trackId,
      },
    });
    expect(vres.status(), `video-with-track create must be < 300 (got ${vres.status()})`).toBeLessThan(300);

    // Explicit clean delete through the track's own front door.
    const del = await request.delete(`/api/music/${trackId}`, { headers: { cookie } });
    expect([200, 204], `track delete must be clean (got ${del.status()})`).toContain(del.status());
  });
});

test.afterAll(async ({ request }) => {
  // Settle law first: every metering insert this suite caused has already
  // been proven landed by its poll — nothing is in flight against this
  // graph. THEN the account dies through its own front door, and the org
  // cascade removes the retained fixture graph in one step.
  await assertNoForeignKeyLinesInServerLog();
  const login = await request.post("/api/auth/login", { data: { email: EMAIL, password: PASSWORD } });
  if (!login.ok()) return; // account never landed — nothing to clean
  const c = ((login.headers()["set-cookie"] as string | undefined) ?? "").split(";")[0];
  if (!c) return;
  await request.post("/api/account/delete", {
    headers: { cookie: c, "Content-Type": "application/json" },
    data: { confirm: "DELETE" },
  });
});

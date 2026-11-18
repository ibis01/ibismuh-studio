import { expect, test, type APIRequestContext } from "@playwright/test";

// S123 (G1) P4 — the Graphics Studio end-to-end (the whiteboard e2e,
// mirrored onto the graphics contract). Drives the REAL product surface
// through its API contract, on the dev server the playwright config boots:
//
//   auth → story video in graphics mode → the doc workflow (GET / PUT /
//   verbatim validation errors) → the scaffold's honest no-scenes gate →
//   a labelled scene DRAFT (the b6 viewport law on the wire) → a REAL FULL
//   render through the in-process claim loop (chromium 1920×1080@24 +
//   ffmpeg → the STANDARD final.mp4, hasVideo) → the cross-mode refusal
//   for a classic video.
//
// The story format's AI scene-splitting needs the generation gateway, so
// the scaffold-from-story path stays covered by the unit suite (the
// planner's determinism/rule-table/wall contracts); here the doc is
// hand-authored through the same validated PUT any studio save uses.

const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const PASSWORD = "s123-graphics-123";
const accounts: string[] = [];

async function register(
  request: APIRequestContext,
  email: string
): Promise<{ cookie: string; verificationUrl?: string }> {
  accounts.push(email);
  const res = await request.post("/api/auth/register", {
    data: { name: "S123 Probe", email, password: PASSWORD },
  });
  expect(res.status(), "registration must succeed").toBe(201);
  const d = (await res.json()) as { verification?: { url?: string } };
  const setCookie = res.headers()["set-cookie"];
  expect(setCookie).toBeTruthy();
  const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(";")[0] ?? "";
  expect(cookie.startsWith("ibismuh_session=")).toBe(true);
  return { cookie, verificationUrl: d.verification?.url };
}

// A minimal validator-clean doc: two scenes, closed-grammar elements with
// legal motion/kind pairs, explicit clocks (4000 + 4000 ms), 24 fps on the
// house 16:9 surface. Exactly what the studio's PUT writes.
function handAuthoredDoc(title: string) {
  return {
    version: 1,
    title,
    width: 1920,
    height: 1080,
    fps: 24,
    scenes: [
      {
        id: "scene-1",
        narration: "A short probe beat for the render lane.",
        durationMs: 4000,
        background: "#ffffff",
        elements: [
          {
            id: "h1",
            kind: "headline",
            at: { x: 960, y: 300, scale: 1, rotateDeg: 0 },
            text: { text: "Probe headline", sizePx: 72, weight: 800, color: "#112233", align: "center" },
            enter: { kind: "rise", durationMs: 600, delayMs: 0, ease: "ease-out" },
            exit: { kind: "fade", durationMs: 400, delayMs: 3400, ease: "linear" },
          },
          {
            id: "cn",
            kind: "counter",
            at: { x: 960, y: 640, scale: 1, rotateDeg: 0 },
            counter: { from: 0, to: 42, decimals: 0 },
            enter: { kind: "count", durationMs: 1200, delayMs: 400, ease: "linear" },
          },
        ],
      },
      {
        id: "scene-2",
        narration: "The second beat closes the probe.",
        durationMs: 4000,
        background: "#f8f8f8",
        elements: [
          {
            id: "br",
            kind: "bar",
            at: { x: 960, y: 540, scale: 1, rotateDeg: 0 },
            bar: { data: [{ label: "alpha", value: 3 }, { label: "beta", value: 5 }] },
            enter: { kind: "wipe", durationMs: 800, delayMs: 200, ease: "ease-out" },
          },
        ],
      },
    ],
  };
}

test.describe("S123 — motion graphics end-to-end", () => {
  test.afterAll(async ({ request }) => {
    // The end-state law: every account this suite created is deleted through
    // the account's own front door.
    for (const email of accounts) {
      const login = await request.post("/api/auth/login", { data: { email, password: PASSWORD } });
      if (!login.ok()) continue;
      const cookie = ((login.headers()["set-cookie"] as string | undefined) ?? "").split(";")[0];
      if (!cookie) continue;
      await request.post("/api/account/delete", {
        headers: { cookie, "Content-Type": "application/json" },
        data: { confirm: "DELETE" },
      });
    }
  });

  test("auth → graphics doc workflow → labelled draft → real full render", async ({ request }) => {
    const email = `s123-${RUN}@ibismuh.test`;
    const { cookie, verificationUrl } = await register(request, email);
    if (verificationUrl) {
      const v = await request.get(verificationUrl);
      expect(v.status()).toBeLessThan(300);
    }

    // 1. Story video created DIRECTLY in graphics mode (the create-route
    //    law: the engine lanes need format story — honored at the front
    //    door, whiteboard and graphics symmetrically).
    const createRes = await request.post("/api/videos", {
      headers: { cookie },
      data: {
        topic: `S123 graphics probe ${RUN}`,
        niche: "Motivation",
        format: "story",
        renderMode: "graphics",
      },
    });
    expect(createRes.status(), "create must succeed").toBeLessThan(300);
    const videoId = ((await createRes.json()) as { video: { id: string } }).video.id;
    expect(videoId).toBeTruthy();

    // 2. The engine-lane front-door law: a classic-script video CANNOT be
    //    created in graphics mode (a contradiction — the same gate S67
    //    rides for whiteboard).
    const badCreate = await request.post("/api/videos", {
      headers: { cookie },
      data: {
        topic: `S123 classic contradiction ${RUN}`,
        niche: "Motivation",
        format: "script",
        renderMode: "graphics",
      },
    });
    expect(badCreate.status()).toBe(400);
    expect(((await badCreate.json()) as { error?: string }).error).toMatch(/scene-based story/i);

    // 3. GET — no doc yet, but the budgets surface (the client-side walls).
    const get1 = await request.get(`/api/videos/${videoId}/graphics`, { headers: { cookie } });
    expect(get1.status()).toBe(200);
    const d1 = (await get1.json()) as {
      doc: unknown;
      voMs: Record<string, number>;
      preflight: unknown;
      budgets: { scenesPerProject: number; renderFrames: number; draftScales: number[] };
    };
    expect(d1.doc).toBeNull();
    expect(d1.budgets.scenesPerProject).toBeGreaterThan(0);
    expect(d1.budgets.renderFrames).toBe(25920);
    expect(d1.budgets.draftScales).toEqual([0.5, 0.75, 1.0]);

    // 4. The scaffold's honest gate: story scenes need the AI script job
    //    (unavailable in e2e), so the planner refuses READABLY.
    const scaffoldRes = await request.post(`/api/videos/${videoId}/graphics/scaffold`, {
      headers: { cookie },
      data: {},
    });
    expect(scaffoldRes.status()).toBe(400);
    expect(((await scaffoldRes.json()) as { error?: string }).error).toMatch(/no scenes/i);

    // 5. PUT — the hand-authored doc lands (LWW; the strict write stores it).
    const put1 = await request.put(`/api/videos/${videoId}/graphics`, {
      headers: { cookie, "Content-Type": "application/json" },
      data: { doc: handAuthoredDoc("S123 probe") },
    });
    expect(put1.status()).toBeLessThan(300);
    const p1 = (await put1.json()) as { doc: { title: string; fps: number } };
    expect(p1.doc.title).toBe("S123 probe");
    expect(p1.doc.fps).toBe(24);

    // 6. GET round-trips the doc + the preflight/QC evidence rides.
    const get2 = await request.get(`/api/videos/${videoId}/graphics`, { headers: { cookie } });
    const d2 = (await get2.json()) as {
      doc: { title: string; scenes: { id: string }[] };
      preflight: { ok: boolean; frames: number; wall: number } | null;
      qc: { passed: boolean; rows: { id: string }[] } | null;
    };
    expect(d2.doc?.scenes.map((s) => s.id)).toEqual(["scene-1", "scene-2"]);
    expect(d2.preflight?.ok).toBe(true);
    expect(d2.preflight?.frames).toBe(192); // 96 + 96 delivered frames @ 24 fps
    expect(d2.preflight?.wall).toBe(25920);
    expect(d2.qc?.passed).toBe(true);
    expect(d2.qc?.rows.map((r) => r.id)).toContain("G1-PROJ-1");

    // 6b. S124 — the element-editor wire contract: a z-reordered +
    //     re-placed doc rides the validated PUT and GETs back in the new
    //     order with the new placements (the studio's Layout commits).
    const reordered = handAuthoredDoc("S124 reordered");
    const rS1 = reordered.scenes[0] as {
      elements: Array<{ id: string; at: { x: number; y: number; scale: number; rotateDeg: number } }>;
    };
    const rH1 = rS1.elements[0];
    const rCn = rS1.elements[1];
    rS1.elements = [rCn, rH1]; // h1 to the end = paints on top
    rH1.at = { x: 1200, y: 380, scale: 1.25, rotateDeg: 0 };
    rCn.at = { x: 480, y: 720, scale: 0.8, rotateDeg: 0 };
    const putS124 = await request.put(`/api/videos/${videoId}/graphics`, {
      headers: { cookie, "Content-Type": "application/json" },
      data: { doc: reordered },
    });
    expect(putS124.status()).toBeLessThan(300);
    const s124Body = (await putS124.json()) as {
      doc: { scenes: Array<{ id: string; elements: Array<{ id: string; at: { x: number; scale: number } }> }> };
    };
    const s124S1 = s124Body.doc.scenes.find((s) => s.id === "scene-1");
    expect(s124S1?.elements.map((e) => e.id)).toEqual(["cn", "h1"]);
    expect(s124S1?.elements.find((e) => e.id === "h1")?.at.x).toBe(1200);
    expect(s124S1?.elements.find((e) => e.id === "h1")?.at.scale).toBe(1.25);
    expect(s124S1?.elements.find((e) => e.id === "cn")?.at.scale).toBe(0.8);

    // 7. Junk grammar → 400 with the validator's verbatim error (no second
    //    error vocabulary). An illegal motion/kind pair is an ERROR.
    const bad = handAuthoredDoc("Bad");
    (bad.scenes[0].elements[0] as { enter: { kind: string } }).enter.kind = "grow";
    const putBad = await request.put(`/api/videos/${videoId}/graphics`, {
      headers: { cookie, "Content-Type": "application/json" },
      data: { doc: bad },
    });
    expect(putBad.status()).toBe(400);
    const badBody = (await putBad.json()) as { errors?: string[] };
    expect(badBody.errors?.join(" ")).toMatch(/grow/i);

    // 8. THE LABELLED DRAFT — a real scene draft through the job loop:
    //    chromium 960×540@24 + ffmpeg → graphics/draft-scene-1-0.5.mp4.
    //    The wire contract IS the b6 draft law: non-reviewable, no credit.
    const draftRes = await request.post(`/api/videos/${videoId}/graphics/render`, {
      headers: { cookie, "Content-Type": "application/json" },
      data: { sceneId: "scene-1", scale: 0.5 },
    });
    expect([200, 202]).toContain(draftRes.status());
    const drBody = (await draftRes.json()) as {
      accepted?: boolean;
      scope?: string;
      scale?: number;
      inheritedReviewCredit?: boolean;
    };
    expect(drBody.accepted).not.toBe(false);
    expect(drBody.scope).toBe("draft-scene");
    expect(drBody.scale).toBe(0.5);
    expect(drBody.inheritedReviewCredit).toBe(false);

    // 8b. An illegal scale refuses on the wire (the closed scale set).
    const badScale = await request.post(`/api/videos/${videoId}/graphics/render`, {
      headers: { cookie, "Content-Type": "application/json" },
      data: { sceneId: "scene-1", scale: 0.9 },
    });
    expect(badScale.status()).toBe(400);

    // 9. THE FULL RENDER — the standard final.mp4 through the engine lane
    //    (the peer-MODE law: the player, QC battery and ship gate never
    //    learn graphics exists). Silent draft (no VO) is a legal shape.
    //
    //    NOTE the shared-row race (the S68 receipt): the story-lane script
    //    job the create route auto-starts fails fast on CI and its poison
    //    never rides video.error for an engine-lane video (S69 lane
    //    attribution) — poll hasVideo only, attach the last error text.
    test.setTimeout(360_000);

    // 9. THE FULL RENDER — explicit through the lane's own route (the
    //    Studio's "Render full video" button = the {} grammar). The b6
    //    draft law means the scene draft above NEVER lands hasVideo —
    //    drafts are looks, never reviewable renders. Polling without
    //    firing this POST was a structural break: the P4 rewrite dropped
    //    the full-render trigger while keeping the poll below, so every
    //    e2e run since has burned its whole window watching an artifact
    //    nothing produces. Restored here in the exact shape of the ORDER
    //    LAW receipt (12139f3), where the suite ran green on CI.
    const fullRes = await request.post(`/api/videos/${videoId}/graphics/render`, {
      headers: { cookie, "Content-Type": "application/json" },
      data: {},
    });
    expect([200, 202]).toContain(fullRes.status());
    const fullBody = (await fullRes.json()) as { accepted?: boolean; scope?: string };
    expect(fullBody.accepted).not.toBe(false);
    expect(fullBody.scope).toBe("full");

    let hasVideo = false;
    let videoUrl: string | null = null;
    let lastError: string | null = null;
    let landedDuration: number | null = null;
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const dto = await request.get(`/api/videos/${videoId}`, { headers: { cookie } });
      if (!dto.ok()) continue;
      const body = (await dto.json()) as { video?: { hasVideo?: boolean; videoUrl?: string | null; error?: string | null; videoDuration?: number | null } };
      lastError = body.video?.error ?? lastError;
      if (body.video?.hasVideo) {
        hasVideo = true;
        videoUrl = body.video.videoUrl ?? null;
        landedDuration = body.video?.videoDuration ?? null;
        break;
      }
    }
    expect(hasVideo, `the full render must land within the poll window (last video.error: ${lastError})`).toBe(true);

    // 9a-top. S136 — the PROBE WALL's positive face: the row's
    //     videoDuration came from a real ffprobe of the landed file (the
    //     lane refuses to land an unmeasurable render), so it must be a
    //     positive number — never the old silent 0.0s "playable" badge.
    expect(landedDuration, "the landed row carries a probed duration").not.toBeNull();
    expect(landedDuration ?? 0).toBeGreaterThan(0);

    // 9b. The artifact SERVES — the standard mp4 route answers with video
    //     bytes (a DB flag without a servable file would be a lying badge).
    const mp4 = await request.get(`/api/videos/${videoId}/mp4`, { headers: { cookie } });
    expect(mp4.status()).toBe(200);
    expect(mp4.headers()["content-type"] ?? "").toContain("video/");
    void videoUrl;

    // 9c. S136 — the codebase's OWN definition of "playable" must agree:
    //     the QC battery (runQcJob, best-effort after the landing) ffprobes
    //     the final and verdicts the playable check. Poll briefly for the
    //     report — a battery that never reports is an evidence gap, not a
    //     pass (the S45 law keeps a crashed battery from failing the
    //     render; it does not license the e2e to accept its absence).
    //     The verdict travels the SAME wire every UI badge reads: the
    //     serialized video's `qc` DTO (serialize.ts) — the battery's stored
    //     JSON itself is row-internal and never leaves the server.
    let qcPlayable: string | null = null;
    for (let i = 0; i < 45 && !qcPlayable; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const dto = await request.get(`/api/videos/${videoId}`, { headers: { cookie } });
      if (!dto.ok()) continue;
      const body = (await dto.json()) as { video?: { qc?: { checks?: { id?: string; status?: string }[] } | null } };
      qcPlayable = body.video?.qc?.checks?.find((c) => c.id === "playable")?.status ?? null;
    }
    expect(qcPlayable, "the QC battery's playable check must reach a verdict").toBe("pass");

    // 10. Cross-mode refusal — a classic (kenburns) video cannot render
    //     through the graphics lane (the peer-MODE law).
    const classic = await request.post("/api/videos", {
      headers: { cookie },
      data: {
        topic: `S123 classic probe ${RUN}`,
        niche: "Motivation",
        format: "script",
        script: "A short classic probe script for the refusal check.",
        approved: true,
      },
    });
    expect(classic.status()).toBeLessThan(300);
    const classicId = ((await classic.json()) as { video: { id: string } }).video.id;
    const refused = await request.post(`/api/videos/${classicId}/graphics/render`, {
      headers: { cookie },
      data: {},
    });
    expect(refused.status()).toBe(400); // format guard fires before the mode guard
    const refusedBody = (await refused.json()) as { error?: string };
    expect(refusedBody.error).toMatch(/not a scene-based video/i);
  });
});

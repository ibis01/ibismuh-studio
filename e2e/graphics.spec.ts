import { expect, test, type APIRequestContext } from "@playwright/test";

// S123 — the Graphics Studio end-to-end (the whiteboard suite's mirror, on
// the graphics grammar). Drives the REAL product surface through its API
// contract, on the dev server the playwright config boots:
//
//   auth → story video in graphics mode → the doc workflow (GET / PUT /
//   rev conflict / verbatim validation errors) → the scaffold's honest
//   no-scenes gate → a REAL scene-draft render through the in-process
//   claim loop (chromium 0.5× draft raster + ffmpeg →
//   graphics/preview-<id>.mp4, hasPreview — a labelled non-reviewable
//   look) → the shared POST /render lane branch (the S119 contract, the
//   graphics edition) → the cross-mode refusal for a classic video.
//
// The story format's AI scene-splitting needs the generation gateway, so
// the scaffold-from-story path stays covered by the unit suite (the
// planner's determinism/rule-table/wall contracts); here the doc is
// hand-authored through the same validated PUT any studio save uses —
// the exact contract the Graphics Studio writes.

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
  expect(cookie.startsWith("tf_session=")).toBe(true);
  return { cookie, verificationUrl: d.verification?.url };
}

// A minimal validator-clean graphics doc: two scenes, mixed element kinds
// exercising the closed grammar (kinetic headline + a counter + a bar —
// the compatibility table's legal motions), explicit clocks (no VO in e2e,
// so the estimate path stays out of the render probe's way).
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
        narration: "A short preview beat for the render probe.",
        durationMs: 4000,
        background: "#ffffff",
        elements: [
          {
            id: "h1",
            kind: "headline",
            at: { x: 960, y: 200, scale: 1, rotateDeg: 0 },
            text: { text: "Big title", sizePx: 64, weight: 800, color: "#112233", align: "center" },
            enter: { kind: "rise", durationMs: 600, delayMs: 0, ease: "ease-back" },
          },
          {
            id: "cn",
            kind: "counter",
            at: { x: 960, y: 540, scale: 1, rotateDeg: 0 },
            counter: { from: 0, to: 100, unit: "%", decimals: 0 },
            enter: { kind: "count", durationMs: 1200, delayMs: 600, ease: "linear" },
          },
          {
            id: "br",
            kind: "bar",
            at: { x: 480, y: 800, scale: 1, rotateDeg: 0 },
            bar: { data: [{ label: "a", value: 1 }, { label: "b", value: 2 }] },
            enter: { kind: "wipe", durationMs: 800, delayMs: 300, ease: "ease-out" },
          },
        ],
      },
      {
        id: "scene-2",
        narration: "The second beat closes the probe.",
        durationMs: 3000,
        background: "#f8f8f8",
        elements: [
          {
            id: "sh",
            kind: "subhead",
            at: { x: 960, y: 300, scale: 1, rotateDeg: 0 },
            text: { text: "Sub title" },
            enter: { kind: "slide", durationMs: 500, delayMs: 200, ease: "ease-in-out" },
          },
        ],
      },
    ],
  };
}

test.describe("S123 — graphics studio end-to-end", () => {
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

  test("auth → graphics doc workflow → real scene-draft render → the lane branch", async ({ request }) => {
    const email = `s123-${RUN}@tubeforge.test`;
    const { cookie, verificationUrl } = await register(request, email);
    if (verificationUrl) {
      const v = await request.get(verificationUrl);
      expect(v.status()).toBeLessThan(300);
    }

    // 1. Story video created DIRECTLY in graphics mode (the create-route
    //    law: engine lanes need format story — honored at the front door).
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

    // 2. THE SHARED PATH'S ORDER LAW (the CI receipt): POST /render's
    //    scenes gate ("Video has no scenes") fires BEFORE the lane dispatch —
    //    for BOTH engine lanes. A scenes-empty graphics video gets the shared
    //    gate's 400, not the lane's 409; the lane branch itself is covered by
    //    the source pin (unit) and exercised by the studio's own route below
    //    (which has no scenes gate — the engine doc IS the scene list).
    const laneNoDoc = await request.post(`/api/videos/${videoId}/render`, {
      headers: { cookie, "Content-Type": "application/json" },
      data: { mode: "graphics" },
    });
    expect(laneNoDoc.status()).toBe(400);
    expect(((await laneNoDoc.json()) as { error?: string }).error).toMatch(/no scenes/i);

    // 3. GET — no doc yet, but the grammar surfaces + budgets + voMs.
    const get1 = await request.get(`/api/videos/${videoId}/graphics`, { headers: { cookie } });
    expect(get1.status()).toBe(200);
    const d1 = (await get1.json()) as {
      doc: unknown;
      rev: number;
      voMs: Record<string, number>;
      grammar: { elementKinds: string[]; motionKinds: string[]; motionKindsByElement: Record<string, string[]> };
      budgets: Record<string, number>;
    };
    expect(d1.doc).toBeNull();
    expect(d1.rev).toBe(0);
    expect(d1.grammar.elementKinds).toContain("headline");
    expect(d1.grammar.motionKinds).toContain("count");
    expect(d1.grammar.motionKindsByElement["headline"]).not.toContain("count");
    expect(d1.budgets.scenesPerProject).toBeGreaterThan(0);
    expect(d1.voMs).toEqual({});

    // 4. The scaffold's honest gate: story scenes need the AI script job
    //    (unavailable in e2e), so the native planner refuses READABLY.
    const scaffoldRes = await request.post(`/api/videos/${videoId}/graphics/scaffold`, {
      headers: { cookie },
      data: {},
    });
    expect(scaffoldRes.status()).toBe(400);
    expect(((await scaffoldRes.json()) as { error?: string }).error).toMatch(/no scenes/i);

    // 5. PUT — the hand-authored doc lands as rev 1.
    const put1 = await request.put(`/api/videos/${videoId}/graphics`, {
      headers: { cookie, "Content-Type": "application/json" },
      data: { doc: handAuthoredDoc("S123 probe") },
    });
    expect(put1.status()).toBeLessThan(300);
    const p1 = (await put1.json()) as { rev: number };
    expect(p1.rev).toBe(1);

    // 6. GET round-trips the doc.
    const get2 = await request.get(`/api/videos/${videoId}/graphics`, { headers: { cookie } });
    const d2 = (await get2.json()) as { doc: { title: string; scenes: { id: string }[] }; rev: number };
    expect(d2.rev).toBe(1);
    expect(d2.doc?.title).toBe("S123 probe");
    expect(d2.doc?.scenes.map((s) => s.id)).toEqual(["scene-1", "scene-2"]);

    // 7. Stale rev → 409 WITH the server's current doc (the advisory lock).
    const putStale = await request.put(`/api/videos/${videoId}/graphics`, {
      headers: { cookie, "Content-Type": "application/json" },
      data: { doc: handAuthoredDoc("Stale save"), rev: 0 },
    });
    expect(putStale.status()).toBe(409);
    const staleBody = (await putStale.json()) as { current?: { rev: number } };
    expect(staleBody.current?.rev).toBe(1);

    // 8. An ILLEGAL motion → 400 with the validator's verbatim error (the
    //    compatibility table is the grammar's enforcement surface).
    const bad = handAuthoredDoc("Bad");
    (bad.scenes[0].elements[0].enter as { kind: string }).kind = "count";
    const putBad = await request.put(`/api/videos/${videoId}/graphics`, {
      headers: { cookie, "Content-Type": "application/json" },
      data: { doc: bad, rev: 1 },
    });
    expect(putBad.status()).toBe(400);
    const badBody = (await putBad.json()) as { errors?: string[] };
    expect(badBody.errors?.join(" ")).toMatch(/count/i);

    // 9. THE DRAFT RENDER — a real scene draft through the in-process claim
    //    loop: chromium at the 0.5× draft raster + ffmpeg →
    //    graphics/preview-scene-1.mp4. The scope label is "draft" (a
    //    non-reviewable look — never a certified output).
    const renderRes = await request.post(`/api/videos/${videoId}/graphics/render`, {
      headers: { cookie, "Content-Type": "application/json" },
      data: { sceneId: "scene-1" },
    });
    expect([200, 202]).toContain(renderRes.status());
    const rBody = (await renderRes.json()) as { accepted?: boolean; scope?: string };
    expect(rBody.accepted).not.toBe(false);
    expect(rBody.scope).toBe("draft");

    // Poll the DTO until the preview lands (bounded — the sandbox render of
    // a ~4s scene at 0.5× took seconds warm; a COLD dev server (CI) spends
    // its first minute compiling routes, so the window is generous). The
    // poll rides previewUrl ONLY (the whiteboard's S68 receipt: the script
    // job the create route auto-starts fails fast on CI and historically
    // poisoned the shared video.error field mid-render).
    test.setTimeout(240_000);
    let previewUrl: string | null = null;
    let lastError: string | null = null;
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const dto = await request.get(`/api/videos/${videoId}`, { headers: { cookie } });
      if (!dto.ok()) continue;
      const body = (await dto.json()) as { video?: { previewUrl?: string | null; error?: string | null } };
      lastError = body.video?.error ?? lastError;
      if (body.video?.previewUrl) {
        previewUrl = body.video.previewUrl;
        break;
      }
    }
    expect(previewUrl, `the scene draft must land within the poll window (last video.error: ${lastError})`).toBe(
      `/api/videos/${videoId}/mp4?variant=preview`
    );

    // 9b. The artifact SERVES — the preview URL answers with video bytes
    //     (a DB flag without a servable file would be a lying badge).
    const mp4 = await request.get(`/api/videos/${videoId}/mp4?variant=preview`, {
      headers: { cookie },
    });
    expect(mp4.status()).toBe(200);
    expect((mp4.headers()["content-type"] ?? "")).toContain("video/");

    // 10. THE FULL RENDER — through the LANE'S OWN route (the Graphics
    //     Studio's "Render full video" button): the engine doc IS the scene
    //     list, so the lane route has no scenes gate (the whiteboard's own
    //     route, mirrored). The shared POST /render branch — the mode
    //     picker's path — needs the story scene list, which CI (no AI
    //     gateway) cannot produce; its dispatch is covered by the source pin
    //     and the order law above.
    const fullRes = await request.post(`/api/videos/${videoId}/graphics/render`, {
      headers: { cookie, "Content-Type": "application/json" },
      data: {},
    });
    expect([200, 202]).toContain(fullRes.status());
    const fullBody = (await fullRes.json()) as { accepted?: boolean; scope?: string };
    expect(fullBody.accepted).not.toBe(false);
    expect(fullBody.scope).toBe("full");

    let finalUrl: string | null = null;
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const dto = await request.get(`/api/videos/${videoId}`, { headers: { cookie } });
      if (!dto.ok()) continue;
      const body = (await dto.json()) as { video?: { videoUrl?: string | null; error?: string | null } };
      lastError = body.video?.error ?? lastError;
      if (body.video?.videoUrl) {
        finalUrl = body.video.videoUrl;
        break;
      }
    }
    expect(finalUrl, `the full render must land within the poll window (last video.error: ${lastError})`).toBe(
      `/api/videos/${videoId}/mp4`
    );
    const finalMp4 = await request.get(`/api/videos/${videoId}/mp4`, { headers: { cookie } });
    expect(finalMp4.status()).toBe(200);
    expect((finalMp4.headers()["content-type"] ?? "")).toContain("video/");

    // 10b. The lane's evidence: the standing final carries the S117 manifest
    //      (mode "graphics") — the shared render status endpoint returns it.
    const status = await request.get(`/api/videos/${videoId}/render`, { headers: { cookie } });
    expect(status.status()).toBe(200);
    const statusBody = (await status.json()) as { manifest?: { mode?: string } | null; staleness?: { status?: string } | null };
    expect(statusBody.manifest?.mode).toBe("graphics");
    expect(statusBody.staleness?.status).toBe("fresh");

    // 11. Cross-mode refusal — a classic (script-format) video cannot render
    //     through the graphics lane's own route (the format guard fires
    //     before the mode guard, the whiteboard's law).
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

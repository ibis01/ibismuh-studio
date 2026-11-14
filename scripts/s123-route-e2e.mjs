// S123 — the graphics lane's route probe (the house sN-route-e2e.mjs
// pattern: register through the real route, drive the API contract with
// numbered checks, exit non-zero on any failure).
//
// Run: node scripts/s123-route-e2e.mjs  (after the dev daemon is up on :3000
// with a bootstrapped database — the same precondition every sN probe has).
//
// Covers: auth → story video in graphics mode → the doc workflow (GET /
// PUT / rev conflict / verbatim validation errors) → the scaffold's honest
// no-scenes gate → a REAL scene-draft render (chromium 0.5×/12fps + ffmpeg
// → graphics/preview-scene-1.mp4) → the shared POST /render lane branch
// (the S119 contract, the graphics edition) → the cross-mode refusal.

import { PrismaClient } from "@prisma/client";

const BASE = "http://localhost:3000";
const jar = [];
const feed = (res) => {
  for (const c of res.headers.getSetCookie?.() ?? []) jar.push(c.split(";")[0]);
};
const H = (extra = {}) => ({
  ...(jar.length ? { cookie: jar.join("; ") } : {}),
  ...extra,
});
let pass = 0;
let fail = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  if (ok) pass++; else fail++;
};
const json = async (res) => res.json().catch(() => ({}));

const prisma = new PrismaClient();
const BASELINE = {
  users: await prisma.user.count(),
  orgs: await prisma.organization.count({ where: { memberships: { none: {} } } }),
};

const tag = `s123-${Date.now()}`;
const email = `${tag}@e2e.local`;
const PASSWORD = "s123-route-1";

// ---- 1. register through the real route ----
const reg = await fetch(`${BASE}/api/auth/register`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "S123 Probe", email, password: PASSWORD }),
});
feed(reg);
check("1.1  register -> 201", reg.status === 201, reg.status);

// ---- 2. the story video in graphics mode ----
const createRes = await fetch(`${BASE}/api/videos`, {
  method: "POST",
  headers: H({ "content-type": "application/json" }),
  body: JSON.stringify({
    topic: `S123 route probe ${tag}`,
    niche: "Motivation",
    format: "story",
    renderMode: "graphics",
  }),
});
feed(createRes);
const createBody = await json(createRes);
check("2.1  create (story, graphics mode) -> < 300", createRes.status < 300, createRes.status);
const videoId = createBody?.video?.id;
check("2.2  video id present", Boolean(videoId), createBody);

// ---- 3. the shared path's ORDER LAW: the scenes gate precedes the lane dispatch ----
const laneNoDoc = await fetch(`${BASE}/api/videos/${videoId}/render`, {
  method: "POST",
  headers: H({ "content-type": "application/json" }),
  body: JSON.stringify({ mode: "graphics" }),
});
const laneNoDocBody = await json(laneNoDoc);
check("3.1  POST /render mode=graphics, scenes-empty -> 400 (the shared gate)", laneNoDoc.status === 400, laneNoDoc.status);
check("3.2  the shared scenes gate fires first (both engine lanes)", /no scenes/i.test(laneNoDocBody?.error ?? ""), laneNoDocBody?.error);

// ---- 4. the doc workflow ----
const get1 = await fetch(`${BASE}/api/videos/${videoId}/graphics`, { headers: H() });
const d1 = await json(get1);
check("4.1  GET /graphics -> 200", get1.status === 200, get1.status);
check("4.2  no doc yet, rev 0", d1?.doc === null && d1?.rev === 0, { doc: d1?.doc, rev: d1?.rev });
check("4.3  the grammar surfaces ride", Array.isArray(d1?.grammar?.elementKinds) && d1.grammar.elementKinds.includes("headline"), d1?.grammar?.elementKinds);

const scaffoldRes = await fetch(`${BASE}/api/videos/${videoId}/graphics/scaffold`, {
  method: "POST",
  headers: H({ "content-type": "application/json" }),
  body: JSON.stringify({}),
});
const scaffoldBody = await json(scaffoldRes);
check("4.4  scaffold without scenes -> 400 (honest gate)", scaffoldRes.status === 400, scaffoldRes.status);
check("4.5  the gate names the missing scenes", /no scenes/i.test(scaffoldBody?.error ?? ""), scaffoldBody?.error);

const handDoc = {
  version: 1,
  title: "S123 route probe",
  width: 1920,
  height: 1080,
  fps: 24,
  scenes: [
    {
      id: "scene-1",
      narration: "A short probe beat for the draft render.",
      durationMs: 4000,
      background: "#ffffff",
      elements: [
        {
          id: "h1", kind: "headline", at: { x: 960, y: 200, scale: 1, rotateDeg: 0 },
          text: { text: "Probe title", sizePx: 64, weight: 800, color: "#112233", align: "center" },
          enter: { kind: "rise", durationMs: 600, delayMs: 0, ease: "ease-back" },
        },
        {
          id: "cn", kind: "counter", at: { x: 960, y: 540, scale: 1, rotateDeg: 0 },
          counter: { from: 0, to: 100, unit: "%", decimals: 0 },
          enter: { kind: "count", durationMs: 1200, delayMs: 600, ease: "linear" },
        },
      ],
    },
    {
      id: "scene-2",
      narration: "The second beat closes the probe.",
      durationMs: 3000,
      background: "#101820",
      elements: [
        {
          id: "sh", kind: "subhead", at: { x: 960, y: 300, scale: 1, rotateDeg: 0 },
          text: { text: "Closing beat" },
          enter: { kind: "slide", durationMs: 500, delayMs: 200, ease: "ease-in-out" },
        },
      ],
    },
  ],
};

const put1 = await fetch(`${BASE}/api/videos/${videoId}/graphics`, {
  method: "PUT",
  headers: H({ "content-type": "application/json" }),
  body: JSON.stringify({ doc: handDoc }),
});
const p1 = await json(put1);
check("4.6  PUT hand-authored doc -> rev 1", put1.status < 300 && p1?.rev === 1, { status: put1.status, rev: p1?.rev });

const get2 = await fetch(`${BASE}/api/videos/${videoId}/graphics`, { headers: H() });
const d2 = await json(get2);
check("4.7  GET round-trips the doc", d2?.rev === 1 && d2?.doc?.title === "S123 route probe", { rev: d2?.rev, title: d2?.doc?.title });

const putStale = await fetch(`${BASE}/api/videos/${videoId}/graphics`, {
  method: "PUT",
  headers: H({ "content-type": "application/json" }),
  body: JSON.stringify({ doc: handDoc, rev: 0 }),
});
const staleBody = await json(putStale);
check("4.8  stale rev -> 409 WITH the server's doc", putStale.status === 409 && staleBody?.current?.rev === 1, { status: putStale.status, currentRev: staleBody?.current?.rev });

const bad = structuredClone(handDoc);
bad.scenes[0].elements[0].enter.kind = "count"; // illegal on a headline
const putBad = await fetch(`${BASE}/api/videos/${videoId}/graphics`, {
  method: "PUT",
  headers: H({ "content-type": "application/json" }),
  body: JSON.stringify({ doc: bad, rev: 1 }),
});
const badBody = await json(putBad);
check("4.9  illegal motion -> 400 verbatim", putBad.status === 400 && /count/i.test((badBody?.errors ?? []).join(" ")), { status: putBad.status, errors: badBody?.errors });

// ---- 5. the real scene-draft render ----
const draftRes = await fetch(`${BASE}/api/videos/${videoId}/graphics/render`, {
  method: "POST",
  headers: H({ "content-type": "application/json" }),
  body: JSON.stringify({ sceneId: "scene-1" }),
});
const draftBody = await json(draftRes);
check("5.1  scene draft render accepted", [200, 202].includes(draftRes.status) && draftBody?.accepted !== false, { status: draftRes.status, body: draftBody });
check("5.2  scope = draft (non-reviewable)", draftBody?.scope === "draft", draftBody);

let previewUrl = null;
for (let i = 0; i < 90; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const dto = await fetch(`${BASE}/api/videos/${videoId}`, { headers: H() });
  if (!dto.ok) continue;
  const body = await json(dto);
  if (body?.video?.previewUrl) {
    previewUrl = body.video.previewUrl;
    break;
  }
}
check("5.3  the draft lands within the poll window", previewUrl === `/api/videos/${videoId}/mp4?variant=preview`, previewUrl);
if (previewUrl) {
  const mp4 = await fetch(`${BASE}${previewUrl}`, { headers: H() });
  check("5.4  the artifact serves video bytes", mp4.status === 200 && (mp4.headers.get("content-type") ?? "").includes("video/"), { status: mp4.status, type: mp4.headers.get("content-type") });
}

// ---- 6. the FULL render through the LANE'S OWN route (the engine doc IS
// the scene list — no scenes gate; the shared POST /render branch needs the
// story scene list, which the probe (no AI gateway) cannot produce) ----
const fullRes = await fetch(`${BASE}/api/videos/${videoId}/graphics/render`, {
  method: "POST",
  headers: H({ "content-type": "application/json" }),
  body: JSON.stringify({}),
});
const fullBody = await json(fullRes);
check("6.1  the lane route accepts the full render", [200, 202].includes(fullRes.status) && fullBody?.accepted !== false && fullBody?.scope === "full", { status: fullRes.status, body: fullBody });

let finalUrl = null;
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const dto = await fetch(`${BASE}/api/videos/${videoId}`, { headers: H() });
  if (!dto.ok) continue;
  const body = await json(dto);
  if (body?.video?.videoUrl) {
    finalUrl = body.video.videoUrl;
    break;
  }
}
check("6.2  the final lands within the poll window", finalUrl === `/api/videos/${videoId}/mp4`, finalUrl);
if (finalUrl) {
  const status = await fetch(`${BASE}/api/videos/${videoId}/render`, { headers: H() });
  const statusBody = await json(status);
  check("6.3  the S117 manifest records mode graphics", statusBody?.manifest?.mode === "graphics", statusBody?.manifest);
  check("6.4  staleness reads fresh", statusBody?.staleness?.status === "fresh", statusBody?.staleness);
}

// ---- 7. cross-mode refusal (the peer-MODE law) ----
const classic = await fetch(`${BASE}/api/videos`, {
  method: "POST",
  headers: H({ "content-type": "application/json" }),
  body: JSON.stringify({
    topic: `S123 classic probe ${tag}`,
    niche: "Motivation",
    format: "script",
    script: "A short classic probe script for the refusal check.",
    approved: true,
  }),
});
feed(classic);
const classicId = (await json(classic))?.video?.id;
const refused = await fetch(`${BASE}/api/videos/${classicId}/graphics/render`, {
  method: "POST",
  headers: H({ "content-type": "application/json" }),
  body: JSON.stringify({}),
});
const refusedBody = await json(refused);
check("7.1  classic video refused by the format guard", refused.status === 400 && /not a scene-based video/i.test(refusedBody?.error ?? ""), { status: refused.status, error: refusedBody?.error });

// ---- end state: baseline-relative cleanup through the account's front door ----
const del = await fetch(`${BASE}/api/account/delete`, {
  method: "POST",
  headers: H({ "content-type": "application/json" }),
  body: JSON.stringify({ confirm: "DELETE" }),
});
check("8.1  account deleted", del.status < 300, del.status);

const endUsers = await prisma.user.count();
const endOrgs = await prisma.organization.count({ where: { memberships: { none: {} } } });
check("8.2  baseline-relative end state", endUsers === BASELINE.users && endOrgs === BASELINE.orgs, { users: [BASELINE.users, endUsers], orgs: [BASELINE.orgs, endOrgs] });

await prisma.$disconnect();
console.log(`\n${fail === 0 ? "ALL CHECKS PASS" : `${fail} FAILURE(S)`} (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);

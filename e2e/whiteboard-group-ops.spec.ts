import { expect, test, type APIRequestContext } from "@playwright/test";

// Master plan Phase 5 (after 941a6ee) — the compound GROUP OPERATIONS
// browser acceptance. e2e/whiteboard.spec.ts established the lane's
// browser pattern: drive the REAL product surface through its API
// contract (that spec has no canvas-interaction helpers — the studio's
// canvas math is not e2e material), so this suite rides the same seams
// the Studio UI rides: the doc workflow (the group ops are CLIENT-SIDE
// pure functions whose results the Studio saves through the same
// validated PUT), the choreography route (the server half of the compile
// button), and the scene-preview render.
//
// Coverage:
//   · two repeated compounds (the same compound duplicated twice) stay
//     INDEPENDENT across save/reload: a transform on one copy moves only
//     its members and writes only its record; the sibling is untouched.
//   · lock (and the route's server-side lock law), duplicate, delete,
//     ungroup, recompose-with-override — each through the exact doc
//     shapes those ops produce.
//   · the choreography receipts: the nine preset ids the studio's picker
//     maps verbatim from COMPOUND_CHOREOGRAPHY_IDS (choreography.ts) each
//     compile through the product seam and stamp the RICH receipt
//     { presetId, timingSource, eventFingerprint, affectedMembers,
//     version }, with the version climbing monotonically per group.
//   · the event-set law at the product surface: overlapping member
//     windows refuse with the offending pair named, and the refusal
//     leaves no scar (rev unchanged).
//   · the backward-compatibility law: a legacy bare-preset-string receipt
//     PUTs clean and upgrades to the rich shape on read.
//   · the choreographed two-compound board renders a real scene preview.

const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const PASSWORD = "p5-group-ops-123";
const accounts: string[] = [];

// The nine preset ids the studio's picker maps verbatim from
// COMPOUND_CHOREOGRAPHY_IDS (src/lib/ibismuh/whiteboard/choreography.ts —
// the closed vocabulary; asserting each id compiles IS the picker
// contract at the product surface, without pixel-perfect canvas clicks).
const NINE_PRESETS = [
  "assembly-cascade",
  "assembly-center-out",
  "assembly-edge-in",
  "assembly-clockwise",
  "assembly-counterclockwise",
  "assembly-top-down",
  "assembly-left-right",
  "assembly-alternate",
  "assembly-spiral",
];

// money-growth-cycle's parts — compounds.ts is the frozen registry and
// the group law judges members against this exact assetId sequence.
const COMPOUND = "money-growth-cycle";
const MONEY_PARTS = [
  { assetId: "coin", dx: -220, dy: 40, scale: 1 },
  { assetId: "arrow-growth", dx: 20, dy: -120, scale: 1 },
  { assetId: "bar-chart", dx: 240, dy: 60, scale: 0.9 },
  { assetId: "piggy-bank-wb", dx: 20, dy: 200, scale: 0.9 },
];
const memberKeys = (instanceId: string) => MONEY_PARTS.map((p) => `${instanceId}-${p.assetId}`);
const sortedKeys = (instanceId: string) => [...memberKeys(instanceId)].sort();

type Pl = {
  assetId: string;
  placementId: string;
  groupId?: string;
  placement: { x: number; y: number; scale: number; rotateDeg: number };
  order?: number;
};

/** The RICH choreography receipt (Phase 5) as it rides the wire. */
type Receipt = {
  presetId: string;
  timingSource: string;
  eventFingerprint: string;
  affectedMembers: string[];
  version: number;
};

/** One compound instance expanded at its origin (the expansion law: the
 *  declared offsets ride the origin, the part scale rides verbatim). */
function copyPlacements(instanceId: string, ox: number, oy: number): Pl[] {
  return MONEY_PARTS.map((p) => ({
    assetId: p.assetId,
    placementId: `${instanceId}-${p.assetId}`,
    groupId: instanceId,
    placement: { x: ox + p.dx, y: oy + p.dy, scale: p.scale, rotateDeg: 0 },
  }));
}

/** The board under test: the SAME compound placed twice (distinct
 *  instance ids — the repeated-placement win), one scene, default camera.
 *  The return type is explicit so the op-shaped fields (the transform
 *  record, the lock roster) are always writable on the built doc. */
function twoCopyDoc(
  title: string,
  extras?: {
    animations?: unknown[];
    groupTransforms?: Record<string, { anchorX: number; anchorY: number; dx: number; dy: number; scale: number; rotateDeg: number }>;
    groupLocks?: string[];
  }
): {
  title: string;
  width: number;
  height: number;
  fps: number;
  hand: { style: string; scale: number };
  scenes: Array<{
    id: string;
    narration: string;
    background: string;
    placements: Pl[];
    animations: unknown[];
    groupTransforms?: Record<string, { anchorX: number; anchorY: number; dx: number; dy: number; scale: number; rotateDeg: number }>;
    groupLocks?: string[];
    camera: Array<{ cx: number; cy: number; scale: number; startMs: number; durationMs: number }>;
  }>;
} {
  const placements = [
    ...copyPlacements(COMPOUND, 500, 400),
    ...copyPlacements(`${COMPOUND}-2`, 1200, 400),
  ].map((pl, i) => ({ ...pl, order: i }));
  return {
    title,
    width: 1920,
    height: 1080,
    fps: 24,
    hand: { style: "marker", scale: 1 },
    scenes: [
      {
        id: "scene-1",
        narration: "Two money cycles assemble as independent systems.",
        background: "#ffffff",
        placements,
        animations: extras?.animations ?? [],
        ...(extras?.groupTransforms !== undefined ? { groupTransforms: extras.groupTransforms } : {}),
        ...(extras?.groupLocks !== undefined ? { groupLocks: extras.groupLocks } : {}),
        camera: [{ cx: 960, cy: 540, scale: 1, startMs: 0, durationMs: 0 }],
      },
    ],
  };
}

async function register(
  request: APIRequestContext,
  email: string
): Promise<{ cookie: string; verificationUrl?: string }> {
  accounts.push(email);
  const res = await request.post("/api/auth/register", {
    data: { name: "P5 Group Ops Probe", email, password: PASSWORD },
  });
  expect(res.status(), "registration must succeed").toBe(201);
  const d = (await res.json()) as { verification?: { url?: string } };
  const setCookie = res.headers()["set-cookie"];
  expect(setCookie).toBeTruthy();
  const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(";")[0] ?? "";
  expect(cookie.startsWith("ibismuh_session=")).toBe(true);
  return { cookie, verificationUrl: d.verification?.url };
}

async function createWhiteboardVideo(request: APIRequestContext, cookie: string, label: string): Promise<string> {
  const createRes = await request.post("/api/videos", {
    headers: { cookie },
    data: {
      topic: `P5 group ops probe ${label} ${RUN}`,
      niche: "Motivation",
      format: "story",
      renderMode: "whiteboard",
    },
  });
  expect(createRes.status(), "create must succeed").toBeLessThan(300);
  const videoId = ((await createRes.json()) as { video: { id: string } }).video.id;
  expect(videoId).toBeTruthy();
  return videoId;
}

const put = (request: APIRequestContext, cookie: string, videoId: string, project: unknown, rev?: number) =>
  request.put(`/api/videos/${videoId}/whiteboard`, {
    headers: { cookie, "Content-Type": "application/json" },
    data: { project, ...(rev !== undefined ? { rev } : {}) },
  });

type SceneShape = {
  id: string;
  placements: Pl[];
  animations: Array<{ type: string; startMs: number; durationMs: number; placementId?: string; assetId: string; pathId?: string }>;
  choreographyGroups?: Record<string, Receipt>;
  groupTransforms?: Record<string, { anchorX: number; anchorY: number; dx: number; dy: number; scale: number; rotateDeg: number }>;
  groupLocks?: string[];
};

const getDoc = async (request: APIRequestContext, cookie: string, videoId: string) => {
  const res = await request.get(`/api/videos/${videoId}/whiteboard`, { headers: { cookie } });
  expect(res.status()).toBe(200);
  return (await res.json()) as {
    project: { scenes: SceneShape[] } | null;
    rev: number;
    library: { id: string; paths: string[] }[];
  };
};

const groupIdsOf = (scene: SceneShape | undefined) =>
  [...new Set((scene?.placements ?? []).filter((p) => p.groupId).map((p) => p.groupId as string))].sort();

const membersOf = (scene: SceneShape | undefined, groupId: string) =>
  (scene?.placements ?? []).filter((p) => p.groupId === groupId);

test.describe("P5 — whiteboard compound group operations", () => {
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

  test("two repeated compounds stay independent: transform, save/reload, lock, duplicate, delete, ungroup, recompose", async ({ request }) => {
    const email = `p5ops-${RUN}@ibismuh.test`;
    const { cookie, verificationUrl } = await register(request, email);
    if (verificationUrl) {
      const v = await request.get(verificationUrl);
      expect(v.status()).toBeLessThan(300);
    }
    const videoId = await createWhiteboardVideo(request, cookie, "ops");

    // 1. The two-copy board lands as rev 1.
    const put1 = await put(request, cookie, videoId, twoCopyDoc("P5 two copies"));
    expect(put1.status()).toBeLessThan(300);
    const d1 = await getDoc(request, cookie, videoId);
    const scene1 = d1.project?.scenes[0];
    expect(scene1).toBeTruthy();
    const groups1 = new Map<string, Pl[]>();
    for (const pl of membersOf(scene1, COMPOUND)) groups1.set(COMPOUND, [...(groups1.get(COMPOUND) ?? []), pl]);
    for (const pl of membersOf(scene1, `${COMPOUND}-2`))
      groups1.set(`${COMPOUND}-2`, [...(groups1.get(`${COMPOUND}-2`) ?? []), pl]);
    // Independent selection's durable form: each copy addresses ITS OWN
    // instance ids — no key is shared, no member bleeds across copies.
    expect(groupIdsOf(scene1)).toEqual([COMPOUND, `${COMPOUND}-2`].sort());
    expect((groups1.get(COMPOUND) ?? []).map((p) => p.placementId).sort()).toEqual(sortedKeys(COMPOUND));
    expect((groups1.get(`${COMPOUND}-2`) ?? []).map((p) => p.placementId).sort()).toEqual(sortedKeys(`${COMPOUND}-2`));
    const copy2V1 = JSON.stringify(groups1.get(`${COMPOUND}-2`));
    expect(copy2V1).toBeTruthy();

    // 2. A transform on ONE copy (move + scale about the live centroid —
    //    the exact member law groups.ts transformCompoundGroup applies;
    //    rotateDeg 0 keeps the arithmetic exact). The record's anchor is
    //    the expansion origin the record was born from; d' rides the
    //    composition law d' = (C − A) + s₂·Rot₂(A + d − C) + d₂.
    const copy1 = groups1.get(COMPOUND) ?? [];
    const cx = copy1.reduce((a, m) => a + m.placement.x, 0) / copy1.length;
    const cy = copy1.reduce((a, m) => a + m.placement.y, 0) / copy1.length;
    const t = { dx: 40, dy: 0, scale: 1.2, rotateDeg: 0 };
    const moved1 = copy1.map((m) => ({
      ...m,
      placement: {
        x: Math.round(cx + t.scale * (m.placement.x - cx) + t.dx),
        y: Math.round(cy + t.scale * (m.placement.y - cy) + t.dy),
        scale: m.placement.scale * t.scale,
        rotateDeg: m.placement.rotateDeg,
      },
    }));
    const record = {
      anchorX: 500,
      anchorY: 400,
      dx: cx - 500 + t.scale * (500 - cx) + t.dx,
      dy: cy - 400 + t.scale * (400 - cy) + t.dy,
      scale: t.scale,
      rotateDeg: t.rotateDeg,
    };
    const transformDoc = twoCopyDoc("P5 two copies");
    transformDoc.scenes[0].placements = [...moved1, ...(groups1.get(`${COMPOUND}-2`) ?? [])].map((pl, i) => ({
      ...pl,
      order: i,
    }));
    transformDoc.scenes[0].groupTransforms = { [COMPOUND]: record };
    const put2 = await put(request, cookie, videoId, transformDoc, d1.rev);
    expect(put2.status()).toBeLessThan(300);

    // 3. Save/reload: the record rides, the moved copy lands, the SIBLING
    //    is byte-untouched (independence across the round-trip).
    const d2 = await getDoc(request, cookie, videoId);
    const scene2 = d2.project?.scenes[0];
    expect(scene2?.groupTransforms?.[COMPOUND]).toEqual(record);
    expect(scene2?.groupTransforms?.[`${COMPOUND}-2`]).toBeUndefined();
    expect(JSON.stringify(membersOf(scene2, `${COMPOUND}-2`))).toBe(copy2V1);
    const movedGot = [...membersOf(scene2, COMPOUND)].sort((a, b) => a.placementId.localeCompare(b.placementId));
    const movedExpect = [...moved1].sort((a, b) => a.placementId.localeCompare(b.placementId));
    for (const [i, m] of movedExpect.entries()) {
      expect(movedGot[i]?.placement.x).toBe(m.placement.x);
      expect(movedGot[i]?.placement.y).toBe(m.placement.y);
      expect(movedGot[i]?.placement.scale).toBeCloseTo(m.placement.scale, 9);
    }

    // 4. RECOMPOSE PRESERVES THE OVERRIDE at the product surface: the
    //    declared layout re-expanded at the record's anchor, the record's
    //    similarity re-applied on top (groups.ts recomposeCompoundGroup's
    //    exact law; rotateDeg 0 → cos 1, sin 0).
    const recomposed1 = MONEY_PARTS.map((p, i) => {
      const px = record.anchorX + p.dx;
      const py = record.anchorY + p.dy;
      return {
        ...(copy1[i] as Pl),
        placement: {
          x: Math.round(record.anchorX + record.scale * (px - record.anchorX) + record.dx),
          y: Math.round(record.anchorY + record.scale * (py - record.anchorY) + record.dy),
          scale: p.scale * record.scale,
          rotateDeg: 0 + record.rotateDeg,
        },
      };
    });
    const recomposeDoc = transformDoc;
    recomposeDoc.scenes[0].placements = [...recomposed1, ...(groups1.get(`${COMPOUND}-2`) ?? [])].map((pl, i) => ({
      ...pl,
      order: i,
    }));
    const put3 = await put(request, cookie, videoId, recomposeDoc, d2.rev);
    expect(put3.status()).toBeLessThan(300);
    const d3 = await getDoc(request, cookie, videoId);
    const scene3 = d3.project?.scenes[0];
    const recomposedGot = [...membersOf(scene3, COMPOUND)].sort((a, b) => a.placementId.localeCompare(b.placementId));
    expect(recomposedGot.length).toBe(MONEY_PARTS.length);
    let maxDelta = 0;
    for (const [i, m] of movedExpect.entries()) {
      maxDelta = Math.max(
        maxDelta,
        Math.abs((recomposedGot[i]?.placement.x ?? 0) - m.placement.x),
        Math.abs((recomposedGot[i]?.placement.y ?? 0) - m.placement.y)
      );
      expect(recomposedGot[i]?.placement.scale).toBeCloseTo(m.placement.scale, 9);
    }
    expect(maxDelta, "recompose lands within rounding of the transformed state (the override survived)").toBeLessThanOrEqual(2);
    expect(JSON.stringify(membersOf(scene3, `${COMPOUND}-2`))).toBe(copy2V1);

    // 5. DUPLICATE: the derive law mints the next free instance (-3).
    const dupDoc = recomposeDoc;
    dupDoc.scenes[0].placements = [
      ...recomposed1,
      ...(groups1.get(`${COMPOUND}-2`) ?? []),
      ...copyPlacements(`${COMPOUND}-3`, 800, 800),
    ].map((pl, i) => ({ ...pl, order: i }));
    const put4 = await put(request, cookie, videoId, dupDoc, d3.rev);
    expect(put4.status()).toBeLessThan(300);
    const d4 = await getDoc(request, cookie, videoId);
    expect(groupIdsOf(d4.project?.scenes[0])).toEqual([COMPOUND, `${COMPOUND}-2`, `${COMPOUND}-3`].sort());

    // 6. LOCK: the roster rides the doc, and the choreography route
    //    refuses a locked group SERVER-SIDE (the route never trusts the
    //    client's check) — then the unlock clears the roster.
    const lockDoc = dupDoc;
    lockDoc.scenes[0].groupLocks = [`${COMPOUND}-2`];
    const put5 = await put(request, cookie, videoId, lockDoc, d4.rev);
    expect(put5.status()).toBeLessThan(300);
    const d5 = await getDoc(request, cookie, videoId);
    expect(d5.project?.scenes[0]?.groupLocks).toEqual([`${COMPOUND}-2`]);
    const lockedRefusal = await request.post(`/api/videos/${videoId}/whiteboard/choreography`, {
      headers: { cookie, "Content-Type": "application/json" },
      data: { sceneId: "scene-1", groupId: `${COMPOUND}-2`, preset: "assembly-cascade" },
    });
    expect(lockedRefusal.status()).toBe(409);
    expect(((await lockedRefusal.json()) as { error?: string }).error).toMatch(/locked/);
    const unlockDoc = lockDoc;
    unlockDoc.scenes[0].groupLocks = [];
    const put6 = await put(request, cookie, videoId, unlockDoc, d5.rev);
    expect(put6.status()).toBeLessThan(300);
    const d6 = await getDoc(request, cookie, videoId);
    expect(d6.project?.scenes[0]?.groupLocks ?? []).toEqual([]);

    // 7. DELETE: the third copy's members leave; the first copy keeps its
    //    members AND its canonical record (an op loses only ITS entries).
    const deleteDoc = twoCopyDoc("P5 two copies");
    deleteDoc.scenes[0].placements = [...recomposed1, ...(groups1.get(`${COMPOUND}-2`) ?? [])].map((pl, i) => ({
      ...pl,
      order: i,
    }));
    deleteDoc.scenes[0].groupTransforms = { [COMPOUND]: record };
    const put7 = await put(request, cookie, videoId, deleteDoc, d6.rev);
    expect(put7.status()).toBeLessThan(300);
    const d7 = await getDoc(request, cookie, videoId);
    expect(groupIdsOf(d7.project?.scenes[0])).toEqual([COMPOUND, `${COMPOUND}-2`].sort());
    expect(d7.project?.scenes[0]?.groupTransforms?.[COMPOUND]).toEqual(record);

    // 8. UNGROUP: the second copy's mark strips, the placementIds STAY
    //    (no identity is lost), the first copy keeps its group and its
    //    record.
    const ungroupDoc = deleteDoc;
    ungroupDoc.scenes[0].placements = [
      ...recomposed1,
      ...(groups1.get(`${COMPOUND}-2`) ?? []).map(({ groupId: _drop, ...rest }) => rest),
    ].map((pl, i) => ({ ...pl, order: i }));
    const put8 = await put(request, cookie, videoId, ungroupDoc, d7.rev);
    expect(put8.status()).toBeLessThan(300);
    const d8 = await getDoc(request, cookie, videoId);
    const scene8 = d8.project?.scenes[0];
    expect(groupIdsOf(scene8)).toEqual([COMPOUND]);
    for (const key of memberKeys(`${COMPOUND}-2`)) {
      const loose = scene8?.placements.find((p) => p.placementId === key);
      expect(loose, `${key} survives the ungroup with its identity`).toBeTruthy();
      expect(loose?.groupId).toBeUndefined();
    }
    expect(scene8?.groupTransforms?.[COMPOUND]).toEqual(record);
  });

  test("the choreography law and the rich receipts: overlap refusal, nine presets, monotonic version, legacy upgrade", async ({ request }) => {
    const email = `p5receipts-${RUN}@ibismuh.test`;
    const { cookie, verificationUrl } = await register(request, email);
    if (verificationUrl) {
      const v = await request.get(verificationUrl);
      expect(v.status()).toBeLessThan(300);
    }
    const videoId = await createWhiteboardVideo(request, cookie, "receipts");

    const put1 = await put(request, cookie, videoId, twoCopyDoc("P5 receipts"));
    expect(put1.status()).toBeLessThan(300);
    const d1 = await getDoc(request, cookie, videoId);
    expect(d1.rev).toBe(1);

    // The member strokes' real path ids ride the library (no hardcoding —
    // the GET response is the palette the editor draws from; each event
    // names its OWN asset's path — the validator judges per asset).
    const pathOf = (assetId: string) => {
      const paths = d1.library.find((a) => a.id === assetId)?.paths ?? [];
      expect(paths.length, `${assetId} carries drawable paths`).toBeGreaterThan(0);
      return paths[0] as string;
    };

    // 2. THE EVENT-SET LAW at the product surface: two member strokes
    //    claiming one clock window refuse with the pair named — and the
    //    refusal leaves NO SCAR (the doc and its rev are untouched).
    const overlapDoc = twoCopyDoc("P5 overlap");
    overlapDoc.scenes[0].animations = [
      { type: "draw_path", assetId: "coin", placementId: `${COMPOUND}-coin`, pathId: pathOf("coin"), startMs: 0, durationMs: 500 },
      {
        type: "draw_path",
        assetId: "arrow-growth",
        placementId: `${COMPOUND}-arrow-growth`,
        pathId: pathOf("arrow-growth"),
        startMs: 300,
        durationMs: 500,
      },
    ];
    const put2 = await put(request, cookie, videoId, overlapDoc, d1.rev);
    expect(put2.status()).toBeLessThan(300);
    const put2Body = (await put2.json()) as { rev: number };
    const compileRefused = await request.post(`/api/videos/${videoId}/whiteboard/choreography`, {
      headers: { cookie, "Content-Type": "application/json" },
      data: { sceneId: "scene-1", groupId: COMPOUND, preset: "assembly-cascade" },
    });
    expect(compileRefused.status()).toBe(400);
    const refusalBody = (await compileRefused.json()) as { error?: string };
    expect(refusalBody.error).toMatch(/overlap/);
    expect(refusalBody.error).toContain(`${COMPOUND}-coin`);
    expect(refusalBody.error).toContain(`${COMPOUND}-arrow-growth`);
    const d2 = await getDoc(request, cookie, videoId);
    // the refused compile never bumped the doc
    expect(d2.rev).toBe(put2Body.rev);

    // 3. THE NINE PRESETS — the picker's closed vocabulary, live on the
    //    product surface: each id compiles and stamps the RICH receipt,
    //    with the version climbing monotonically per group (1..9).
    const cleanDoc = twoCopyDoc("P5 receipts");
    const put3 = await put(request, cookie, videoId, cleanDoc, d2.rev);
    expect(put3.status()).toBeLessThan(300);
    const put3Body = (await put3.json()) as { rev: number };
    let rev = put3Body.rev;
    let lastReceipts: Record<string, Receipt> | undefined;
    for (const [i, preset] of NINE_PRESETS.entries()) {
      const res = await request.post(`/api/videos/${videoId}/whiteboard/choreography`, {
        headers: { cookie, "Content-Type": "application/json" },
        data: { sceneId: "scene-1", groupId: COMPOUND, preset, rev },
      });
      expect(res.status(), `${preset} must compile`).toBeLessThan(300);
      const body = (await res.json()) as { rev: number; project: { scenes: SceneShape[] } | null };
      expect(body.rev).toBe(rev + 1);
      rev = body.rev;
      const receipt = body.project?.scenes[0]?.choreographyGroups?.[COMPOUND];
      expect(receipt, `${preset} stamps its receipt`).toBeTruthy();
      expect(receipt?.presetId).toBe(preset);
      expect(receipt?.timingSource).toBe("scene-clock");
      expect(receipt?.eventFingerprint).toMatch(/^[0-9a-f]{8}$/);
      expect(receipt?.affectedMembers).toEqual(sortedKeys(COMPOUND));
      expect(receipt?.version, `${preset} continues the counter`).toBe(i + 1);
      lastReceipts = body.project?.scenes[0]?.choreographyGroups;
    }
    expect(lastReceipts?.[COMPOUND]?.version).toBe(NINE_PRESETS.length);

    // 4. Save/reload: the rich receipt survives the round-trip verbatim
    //    (recorded, never recomputed), and the sibling copy stayed
    //    receipt-free through all nine compiles.
    const d4 = await getDoc(request, cookie, videoId);
    expect(d4.project?.scenes[0]?.choreographyGroups).toEqual(lastReceipts);
    expect(d4.project?.scenes[0]?.choreographyGroups?.[`${COMPOUND}-2`]).toBeUndefined();

    // 5. BACKWARD COMPATIBILITY: the Phase 4 bare preset string PUTs
    //    clean and upgrades to the rich shape on read (version 1 — the
    //    legacy shape carries no counter).
    expect(d4.project).toBeTruthy();
    const legacyDoc = d4.project as NonNullable<typeof d4.project>;
    legacyDoc.scenes[0].choreographyGroups = { [COMPOUND]: "assembly-cascade" } as unknown as Record<string, Receipt>;
    const put5 = await put(request, cookie, videoId, legacyDoc, d4.rev);
    // the legacy bare-string receipt is accepted
    expect(put5.status()).toBeLessThan(300);
    const d5 = await getDoc(request, cookie, videoId);
    const legacyReceipt = d5.project?.scenes[0]?.choreographyGroups?.[COMPOUND];
    expect(legacyReceipt?.presetId).toBe("assembly-cascade");
    expect(legacyReceipt?.timingSource).toBe("scene-clock");
    expect(legacyReceipt?.eventFingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(legacyReceipt?.affectedMembers).toEqual(sortedKeys(COMPOUND));
    expect(legacyReceipt?.version).toBe(1);

    // 6. THE RENDER — the choreographed two-compound board renders a real
    //    scene preview through the in-process claim loop, and the artifact
    //    serves (a lying badge would not carry video bytes).
    const beforeRender = await getDoc(request, cookie, videoId);
    // both copies still ride the board at render time
    expect(groupIdsOf(beforeRender.project?.scenes[0])).toEqual([COMPOUND, `${COMPOUND}-2`].sort());
    const renderRes = await request.post(`/api/videos/${videoId}/whiteboard/render`, {
      headers: { cookie, "Content-Type": "application/json" },
      data: { sceneId: "scene-1" },
    });
    expect([200, 202]).toContain(renderRes.status());
    expect(((await renderRes.json()) as { scope?: string }).scope).toBe("preview");

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
    expect(previewUrl, `the choreographed preview must land (last video.error: ${lastError})`).toBe(
      `/api/videos/${videoId}/mp4?variant=preview`
    );
    const mp4 = await request.get(`/api/videos/${videoId}/mp4?variant=preview`, { headers: { cookie } });
    expect(mp4.status()).toBe(200);
    expect(mp4.headers()["content-type"] ?? "").toContain("video/");
  });
});

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// Phase 2.1 of the master engineering plan (post-f53b8c7): /studio gets the
// browser coverage the workspace adjudication promised. The canonical
// workspace is / — this spec pins the PREVIEW's obligations instead:
//
//   1. the surface identifies itself (a visible "planner-pipeline preview"
//      marker, so a preview can never pass as the canonical studio);
//   2. an authenticated creator creates a project through the dialog, every
//      lane is selectable in the picker, the brief saves, the deterministic
//      planner compiles, and the selection survives reload AND a round-trip
//      through the canonical surface at /;
//   3. the /api/projects lane it rides on is default-deny for anonymous
//      callers and tenant-tight across accounts (B never touches A's
//      project).
//
// Cleanup end-state law (isolation.spec's pattern): every account this suite
// registers deletes itself afterAll through its own front door, so the proof
// never poisons the install it ran against.

const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const EMAIL = `studio-preview-${RUN}@ibismuh.test`;
const EMAIL_B = `studio-neighbor-${RUN}@ibismuh.test`;
const EMAIL_ID = `studio-identity-${RUN}@ibismuh.test`;
const PASSWORD = "preview-pass-123";
const TITLE = `Preview probe ${RUN}`;
const accounts: string[] = [];

const LANE_TITLES = [
  "Classic narration",
  "Scene story",
  "Whiteboard explainer",
  "Motion graphics (2D)",
  "Character animation",
  "Keynote slides",
] as const;

async function register(request: APIRequestContext, email: string): Promise<string> {
  accounts.push(email);
  const res = await request.post("/api/auth/register", {
    data: { name: "Studio Preview Probe", email, password: PASSWORD },
  });
  expect(res.status(), "registration must succeed").toBe(201);
  const d = (await res.json()) as { verification?: { url?: string } };
  // Console email mode hands the verification link back — visit it so the
  // account is fully activated.
  if (d.verification?.url) {
    await request.get(d.verification.url);
  }
  const setCookie = res.headers()["set-cookie"];
  expect(setCookie, "registration must set a session cookie").toBeTruthy();
  const pair = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(";")[0] ?? "";
  expect(pair.startsWith("ibismuh_session=")).toBe(true);
  return pair.slice("ibismuh_session=".length);
}

async function signIn(page: Page, sessionValue: string): Promise<void> {
  await page.context().addCookies([
    { name: "ibismuh_session", value: sessionValue, domain: "localhost", path: "/" },
  ]);
}

test.afterAll(async ({ request }) => {
  for (const email of accounts) {
    const login = await request.post("/api/auth/login", { data: { email, password: PASSWORD } });
    if (!login.ok()) continue; // account never landed — nothing to clean
    const cookie = ((login.headers()["set-cookie"] as string | undefined) ?? "").split(";")[0];
    if (!cookie) continue;
    await request.post("/api/account/delete", {
      headers: { cookie, "Content-Type": "application/json" },
      data: { confirm: "DELETE" },
    });
  }
});

test.describe("studio preview — the surface identifies itself", () => {
  let identitySession = "";

  test.beforeAll(async ({ request }) => {
    identitySession = await register(request, EMAIL_ID);
  });

  test("the /api/projects lane is default-deny for anonymous callers", async ({ request }) => {
    const get = await request.get("/api/projects");
    expect(get.status()).toBe(401);
    const post = await request.post("/api/projects", { data: { lane: "classic", topic: "nope" } });
    expect(post.status()).toBe(401);
  });

  test("the page carries a visible planner-pipeline preview marker", async ({ page }) => {
    await signIn(page, identitySession);
    await page.goto("/studio");
    // the identity marker lives in the rail's branding block (nav-rail.tsx)
    await expect(page.getByText("planner-pipeline preview")).toBeVisible();
    // and this surface never presents itself as canonical: the quiet entry
    // lives on the dashboard, not here — no preview link appears in /studio.
    await expect(page.getByRole("link", { name: /Open the planner pipeline preview workspace/i })).toHaveCount(0);
  });
});

test.describe.serial("studio preview — authenticated workflow", () => {
  let session = "";

  test.beforeAll(async ({ request }) => {
    session = await register(request, EMAIL);
  });

  test("a classic project is created through the dialog", async ({ page }) => {
    test.setTimeout(180_000); // dev-compile of the POST route on first hit
    await signIn(page, session);
    await page.goto("/studio");
    await page.getByRole("button", { name: "New project" }).click();
    // classic is the dialog's default lane — asserted, filled, submitted
    const classic = page.getByRole("radio", { name: /Classic narration/ });
    await expect(classic).toHaveAttribute("aria-checked", "true");
    // the dialog DERIVES the default title from the topic — an explicit title
    // makes the rail/tenant assertions unambiguous across runs
    await page.getByLabel("Title", { exact: true }).fill(TITLE);
    await page.getByLabel("Topic — required").fill(`Deterministic probe topic ${RUN}`);
    await page
      .getByLabel("Script — optional")
      .fill("A short deterministic probe script for the preview workflow.");
    await page.getByRole("button", { name: "Create project" }).click();
    // Success evidence = the persisted project in the rail (unambiguous,
    // permanent) — the toast is a 4s transient and the studio event feed
    // carries a lowercase "project created (lane …)" row that collides with
    // the title in substring mode. The rail item proves the POST landed and
    // the row was written under the acting tenant.
    await expect(page.getByLabel(`Open project ${TITLE}`)).toBeVisible({ timeout: 60_000 });
  });

  test("every lane is selectable in the picker", async ({ page }) => {
    await signIn(page, session);
    await page.goto("/studio");
    await page.getByRole("button", { name: "New project" }).click();
    // Phase 2 hardening (master plan after 941a6ee): the studio surface can
    // re-render mid-loop (deferred hydration produces a soft navigation to
    // the same URL), and a click that races that re-render lands on a stale
    // tree — the controlled radio keeps aria-checked=false. The assertion
    // law is unchanged (every lane must PROVE aria-checked=true); the click
    // is retried ONCE (idempotent on a controlled radio) so a hydration
    // race cannot mask a real selection defect.
    await expect(page.getByRole("radiogroup", { name: "Video lane" })).toBeVisible();
    for (const laneTitle of LANE_TITLES) {
      const radio = page.getByRole("radio", {
        name: new RegExp(`^${laneTitle.replace(/[()]/g, "\\$&")}`),
      });
      await radio.scrollIntoViewIfNeeded();
      await radio.click();
      if ((await radio.getAttribute("aria-checked")) !== "true") {
        await radio.click();
      }
      await expect(radio).toHaveAttribute("aria-checked", "true");
    }
    await page.keyboard.press("Escape");
  });

  test("the brief saves, compiles deterministically, and survives reload", async ({ page }) => {
    test.setTimeout(180_000); // first compile of the plan route lands here
    await signIn(page, session);
    await page.goto("/studio");
    await page.getByLabel(`Open project ${TITLE}`).click();
    await page.getByRole("tab", { name: "Brief" }).click();
    await page.getByLabel("Brief topic").fill(`Edited brief topic ${RUN}`);
    await page.getByLabel("Save brief").click();
    // first PATCH of this server pays the dev-compile cost (same as POST);
    // scoped to the sonner viewport — the events feed renders identical text
    await expect(page.locator('[data-sonner-toast]').getByText("Saved", { exact: true })).toBeVisible({ timeout: 60_000 });

    // reload — the selection persists through STORAGE_KEY and the saved
    // brief value comes back from the server. The header shows the title as
    // a heading (the "Project title" input exists only in rename mode).
    await page.reload();
    await expect(page.getByRole("heading", { name: TITLE })).toBeVisible();
    await page.getByRole("tab", { name: "Brief" }).click();
    await expect(page.getByLabel("Brief topic")).toHaveValue(`Edited brief topic ${RUN}`);

    // the deterministic planner compiles without any live provider
    // (first compile of the plan route pays the dev-compile cost)
    await page.getByLabel("Compile plan with the AI planner").click();
    // scoped to the sonner viewport — the events feed renders "Plan compiled"
    await expect(page.locator('[data-sonner-toast]').getByText("Plan compiled", { exact: true })).toBeVisible({ timeout: 60_000 });
  });

  test("a round-trip through / keeps the preview state", async ({ page }) => {
    await signIn(page, session);
    await page.goto("/studio");
    await expect(page.getByLabel(`Open project ${TITLE}`)).toBeVisible();
    // canonical surface: the quiet entry is there and clearly labeled
    await page.goto("/");
    const entry = page.getByRole("link", { name: /Open the planner pipeline preview workspace/i });
    await expect(entry).toBeVisible();
    await entry.click();
    await page.waitForURL(/\/studio$/);
    // the selection survived the round-trip
    await expect(page.getByLabel(`Open project ${TITLE}`)).toBeVisible();
    await expect(page.getByRole("heading", { name: TITLE })).toBeVisible();
  });

  test("another tenant cannot read or mutate the project; A's project stays intact", async ({ request }) => {
    const aList = await request.get("/api/projects", {
      headers: { cookie: `ibismuh_session=${session}` },
    });
    expect(aList.status()).toBe(200);
    // the route returns the bare array — tolerate a { projects: [...] }
    // wrapper too, matching api-client's contract handling
    const aRaw = (await aList.json()) as unknown;
    const aProjects = Array.isArray(aRaw)
      ? (aRaw as Array<{ id: string; title: string }>)
      : ((aRaw as { projects?: Array<{ id: string; title: string }> }).projects ?? []);
    const mine = aProjects.find((p) => p.title === TITLE);
    expect(mine, "A's created project must be listed").toBeTruthy();
    const projectId = mine?.id ?? "";
    expect(projectId, "the listed project carries an id").toBeTruthy();

    const bSession = await register(request, EMAIL_B);
    // B's list never contains A's project
    const bList = await request.get("/api/projects", {
      headers: { cookie: `ibismuh_session=${bSession}` },
    });
    expect(bList.status()).toBe(200);
    const bRaw = (await bList.json()) as unknown;
    const bProjects = Array.isArray(bRaw)
      ? (bRaw as Array<{ id: string; title: string }>)
      : ((bRaw as { projects?: Array<{ id: string; title: string }> }).projects ?? []);
    expect(bProjects.some((p) => p.id === projectId)).toBe(false);

    // direct reads and writes are denied in every direction that matters
    const bGet = await request.get(`/api/projects/${projectId}`, {
      headers: { cookie: `ibismuh_session=${bSession}` },
    });
    expect([403, 404]).toContain(bGet.status());
    const bPatch = await request.patch(`/api/projects/${projectId}`, {
      headers: { cookie: `ibismuh_session=${bSession}`, "Content-Type": "application/json" },
      data: { title: "hijacked" },
    });
    expect([403, 404]).toContain(bPatch.status());
    const bDelete = await request.delete(`/api/projects/${projectId}`, {
      headers: { cookie: `ibismuh_session=${bSession}` },
    });
    // 405 = the route does not implement DELETE at all — also a denial
    expect([403, 404, 405]).toContain(bDelete.status());

    // the survivor check: A's project still exists with its own title
    const aGet = await request.get(`/api/projects/${projectId}`, {
      headers: { cookie: `ibismuh_session=${session}` },
    });
    expect(aGet.status()).toBe(200);
    const aProject = (await aGet.json()) as { project?: { title?: string } };
    expect(aProject.project?.title).toBe(TITLE);
  });
});

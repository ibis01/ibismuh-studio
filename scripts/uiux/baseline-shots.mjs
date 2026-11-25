// Phase 0 baseline screenshots — Ibismuh Studio UI/UX audit.
// Captures the shell states the plan's Gate 0 asks for at the five
// reference resolutions, using the running dev server + the audit session.
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = "http://localhost:3111";
const OUT = "/home/z/my-project/ibismuh-studio/docs/uiux/baseline-screenshots";
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  ["1920x1080", 1920, 1080],
  ["1440x900", 1440, 900],
  ["1366x768", 1366, 768],
  ["1024x768", 1024, 768],
  ["390x844", 390, 844],
];

// view id → hash route (the app's URL law)
const ROUTES = [
  ["dashboard", "#/dashboard"],
  ["library", "#/library"],
  ["create", "#/create"],
  ["director", "#/director"],
  ["storyboard", "#/storyboard"],
  ["canvas", "#/canvas"],
  ["timeline", "#/timeline"],
  ["inspector", "#/inspector"],
  ["cast", "#/cast"],
  ["world", "#/world"],
  ["voice", "#/voice"],
  ["analytics", "#/analytics"],
  ["research", "#/research"],
  ["calendar", "#/calendar"],
  ["channels", "#/channels"],
  ["settings", "#/settings"],
];

const browser = await chromium.launch();

// Full grid at 1920x1080 (the reference pass)
{
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    storageState: undefined,
  });
  const page = await ctx.newPage();
  // seed the session cookie — curl's jar prefixes HttpOnly lines with
  // "#HttpOnly_", so strip that prefix instead of skipping the line
  const cookies = await import("fs").then((fs) =>
    fs
      .readFileSync("/tmp/cookies.txt", "utf8")
      .split("\n")
      .filter((l) => l.includes("localhost") && l.includes("\t"))
      .map((l) => l.replace(/^#HttpOnly_/, "").split("\t"))
  );
  for (const c of cookies) {
    await ctx.addCookies([
      {
        name: c[5],
        value: c[6],
        domain: "localhost",
        path: c[2] || "/",
      },
    ]);
  }
  await page.goto(BASE + "/#/dashboard", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  for (const [name, hash] of ROUTES) {
    await page.evaluate((h) => {
      window.location.hash = h;
    }, hash);
    await page.waitForTimeout(1400);
    await page.screenshot({ path: `${OUT}/1920x1080-${name}.png` });
  }
  // mobile nav sheet open state at 390
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    window.location.hash = "#/dashboard";
  });
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/390x844-mobile-nav.png` });
  await ctx.close();
}

// Key screens at the remaining resolutions
const KEY = [
  ["dashboard", "#/dashboard"],
  ["library", "#/library"],
  ["create", "#/create"],
  ["timeline", "#/timeline"],
  ["settings", "#/settings"],
];
for (const [label, w, h] of VIEWPORTS.slice(1)) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
  });
  const page = await ctx.newPage();
  const fs = await import("fs");
  const cookies = fs
    .readFileSync("/tmp/cookies.txt", "utf8")
    .split("\n")
    .filter((l) => l.includes("localhost") && l.includes("\t"))
    .map((l) => l.replace(/^#HttpOnly_/, "").split("\t"));
  for (const c of cookies) {
    await ctx.addCookies([
      { name: c[5], value: c[6], domain: "localhost", path: c[2] || "/" },
    ]);
  }
  await page.goto(BASE + "/#/dashboard", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  for (const [name, hash] of KEY) {
    await page.evaluate((h) => {
      window.location.hash = h;
    }, hash);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/${label}-${name}.png` });
  }
  await ctx.close();
}

await browser.close();
console.log("done");

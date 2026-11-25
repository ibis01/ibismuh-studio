// AFTER screenshots — the UIUX §5 navigation consolidation.
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = "http://localhost:3111";
const VID = process.argv[2];
const OUT = "/home/z/my-project/ibismuh-studio/docs/uiux/baseline-screenshots";
mkdirSync(OUT, { recursive: true });

const cookies = (await import("fs"))
  .readFileSync("/tmp/cookies.txt", "utf8")
  .split("\n")
  .filter((l) => l.includes("localhost") && l.includes("\t"))
  .map((l) => l.replace(/^#HttpOnly_/, "").split("\t"));

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
});
for (const c of cookies) {
  await ctx.addCookies([
    { name: c[5], value: c[6], domain: "localhost", path: c[2] || "/" },
  ]);
}
const page = await ctx.newPage();
await page.goto(BASE + `/#/storyboard/${VID}`, { waitUntil: "networkidle" });
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT}/1920x1080-after-ws-storyboard.png` });

await page.evaluate((h) => {
  window.location.hash = h;
}, "#/timeline");
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/1920x1080-after-ws-timeline.png` });

// hub pages — strip retired
await page.evaluate((h) => {
  window.location.hash = h;
}, "#/cast");
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/1920x1080-after-cast.png` });

await page.evaluate((h) => {
  window.location.hash = h;
}, "#/analytics");
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/1920x1080-after-analytics.png` });

// legacy deep links normalize
await page.goto(BASE + "/#/assets", { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/1920x1080-after-deeplink-assets.png` });

// mobile workspace timeline
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate((h) => {
  window.location.hash = h;
}, `#/storyboard/${VID}`);
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/390x844-after-ws-storyboard.png` });

await browser.close();
console.log("done");

// Capture the five workspace area pages with the seeded demo project open.
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
await page.goto(BASE + `/#/director/${VID}`, { waitUntil: "networkidle" });
await page.waitForTimeout(6000);

const AREAS = [
  ["director", `#/director/${VID}`],
  ["storyboard", `#/storyboard/${VID}`],
  ["canvas", `#/canvas/${VID}`],
  ["timeline", `#/timeline/${VID}`],
  ["inspector", `#/inspector/${VID}`],
];
for (const [name, hash] of AREAS) {
  await page.evaluate((h) => {
    window.location.hash = h;
  }, hash);
  await page.waitForTimeout(4500);
  await page.screenshot({ path: `${OUT}/1920x1080-ws-${name}.png`, fullPage: false });
}

// laptop reference of the timeline page too
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/1440x900-ws-timeline.png` });

await browser.close();
console.log("done");

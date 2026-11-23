// A3 screenshot harness — captures the surfaces the A3 pass touches:
// dashboard (shell rhythm, header masthead, KPI cards), library (cards),
// create (form controls), a dialog, the command palette, and a select
// dropdown open state. Evidence for the before/after comparison.
//
// Usage: node --import tsx scripts/a3-shots.mts --label <before|after>
// Prereqs: server on :3000 with the seeded harness DB.
import { chromium } from "playwright";
import fs from "fs";

const label = process.argv.includes("--label")
  ? process.argv[process.argv.indexOf("--label") + 1]
  : "shot";
const outDir = `/tmp/a3-shots/${label}`;
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
// Local harness session — minted by scripts/mint-preview-session.mts into
// /tmp/tf-session.txt (the s41 probe's cookie contract: name tf_session).
const token = fs.readFileSync("/tmp/tf-session.txt", "utf8").trim();
await ctx.addCookies([
  { name: "tf_session", value: token, url: "http://localhost:3000" },
]);
const page = await ctx.newPage();

// Local harness: the studio gate is unconfigured → AuthGate passes through.
// NOTE: domcontentloaded, NOT networkidle — the dashboard polls its APIs
// continuously, so the network never goes idle.
await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${outDir}/01-dashboard.png` });

// Library — project cards (tf-card/tf-card-hover, buttons).
await page.click('aside button:has-text("Projects")', { timeout: 8000 });
await page.waitForTimeout(1800);
await page.screenshot({ path: `${outDir}/02-library.png` });

// Create — form controls (tf-control fields + selects).
await page.click('aside button:has-text("New Project")', { timeout: 8000 });
await page.waitForTimeout(1800);
await page.screenshot({ path: `${outDir}/03-create.png` });

// A select dropdown open (tf-pop chrome on the select content).
try {
  await page.click('[data-slot="select-trigger"] >> nth=0', { timeout: 4000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${outDir}/04-select-open.png` });
  await page.keyboard.press("Escape");
} catch {
  console.log("no select on create — skipped 04");
}

// Command palette (Dialog + tf-pop).
await page.keyboard.press("Meta+k");
await page.waitForTimeout(700);
await page.screenshot({ path: `${outDir}/05-palette.png` });
await page.keyboard.press("Escape");

// Voice Studio — pickers + cards.
await page.click('aside button:has-text("Voice Studio")', { timeout: 8000 });
await page.waitForTimeout(1800);
await page.screenshot({ path: `${outDir}/06-voice.png` });

console.log("shots written to", outDir);
await browser.close();

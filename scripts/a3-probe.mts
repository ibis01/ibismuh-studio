// Quick probe: load /, log CSS response codes + console errors + first paint.
import { chromium } from "playwright";
import fs from "fs";

const token = fs.readFileSync("/tmp/tf-session.txt", "utf8").trim();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{ name: "tf_session", value: token, url: "http://localhost:3000" }]);
const page = await ctx.newPage();
page.on("response", (r) => {
  if (r.url().includes(".css") || r.url().includes("_next/static/chunks/main") || r.url().endsWith("/"))
    console.log(r.status(), r.url().slice(0, 100));
});
page.on("console", (m) => {
  if (m.type() === "error") console.log("CONSOLE-ERR:", m.text().slice(0, 160));
});
page.on("pageerror", (e) => console.log("PAGE-ERR:", String(e).slice(0, 160)));
await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(4000);
const title = await page.title();
const bodyText = (await page.locator("body").innerText()).slice(0, 200);
console.log("TITLE:", title);
console.log("BODY:", JSON.stringify(bodyText));
await browser.close();

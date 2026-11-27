#!/usr/bin/env node
// ui-events regression — the rebrand event-name law.
//
// Master plan commit group 1: the residual legacy event names
// `tf-preview-change` (music preview singleton) and `tf-gate` (auth gate
// broadcast) were renamed to the neutral `ibismuh-*` catalog declared in
// src/lib/ibismuh/ui-events.ts. This suite pins that cleanup so the legacy
// class can never silently return:
//
//   1. CATALOG    — every exported event name is the neutral `ibismuh-`
//                   form; no `tf-` prefix anywhere in the catalog.
//   2. SOURCE SCAN — no file under src/ carries the legacy literals;
//                   the four consumers import the constants instead of
//                   string literals (the import IS the regression guard).
//
// Run: npm run test:ui-events   (pure — no DB, no DOM; CI step)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AUTH_GATE_EVENT, MUSIC_PREVIEW_CHANGE_EVENT, UI_EVENT_NAMES } from "../src/lib/ibismuh/ui-events";

let passed = 0;
let failed = 0;
const failures: string[] = [];
let suite = "";

function suiteStart(name: string) {
  suite = name;
  console.log(`\n◆ ${name}`);
}

function ok(cond: unknown, msg?: string) {
  if (cond) return;
  throw new Error(msg ?? `assertion failed in "${suite}"`);
}

function eq(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) return;
  throw new Error(msg ?? `expected ${b}, got ${a} (in "${suite}")`);
}

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    failures.push(`${suite} — ${name}: ${err instanceof Error ? err.message : String(err)}`);
    console.log(`  ✗ ${name}`);
  }
}

// --- 1. CATALOG ------------------------------------------------------------------

suiteStart("event catalog");

await test("the music preview event is the neutral ibismuh form", () => {
  eq(MUSIC_PREVIEW_CHANGE_EVENT, "ibismuh-preview-change");
});

await test("the auth gate event is the neutral ibismuh form", () => {
  eq(AUTH_GATE_EVENT, "ibismuh-gate");
});

await test("no catalog name carries the legacy tf- prefix", () => {
  for (const name of UI_EVENT_NAMES) {
    ok(!name.startsWith("tf-"), `${name} still carries the legacy tf- prefix`);
    ok(name.startsWith("ibismuh-"), `${name} must live in the ibismuh- namespace`);
  }
});

// --- 2. SOURCE SCAN --------------------------------------------------------------

suiteStart("source scan");

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, "..", "src");

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) yield full;
  }
}

await test("no legacy tf-preview-change / tf-gate literal survives under src/", () => {
  const banned = ["tf-preview-change", "tf-gate"];
  const offenders: string[] = [];
  for (const file of walk(srcRoot)) {
    const text = fs.readFileSync(file, "utf8");
    for (const b of banned) {
      if (text.includes(b)) offenders.push(`${path.relative(srcRoot, file)} contains "${b}"`);
    }
  }
  eq(offenders, [], "legacy event literals must be gone");
});

await test("each consumer imports its event constant (no re-scattered literals)", () => {
  const consumers: Array<{ file: string; constant: string }> = [
    { file: "src/components/ibismuh/music-controls.tsx", constant: "MUSIC_PREVIEW_CHANGE_EVENT" },
    { file: "src/components/ibismuh/auth-gate.tsx", constant: "AUTH_GATE_EVENT" },
    { file: "src/components/ibismuh/security-card.tsx", constant: "AUTH_GATE_EVENT" },
    { file: "src/components/ibismuh/app-sidebar.tsx", constant: "AUTH_GATE_EVENT" },
  ];
  for (const { file, constant } of consumers) {
    const text = fs.readFileSync(path.resolve(here, "..", file), "utf8");
    ok(text.includes(`from "@/lib/ibismuh/ui-events"`), `${file} must import from the ui-events catalog`);
    ok(text.includes(constant), `${file} must use ${constant}`);
  }
});

await test("the catalog declares every browser event the components broadcast", () => {
  // Both events stay declared together: removing a name from the catalog
  // while a component still imports it would be a compile error, but a
  // component drifting back to a NEW undeclared literal would not be —
  // so scan for any remaining window/document event literals that are not
  // DOM-standard, and require them to live in the catalog.
  const known = new Set<string>(UI_EVENT_NAMES);
  for (const file of walk(path.join(srcRoot, "components"))) {
    const text = fs.readFileSync(file, "utf8");
    const literals = [...text.matchAll(/(?:addEventListener|dispatchEvent)\(\s*(?:new\s+(?:Custom)?Event\(\s*)?["']([a-z][a-z0-9:-]+)["']/g)].map((m) => m[1]);
    for (const name of literals) {
      const isDomStandard =
        [
          "error", "ended", "load", "keydown", "change", "wheel", "scroll",
          "resize", "pointerup", "pointerdown", "click", "input", "submit",
          "focus", "blur", "play", "pause", "timeupdate", "mouseup",
          "mousedown", "mousemove", "touchstart", "touchend", "dragstart",
          "dragend", "dragover", "drop", "contextmenu", "animationend",
          "transitionend", "visibilitychange", "message", "beforeunload",
          "beforeinstallprompt", "appinstalled", "pointermove", "pointercancel",
        ].includes(name);
      if (!isDomStandard && !known.has(name)) {
        throw new Error(
          `${path.relative(srcRoot, file)} uses undeclared browser event "${name}" — declare it in src/lib/ibismuh/ui-events.ts`,
        );
      }
    }
  }
});

// --- the seek-slider keyboard law (G3 / briefing PART 2.3) ----------------------

await test("the studio timeline seek slider owns its full keyboard set", () => {
  // The /studio timeline-strip seek surface is a role="slider" with tabIndex;
  // its keyboard law: ArrowLeft/ArrowRight step ±500 ms, Home/End jump to the
  // edges, and every handled key is consumed via preventDefault so the
  // overflow-x scroll container never double-acts on the same keypress.
  const file = path.resolve(here, "..", "src/components/studio/timeline-strip.tsx");
  const text = fs.readFileSync(file, "utf8");
  ok(text.includes('role="slider"'), "seek surface must declare role=slider");
  ok(/tabIndex=\{0\}/.test(text), "seek surface must be keyboard-focusable (tabIndex)");
  ok(text.includes("aria-valuemin") && text.includes("aria-valuemax") && text.includes("aria-valuenow"),
    "slider must carry the value triple");
  for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"]) {
    ok(text.includes(`"${key}"`), `onKeyDown must handle ${key}`);
  }
  ok(text.includes("e.preventDefault()"), "handled keys must be consumed (preventDefault) before seeking");
  ok(/if \(e\.key === "Home"\)\s*requestSeek\(0\)/.test(text), "Home must seek to the timeline start");
  ok(/if \(e\.key === "End"\)\s*requestSeek\(total\)/.test(text), "End must seek to the timeline end");
  // The scroll container keeps pointer/touch seek intact.
  ok(text.includes("onPointerDown") && text.includes("onPointerMove"), "pointer seek must remain declared");
});

// --- teardown -------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed${failures.length ? ":" : ""}`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exit(failed > 0 ? 1 : 0);

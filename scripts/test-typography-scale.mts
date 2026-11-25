#!/usr/bin/env node
// typography-scale regression — the 12px floor law (premium studio UX).
//
// The studio's typography census found 714 sub-12px arbitrary font-size
// utilities (text-[9px] / text-[10px] / text-[11px] and fractional
// variants) scattered across the UI — metadata text shrunk below the
// smallest size the design system ships (text-xs = 12px). The scale
// cleanup replaced every one of them with text-xs. This suite pins that
// cleanup so the shrink can never silently return:
//
//   1. SOURCE SCAN — no file under src/ declares an arbitrary font-size
//      utility below 12px. The banned class of utilities is the literal
//      pattern text-[(9|10|11)(.N)?px] — text-xs / text-sm / text-[12px]
//      and every size above remain legal.
//   2. SCOPE — UI metadata only. Burned-in video overlay text is a
//      different medium (proportional-to-frame sizing per the BBC
//      subtitle guideline), and slides lane display type is intentionally
//      huge (headlineFontPx); neither carries Tailwind UI classes, so
//      they are out of scope here by construction.
//
// Run: npm run test:typography-scale   (pure — no DB, no DOM; CI step)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

/** Any arbitrary font-size utility strictly below 12px. */
const BANNED = /text-\[(?:9|10|11)(?:\.\d+)?px\]/;

const offenders: string[] = [];
let scanned = 0;

function walk(dir: string) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(p);
      continue;
    }
    if (!entry.name.endsWith(".tsx") && !entry.name.endsWith(".ts")) continue;
    scanned += 1;
    const lines = fs.readFileSync(p, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (BANNED.test(line)) offenders.push(`${path.relative(ROOT, p)}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
}

walk(ROOT);

if (offenders.length > 0) {
  console.error(`typography-scale: FAIL — ${offenders.length} sub-12px font-size utility(ies) under src/ (scanned ${scanned} files)`);
  for (const o of offenders.slice(0, 40)) console.error(`  ${o}`);
  if (offenders.length > 40) console.error(`  … and ${offenders.length - 40} more`);
  process.exit(1);
}

console.log(`typography-scale: PASS — 0 sub-12px utilities across ${scanned} scanned files (12px floor holds)`);

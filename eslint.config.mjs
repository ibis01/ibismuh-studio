import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // TypeScript rules — 2026-11-23 hardening (Phase 9): the warning count
    // was driven to ZERO (the 19 production-harness anys in scripts/ were
    // typed; src/ was already clean). The rule stays "warn" as the GLOBAL
    // floor, is promoted to "error" for src/** below (product code cannot
    // grow the class back), and scripts/lint-budget.mjs pins the total
    // warning count so CI fails on ANY growth.
    "@typescript-eslint/no-explicit-any": "warn",
    // S56/T-56.6: the trivial tranche is at ZERO (72+3+5 sites burned down,
    // 2026-11-08) — promoted to "error" so the class cannot grow back.
    // Underscore-prefixed names stay allowed (argsIgnorePattern/
    // varsIgnorePattern); catch params should use optional catch binding.
    "@typescript-eslint/no-unused-vars": [
      "error",
      { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_", "caughtErrors": "none" },
    ],
    // S58/T-58.3 — the non-null-assertion freeze: 159 `!` sites burned down
    // (2026-11-08; 43 src/ + 116 scripts/), each replaced by a guard, a
    // restructure, providerMetaRequired/must()/req(), or narrowing the
    // compiler can see. Promoted to "error" — the class cannot grow back
    // without failing CI. No carve-outs: tests get req(), not exemptions.
    "@typescript-eslint/no-non-null-assertion": "error",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/prefer-as-const": "off",
    "@typescript-eslint/no-unused-disable-directive": "off",
    "prefer-const": "error", // S56/T-56.6 — frozen at zero
    "no-useless-escape": "error", // S56/T-56.6 — frozen at zero

    // React rules
    // S59 — both react-hooks correctness classes frozen at error, no
    // carve-outs: set-state-in-effect 33→0 and exhaustive-deps 9→0. The one
    // reasoned inline disable (video-detail-dialog's fetch battery, whose
    // deps would otherwise storm on an unstable inline prop) is disclosed
    // in the S59 reliability record.
    "react-hooks/exhaustive-deps": "error",
    "react-hooks/set-state-in-effect": "error",
    "react-hooks/purity": "off",
    "react/no-unescaped-entities": "off",
    "react/display-name": "off",
    "react/prop-types": "off",
    "react-compiler/react-compiler": "off",

    // Next.js rules
    // <img> is deliberate here: all media streams from same-origin /api/...
    // routes (thumbnails, scene art, video), so next/image adds nothing.
    "@next/next/no-img-element": "off",
    "@next/next/no-html-link-for-pages": "off",

    // General JavaScript rules
    // (prefer-const and no-useless-escape stay at "error" from the
    // T-56.6 freeze above — the duplicate "warn" keys that used to sit
    // here silently overrode them, JS-object-literal last-key-wins. Found
    // and deduped by S58/T-58.3; the freeze is real again.)
    "no-unused-vars": "off", // superseded by @typescript-eslint/no-unused-vars
    // S57/T-57.3 — the structured-logger freeze: src/ (the running app) has
    // NO console sites left; every line goes through log.ts (pino-format
    // JSON with request ids). Promoted to a bare error (no allow list) — the class
    // cannot grow back without failing CI. The owned exceptions carry
    // inline eslint-disable comments with their reasons (log.ts's portable
    // fallback sink, email.ts's console delivery channel, pwa.tsx's client
    // line, instrumentation.ts's last-resort boot line). scripts/ and e2e/
    // are scoped OFF below — they are operator-facing CLI harnesses where
    // readable console output IS the interface.
    "no-console": "error",
    "no-debugger": "warn",
    "no-empty": "off",
    "no-irregular-whitespace": "off",
    "no-case-declarations": "off",
    "no-fallthrough": "off",
    "no-mixed-spaces-and-tabs": "off",
    "no-redeclare": "off",
    "no-undef": "off", // TS handles undefined globals
    "no-unreachable": "warn",
  },
}, {
  // Phase 9 — product code carries zero explicit anys (verified 2026-11-23;
  // the two remaining mentions in tenant-db.ts are scoped disable/enable
  // pairs around the Prisma adapter, justified in place). The rule is now
  // an ERROR for src/** — the class cannot grow back silently.
  files: ["src/**/*.{ts,tsx}"],
  rules: {
    "@typescript-eslint/no-explicit-any": "error",
  },
}, {
  // Stage 2 multi-tenant guard: route handlers must go through the tenant-
  // scoped client (src/lib/ibismuh/tenant-db.ts). A raw @/lib/db import in
  // src/app would silently BYPASS the organizationId filter — this rule makes
  // that a lint error instead of a cross-tenant hole.
  //
  // 2026-11-23 hardening (Phase 6): the raw client is now reachable ONLY
  // through the documented gateway modules (src/lib/ibismuh/raw-db/*) —
  // auth-bootstrap, queue-recovery, billing, system — each carrying its
  // auditable inventory. Routes and ordinary lib modules must use the
  // tenant-scoped client or the gateways.
  files: ["src/app/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [
        {
          group: ["@/lib/db", "@/lib/db*"],
          message: "Routes must use the tenant-scoped client: import { db } from \"@/lib/ibismuh/tenant-db\" (raw @/lib/db bypasses the organizationId guard).",
        },
        {
          group: ["@/lib/ibismuh/tenant-db"],
          importNames: ["rawDatabase"],
          message: "The raw client is confined to the documented gateways: import { rawDatabase } from \"@/lib/ibismuh/raw-db/auth-bootstrap\" (auth routes) or \"@/lib/ibismuh/raw-db/system\" (account/youtube surfaces) — each gateway carries the auditable inventory.",
        },
      ],
    }],
  },
}, {
  // Phase 6, the lib-side wall: inside src/lib/ibismuh, the raw client may
  // only be imported by tenant-db.ts itself (the definition) and the
  // raw-db/* gateway modules. Every other module uses the tenant-scoped
  // client or a gateway — the rule IS the reviewable inventory.
  files: ["src/lib/ibismuh/**/*.ts"],
  ignores: ["src/lib/ibismuh/tenant-db.ts", "src/lib/ibismuh/raw-db/**"],
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [
        {
          group: ["@/lib/db", "@/lib/db*", "./db", "../db"],
          message: "Use the tenant-scoped client (./tenant-db) or a raw-db/* gateway — direct raw imports are confined to tenant-db.ts and the gateways.",
        },
        {
          group: ["./tenant-db", "../tenant-db", "@/lib/ibismuh/tenant-db"],
          importNames: ["rawDatabase"],
          message: "Import rawDatabase from its category gateway (./raw-db/auth-bootstrap | ./raw-db/queue-recovery | ./raw-db/billing | ./raw-db/system) — the gateway file documents why raw access is legitimate there.",
        },
      ],
    }],
  },
}, {
  // S57/T-57.3 — the CLI harness scope: scripts/ and e2e/ are operator-
  // facing tools (probes, suites, workers, evidence harnesses). Their
  // console output is the human interface, not app observability — JSON
  // lines there would bury the operator. The structured-logger law governs
  // src/ only; harnesses that want structure import log.ts themselves.
  files: ["scripts/**/*.{js,mjs,mts,ts}", "e2e/**/*.ts"],
  rules: {
    "no-console": "off",
  },
}, {
  // pack/ is a packaging artifact mirror; scripts/*.cjs are standalone ops
  // scripts executed directly with node (CommonJS by design, not app code).
  // contrib/ is archived reference engineering (S66) — deliberately outside
  // the product's lint surface, same contract as examples/.
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills", "pack/**", "scripts/**/*.cjs", "contrib/**"]
}];

export default eslintConfig;

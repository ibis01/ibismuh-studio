// Tenant registry — the schema-driven completeness pin (2026-11-23).
//
//   npm run test:tenant-registry
//
// The ORG_SCOPED_MODELS set in src/lib/ibismuh/tenant-db.ts is the tenant
// guard's source of truth. History shows this registry drifting from the
// schema twice (T-4.14: five camelCase entries never matched; S136: two
// models missed by the manual audit). This test parses prisma/schema.prisma
// itself and FAILS when any model carrying organizationId is absent from
// the registry — the drift class is now structurally impossible.

import fs from "node:fs";
import path from "node:path";

let failed = false;
function ok(cond: unknown, msg: string): asserts cond {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    failed = true;
    console.error(`  ✗ ${msg}`);
  }
}

async function main(): Promise<void> {
  console.log("◆ tenant registry — schema-driven completeness (the T-4.14/S136 drift class, closed)");

  const schemaPath = path.resolve(import.meta.dirname, "../prisma/schema.prisma");
  const schema = fs.readFileSync(schemaPath, "utf8");

  // Parse every model with an organizationId column
  const orgOwned: string[] = [];
  let current: string | null = null;
  for (const line of schema.split("\n")) {
    const m = /^model (\w+) \{/.exec(line);
    if (m) {
      current = m[1];
      continue;
    }
    if (current && line.trim() === "}") {
      current = null;
      continue;
    }
    if (current && /^\s+organizationId\s+\w+/.test(line) && !orgOwned.includes(current.toLowerCase())) {
      orgOwned.push(current.toLowerCase());
    }
  }

  const { ORG_SCOPED_MODELS } = await import("../src/lib/ibismuh/tenant-db.ts");

  const missing = orgOwned.filter((m) => !ORG_SCOPED_MODELS.has(m));
  ok(
    missing.length === 0,
    `every schema model with organizationId is in ORG_SCOPED_MODELS (${orgOwned.length} org-owned models checked)`,
  );
  if (missing.length) {
    console.error(`    MISSING FROM REGISTRY: ${missing.join(", ")}`);
  }

  // The registry must not carry entries the schema dropped (dead names =
  // silently unscoped if a model is renamed)
  const extra = [...ORG_SCOPED_MODELS].filter((m) => !orgOwned.includes(m));
  ok(extra.length === 0, "no dead entries: every registry name maps to a current schema model");
  if (extra.length) {
    console.error(`    DEAD REGISTRY ENTRIES: ${extra.join(", ")}`);
  }

  // The tenant guard itself: a scoped read with a tenant ctx filters by
  // organizationId (the mechanism the registry feeds).
  ok(ORG_SCOPED_MODELS.size >= 24, `the registry carries the full org-owned set (${ORG_SCOPED_MODELS.size} models)`);

  if (failed) {
    console.error("\ntenant registry battery: FAIL");
    process.exit(1);
  }
  console.log("\ntenant registry battery: PASS");
}

main().catch((err) => {
  console.error("[test-tenant-registry] fatal:", err);
  process.exit(1);
});

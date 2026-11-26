// catalog/manifest.ts — the BUILTIN manifest builder: one CatalogAssetMeta
// row for EVERY whiteboard ASSETS entry and EVERY graphics icon (the audit's
// coverage law — an unregistered library asset is a defect, so the builder
// derives rows mechanically and the contract suite pins the counts).
//
// Derivation rules (deterministic, no per-asset wiring to drift):
//   · category   — whiteboard: the asset's LEAD tag (the author's primary
//                  domain). graphics: a domain scan over the icon's tags
//                  against the audit's 16 production domains, first hit
//                  wins, "status" is the guaranteed catch-all bucket.
//   · complexity — 1..5 from the drawable stroke count (the drawing-cost
//                  rating the budget planner consults).
//   · concepts   — the library's own tags (+ whiteboard alts): the SAME
//                  vocabulary the W2 mention matcher and the graphics
//                  keyword picks match on. ONE vocabulary, two lanes.
//   · a11y       — the authored description when present; otherwise a
//                  neutral tag-derived line (declared, not invented).
//   · provenance — "hand-authored" (v1 built-ins carry no traced rows; a
//                  traced upload would declare "traced" via its tag).
//   · license    — LicenseRef-Ibismuh-Original (the repo's own art),
//                  attribution + approved: true (the review gate's receipt).
//   · publish state / ownership — "published", global (ownerTenantId null):
//                  the built-ins ship to every tenant.
//
// Pure + deterministic: same libraries → the same manifest, byte for byte.

import { ASSETS, type WhiteboardAsset } from "../whiteboard/assets";
import {
  assertCompoundRegistry,
  WB_COMPOUNDS,
  type WhiteboardCompoundSpec,
} from "../whiteboard/compounds";
import { GRAPHICS_ICON_LIBRARY } from "../graphics/planner";
import {
  buildCatalogManifest,
  compoundContentHash,
  graphicsContentHash,
  whiteboardContentHash,
  type CatalogAssetMeta,
  type CatalogCompositionPart,
  type CatalogManifest,
} from "./contracts";

// ---------------------------------------------------------------------------
// Category derivation
// ---------------------------------------------------------------------------

/** The audit's 16 production domains for the graphics vocabulary, ordered
 *  general-first. An icon's category is the FIRST domain whose keywords
 *  intersect its tags; the final entry carries no keywords — it ALWAYS
 *  matches, so coverage is total by construction. */
const GRAPHICS_DOMAIN_RULES: { category: string; keywords: string[] }[] = [
  { category: "people", keywords: ["person", "people", "team", "crowd", "farmer", "doctor", "worker", "teacher", "speaker", "handshake", "waving", "runner", "thumbs-up", "user", "human", "individual", "audience", "staff"] },
  { category: "education", keywords: ["book", "reading", "graduation", "pencil", "notebook", "backpack", "microscope", "flask", "atom", "calculator", "blackboard", "diploma", "study", "learn", "school", "research", "science", "knowledge"] },
  { category: "agriculture", keywords: ["seedling", "plant", "wheat", "tractor", "cow", "chicken", "greenhouse", "farm", "crop", "harvest", "livestock", "rural", "poultry", "grain"] },
  { category: "tools", keywords: ["wrench", "hammer", "screwdriver", "tool", "fix", "repair", "maintenance", "build", "construction"] },
  { category: "technology", keywords: ["robot", "chip", "laptop", "code", "database", "server", "cloud", "wifi", "signal", "battery", "plug", "terminal", "automation", "hardware", "programming", "ai"] },
  { category: "healthcare", keywords: ["heart", "stethoscope", "pill", "hospital", "bandage", "syringe", "dna", "brain", "tooth", "eye", "thermometer", "medical", "health", "doctor", "medicine"] },
  { category: "business", keywords: ["briefcase", "office", "contract", "meeting", "deal", "career", "corporate", "work"] },
  { category: "finance", keywords: ["chart-up", "chart-down", "coins", "wallet", "bank", "invoice", "dollar", "piggy-bank", "money", "payment", "budget", "savings", "revenue"] },
  { category: "engineering", keywords: ["blueprint", "ruler", "crane", "factory", "pipeline", "robot-arm", "bridge", "measure", "gear", "machine"] },
  { category: "communication", keywords: ["chat", "mail", "megaphone", "phone", "share", "link", "at-sign", "question", "info", "bell", "message", "email", "announce", "notification"] },
  { category: "cybersecurity", keywords: ["lock", "unlock", "shield", "key", "fingerprint", "bug", "eye-scan", "security", "protected", "password"] },
  { category: "environment", keywords: ["recycle", "earth", "mountain", "forest", "wind", "solar", "wind-turbine", "trash", "nature", "eco", "sustainable", "leaf", "tree"] },
  { category: "transport", keywords: ["car", "truck", "bus", "bicycle", "airplane", "train", "ship", "rocket", "vehicle", "travel", "delivery", "flight"] },
  { category: "buildings", keywords: ["house", "store", "warehouse", "tower", "farm-house", "school-building", "home", "building", "property"] },
  { category: "devices", keywords: ["smartphone", "tablet", "monitor", "tv", "watch", "headphones", "microphone", "printer", "camera", "device", "screen"] },
  { category: "status", keywords: [] }, // the guaranteed catch-all
];

function graphicsCategory(tags: string[]): string {
  const set = new Set(tags);
  for (const rule of GRAPHICS_DOMAIN_RULES) {
    if (rule.keywords.length === 0) return rule.category; // catch-all
    if (rule.keywords.some((k) => set.has(k))) return rule.category;
  }
  return "status"; // unreachable — the catch-all guarantees coverage
}

// ---------------------------------------------------------------------------
// Complexity derivation (1..5 from the drawable stroke count)
// ---------------------------------------------------------------------------

function complexityBucket(strokeCount: number): number {
  if (strokeCount <= 3) return 1;
  if (strokeCount <= 6) return 2;
  if (strokeCount <= 10) return 3;
  if (strokeCount <= 16) return 4;
  return 5;
}

function countWhiteboardStrokes(svg: string): number {
  return (svg.match(/<path\b/g) ?? []).length;
}

// ---------------------------------------------------------------------------
// Row builders
// ---------------------------------------------------------------------------

const BUILTIN_LICENSE = {
  spdx: "LicenseRef-Ibismuh-Original",
  attribution: "Ibismuh Studio built-in library",
  approved: true,
} as const;

const BUILTIN_VERSION = "1.0.0";
const BUILTIN_STYLE_FAMILY = "classic";

export function whiteboardCatalogRows(assets: readonly WhiteboardAsset[]): CatalogAssetMeta[] {
  return assets.map((a) => ({
    id: a.id,
    lane: "whiteboard" as const,
    version: BUILTIN_VERSION,
    contentHash: whiteboardContentHash({
      id: a.id,
      svg: a.svg,
      viewBox: { w: a.viewBox.w, h: a.viewBox.h },
      tags: [...a.tags],
      ...(a.role !== undefined ? { role: a.role } : {}),
      ...(a.alts !== undefined ? { alts: [...a.alts] } : {}),
      ...(a.textMode !== undefined ? { textMode: a.textMode } : {}),
    }),
    category: a.tags[0] ?? "generic",
    ...(a.tags[1] !== undefined ? { subcategory: a.tags[1] } : {}),
    aliases: [...(a.alts ?? [])],
    concepts: [...a.tags, ...(a.alts ?? [])],
    subjectPacks: [],
    styleFamily: BUILTIN_STYLE_FAMILY,
    complexity: complexityBucket(countWhiteboardStrokes(a.svg)),
    a11y: a.a11y ?? `Hand-drawn ${[...a.tags].join(", ")} illustration.`,
    license: { ...BUILTIN_LICENSE },
    provenance: a.tags.includes("traced") ? ("traced" as const) : ("hand-authored" as const),
    publishState: "published" as const,
    ownerTenantId: null,
  }));
}

export function graphicsCatalogRows(
  library: Readonly<Record<string, { paths: string[]; tags: string[] }>>
): CatalogAssetMeta[] {
  return Object.entries(library).map(([id, icon]) => ({
    id,
    lane: "graphics" as const,
    version: BUILTIN_VERSION,
    contentHash: graphicsContentHash({ id, paths: [...icon.paths], tags: [...icon.tags] }),
    category: graphicsCategory(icon.tags),
    ...(icon.tags[1] !== undefined ? { subcategory: icon.tags[1] } : {}),
    aliases: [],
    concepts: [...icon.tags],
    subjectPacks: [],
    styleFamily: BUILTIN_STYLE_FAMILY,
    complexity: complexityBucket(icon.paths.length),
    a11y: `Line icon: ${[...icon.tags].join(", ")}.`,
    license: { ...BUILTIN_LICENSE },
    provenance: "hand-authored" as const,
    publishState: "published" as const,
    ownerTenantId: null,
  }));
}

// ---------------------------------------------------------------------------
// Compound rows (Phase B slice 3 — the composition graph)
// ---------------------------------------------------------------------------

/** The catalog rows for the compound registry: a compound's content IS its
 *  graph (no own svg — the expansion law lives at the planner seam), so the
 *  row carries the composition spec and hashes it. Category "composition",
 *  concepts from the spec's tags + aliases (the search vocabulary),
 *  complexity from the part count (a composition is dense by definition). */
export function compoundCatalogRows(specs: readonly WhiteboardCompoundSpec[]): CatalogAssetMeta[] {
  return specs.map((spec) => {
    const parts: CatalogCompositionPart[] = spec.parts.map((p) => ({
      assetId: p.assetId,
      dx: p.dx,
      dy: p.dy,
      ...(p.scale !== undefined ? { scale: p.scale } : {}),
    }));
    return {
      id: spec.id,
      lane: "whiteboard" as const,
      version: BUILTIN_VERSION,
      contentHash: compoundContentHash({ id: spec.id, tags: [...spec.tags], parts }),
      category: "composition",
      aliases: [...spec.aliases],
      concepts: [...spec.tags, ...spec.aliases],
      subjectPacks: [],
      styleFamily: BUILTIN_STYLE_FAMILY,
      complexity: spec.parts.length >= 5 ? 5 : spec.parts.length >= 3 ? 4 : 3,
      a11y: spec.a11y,
      license: { ...BUILTIN_LICENSE },
      provenance: "hand-authored" as const,
      publishState: "published" as const,
      ownerTenantId: null,
      composition: { parts },
    };
  });
}

// ---------------------------------------------------------------------------
// The builtin manifest (memoized — the build is pure, the memo is safe)
// ---------------------------------------------------------------------------

let memo: CatalogManifest | null = null;

/** The builtin manifest over BOTH lanes: every whiteboard asset + the
 *  compound composition rows + every graphics icon, canonically sorted,
 *  content-hashed, fingerprinted. The registry self-check rides the build —
 *  a defective graph refuses the manifest (fail-closed by construction). */
export function builtinCatalogManifest(): CatalogManifest {
  if (memo === null) {
    assertCompoundRegistry(WB_COMPOUNDS, new Set(ASSETS.map((a) => a.id)));
    memo = buildCatalogManifest({
      assets: [...whiteboardCatalogRows(ASSETS), ...compoundCatalogRows(WB_COMPOUNDS), ...graphicsCatalogRows(GRAPHICS_ICON_LIBRARY)],
    });
  }
  return memo;
}

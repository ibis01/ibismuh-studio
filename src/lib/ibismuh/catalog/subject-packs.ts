// subject-packs.ts — the CURATED SUBJECT PACK REGISTRY (master plan
// Phase 5: "library coverage packs + provenance QA").
//
// The catalog's search/filter machinery already spoke `subjectPacks`
// (CatalogAssetMeta + the subjectPack query filter) — but every row was
// stamped `[]`: machinery without data. This module is the one registry
// that gives the dimension its data: a CLOSED vocabulary of subject packs,
// each with a DECLARED membership rule over the row's own metadata
// (category + concepts). Rows never author their packs by hand — the
// packs DERIVE mechanically from the registry, so the manifest stays
// deterministic and the tamper fingerprint keeps covering them.
//
// Laws (pinned by scripts/test-catalog.mts):
//   · CLOSED   — a row's subjectPacks can only name packs from this
//                registry (no invented ids anywhere in the manifest).
//   · COVERED  — every pack in the registry actually matches rows (no
//                dead packs — a pack nobody belongs to is a lie).
//   · DETERMINISTIC — the derivation is a pure function of the row:
//                same row in, same packs out, registry order preserved.
//   · HONEST   — the search engine's subjectPack filter returns exactly
//                the rows the registry derives (the filter is not a
//                second, divergent implementation).
//
// Pure and deterministic: no fs, no clock, no randomness, no node imports
// (the manifest build and the browser share this module).

/** The closed pack vocabulary (the ids the search filter accepts). */
export const SUBJECT_PACK_IDS = [
  "agriculture",
  "education",
  "business-finance",
  "health",
  "technology",
  "nature-weather",
  "travel-food",
  "sports-music",
  "everyday",
] as const;
export type SubjectPackId = (typeof SUBJECT_PACK_IDS)[number];

export interface SubjectPackDecl {
  id: SubjectPackId;
  /** Human label (the browser's pack filter). */
  label: string;
  /** One-line intent — what belongs here and why. */
  description: string;
  /** The row joins when its category is one of these (exact). */
  categories: readonly string[];
  /** …OR when any of its concepts is one of these (exact). Concepts are
   *  the row's tags + aliases — the same vocabulary the semantic layer
   *  matches on, so a compound like smart-farm-system rides the
   *  agriculture pack through its own declared tags. */
  concepts: readonly string[];
}

export const SUBJECT_PACKS: readonly SubjectPackDecl[] = [
  {
    id: "agriculture",
    label: "Agriculture",
    description: "Farming, crops, irrigation and the land at work — the S-PAK home ground.",
    categories: ["agriculture"],
    concepts: ["farm", "agriculture", "crop", "harvest", "irrigation", "barn", "tractor"],
  },
  {
    id: "education",
    label: "Education",
    description: "Schools, classrooms, study and teaching.",
    categories: ["education"],
    concepts: ["school", "classroom", "learning", "study", "book", "teaching", "graduation"],
  },
  {
    id: "business-finance",
    label: "Business & finance",
    description: "Meetings, money, growth curves and the ledger.",
    categories: ["business", "finance", "money"],
    concepts: ["finance", "money", "growth", "payment", "budget", "startup", "meeting", "coin"],
  },
  {
    id: "health",
    label: "Health",
    description: "Care, medicine and wellness.",
    categories: ["health", "healthcare"],
    concepts: ["health", "medical", "doctor", "wellness", "care", "hospital"],
  },
  {
    id: "technology",
    label: "Technology",
    description: "Devices, software, cloud and security.",
    categories: ["technology", "devices", "cybersecurity", "engineering"],
    concepts: ["technology", "computer", "software", "ai", "cloud", "security", "device", "code"],
  },
  {
    id: "nature-weather",
    label: "Nature & weather",
    description: "Plants, climate, sky and the living world.",
    categories: ["nature", "weather", "environment"],
    concepts: ["nature", "weather", "climate", "environment", "plant", "tree", "water", "sun", "rain"],
  },
  {
    id: "travel-food",
    label: "Travel & food",
    description: "Journeys, transport and the meal.",
    categories: ["travel", "food", "transport"],
    concepts: ["travel", "food", "transport", "trip", "restaurant", "vehicle", "journey"],
  },
  {
    id: "sports-music",
    label: "Sports & music",
    description: "The game and the song.",
    categories: ["sports", "music"],
    concepts: ["sport", "music", "game", "exercise", "song", "concert", "ball"],
  },
  {
    id: "everyday",
    label: "Everyday",
    description: "Generic life, people, communication and ideas — the every-topic safety net.",
    categories: ["generic", "art", "idea", "world", "people", "communication", "time", "calendar"],
    concepts: ["everyday", "home", "family", "communication", "mail", "phone", "idea", "world", "clock", "calendar"],
  },
];

/** Resolve a pack id — unknown → null (the tolerant READ; the search
 *  filter's caller can refuse with its own voice). */
export function resolveSubjectPack(id: string): SubjectPackId | null {
  return (SUBJECT_PACK_IDS as readonly string[]).includes(id) ? (id as SubjectPackId) : null;
}

/** The packs one catalog row belongs to, in REGISTRY ORDER (the
 *  derivation is deterministic — the manifest's fingerprint keeps
 *  covering the result). A row's category matches the pack's category
 *  list exactly, or any of its concepts matches the pack's concept
 *  list exactly. */
export function packsForRow(row: {
  category: string;
  concepts: readonly string[];
}): SubjectPackId[] {
  const out: SubjectPackId[] = [];
  for (const pack of SUBJECT_PACKS) {
    const join =
      pack.categories.includes(row.category) ||
      row.concepts.some((c) => pack.concepts.includes(c));
    if (join) out.push(pack.id);
  }
  return out;
}

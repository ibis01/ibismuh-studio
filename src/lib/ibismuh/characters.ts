// Character (Cast) AI services — character bible via GLM, reference portraits via
// CogView, and identity-consistent pose sheets via image-to-image editing.
// The `identityAnchor` is the canonical visual description reused verbatim in
// every future generation so the character stays recognizable across scenes.

import type { Character } from "@prisma/client";
import { POSES, ART_STYLES } from "./types";
import { db } from "./tenant-db";
import { parseJsonLoose } from "./ai";
import { aiCall } from "./budget";
import { characterJobSnapshot, lastJobError } from "./jobs";
import { chatComplete } from "./providers/chat";
import { imageEdit, imageGenerate, imageEditSupported } from "./providers/image";
import { getCapability } from "./providers/settings";
import { voiceCatalog } from "./providers/tts";
import { parseReferenceKeys, CHARACTER_REFERENCE_CAP } from "./references";
import * as storage from "./storage";
import {
  RIG_MOUTH_LEGACY_SLOTS,
  RIG_MOUTH_NEW_SLOTS,
  scaffoldRigDoc,
  validateRigDoc,
  validateRigParts,
  writeRigDoc,
  writeRigParts,
} from "./characters/rig2d";

// Character assets live under the characters/<id>/ prefix in object storage
// (same layout the raw-fs era used under uploads/ — zero data migration).
// Stage 4a, T-4.0: every read/write/list/delete goes through the storage
// seam so portraits survive a web/worker split and work under the s3 driver.
const characterKey = (characterId: string, file: string) =>
  `characters/${characterId}/${file}`;

/** T-4.9 — the ≤4 newest videos casting a character (the "Cast in" section
 *  of the Character Studio). Scoped by the character's OWN organizationId so
 *  the helper stays correct under any calling context. */
export async function recentVideosFor(
  characterId: string,
  organizationId: string
): Promise<import("./types").CharacterDTO["recentVideos"]> {
  const rows = await db.video.findMany({
    where: { characterId, organizationId },
    orderBy: { updatedAt: "desc" },
    take: 4,
    select: { id: true, title: true, status: true, hasThumbnail: true },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status as import("./types").CharacterDTO["recentVideos"][number]["status"],
    hasThumbnail: r.hasThumbnail,
  }));
}

/** Shape a Prisma character row (with optional video count) into the API DTO.
 *  `recentVideos` defaults to [] — single-character callers pass the
 *  recentVideosFor() result; the list route computes them in one grouped
 *  query instead. */
export async function serializeCharacter(
  c: Character,
  videoCount = 0,
  recentVideos: import("./types").CharacterDTO["recentVideos"] = []
): Promise<import("./types").CharacterDTO> {
  const poseIds = new Set(await listPoses(c.id));
  return {
    id: c.id,
    name: c.name,
    role: c.role,
    personality: c.personality,
    appearance: c.appearance,
    identityAnchor: c.identityAnchor,
    voice: c.voice,
    artStyle: c.artStyle,
    hasPortrait: c.hasPortrait,
    hasRig: Boolean(c.rigDoc),
    videoCount,
    poseCount: poseIds.size,
    portraitUrl: c.hasPortrait ? `/api/characters/${c.id}/portrait` : null,
    poseUrls: POSES.filter((p) => poseIds.has(p.id)).map((p) => ({
      pose: p.id,
      label: p.label,
      url: `/api/characters/${c.id}/poses/${p.id}`,
    })),
    // S51 — the reference-photo library (user uploads; the portrait derives
    // from the newest when present, the continuity check reads up to three).
    referenceCount: parseReferenceKeys(c.referenceImages).length,
    referenceUrls: parseReferenceKeys(c.referenceImages).map(
      (k) => `/api/characters/${c.id}/references/${k.split("/").pop()}`
    ),
    generating: characterJobSnapshot(c.id),
    error: lastJobError(c.id, "portrait") ?? lastJobError(c.id, "poses"),
    recentVideos,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export async function portraitExists(characterId: string): Promise<boolean> {
  return storage.exists(characterKey(characterId, "portrait.png"));
}

export async function readPortrait(characterId: string): Promise<Buffer | null> {
  try {
    return await storage.get(characterKey(characterId, "portrait.png"));
  } catch {
    return null;
  }
}

export async function readPose(
  characterId: string,
  pose: string
): Promise<Buffer | null> {
  if (!POSES.some((p) => p.id === pose)) return null;
  try {
    return await storage.get(characterKey(characterId, `pose-${pose}.png`));
  } catch {
    return null;
  }
}

export async function listPoses(characterId: string): Promise<string[]> {
  const keys = await storage.list(`characters/${characterId}`);
  return keys
    .map((k) => k.split("/").pop() ?? "")
    .filter((f) => /^pose-[\w-]+\.png$/.test(f))
    .map((f) => f.slice("pose-".length, -".png".length));
}

export async function deleteCharacterFiles(characterId: string): Promise<void> {
  await storage.removePrefix(`characters/${characterId}`).catch(() => {});
}

/** Fallback anchor built from user fields when GLM hasn't crafted one. */
export function buildAnchorFallback(appearance: string | null, artStyle: string): string {
  const style =
    ART_STYLES.find((s) => s.id === artStyle)?.prompt ?? ART_STYLES[0].prompt;
  return [appearance?.trim(), style].filter(Boolean).join(". ");
}

export interface CharacterBible {
  personality: string;
  appearance: string;
  identityAnchor: string;
  voice: string;
  artStyle: string;
  role: string;
}

/** GLM "character bible" — expands a short concept into a full, generation-ready profile. */
export async function generateCharacterBible(opts: {
  name: string;
  concept: string;
  niche?: string;
}): Promise<CharacterBible> {
  // Voice ids come from the ACTIVE voiceover provider so the bible never
  // recommends a voice the TTS engine can't speak.
  const ttsConfig = await getCapability("tts");
  const voiceIds = voiceCatalog(ttsConfig.provider, ttsConfig.model).map((v) => v.id);

  const raw = await aiCall("llm", "character bible LLM", () =>
    chatComplete({
      system:
        "You are a character designer for faceless YouTube channels. You invent memorable recurring hosts/personas that stay visually consistent across hundreds of videos and speak in ways that keep retention high. You always respond with STRICT JSON only — no markdown, no commentary.",
      user: `Design a recurring on-screen persona for a faceless YouTube channel${opts.niche ? ` in the "${opts.niche}" niche` : ""}.

Name: ${opts.name}
Concept/notes: ${opts.concept || "(designer's choice — invent something compelling)"}

Return JSON with exactly these keys:
{
  "role": "one-line role, e.g. 'Host — skeptical science storyteller'",
  "personality": "2-3 sentences: on-screen energy, speech style, catchphrases or verbal tics, how they open and close videos",
  "appearance": "2-3 sentences of FIXED visual identity: age range, hair, face, glasses/accessories, signature outfit, body language. Specific enough that an artist could draw them identically every time",
  "identityAnchor": "ONE dense comma-separated visual prompt fragment (age, hair, facial hair, glasses, outfit colors, art style hints) describing ONLY the invariant visual traits. Max 60 words. No camera or lighting words.",
  "voice": "one of: ${voiceIds.join(", ")} — pick the TTS voice that matches the persona's energy",
  "artStyle": "one of: cinematic, stylized, anime, comic, noir — pick the portrait art style that fits"
}`,
    })
  );
  const parsed = parseJsonLoose(raw);

  const bible: CharacterBible = {
    role: String(parsed.role ?? "").trim(),
    personality: String(parsed.personality ?? "").trim(),
    appearance: String(parsed.appearance ?? "").trim(),
    identityAnchor: String(parsed.identityAnchor ?? "").trim(),
    voice: String(parsed.voice ?? "jam").trim(),
    artStyle: String(parsed.artStyle ?? "cinematic").trim(),
  };
  if (!bible.appearance) throw new Error("Character bible returned no appearance");
  return bible;
}

/** The portrait prompt, extracted pure so the unit suite can pin the S51
 *  contract: anchor LEADS (primacy), the apparent-age fidelity clause rides
 *  the middle, the anchor ECHOES right before the close (recency) — the two
 *  positions image models weigh most, answering the S47 benchmark's
 *  portrait-age finding (anchor said late-20s, freehand painted 50s-60s). */
export function buildPortraitPrompt(opts: {
  name: string;
  anchor: string;
  style: string;
}): string {
  return `${opts.anchor}. ${opts.style}. Official character reference portrait of "${opts.name}" — head-and-shoulders framing, facing camera, neutral studio backdrop, crisp detail, personality visible in the expression. The subject's apparent age MUST match the age stated in the description above exactly — paint them that age, not older, not younger. Identity lock, verbatim: ${opts.anchor}. Absolutely no text, no letters, no watermarks.`;
}

/** Reference portrait (1024x1024) — the canonical look of the character.
 *
 *  S51 — two changes, both answering the S47 continuity benchmark:
 *
 *  1. THE PORTRAIT-AGE FIX. The benchmark's VLM flagged every scene as
 *     "appears 50s-60s, not late-20s as stated" — CogView freehand drifted
 *     the anchor's age, and the portrait-seeded edit propagated the drift to
 *     every paint ("consistent with the reference" was the checker's exact
 *     diagnosis). The prompt now leads with the anchor (primacy), carries an
 *     explicit apparent-age fidelity clause, and echoes the anchor right
 *     before the close (recency) — see buildPortraitPrompt.
 *
 *  2. REFERENCES RIDE IDENTITY. When the character carries user-uploaded
 *     reference photos, the portrait is DERIVED from the newest one via an
 *     imageEdit seed (the user's ground truth over the model's freehand) —
 *     the same likeness lock scene paints get. Fails back to text-to-image
 *     when there are no refs, edits are unsupported, or the edit errors. */
export async function generateCharacterPortrait(opts: {
  characterId: string;
  name: string;
  appearance: string | null;
  identityAnchor: string | null;
  artStyle: string;
  /** The character row's referenceImages JSON (user uploads), oldest first. */
  referenceImages?: string | null;
}): Promise<{ fileBytes: number }> {
  const anchor = opts.identityAnchor?.trim() || buildAnchorFallback(opts.appearance, opts.artStyle);
  const style =
    ART_STYLES.find((s) => s.id === opts.artStyle)?.prompt ?? ART_STYLES[0].prompt;

  const prompt = buildPortraitPrompt({ name: opts.name, anchor, style });

  const refKeys = parseReferenceKeys(opts.referenceImages).slice(0, CHARACTER_REFERENCE_CAP);
  const newestRef =
    refKeys.length > 0
      ? await storage.get(refKeys[refKeys.length - 1]).catch(() => null)
      : null;

  let buffer: Buffer | null = null;
  if (newestRef && (await imageEditSupported())) {
    buffer = await aiCall(
      "image",
      "character portrait (reference-seeded)",
      () =>
        imageEdit({
          prompt: `Portrait of this exact person — keep their face, hairstyle, skin tone and physical build perfectly recognizable. ${prompt}`,
          imagePngBase64: newestRef.toString("base64"),
          size: "1024x1024",
        }).then((b) => {
          if (!b) throw new Error("Reference-seeded portrait edit returned no data");
          return b;
        }),
      { attempts: 4, baseDelayMs: 5000 }
    ).catch(() => null);
  }

  if (!buffer) {
    buffer = await aiCall(
      "image",
      "character portrait",
      () => imageGenerate({ prompt, size: "1024x1024" }),
      { attempts: 4, baseDelayMs: 5000 }
    );
  }

  if (buffer.length < 1000) throw new Error("Generated portrait is empty");

  await storage.put(characterKey(opts.characterId, "portrait.png"), buffer);
  return { fileBytes: buffer.length };
}

/**
 * Identity-consistency sheet — re-renders the SAME character in 3 canonical poses
 * using image-to-image editing seeded from the reference portrait.
 * These poses are the storyboard building blocks for Phase 2 (story engine).
 */
export async function generateCharacterPoses(opts: {
  characterId: string;
  identityAnchor: string | null;
}): Promise<{ generated: string[] }> {
  const portrait = await readPortrait(opts.characterId);
  if (!portrait)
    throw new Error("Generate the reference portrait first — poses are derived from it");

  if (!(await imageEditSupported()))
    throw new Error(
      "Pose sheets need an image provider that supports edits — Z.ai CogView or OpenAI gpt-image-1 (Settings → AI Providers)"
    );

  const anchor = opts.identityAnchor?.trim();
  const generated: string[] = [];

  for (const [i, pose] of POSES.entries()) {
    const buffer = await aiCall(
      "image",
      `pose:${pose.id}`,
      () =>
        imageEdit({
          prompt: `Exact same character, identical face, hair, glasses, outfit and art style as the reference image. ${anchor ? `Visual identity: ${anchor}.` : ""} New pose: ${pose.desc}. Identical lighting and backdrop as the reference. Absolutely no text, no letters, no watermarks.`,
          imagePngBase64: portrait.toString("base64"),
          size: "1024x1024",
        }).then((b) => {
          if (!b) throw new Error(`Pose "${pose.id}" returned no data`);
          return b;
        }),
      { attempts: 4, baseDelayMs: 5000 }
    );
    if (buffer.length < 1000) throw new Error(`Pose "${pose.id}" image is empty`);
    await storage.put(characterKey(opts.characterId, `pose-${pose.id}.png`), buffer);
    generated.push(pose.id);
    // Pace the edit calls — back-to-back image calls trip upstream burst limits.
    if (i < POSES.length - 1) await new Promise((r) => setTimeout(r, 2000));
  }

  return { generated };
}

/** Prompt fragment that stamps the character's identity onto any scene generation.
 *  Image-model-native phrasing: the anchor verbatim + a hard "same exact person"
 *  clause. On text-to-image providers (Pollinations) this fragment rides the
 *  SAME prompt slot in every scene AND pairs with the character-pinned seed
 *  (story.ts sceneGenerationSeed) — prompt + latent together are the closest
 *  those providers get to an identity lock. Edit-capable providers ignore it
 *  (they keep likeness via the portrait-seeded image edit instead). */
export function characterSceneFragment(character: {
  name: string;
  identityAnchor: string | null;
  appearance: string | null;
}): string {
  const anchor =
    character.identityAnchor?.trim() ||
    character.appearance?.trim() ||
    "";
  if (!anchor) return "";
  return `The same recurring host character "${character.name}" appears here: ${anchor}. Depict this exact same person — identical face shape, hairstyle, facial hair, glasses and signature outfit as in every other scene of this video.`;
}

// ---------------------------------------------------------------------------
// S125 (K1) — the part-decomposition pass (roadmap §6: "characters.ts — part
// decomposition prompt for the portrait flow (generate layered parts, not one
// flat PNG); pose-sheet generation targets rig slots").
//
// THE NATIVE-FIRST LAW APPLIED TO CHARACTER ART: the rig's parts are SVG
// fragments the LLM authors as TEXT ($0 raster, the G1 icon-library
// precedent) — flat explainer-style vector limbs drawn in the rig STAGE's
// coordinates (1080×1080, rest = identity). The identity lock rides the
// anchor verbatim (the portrait prompt's law); the VCE judges the RENDERED
// rig frames ≥80 (the smoke gate — parts never shortcut it).
//
// DEGRADATION (per-part, the graphics llm-planner shape): every proposed
// row is policed individually against the closed grammar — a bad part is
// dropped with a reason, never silent; a PARTIAL legacy mouth set drops ALL
// mouth parts (the mouthless rig renders closed-mouth honestly — a partial
// set would visibly break the speaking beats); S166 — the two new classes
// (mbp, rest) are OPTIONAL art: the prompt asks for the seven, the floor
// stays the S125 five, a missing new class is a warning (the schedule's
// closure/rest windows degrade to closed); the pose proposal keeps only
// poses whose joints reference surviving parts inside the bands; a proposal
// the validator refuses degrades to the empty sheet (the standard poses
// arrive from the author — the validator's warnings name them). The pass
// never ships an unvalidated doc: what lands in the columns is
// validateRigDoc's output, byte-stable.
// ---------------------------------------------------------------------------

const PARTS_SYSTEM_PROMPT =
  "You are a 2D puppet-rig artist for explainer videos. You decompose a character into layered SVG parts a rig engine can pose. You always respond with STRICT JSON only — no markdown, no commentary, no code fences.";

export interface RigPartsGeneration {
  parts: number;
  poses: number;
  warnings: string[];
}

/** The slot → scaffold kinematics table (pivot, parent, z) — the ONE seed
 *  table; hand-edited rigs author their own pivots, this table only
 *  scaffolds the auto pass. */
const RIG_SLOT_SEEDS: ReadonlyMap<string, { pivot: { x: number; y: number }; parent?: string; z: number }> = new Map([
  ["leg-l", { pivot: { x: 480, y: 840 }, parent: "torso", z: 6 }],
  ["leg-r", { pivot: { x: 600, y: 840 }, parent: "torso", z: 7 }],
  ["arm-l", { pivot: { x: 420, y: 560 }, parent: "torso", z: 9 }],
  ["torso", { pivot: { x: 540, y: 680 }, z: 10 }],
  ["arm-r", { pivot: { x: 660, y: 560 }, parent: "torso", z: 11 }],
  ["head", { pivot: { x: 540, y: 520 }, parent: "torso", z: 20 }],
  ["eye", { pivot: { x: 540, y: 400 }, parent: "head", z: 22 }],
  ["brow", { pivot: { x: 540, y: 336 }, parent: "head", z: 23 }],
  ["prop", { pivot: { x: 700, y: 620 }, z: 30 }],
]);
const MOUTH_BASE_Z = 24;

export async function generateCharacterParts(opts: {
  characterId: string;
  name: string;
  appearance: string | null;
  identityAnchor: string | null;
  artStyle: string;
}): Promise<RigPartsGeneration> {
  const anchor = opts.identityAnchor?.trim() || buildAnchorFallback(opts.appearance, opts.artStyle);
  const style = ART_STYLES.find((s) => s.id === opts.artStyle)?.prompt ?? ART_STYLES[0].prompt;

  const raw = await aiCall("llm", "character rig parts LLM", () =>
    chatComplete({
      system: PARTS_SYSTEM_PROMPT,
      user: `Decompose this character into 2D puppet-rig parts.

Character: ${opts.name}
Visual identity (verbatim, the identity lock): ${anchor}
Art style: ${style}

STAGE: one 1080x1080 square, y grows downward. The FULL character stands centered: head top ~y120, head center ~(540,400), shoulders ~y560 at x420/x660, torso center ~(540,650), hips ~y840, feet ~y950. Flat vector explainer shapes, solid fills, no gradients, no <text>, no <image>, no external refs.

Return JSON with exactly these keys:
{
  "parts": [
    { "id": "torso", "slot": "torso", "svg": "<rect .../>" },
    { "id": "head", "slot": "head", "svg": "<...>" },
    { "id": "brow", "slot": "brow", "svg": "<...>" },
    { "id": "arm-l", "slot": "arm-l", "svg": "<...>" },
    { "id": "arm-r", "slot": "arm-r", "svg": "<...>" }
    ...plus any of: eye, forearm-l, forearm-r, hand-l, hand-r, leg-l, leg-r, prop
    ...and the SEVEN mouth parts, slot "mouth", each with variant:
        closed | open | wide | oh | smile | mbp | rest  (seven separate parts, same mouth position ~(540,470);
        mbp = lips pressed together (bilabial closure for m/b/p syllables), rest = the neutral relaxed mouth for pauses)
  ],
  "poses": [
    { "id": "arm-l-raise", "name": "Raise left arm", "joints": { "arm-l": { "rotateDeg": -140 } } },
    { "id": "arm-l-rest", "name": "Rest", "joints": { "arm-l": { "rotateDeg": 0 } } },
    { "id": "arm-l-point", "name": "Point", "joints": { "arm-l": { "rotateDeg": 100 } } },
    ...same trio for arm-r, plus "brow-rest" and "brow-raise" (rotateDeg 0, y -12),
    ...and up to 4 free poses (welcoming, explaining, thinking, ...).
    rotateDeg is a RELATIVE rotation from rest about the part's pivot: arms rest hanging down.
    Allowed fields per joint: rotateDeg (required), x, y (stage px offsets), scale (0.2..3).
  ]
}

Rules: every part id lowercase-kebab; every svg is ONE small SVG fragment (under 2000 chars) in stage coordinates; all seven mouth parts share the exact same position so they swap invisibly; poses reference ONLY part ids you defined.`,
    })
  );

  const parsed = parseJsonLoose(raw);
  const warnings: string[] = [];

  // Per-part policing: drop rows that fail the library gate individually.
  const proposedParts = Array.isArray(parsed.parts) ? parsed.parts : [];
  const survivors: unknown[] = [];
  const keptSlots = new Set<string>();
  for (const row of proposedParts) {
    const probe = validateRigParts([row]);
    if (probe.parts) {
      survivors.push(row);
      keptSlots.add(probe.parts[0].slot);
    } else {
      warnings.push(`part dropped — ${probe.errors[0] ?? "junk row"}`);
    }
  }
  if (survivors.length === 0) {
    throw new Error(
      `the parts pass returned no usable parts (${warnings.slice(0, 3).join("; ")}) — adjust the appearance description and retry`
    );
  }
  // The partial-mouth law (S166): the FLOOR is the S125 five — a set that
  // is not exactly the five drops ALL mouth rows (the mouthless rig renders
  // closed-mouth honestly). The two S166 classes ride OUTSIDE the floor:
  // kept when the model authors them, warned when missing (the schedule's
  // closure/rest windows degrade to closed).
  const mouthVariants = survivors
    .map((r) => (r as { variant?: unknown }).variant)
    .filter((v): v is string => typeof v === "string");
  const completeMouth =
    keptSlots.has("mouth") && RIG_MOUTH_LEGACY_SLOTS.every((s) => mouthVariants.includes(s));
  if (keptSlots.has("mouth") && !completeMouth) {
    const before = survivors.length;
    for (const s of RIG_MOUTH_LEGACY_SLOTS) {
      const idx = survivors.findIndex(
        (r) => (r as { slot?: unknown }).slot === "mouth" && (r as { variant?: unknown }).variant === s
      );
      if (idx >= 0) survivors.splice(idx, 1);
    }
    warnings.push(`mouth parts dropped (${before - survivors.length}) — the set was incomplete; the rig renders closed-mouth`);
  } else if (keptSlots.has("mouth")) {
    const missingNew = RIG_MOUTH_NEW_SLOTS.filter((s) => !mouthVariants.includes(s));
    if (missingNew.length > 0) {
      warnings.push(
        `mouth set missing the S166 classes (${missingNew.join(", ")}) — bilabial-closure and rest windows degrade to closed (add the two mouth parts to opt in)`
      );
    }
  }
  const art = validateRigParts(survivors);
  if (!art.parts) {
    throw new Error(`the surviving parts failed the library gate — ${art.errors[0]}`);
  }
  const artRows = art.parts;

  // The scaffold: surviving art rows → seeded kinematics (the ONE table).
  const seeds = artRows.map((p) => {
    if (p.slot === "mouth") {
      const mouths = artRows.filter((q) => q.slot === "mouth");
      const idx = mouths.findIndex((q) => q.id === p.id);
      return {
        id: p.id,
        slot: p.slot,
        variant: p.variant,
        svgRef: p.id,
        z: MOUTH_BASE_Z + Math.max(0, idx),
        pivot: { x: 540, y: 470 },
        parent: artRows.some((q) => q.id === "head") ? "head" : undefined,
      };
    }
    const seed = RIG_SLOT_SEEDS.get(p.slot) ?? { pivot: { x: 540, y: 700 }, z: 15 };
    return {
      id: p.id,
      slot: p.slot,
      svgRef: p.id,
      z: seed.z,
      pivot: { ...seed.pivot },
      parent: seed.parent && artRows.some((q) => q.id === seed.parent) ? seed.parent : undefined,
    };
  });
  const scaffolded = scaffoldRigDoc({ parts: seeds, art: artRows });
  if (!scaffolded.doc) {
    throw new Error(`the rig scaffold refused the parts — ${scaffolded.errors[0]}`);
  }
  warnings.push(...scaffolded.warnings);

  // The pose proposal: keep poses whose joints reference surviving parts and
  // sit inside the bands — the validator is the judge, the proposal only
  // pre-fills the sheet.
  const proposedPoses = Array.isArray(parsed.poses) ? parsed.poses : [];
  const partIds = new Set(artRows.map((p) => p.id));
  const keptPoses: unknown[] = [];
  for (const pose of proposedPoses) {
    const p = pose as { id?: unknown; name?: unknown; joints?: Record<string, unknown> };
    const joints = (p.joints ?? {}) as Record<string, unknown>;
    const keys = Object.keys(joints);
    if (!p.id || !p.name || keys.length === 0) continue;
    if (!keys.every((k) => partIds.has(k))) {
      warnings.push(`pose "${String(p.id)}" dropped — joints reference dropped parts`);
      continue;
    }
    const sane = keys.every((k) => {
      const j = joints[k] as { rotateDeg?: unknown; x?: unknown; y?: unknown; scale?: unknown } | undefined;
      if (!j || typeof j.rotateDeg !== "number" || !Number.isFinite(j.rotateDeg) || Math.abs(j.rotateDeg) > 360) return false;
      const band = 1080 * 1.5;
      for (const v of [j.x, j.y]) {
        if (v !== undefined && (typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > band)) return false;
      }
      if (j.scale !== undefined) {
        const sc = j.scale;
        if (typeof sc !== "number" || !Number.isFinite(sc) || sc < 0.2 || sc > 3) return false;
      }
      return true;
    });
    if (!sane) {
      warnings.push(`pose "${String(p.id)}" dropped — joints outside the bands`);
      continue;
    }
    keptPoses.push(pose);
  }
  const docAttempt = validateRigDoc(
    {
      ...scaffolded.doc,
      poses: keptPoses,
    },
    art.parts
  );
  const finalDoc = docAttempt.doc ?? scaffolded.doc; // the empty sheet degrades honestly
  if (!docAttempt.doc) {
    warnings.push(`the pose proposal was refused (${docAttempt.errors[0]}) — the sheet starts empty`);
  } else {
    warnings.push(...docAttempt.warnings);
  }

  const docBytes = writeRigDoc(finalDoc);
  const artBytes = writeRigParts(artRows);
  await db.character.update({
    where: { id: opts.characterId },
    data: { rigDoc: docBytes, parts: artBytes },
  });

  return { parts: artRows.length, poses: finalDoc.poses.length, warnings };
}

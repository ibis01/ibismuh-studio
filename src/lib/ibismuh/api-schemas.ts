// Shared API validation schemas — the high-risk route families (2026-11-23).
//
// The 137-route surface grew per-route manual validation of uneven rigor
// (finding F-08): Number(...) coercion silently produces NaN, String(...)
// accepts arbitrary lengths, and every route re-implements its own guards.
// This module is the shared Zod layer for the routes where malformed input
// is highest-stakes — auth surfaces already carried schemas; these add the
// video-create/update, job-cancel, provider-settings and clone-metadata
// families.
//
// Contract rules (the no-breakage law):
//   - error responses keep the repo's `{ error }` shape and the same status
//     codes the manual paths already answered with
//   - coercions the existing routes performed (trim, clamp, default) are
//     preserved — schemas REJECT what the old path silently mangled (NaN,
//     Infinity, absurd lengths), they do not invent new requirements
//   - parseBody()/parseJson() never throw to the caller: they return a
//     discriminated result the route maps to its own response

import { z } from "zod";

// ------------------------------------------------------------- primitives

/** A cuid-ish entity id: opaque, bounded, no control characters. */
export const entityId = z
  .string()
  .trim()
  .min(8)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/, "Malformed id");

/** Finite float in [lo, hi] — NaN/Infinity are rejected, not clamped. */
export const finiteFloat = (lo: number, hi: number, fallback: number | null = null) => {
  const base =
    fallback === null
      ? z.number({ message: "A number is required" })
      : z
          .number({ message: "A number is required" })
          .optional()
          .transform((v) => v ?? fallback);
  return base
    .refine((v) => Number.isFinite(v), "A finite number is required")
    .refine((v) => typeof v === "number" && v >= lo && v <= hi, `Must be between ${lo} and ${hi}`);
};

/** Bounded, trimmed text. */
export const boundedText = (max: number, min = 1) =>
  z.string().trim().min(min).max(max);

/** Optional bounded, trimmed text ("" allowed, absent allowed). */
export const optionalBoundedText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional();

// ------------------------------------------------- video create / update

export const VIDEO_FORMATS = ["script", "story"] as const;
export const RENDER_MODES_IDS = [
  "kenburns",
  "stock",
  "slides",
  "whiteboard",
  "graphics",
  "animated",
] as const;

export const videoCreateSchema = z.object({
  topic: boundedText(300),
  script: z.union([z.string().max(50_000), z.null()]).optional(),
  approved: z.boolean().optional(),
  niche: z.string().trim().max(80).optional(),
  tone: z.string().trim().max(40).optional(),
  length: z.string().trim().max(20).optional(),
  voice: z.string().trim().max(60).optional(),
  ttsSpeed: finiteFloat(0.5, 2.0, 1.0).optional(),
  thumbStyle: z.string().trim().max(40).optional(),
  channelId: z.union([entityId, z.null()]).optional(),
  characterId: z.union([entityId, z.null()]).optional(),
  format: z.enum(VIDEO_FORMATS).optional(),
  renderMode: z.enum(RENDER_MODES_IDS).optional(),
  contentPolicy: z.string().trim().max(40).optional(),
  researchSources: z
    .array(
      z.object({
        url: z.string().max(300),
        name: z.string().max(160).optional(),
        host: z.string().max(100).optional(),
      }),
    )
    .max(6)
    .optional(),
  musicEnabled: z.boolean().nullish(),
  musicTrackId: z.union([entityId, z.null()]).optional(),
  musicVolume: finiteFloat(0, 1).nullish(),
  musicFadeIn: finiteFloat(0.5, 8).nullish(),
  musicFadeOut: finiteFloat(0.5, 8).nullish(),
  musicDucking: z.boolean().nullish(),
  musicDuckingIntensity: z.string().trim().max(20).nullish(),
  musicMood: z.string().trim().max(30).nullish(),
  motionMode: z.string().trim().max(20).nullish(),
  motionIntensity: finiteFloat(0, 30).nullish(),
  motionCurve: z.string().trim().max(20).nullish(),
  motionVary: z.boolean().nullish(),
  transitionStyle: z.string().trim().max(40).nullish(),
  transitionDuration: finiteFloat(0, 10).nullish(),
});

export const videoPatchSchema = videoCreateSchema.partial().extend({
  title: optionalBoundedText(300),
  description: optionalBoundedText(10_000),
  tags: optionalBoundedText(2_000),
});

// --------------------------------------------------------- job cancel

export const jobCancelSchema = z.object({
  entityId,
  kind: z.string().trim().min(1).max(40),
});

// -------------------------------------------------- provider settings

export const CAPABILITY_IDS = ["chat", "tts", "asr", "image", "video"] as const;
export const capabilityId = z.enum(CAPABILITY_IDS);

export const providerSettingsPatchSchema = z.object({
  scope: z.string().trim().max(20).optional(),
  capability: capabilityId.optional(),
  provider: z.string().trim().max(40).optional(),
  model: z.string().trim().max(120).optional(),
  visionModel: z.string().trim().max(120).optional(),
  baseUrl: z.string().trim().max(300).optional(),
  apiKey: z.string().trim().max(500).optional(),
  copyCredsFrom: capabilityId.optional(),
});

export const providerTestSchema = z.object({
  capability: z.string().trim().max(20).optional(),
  provider: z.string().trim().max(40).optional(),
  baseUrl: z.string().trim().max(300).optional(),
  model: z.string().trim().max(120).optional(),
  visionModel: z.string().trim().max(120).optional(),
  apiKey: z.string().trim().max(500).optional(),
  voice: z.string().trim().max(80).optional(),
  health: z.boolean().optional(),
  confirmCost: z.boolean().optional(),
});

// ------------------------------------------------------ clone metadata

export const cloneMetaSchema = z.object({
  name: optionalBoundedText(80),
  sampleText: optionalBoundedText(4_000),
  auditionText: optionalBoundedText(1_000),
  consentText: optionalBoundedText(2_000),
  consentBasis: z
    .union([z.enum(["self", "written-consent", "licensed-service"]), z.string().trim().max(40)])
    .optional(),
});

// --------------------------------------------------------------- helpers

export type Parsed<T> = { ok: true; data: T } | { ok: false; error: string };

/** Parse a JSON body against a schema — never throws. */
export async function parseJsonBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
): Promise<Parsed<z.infer<T>>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, error: "Invalid JSON body" };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: first
        ? `${first.path.length ? `${first.path.join(".")}: ` : ""}${first.message}`
        : "Invalid request body",
    };
  }
  return { ok: true, data: parsed.data };
}

/** Parse an already-read JSON value against a schema — never throws. */
export function parseJsonValue<T extends z.ZodTypeAny>(
  raw: unknown,
  schema: T,
  fallbackError = "Invalid request body",
): Parsed<z.infer<T>> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: first
        ? `${first.path.length ? `${first.path.join(".")}: ` : ""}${first.message}`
        : fallbackError,
    };
  }
  return { ok: true, data: parsed.data };
}

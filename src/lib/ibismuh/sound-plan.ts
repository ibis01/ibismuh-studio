// S178 — Music and Sound Design (Programme E): "The Director selects
// audio assets; Ibismuh Studio handles mixing and synchronization." The plan
// is DATA riding the catalogs that already exist — music.ts's closed
// mood ids, audiomix.ts's duck intensities and the −16 LUFS contract,
// and the S163 boundary clock. The Director SUGGESTS; the mixer owns
// the lanes; nothing here calls a provider.
//
// Pure module — no I/O, no wall-clock, no randomness.

import { isMusicMoodId } from "./music";
import { DUCK_INTENSITIES, isDuckIntensity } from "./audiomix";

export const SOUND_PLAN_VERSION = 1;

/** The boundary→cue vocabulary: the closed set of SFX cue kinds the
 *  sound bed may place, with the transition types they ride. */
export const SOUND_CUE_KINDS = ["boundary-whoosh", "boundary-swish", "impact", "sting", "ambience-in", "ambience-out"] as const;
export type SoundCueKind = (typeof SOUND_CUE_KINDS)[number];

/** The cue family per S163 transition type — the pairing is a designed
 *  receipt (tune freely; the NAMES are the contract). */
export const CUE_FOR_TRANSITION: Readonly<Record<string, SoundCueKind>> = Object.freeze({
  crossfade: "boundary-swish",
  iris: "boundary-whoosh",
  whiteout: "impact",
  zoomthrough: "boundary-whoosh",
  wipeleft: "boundary-swish",
  wiperight: "boundary-swish",
});

export interface SoundCue {
  readonly kind: SoundCueKind;
  readonly atMs: number;
  /** The transition that motivates the cue (provenance). */
  readonly via?: string;
}

export interface SoundDesignPlan {
  readonly version: typeof SOUND_PLAN_VERSION;
  /** The music bed's mood — a music.ts catalog id (junk refuses). */
  readonly musicMood: string;
  /** The bed's duck intensity — an audiomix catalog id. */
  readonly duckIntensity: string;
  /** The loudness contract the mix targets (the house constant). */
  readonly targetLufs: -16;
  readonly cues: readonly SoundCue[];
}

export interface SoundPlanError {
  readonly path: string;
  readonly message: string;
}

export type SoundPlanVerdict =
  | { readonly ok: true; readonly plan: SoundDesignPlan }
  | { readonly ok: false; readonly errors: readonly SoundPlanError[] };

/** Build + validate the sound plan. The mood must be a real catalog id;
 *  the duck intensity must be a real audiomix intensity; cues must sit
 *  inside the composition clock (the compiled plan's totalMs). */
export function planSoundDesign(
  input: {
    musicMood?: string;
    duckIntensity?: string;
    boundaryTransitions: readonly { readonly boundaryIndex: number; readonly transitionType: string; readonly atMs: number }[];
    totalMs: number;
  },
): SoundPlanVerdict {
  const errors: SoundPlanError[] = [];
  const mood = input.musicMood ?? "auto";
  if (!isMusicMoodId(mood)) {
    errors.push({ path: "$.musicMood", message: `"${mood}" is not a music catalog mood — the Director selects from the closed mood set` });
  }
  const duck = input.duckIntensity ?? "standard";
  if (!isDuckIntensity(duck)) {
    errors.push({ path: "$.duckIntensity", message: `"${duck}" is not an audiomix duck intensity (${DUCK_INTENSITIES.join(", ")})` });
  }
  if (typeof input.totalMs !== "number" || !Number.isFinite(input.totalMs) || input.totalMs <= 0) {
    errors.push({ path: "$.totalMs", message: "the composition clock must be positive" });
  }
  const cues: SoundCue[] = input.boundaryTransitions.map((b) => {
    const kind = CUE_FOR_TRANSITION[b.transitionType];
    if (kind === undefined) {
      errors.push({ path: `$.cues[boundary:${b.boundaryIndex}]`, message: `no cue family for transition "${b.transitionType}" (the pairing table is closed)` });
    }
    if (b.atMs < 0 || b.atMs > input.totalMs) {
      errors.push({ path: `$.cues[boundary:${b.boundaryIndex}]`, message: `cue at ${b.atMs} ms sits outside the composition clock` });
    }
    return { kind: kind ?? "boundary-whoosh", atMs: Math.round(b.atMs), via: b.transitionType };
  });
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    plan: {
      version: SOUND_PLAN_VERSION,
      musicMood: mood,
      duckIntensity: duck,
      targetLufs: -16,
      cues,
    },
  };
}

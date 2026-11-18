// S174 + S175 — Voice Quality Profiles and the Intelligent Voice
// Manager (Programme D). The PURE planning layer over the existing TTS
// surface (providers/tts.ts executes; the registry lists; the S176
// router decides WHERE) — the roadmap's "extend the existing
// architecture, do not build another subsystem" law.
//
// S174 — voice quality: the closed profile set (accents and delivery),
// each compiled into the provider-facing knobs (rate, pauses, emphasis)
// plus chunk-level pronunciation corrections riding pronounce.ts's
// stored-pair format. Nigerian English is first-class (the roadmap
// names it explicitly).
//
// S175 — intelligent voice management, the DIRECTOR's voice loop as a
// pure plan:
//   analyse the narration → chunk long scripts on sentence boundaries
//   (deterministic, no AI) → map chunks onto the S170 narration slots →
//   attach pronunciation corrections per chunk → and, after generation,
//   re-plan ONLY the failed chunks (selective regeneration — never the
//   whole script, never the unaffected scenes).
//
// Pure module — no I/O, no wall-clock, no randomness. Duration
// measurement happens at the executor; the manager plans against the
// windows the compiler already resolved (the anchors-are-inputs law).

import type { PronunciationEntry } from "./pronounce";
import type { CompiledNarrationSlot } from "./animation-compiler";

export const VOICE_MANAGER_VERSION = 1;

// ---------------------------------------------------------------------------
// S174 — the quality profiles (closed set).
// ---------------------------------------------------------------------------

export const VOICE_QUALITY_PROFILES = [
  "nigerian-english",
  "british-english",
  "american-english",
  "neutral-multilingual",
] as const;

export type VoiceQualityProfile = (typeof VOICE_QUALITY_PROFILES)[number];

export interface VoiceProfileDirective {
  readonly profile: VoiceQualityProfile;
  /** Speaking rate multiplier (0.5–1.5; 1 = the provider's natural pace). */
  readonly rate: number;
  /** Pause scale for punctuation and breathing (0.5–2; 1 = house). */
  readonly pauseScale: number;
  /** Emotional delivery hint — the provider may map it; junk refuses. */
  readonly emotion: "neutral" | "warm" | "urgent" | "reflective" | "playful";
  /** Consistency: one voice id per production (long-form law). */
  readonly voiceId?: string;
}

const PROFILE_DEFAULTS: Readonly<Record<VoiceQualityProfile, Omit<VoiceProfileDirective, "profile" | "voiceId">>> = Object.freeze({
  "nigerian-english": { rate: 0.95, pauseScale: 1.1, emotion: "warm" },
  "british-english": { rate: 1, pauseScale: 1, emotion: "neutral" },
  "american-english": { rate: 1, pauseScale: 1, emotion: "neutral" },
  "neutral-multilingual": { rate: 1, pauseScale: 1.05, emotion: "neutral" },
});

export interface VoiceProfileError {
  readonly code: "unknown-profile" | "knob-out-of-range" | "voice-required";
  readonly message: string;
}

export type VoiceProfileVerdict =
  | { readonly ok: true; readonly directive: VoiceProfileDirective }
  | { readonly ok: false; readonly errors: readonly VoiceProfileError[] };

/** Build the S174 directive. A long-form production MUST pin one voiceId
 *  (the consistency law — profiles do not drift mid-script). */
export function buildVoiceProfileDirective(
  profile: VoiceQualityProfile,
  overrides: Partial<Pick<VoiceProfileDirective, "rate" | "pauseScale" | "emotion" | "voiceId">> = {},
  opts: { longForm?: boolean } = {},
): VoiceProfileVerdict {
  const errors: VoiceProfileError[] = [];
  if (!(VOICE_QUALITY_PROFILES as readonly string[]).includes(profile)) {
    errors.push({ code: "unknown-profile", message: `"${String(profile)}" is not a quality profile (${VOICE_QUALITY_PROFILES.join(", ")})` });
    return { ok: false, errors };
  }
  const base = PROFILE_DEFAULTS[profile];
  const rate = overrides.rate ?? base.rate;
  const pauseScale = overrides.pauseScale ?? base.pauseScale;
  if (typeof rate !== "number" || rate < 0.5 || rate > 1.5) {
    errors.push({ code: "knob-out-of-range", message: `rate ${String(rate)} is outside [0.5, 1.5]` });
  }
  if (typeof pauseScale !== "number" || pauseScale < 0.5 || pauseScale > 2) {
    errors.push({ code: "knob-out-of-range", message: `pauseScale ${String(pauseScale)} is outside [0.5, 2]` });
  }
  const emotion = overrides.emotion ?? base.emotion;
  if (!["neutral", "warm", "urgent", "reflective", "playful"].includes(emotion)) {
    errors.push({ code: "knob-out-of-range", message: `"${String(emotion)}" is not a delivery hint` });
  }
  const voiceId = overrides.voiceId;
  if (opts.longForm === true && (typeof voiceId !== "string" || voiceId.length === 0)) {
    errors.push({ code: "voice-required", message: "a long-form production must pin ONE voiceId (the consistency law)" });
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, directive: { profile, rate, pauseScale, emotion, voiceId } };
}

// ---------------------------------------------------------------------------
// S175 — the chunker + the production planner.
// ---------------------------------------------------------------------------

export const CHUNK_MAX_CHARS = 480;
export const CHUNK_MIN_CHARS = 40;

export interface NarrationChunk {
  readonly chunkId: string; // `chunk-<zero-padded index>`
  readonly text: string;
  readonly charRange: readonly [number, number];
}

/** Sentence-boundary chunking — deterministic, AI-free. Splits on . ! ?
 *  followed by whitespace (the abbreviation law: a period NOT followed
 *  by whitespace does not end a sentence), accumulates sentences until
 *  the wall, never splits a sentence. `scopeId` namespaces the chunk ids
 *  (a production chunks MANY slots — ids must be unique across the whole
 *  plan, not per slot). */
export function chunkNarration(text: string, scopeId = "root"): NarrationChunk[] {
  if (typeof text !== "string" || text.trim().length === 0) return [];
  const sentences: { text: string; start: number }[] = [];
  const re = /[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g;
  for (const m of text.matchAll(re)) {
    const raw = m[0];
    const start = m.index ?? 0;
    const trimmed = raw.trim();
    if (trimmed.length > 0) sentences.push({ text: trimmed, start });
  }
  const chunks: NarrationChunk[] = [];
  let buf: string[] = [];
  let bufStart = -1;
  let bufEnd = 0;
  const flush = () => {
    if (buf.length === 0) return;
    const id = `chunk-${scopeId}-${String(chunks.length).padStart(3, "0")}`;
    chunks.push({ chunkId: id, text: buf.join(" "), charRange: [bufStart, bufEnd] });
    buf = [];
    bufStart = -1;
  };
  for (const s of sentences) {
    if (bufStart < 0) bufStart = s.start;
    // A single sentence over the wall rides alone (never split a sentence).
    if (buf.length > 0 && buf.join(" ").length + s.text.length + 1 > CHUNK_MAX_CHARS) {
      flush();
      bufStart = s.start;
    }
    buf.push(s.text);
    bufEnd = s.start + s.text.length;
    if (buf.join(" ").length >= CHUNK_MIN_CHARS && buf.join(" ").length + 80 > CHUNK_MAX_CHARS) {
      flush();
    }
  }
  flush();
  return chunks;
}

export interface VoiceChunkPlan {
  readonly slotSceneId: string;
  readonly chunk: NarrationChunk;
  /** The pronunciation corrections that apply INSIDE this chunk
   *  (pronounce.ts's stored pairs, applied case-insensitively). */
  readonly corrections: readonly { readonly from: string; readonly to: string }[];
}

export interface VoiceProductionPlan {
  readonly version: typeof VOICE_MANAGER_VERSION;
  readonly directive: VoiceProfileDirective;
  readonly chunks: readonly VoiceChunkPlan[];
}

/** Map the chunked narration onto the compiler's narration slots, with
 *  per-chunk pronunciation corrections. Unmapped chunks are an ERROR —
 *  narration that no scene will speak must not silently vanish. */
export function planVoiceProduction(
  slots: readonly CompiledNarrationSlot[],
  directive: VoiceProfileDirective,
  corrections: readonly PronunciationEntry[] = [],
): { ok: true; plan: VoiceProductionPlan } | { ok: false; errors: readonly string[] } {
  const errors: string[] = [];
  const pairs = corrections.map((c) => ({ from: c.from, to: c.to }));
  const chunks: VoiceChunkPlan[] = [];
  for (const slot of slots) {
    const parts = chunkNarration(slot.text, slot.sceneId);
    if (parts.length === 0) {
      errors.push(`slot ${slot.sceneId}: narration chunked to nothing`);
      continue;
    }
    for (const chunk of parts) {
      const applied = pairs.filter((p) => p.from.length > 0 && chunk.text.toLowerCase().includes(p.from.toLowerCase()));
      chunks.push({ slotSceneId: slot.sceneId, chunk, corrections: applied });
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, plan: { version: VOICE_MANAGER_VERSION, directive, chunks } };
}

export interface ChunkVerdict {
  readonly chunkId: string;
  readonly ok: boolean;
  /** The measured duration (ms) when ok — the executor's receipt. */
  readonly durationMs?: number;
  readonly error?: string;
}

/** Selective regeneration: given the previous plan and the generation
 *  verdicts, return ONLY the chunk ids that need a re-run. Unaffected
 *  chunks carry over untouched — the roadmap's "regenerates only failed
 *  sections", as data. */
export function chunksNeedingRegeneration(plan: VoiceProductionPlan, verdicts: readonly ChunkVerdict[]): readonly string[] {
  const failed = new Set(verdicts.filter((v) => !v.ok).map((v) => v.chunkId));
  const known = new Set(plan.chunks.map((c) => c.chunk.chunkId));
  // A verdict for a chunk the plan does not know is stale — regenerate it.
  const stale = [...verdicts.filter((v) => !known.has(v.chunkId)).map((v) => v.chunkId)];
  return [...failed, ...stale].filter((id, i, arr) => arr.indexOf(id) === i);
}

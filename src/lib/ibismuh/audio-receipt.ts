// audio-receipt.ts — THE SHARED MEASURED-AUDIO CONTRACT (master plan §4.3).
//
// One measured audio document consumed by ALL six lanes. Before this
// contract, each consumer re-derived timing facts (measured duration,
// spans, normalization) from its own neighborhood — the same narration
// could be measured twice with two different truths. THE LAW: audio is
// measured ONCE, the receipt is versioned and fail-closed to parse, and
// every render receipt states which timing source it used, from the
// declared priority chain:
//
//   1. manual            — a human edited the timing; nothing overrides it
//   2. word-timestamps   — word spans measured from the actual audio
//   3. sentence-timestamps — sentence spans measured from the actual audio
//   4. estimate          — a deterministic character-count fallback, DECLARED
//                          as a fallback wherever it appears (never silent)
//
// The receipt itself is lane-agnostic: the whiteboard consumes it for word
// anchors, the compositor lanes for scene windows, slides for reveal
// timing. Run: npm run test:audio-receipt   (pure — CI step)

import { canonicalStringify, sha256Hex } from "./canonical";

export const AUDIO_RECEIPT_VERSION = 1;

export type TimingSource = "manual" | "word-timestamps" | "sentence-timestamps" | "estimate";

/** The declared timing-priority chain (master plan §4.3), best first. */
export const TIMING_PRIORITY: readonly TimingSource[] = [
  "manual",
  "word-timestamps",
  "sentence-timestamps",
  "estimate",
];

export function isTimingSource(v: string): v is TimingSource {
  return (TIMING_PRIORITY as readonly string[]).includes(v);
}

/** Rank of a timing source in the priority chain (0 = best). Unknown → -1. */
export function timingPriorityRank(source: string): number {
  return (TIMING_PRIORITY as readonly string[]).indexOf(source);
}

export interface AudioSpan {
  startMs: number;
  endMs: number;
}

export interface SentenceSpan extends AudioSpan {
  id: string;
}

export interface WordSpan {
  word: string;
  startMs: number;
  endMs: number;
}

export interface AudioReceipt {
  version: number;
  /** sha256 of the measured audio source bytes. */
  sourceHash: string;
  durationMs: number;
  sampleRate: number;
  channels: number;
  loudness?: {
    integratedLufs?: number;
    truePeakDb?: number;
  };
  silenceSpans: AudioSpan[];
  sentenceSpans: SentenceSpan[];
  wordSpans?: WordSpan[];
  normalization: {
    applied: boolean;
    target?: string;
  };
  provider?: string;
  model?: string;
}

// ---------- construction ----------

export interface AudioReceiptInput {
  sourceHash: string;
  durationMs: number;
  sampleRate: number;
  channels: number;
  loudness?: { integratedLufs?: number; truePeakDb?: number };
  silenceSpans?: AudioSpan[];
  sentenceSpans?: SentenceSpan[];
  wordSpans?: WordSpan[];
  normalization?: { applied: boolean; target?: string };
  provider?: string;
  model?: string;
}

/**
 * Build a receipt, failing closed on structural nonsense: unknown hash
 * shape, non-finite numbers, spans that outlive the audio or arrive
 * unordered (a span timeline that reads backwards is a measurement bug,
 * not a style choice), or words/sentences that overlap themselves.
 */
export function buildAudioReceipt(input: AudioReceiptInput): AudioReceipt {
  if (!/^[0-9a-f]{64}$/.test(input.sourceHash)) {
    throw new Error(`audio-receipt: sourceHash must be a 64-char sha256 hex string`);
  }
  for (const [field, v] of Object.entries({
    durationMs: input.durationMs,
    sampleRate: input.sampleRate,
    channels: input.channels,
  })) {
    if (!Number.isFinite(v) || v <= 0) {
      throw new Error(`audio-receipt: ${field} must be a finite positive number`);
    }
  }
  const spans: Array<[string, AudioSpan[]]> = [
    ["silenceSpans", input.silenceSpans ?? []],
    ["sentenceSpans", input.sentenceSpans ?? []],
    ["wordSpans", (input.wordSpans ?? []) as unknown as AudioSpan[]],
  ];
  for (const [name, list] of spans) {
    let prevEnd = -1;
    for (const s of list) {
      if (!Number.isFinite(s.startMs) || !Number.isFinite(s.endMs) || s.startMs < 0 || s.endMs < s.startMs) {
        throw new Error(`audio-receipt: ${name} entry [${s.startMs}, ${s.endMs}] is not a sane span`);
      }
      if (s.endMs > input.durationMs) {
        throw new Error(`audio-receipt: ${name} entry ends at ${s.endMs}ms — past the ${input.durationMs}ms audio`);
      }
      if (s.startMs < prevEnd) {
        throw new Error(`audio-receipt: ${name} entries must be ordered (start ${s.startMs}ms lands inside the previous span)`);
      }
      prevEnd = s.endMs;
    }
  }
  if (input.wordSpans) {
    for (const w of input.wordSpans) {
      if (typeof w.word !== "string" || w.word.length === 0) {
        throw new Error("audio-receipt: word spans must carry the word text");
      }
    }
  }
  if (input.sentenceSpans) {
    for (const s of input.sentenceSpans) {
      if (typeof s.id !== "string" || s.id.length === 0) {
        throw new Error("audio-receipt: sentence spans must carry an id");
      }
    }
  }
  const receipt: AudioReceipt = {
    version: AUDIO_RECEIPT_VERSION,
    sourceHash: input.sourceHash,
    durationMs: input.durationMs,
    sampleRate: input.sampleRate,
    channels: input.channels,
    loudness: input.loudness,
    silenceSpans: input.silenceSpans ?? [],
    sentenceSpans: input.sentenceSpans ?? [],
    wordSpans: input.wordSpans,
    normalization: input.normalization ?? { applied: false },
    provider: input.provider,
    model: input.model,
  };
  return receipt;
}

// ---------- serialization ----------

/** Canonical form sans fingerprint (audio receipts are fingerprint-free —
 *  their integrity rides on the plan envelope's fingerprint, which covers
 *  the receipt verbatim). Deterministic regardless. */
export function serializeAudioReceipt(receipt: AudioReceipt): string {
  return canonicalStringify(receipt);
}

/** sha256 over the canonical serialization — stable content identity for
 *  cache keys and stage fingerprints ("was THIS receipt measured?"). */
export function audioReceiptHash(receipt: AudioReceipt): string {
  return sha256Hex(serializeAudioReceipt(receipt));
}

// ---------- fail-closed parsing ----------

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function fail(msg: string): never {
  throw new Error(`audio-receipt parse: ${msg}`);
}

/** Strict shape validation for a parsed receipt (version-first). */
export function validateAudioReceiptShape(parsed: unknown): AudioReceipt {
  if (typeof parsed !== "object" || parsed === null) fail("document is not an object");
  const d = parsed as Record<string, unknown>;
  if (d.version !== AUDIO_RECEIPT_VERSION) {
    fail(`unsupported version ${String(d.version)} (this parser speaks version ${AUDIO_RECEIPT_VERSION})`);
  }
  if (typeof d.sourceHash !== "string" || !/^[0-9a-f]{64}$/.test(d.sourceHash)) {
    fail("sourceHash must be a 64-char sha256 hex string");
  }
  for (const field of ["durationMs", "sampleRate", "channels"] as const) {
    if (!isFiniteNumber(d[field]) || (d[field] as number) <= 0) fail(`${field} must be a finite positive number`);
  }
  for (const field of ["silenceSpans", "sentenceSpans"] as const) {
    if (!Array.isArray(d[field])) fail(`${field} must be an array`);
  }
  if (d.wordSpans !== undefined && !Array.isArray(d.wordSpans)) fail("wordSpans must be an array when present");
  if (typeof d.normalization !== "object" || d.normalization === null) fail("normalization must be an object");
  if (typeof (d.normalization as Record<string, unknown>).applied !== "boolean") {
    fail("normalization.applied must be a boolean");
  }
  if (d.loudness !== undefined) {
    if (typeof d.loudness !== "object" || d.loudness === null) fail("loudness must be an object when present");
    const l = d.loudness as Record<string, unknown>;
    for (const k of ["integratedLufs", "truePeakDb"]) {
      if (l[k] !== undefined && !isFiniteNumber(l[k])) fail(`loudness.${k} must be a finite number when present`);
    }
  }
  return parsed as unknown as AudioReceipt;
}

/** Parse + validate a stored receipt. Fail-closed on anything malformed. */
export function parseAudioReceipt(text: string): AudioReceipt {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail("document is not valid JSON");
  }
  return validateAudioReceiptShape(parsed);
}

// ---------- the timing-source decision ----------

export interface TimingSourceDecision {
  source: TimingSource;
  /** Always true on a decision — a render receipt NEVER carries an
   *  undeclared estimate without this record. */
  declared: true;
  /** Why this source won (or fell) in the priority chain. */
  reason: string;
}

/**
 * Resolve the timing source for a render: walk the priority chain, take the
 * FIRST source with evidence, and DECLARE the result. An estimate is only
 * ever returned when explicitly allowed (allowEstimate) — a caller that
 * cannot accept an estimate must not be handed one.
 */
export function resolveTimingSource(input: {
  manualEditedTiming?: boolean;
  audioReceipt?: AudioReceipt | null;
  allowEstimate: boolean;
}): TimingSourceDecision {
  if (input.manualEditedTiming) {
    return { source: "manual", declared: true, reason: "manually edited timing takes the priority chain's first seat" };
  }
  const receipt = input.audioReceipt;
  if (receipt && (receipt.wordSpans?.length ?? 0) > 0) {
    return {
      source: "word-timestamps",
      declared: true,
      reason: `measured audio receipt carries ${receipt.wordSpans?.length ?? 0} word spans`,
    };
  }
  if (receipt && receipt.sentenceSpans.length > 0) {
    return {
      source: "sentence-timestamps",
      declared: true,
      reason: `measured audio receipt carries ${receipt.sentenceSpans.length} sentence spans (no word spans)`,
    };
  }
  if (input.allowEstimate) {
    return {
      source: "estimate",
      declared: true,
      reason: receipt
        ? "measured receipt has no usable spans — deterministic estimate DECLARED as fallback"
        : "no measured audio receipt — deterministic estimate DECLARED as fallback",
    };
  }
  throw new Error(
    "audio-receipt: no usable timing evidence (no manual timing, no measured spans) and estimates are not allowed",
  );
}

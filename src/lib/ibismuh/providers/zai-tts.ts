// tts.ts — the TTS provider wrapper (backend-only; z-ai-web-dev-sdk).
//
// One door for narration synthesis: text in, a single well-formed WAV out.
// Inputs longer than the provider's 1000-char limit are split on sentence
// boundaries, synthesized sequentially, and merged at the PCM level under
// one rebuilt RIFF header (format facts taken from the first chunk, all
// chunks must agree). THE LAW: never throws — any provider or format
// failure surfaces as null so the pipeline can declare its fallback. The
// "data" chunk is located by scanning the RIFF chunk table, never by
// assuming a fixed offset.

import ZAI from "z-ai-web-dev-sdk";

export interface TtsResult {
  wav: Uint8Array;
  durationMs: number;
  sampleRate: number;
  channels: number;
}

const KNOWN_VOICES: readonly string[] = [
  "tongtong",
  "chuichui",
  "xiaochen",
  "jam",
  "kazi",
  "douji",
  "luodo",
];
const DEFAULT_VOICE = "tongtong";
const MAX_INPUT_CHARS = 1000;

interface WavFormat {
  audioFormat: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
}

interface WavChunks {
  format: WavFormat;
  /** Raw PCM payload of the "data" chunk. */
  pcm: Uint8Array;
}

// ---------- public entry ----------

export async function synthesizeWav(text: string, voice: string, speed?: number): Promise<TtsResult | null> {
  try {
    const clean = text.replace(/\s+/g, " ").trim();
    if (clean.length === 0) return null;
    const safeVoice = KNOWN_VOICES.includes(voice) ? voice : DEFAULT_VOICE;
    const chunks = splitForTts(clean, MAX_INPUT_CHARS);
    if (chunks.length === 0) return null;

    const zai = await ZAI.create();
    const parsed: WavChunks[] = [];
    for (const chunk of chunks) {
      const response: unknown = await zai.audio.tts.create({
        input: chunk,
        voice: safeVoice,
        speed: speed ?? 1.0,
        response_format: "wav",
        stream: false,
      });
      const bytes = await responseBytes(response);
      if (bytes === null) return null;
      const wav = parseWav(bytes);
      if (wav === null || !saneFormat(wav.format) || wav.pcm.length === 0) return null;
      parsed.push(wav);
    }

    const first = parsed[0].format;
    const consistent = parsed.every(
      (w) =>
        w.format.audioFormat === first.audioFormat &&
        w.format.channels === first.channels &&
        w.format.sampleRate === first.sampleRate &&
        w.format.bitsPerSample === first.bitsPerSample,
    );
    if (!consistent) return null;

    const pcm = parsed.length === 1 ? parsed[0].pcm : concatBytes(parsed.map((w) => w.pcm));
    const bytesPerFrame = first.sampleRate * first.channels * (first.bitsPerSample / 8);
    if (bytesPerFrame <= 0 || pcm.length < bytesPerFrame) return null;
    const durationMs = Math.round((pcm.length / bytesPerFrame) * 1000);
    if (!Number.isFinite(durationMs) || durationMs <= 0) return null;

    return { wav: buildWav(first, pcm), durationMs, sampleRate: first.sampleRate, channels: first.channels };
  } catch {
    return null;
  }
}

// ---------- input splitting ----------

/** Split text into sentence-boundary chunks of at most `limit` chars. */
function splitForTts(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  const chunks: string[] = [];
  let buf = "";
  for (const raw of sentences) {
    const s = raw.trim();
    if (s.length === 0) continue;
    if (s.length > limit) {
      // A single sentence over the limit: hard-split on word boundaries.
      if (buf.length > 0) chunks.push(buf.trim());
      buf = "";
      let rest = s;
      while (rest.length > limit) {
        let cut = rest.lastIndexOf(" ", limit);
        if (cut < Math.floor(limit * 0.4)) cut = limit;
        const piece = rest.slice(0, cut).trim();
        if (piece.length > 0) chunks.push(piece);
        rest = rest.slice(cut).trim();
      }
      buf = rest;
      continue;
    }
    if ((buf + " " + s).trim().length > limit) {
      if (buf.length > 0) chunks.push(buf.trim());
      buf = s;
    } else {
      buf = (buf + " " + s).trim();
    }
  }
  if (buf.trim().length > 0) chunks.push(buf.trim());
  return chunks.filter((c) => c.length > 0);
}

// ---------- WAV parsing / merging ----------

function readU16LE(bytes: Uint8Array, off: number): number {
  return bytes[off] | (bytes[off + 1] << 8);
}

function readU32LE(bytes: Uint8Array, off: number): number {
  return ((bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24)) >>> 0);
}

function asciiAt(bytes: Uint8Array, off: number): string {
  return String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
}

function saneFormat(f: WavFormat): boolean {
  return f.channels > 0 && f.sampleRate > 0 && f.bitsPerSample > 0 && f.audioFormat > 0;
}

/** Scan the RIFF chunk table for "fmt " and "data" — never fixed offsets. */
function parseWav(bytes: Uint8Array): WavChunks | null {
  if (bytes.length < 44) return null;
  if (asciiAt(bytes, 0) !== "RIFF" || asciiAt(bytes, 8) !== "WAVE") return null;
  let format: WavFormat | null = null;
  let pcm: Uint8Array | null = null;
  let pos = 12;
  while (pos + 8 <= bytes.length) {
    const id = asciiAt(bytes, pos);
    const size = readU32LE(bytes, pos + 4);
    const dataStart = pos + 8;
    if (id === "fmt " && size >= 16 && dataStart + 16 <= bytes.length) {
      format = {
        audioFormat: readU16LE(bytes, dataStart),
        channels: readU16LE(bytes, dataStart + 2),
        sampleRate: readU32LE(bytes, dataStart + 4),
        bitsPerSample: readU16LE(bytes, dataStart + 14),
      };
    } else if (id === "data") {
      const available = Math.min(size, bytes.length - dataStart);
      if (available > 0) pcm = bytes.slice(dataStart, dataStart + available);
      break; // data is the payload chunk — stop scanning
    }
    if (dataStart + size > bytes.length) break; // truncated chunk table
    pos = dataStart + size + (size % 2); // chunks are word-aligned
  }
  if (format === null || pcm === null) return null;
  return { format, pcm };
}

/** Rebuild one clean WAV: canonical RIFF header + merged PCM payload. */
function buildWav(format: WavFormat, pcm: Uint8Array): Uint8Array {
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);
  const writeAscii = (off: number, text: string): void => {
    for (let i = 0; i < text.length; i++) header[off + i] = text.charCodeAt(i);
  };
  const bytesPerFrame = Math.round(format.channels * (format.bitsPerSample / 8));
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format.audioFormat, true);
  view.setUint16(22, format.channels, true);
  view.setUint32(24, format.sampleRate, true);
  view.setUint32(28, format.sampleRate * bytesPerFrame, true);
  view.setUint16(32, bytesPerFrame, true);
  view.setUint16(34, format.bitsPerSample, true);
  writeAscii(36, "data");
  view.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length);
  out.set(header, 0);
  out.set(pcm, 44);
  return out;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((acc, p) => acc + p.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const p of parts) {
    out.set(p, cursor);
    cursor += p.length;
  }
  return out;
}

// ---------- response normalization ----------

/**
 * The SDK hands back the raw fetch Response for TTS; tolerate the shapes a
 * Response (or a pre-read buffer) can legally take. Null when unreadable.
 */
async function responseBytes(response: unknown): Promise<Uint8Array | null> {
  if (typeof Response !== "undefined" && response instanceof Response) {
    if (!response.ok) return null;
    const buf = await response.arrayBuffer();
    return new Uint8Array(buf);
  }
  if (typeof response === "object" && response !== null && typeof (response as { arrayBuffer?: unknown }).arrayBuffer === "function") {
    const buf = await (response as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer();
    return new Uint8Array(buf);
  }
  if (typeof response === "object" && response !== null && ArrayBuffer.isView(response)) {
    const view = response as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  if (response instanceof ArrayBuffer) return new Uint8Array(response);
  return null;
}

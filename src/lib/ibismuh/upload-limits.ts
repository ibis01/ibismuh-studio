// Upload limits — the shared admission-control layer (2026-11-23 hardening).
//
// The battery of upload routes each enforced SOME of the walls (voiceover
// checked file.size before buffering; voices/clone buffered first and asked
// questions later — finding F-03). This module centralizes the contract:
//
//   1. REQUEST wall — Content-Length above the cap is refused before the
//      body is read (an oversized upload dies at the door, not in memory).
//   2. FILE wall — the parsed multipart File's size is checked BEFORE
//      arrayBuffer() materializes it (multipart metadata is the truth;
//      client MIME/filename are not).
//   3. FORMAT wall — magic bytes, never extensions: audio uploads must
//      carry a real audio container signature, images a real image one.
//   4. CONCURRENCY wall — a per-organization in-process upload slot cap so
//      one tenant cannot hold N workers busy with parallel multipart
//      streams (multi-instance deployments still get per-process ceilings;
//      the durable quota wall remains storage-quota.ts).
//
// The deep content validation (ffprobe must find an audio stream, etc.)
// stays where it was — those checks are the SECOND line, this module is the
// cheap first line that never allocates for garbage.

import type { NextRequest } from "next/server";

export class UploadTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadTooLargeError";
  }
}

export class UnsupportedMediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedMediaError";
  }
}

export class UploadConcurrencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadConcurrencyError";
  }
}

/**
 * Wall 1 — reject by Content-Length BEFORE the body is read. Chunked
 * requests (no Content-Length) pass here and hit Wall 2 after parsing:
 * between the two, an oversized upload can never be fully materialized.
 */
export function enforceRequestContentLength(
  req: NextRequest,
  maxBytes: number,
  label = "This upload",
): void {
  const raw = req.headers.get("content-length");
  if (raw === null) return; // chunked — Wall 2 decides after parse
  const declared = Number(raw);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new UploadTooLargeError(
      `${label} is ${Math.round(declared / 1024 / 1024)} MB — the limit is ${Math.round(maxBytes / 1024 / 1024)} MB`,
    );
  }
}

/** Wall 2 — the parsed File's size, checked BEFORE arrayBuffer(). */
export function enforceFileSize(
  file: File,
  maxBytes: number,
  label = "That file",
): void {
  if (file.size > maxBytes) {
    throw new UploadTooLargeError(
      `${label} is ${Math.round(file.size / 1024 / 1024)} MB — the limit is ${Math.round(maxBytes / 1024 / 1024)} MB`,
    );
  }
}

// ---------------------------------------------------------------- magic bytes

export type AudioContainer =
  | "wav"
  | "mp3"
  | "ogg"
  | "opus"
  | "webm"
  | "m4a"
  | "flac"
  | "aac";

const ascii = (buf: Buffer, start: number, len: number): string =>
  buf.toString("ascii", start, start + len);

/**
 * Wall 3 (audio) — sniff the REAL container from magic bytes. Extensions
 * and client MIME types lie; ffprobe later re-verifies with full parsing
 * (this gate just refuses the obvious garbage before it costs anything).
 */
export function sniffAudioFormat(buf: Buffer): AudioContainer | null {
  if (buf.length < 12) return null;
  // RIFF….WAVE
  if (ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 4) === "WAVE") return "wav";
  // ID3v2 tag or MPEG frame sync
  if (ascii(buf, 0, 3) === "ID3") return "mp3";
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return "mp3";
  // OggS (covers ogg vorbis + opus)
  if (ascii(buf, 0, 4) === "OggS") return "opus"; // vorbis pages also start OggS
  // EBML (webm/matroska audio)
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3)
    return "webm";
  // fLaC
  if (ascii(buf, 0, 4) === "fLaC") return "flac";
  // MP4/M4A — the ftyp box at offset 4 ("M4A ", "iso2", "mp42", …)
  if (ascii(buf, 4, 4) === "ftyp") return "m4a";
  // ADTS AAC
  if (buf[0] === 0xff && (buf[1] & 0xf6) === 0xf0) return "aac";
  return null;
}

export function enforceAudioMagicBytes(buf: Buffer, label = "That file"): AudioContainer {
  const format = sniffAudioFormat(buf);
  if (!format) {
    throw new UnsupportedMediaError(
      `${label} does not look like an audio file (WAV, MP3, OGG, WEBM, M4A, FLAC or AAC) — the file content does not match a real audio container`,
    );
  }
  return format;
}

// ------------------------------------------------------- concurrency slots

const g = globalThis as typeof globalThis & {
  __ibismuhUploadSlots?: Map<string, number>;
};
const slots = (g.__ibismuhUploadSlots ??= new Map<string, number>());

/** The per-organization concurrent-upload ceiling (per process). */
export const MAX_CONCURRENT_UPLOADS_PER_ORG = 4;

/**
 * Wall 4 — run fn while holding one of the organization's upload slots.
 * Exceeding the cap answers 429 (with a retry hint), never queues unbounded
 * multipart work. Slots are process-local: multi-instance deployments get
 * this ceiling per machine, and the durable bytes wall stays storage-quota.
 */
export async function withUploadSlot<T>(
  organizationId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const active = slots.get(organizationId) ?? 0;
  if (active >= MAX_CONCURRENT_UPLOADS_PER_ORG) {
    throw new UploadConcurrencyError(
      `Too many concurrent uploads for this workspace (${active} in flight) — retry in a moment`,
    );
  }
  slots.set(organizationId, active + 1);
  try {
    return await fn();
  } finally {
    const now = (slots.get(organizationId) ?? 1) - 1;
    if (now <= 0) slots.delete(organizationId);
    else slots.set(organizationId, now);
  }
}

/** Test hook — clear the slot counters. */
export function resetUploadSlots(): void {
  slots.clear();
}

// ---------------------------------------------------------------- quota wall

/**
 * The BYTES wall — the declared upload size must fit the organization's
 * remaining storage quota, checked BEFORE the body is buffered. The durable
 * wall stays storage.put's reservation (concurrent racers can still lose at
 * commit); this is the cheap early refusal that never allocates for work
 * that cannot be admitted anyway.
 */
export async function enforceQuotaHeadroom(
  organizationId: string,
  incomingBytes: number,
  label = "That upload",
): Promise<void> {
  const { usageBytes, storageQuotaBytes } = await import("./storage-quota");
  const quota = storageQuotaBytes();
  if (quota <= 0) return; // no quota configured (unlimited)
  const used = await usageBytes(organizationId).catch(() => 0);
  if (used + incomingBytes > quota) {
    const over = Math.ceil((used + incomingBytes - quota) / 1024 / 1024);
    throw new UploadTooLargeError(
      `${label} would exceed this workspace's storage quota by ~${over} MB — free up space or upgrade the plan`,
    );
  }
}

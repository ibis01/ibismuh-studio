// POST /api/voices/clone — "mimic a voice when uploaded".
//
// Multipart form:
//   file        (File)  the 3-30s voice sample   ─┐ one of the two
//   url         (text)  direct http(s) audio link ─┘
//   name        (text)  optional display name (defaults to the file name)
//   sampleText  (text)  optional transcript of the sample — improves fidelity
//   auditionText(text)  what the clone-time preview should say
//
// 200 → { ok, profile } — the new voice is immediately usable in every voice
// picker (id = voice_clone_…) and speaks via glm-tts.
// 400/409/502 → { error } with a human-readable reason.

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/ibismuh/tenant";
import { getCapability } from "@/lib/ibismuh/providers/settings";
import { cloneVoice, isCloneProvider, parseCloneConsent, pickCloneProvider, MAX_SAMPLE_BYTES } from "@/lib/ibismuh/voice-clone";
import { errorText } from "@/lib/ibismuh/redact";
import {
  UploadTooLargeError,
  UploadConcurrencyError,
  UnsupportedMediaError,
  enforceAudioMagicBytes,
  enforceQuotaHeadroom,
  enforceFileSize,
  enforceRequestContentLength,
  withUploadSlot,
} from "@/lib/ibismuh/upload-limits";

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  auth.enter(); // tenant scope: handler + spawned job closures

  // Auto-pick a clone-capable provider regardless of which TTS provider is
  // currently active. The active provider wins only if it's clone-capable AND
  // fully configured; otherwise pickCloneProvider prefers selfhost (the clone
  // itself needs no server — the sample is stored on the VoiceProfile row;
  // the server URL+key are only needed at synthesis time). This unblocks the
  // inline "Clone" flow in the video detail dialog: users clone right away
  // without first flipping Settings → Voiceover.
  const active = await getCapability("tts");
  let provider = (await pickCloneProvider()).provider;
  if (isCloneProvider(active.provider)) {
    if (active.provider === "selfhost" && (active.baseUrl?.trim() || active.apiKey?.trim())) {
      provider = "selfhost";
    } else if (active.provider === "zhipu" && active.apiKey?.trim()) {
      provider = "zhipu";
    } else if (active.provider === "voicestudio" && (active.baseUrl?.trim() || active.apiKey?.trim())) {
      provider = "voicestudio";
    }
  }

  // F-03 (upload admission): the request and file walls run BEFORE any
  // body is materialized — an oversized sample dies at the door (413), a
  // fake-extension file dies at the magic bytes, and one organization
  // cannot hold the workers with parallel clone streams.
  try {
    // multipart overhead (fields + boundaries) on top of the file cap
    enforceRequestContentLength(req, MAX_SAMPLE_BYTES + 64 * 1024, "The voice sample");
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload too large" }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected a multipart form with a 'file' (or 'url') field" },
      { status: 400 }
    );
  }

  const file = form.get("file");
  const url = form.get("url");
  const name = typeof form.get("name") === "string" ? String(form.get("name")) : "";
  const sampleText =
    typeof form.get("sampleText") === "string" ? String(form.get("sampleText")) : "";
  const auditionText =
    typeof form.get("auditionText") === "string" ? String(form.get("auditionText")) : "";

  // S121 consent ledger — the uploader records WHOSE voice this is and the
  // basis of their claim. Optional today (legacy rows have null), persisted
  // on every clone when supplied; the UI prompts for it next to the upload.
  // The law lives in parseCloneConsent (voice-clone.ts) — shared with its pin.
  const consentTextRaw =
    typeof form.get("consentText") === "string" ? String(form.get("consentText")) : "";
  const consentBasisRaw =
    typeof form.get("consentBasis") === "string" ? String(form.get("consentBasis")) : "";
  const parsedConsent = parseCloneConsent(consentTextRaw, consentBasisRaw);
  if (!parsedConsent.ok) {
    return NextResponse.json({ error: parsedConsent.error }, { status: 400 });
  }
  const consent = parsedConsent.consent;

  if (!(file instanceof File) && typeof url !== "string")
    return NextResponse.json(
      { error: "Attach the voice sample as 'file', or pass a direct audio link as 'url'" },
      { status: 400 }
    );

  try {
    const result = await withUploadSlot(auth.ctx.organizationId, async () => {
      let source:
        | { kind: "upload"; buffer: Buffer; filename: string }
        | { kind: "url"; url: string };
      if (file instanceof File && file.size > 0) {
        // Wall 2: the parsed File's size — checked BEFORE arrayBuffer()
        // materializes it (the old path buffered first and asked later).
        enforceFileSize(file, MAX_SAMPLE_BYTES, "The voice sample");
        await enforceQuotaHeadroom(auth.ctx.organizationId, file.size, "The voice sample");
        const buffer = Buffer.from(await file.arrayBuffer());
        // Wall 3: magic bytes — a ".wav" that is not a WAV dies here
        enforceAudioMagicBytes(buffer, "The voice sample");
        source = { kind: "upload", buffer, filename: file.name || "uploaded sample" };
      } else {
        source = { kind: "url", url: String(url ?? "").trim() };
      }
      return cloneVoice({
        source,
        name,
        sampleText,
        auditionText,
        provider,
        consent,
      });
    });
    return NextResponse.json({
      ok: true,
      profile: result.profile,
      // `pending: true` = the self-hosted voice server is synthesizing the
      // preview in the background — the UI polls /api/voices/{id}/audition
      // until it lands instead of having waited for it here.
      audition: result.auditionWav
        ? { available: true, bytes: result.auditionWav.length }
        : { available: false, pending: Boolean(result.auditionPending) },
    });
  } catch (err) {
    const message = errorText(err, "Voice cloning failed");
    const status =
      err instanceof UploadTooLargeError
        ? 413
        : err instanceof UploadConcurrencyError
          ? 429
          : err instanceof UnsupportedMediaError
            ? 400
            : /needs an API key|Add your bigmodel/.test(message)
              ? 409
              : /too small|no audio|Could not read|not a valid|exceeds|enormous|only .*s/.test(message)
                ? 400
                : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

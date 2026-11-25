// Voice catalog for the ACTIVE voiceover provider — drives every voice picker
// so a video saved with a Z.ai voice keeps working after switching providers.
// Cloned voices (VoiceProfile rows) are appended when they can be spoken —
// either because the active provider is clone-capable, OR because a saved
// credential exists for the clone's owning provider (ttsSynthesize auto-routes
// a cloned-voice request to its owning provider at synthesis time, so a user
// with active Z.ai can still speak a self-hosted clone if the selfhost server
// URL+key are saved).
// Stage 2: the active provider config is per-user (UserSetting + credential).

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/ibismuh/tenant";
import { getCapability, getProviderCredential } from "@/lib/ibismuh/providers/settings";
import { voiceCatalog, listCartesiaVoices } from "@/lib/ibismuh/providers/tts";
import { providerMeta } from "@/lib/ibismuh/providers/registry";
import {
  CLONE_PROVIDERS,
  isCloneProvider,
  listVoiceProfiles,
} from "@/lib/ibismuh/voice-clone";
import { sharedVoiceServer } from "@/lib/ibismuh/shared-voice";

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  auth.enter(); // tenant scope: handler + spawned job closures

  const config = await getCapability("tts");
  const model =
    config.provider === "openai"
      ? config.model?.trim() || "gpt-4o-mini-tts"
      : config.model?.trim();
  let voices = voiceCatalog(config.provider, model);

  // S159 — the LIVE overlay (the Cartesia law, mirrored across the
  // account-list providers): the static catalog stays the offline shape
  // fallback; the account's real voices (custom voices and clones included)
  // lead the picker when the live probe answers. UUID/20-char ids pass
  // sanitizeVoice verbatim, so anything picked here rides to the provider
  // untouched — no more stale hard-coded id 404s.
  if (config.provider === "cartesia") {
    const live = await listCartesiaVoices(config);
    if (live.length) {
      const liveIds = new Set(live.map((v) => v.id));
      voices = [...live, ...voices.filter((v) => !liveIds.has(v.id))];
    }
  } else if (config.provider === "elevenlabs") {
    const { listElevenlabsVoices } = await import("@/lib/ibismuh/providers/tts");
    const live = await listElevenlabsVoices(config);
    if (live.length) {
      const liveIds = new Set(live.map((v) => v.id));
      voices = [...live, ...voices.filter((v) => !liveIds.has(v.id))];
    }
  } else if (config.provider === "playht") {
    const { listPlayhtVoices } = await import("@/lib/ibismuh/providers/tts");
    const live = await listPlayhtVoices(config);
    if (live.length) {
      const liveIds = new Set(live.map((v) => v.id));
      voices = [...live, ...voices.filter((v) => !liveIds.has(v.id))];
    }
  }

  // Cloned voices are speakable when their owning provider has saved creds.
  // The active provider being clone-capable is the simple case; the auto-route
  // case (active=zai, clone=selfhost with saved URL+key) lets clones appear
  // even when the active TTS isn't clone-capable. The operator's shared voice
  // server counts as a speakable selfhost credential for every user.
  const speakableCloneProviders = new Set<string>();
  if (isCloneProvider(config.provider)) speakableCloneProviders.add(config.provider);
  if (sharedVoiceServer()) speakableCloneProviders.add("selfhost");
  for (const p of CLONE_PROVIDERS) {
    const cred = await getProviderCredential("tts", p);
    if (cred?.apiKey?.trim() || cred?.baseUrl?.trim()) {
      speakableCloneProviders.add(p);
    }
  }
  // listVoiceProfiles takes a single provider; fetch each speakable one and
  // dedupe by id (an active clone-capable provider may overlap with a saved
  // credential for the same provider).
  const cloned: { id: string; label: string }[] = [];
  const seenCloneIds = new Set<string>();
  for (const p of speakableCloneProviders) {
    const rows = await listVoiceProfiles(p);
    for (const r of rows) {
      if (!seenCloneIds.has(r.id)) {
        seenCloneIds.add(r.id);
        cloned.push({ id: r.id, label: r.label });
      }
    }
  }

  const meta = providerMeta("tts", config.provider);
  return NextResponse.json({
    provider: config.provider,
    model,
    voices: [...voices, ...cloned],
    // canClone is the legacy "active provider is clone-capable" flag for the
    // Voice Studio picker; the inline Clone tab uses the new clone-providers
    // endpoint's status instead.
    canClone: isCloneProvider(config.provider),
    note: meta?.note ?? "",
  });
}

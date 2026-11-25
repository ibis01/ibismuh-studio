# Live AI-Provider Validation — the script→video money path on real providers

| | |
|---|---|
| Gate | The external review's gate 2: "configure affordable providers and test complete script-to-video workflows." Machine-executable evidence for the provider-backed stages; the harness gates itself so CI/nightly never spends by surprise. |
| Harness | `scripts/live-provider-production-test.mts` (committed) — register → brief → **LIVE script** → **LIVE analysis** → **LIVE voiceover** → render → QC → export, per-stage latency, JSON receipt under `validation/live-provider/` (gitignored). Kill-switch: `IBISMUH_STUDIO_LIVE_AI=0`. |
| Run of record | `receipt-2026-11-18T14-38-59-707Z.json` — verdict **FAIL (honest)**: 6/9 stages passed; the TTS stage could not land within its 240 s window because the sandbox gateway is hard-throttling TTS. |
| Related evidence | `scripts/test-providers.mjs` Part A (the 13-scenario stub suite — exact wire formats for openai/anthropic/gemini adapters, TTS/ASR/image/image-edit through the REAL settings endpoint); `src/lib/ibismuh/providers/registry.ts` (the affordable-provider menu). |

## 1. What the run of record proves (live, this sandbox)

| Stage | Result | Latency | Evidence |
|---|---|---|---|
| server reachable | PASS | 77 ms | GET / |
| register + login | PASS | 175 ms | session cookie set |
| brief accepted | PASS | 32 ms | `POST /api/videos` → `cmwm81in703brt0ebx98vqqrj` |
| **LIVE script generation** | **PASS** | **24.9 s** | **364 words, 14 scenes scaffolded — the story lane's LLM job wrote the whole script through the gateway, unprompted by the create route** |
| **LIVE script analysis** | **PASS** | **3.3 s** | `POST /api/videos/analyze-script` — the creator-in-control verdict, real LLM |
| LIVE voiceover (TTS) | FAIL (honest) | 240 s cap | 202 accepted; job ran; `hasVoiceover` never landed |
| render | FAIL (correct gate) | 78 ms | **409 "The voiceover is still regenerating — wait for it to finish before rendering" — the render gate refuses honestly rather than rendering a silent program** |
| QC battery | n/a | — | no render → no QC (correct) |
| export bundle | PASS | 109 ms | `GET /export` → 200 |

**Direct capability probes (isolating the gateway from the app):**

| Capability | Probe | Result |
|---|---|---|
| chat | SDK completion, 1 call | **336 ms — LIVE** |
| tts | `ttsSynthesize` (zaiTts → SDK) | **429 "Too many requests" in ~115 ms** — twice, 90 s apart (sustained quota state, not a short window) |
| image | `imageGenerate` (SDK) | **429 in ~95 ms** — same throttle state |

The gateway throttles TTS and image while leaving chat open. The app's
behavior through the storm is the finding of record:

1. The TTS lane's job accepted (202), stayed `running`, and **retried with
   documented patience** — `aiCall("tts", …, { attempts: 6, baseDelayMs:
   8000 })` per chunk, ≈16 min of patience per chunk, across 14 scenes.
   No error surfaced to the video (correct: the job had not exhausted its
   patience yet).
2. The render gate refused (409) instead of rendering a silent program —
   the gate UX is right.
3. **The product finding:** an infrastructure-wide 429 storm turns a
   two-minute voiceover into a potentially hours-long silent grind
   (6 attempts × 8 s base backoff × chunks × scenes), with no
   capability-level circuit breaker to stop early and say "the provider's
   quota is exhausted — configure an alternative voice lane."

## 2. The improvement finding (owner slice, not yet built)

**F-1 — TTS/image quota circuit breaker.** When consecutive `aiCall`
attempts for one capability return quota-class errors (429 at the
provider level, not the app limiter), stop after a bounded number of
full rounds (e.g. one), fail the stage with a capability-specific
message, and surface the registry's alternatives in the workspace
("TTS quota exhausted — VoiceStudio/Kokoro/Chatterbox are $0 lanes").
Owner slice: `src/lib/ibismuh/budget.ts` (aiCall) + the voiceover stage
error surface; acceptance = a scripted 429 storm fails the stage inside
one retry round with the alternatives message, battery-pinned.

**F-2 — progress honesty during storms.** The Job row's `updatedAt` froze
for minutes while chunk retries ground silently. `setJobProgress` fires at
scene boundaries only; a per-attempt progress line ("scene 3, attempt 2/6,
429 from provider") would make the grind legible. Owner slice:
`generateSceneVoiceovers`'s `aiCall` callback → progress; acceptance =
during a scripted storm the DTO/job snapshot shows the attempt counter.

## 3. The affordable-provider story (verified from the registry, `registry.ts`)

| Capability | $0 lanes of record |
|---|---|
| chat | Z.ai flash models ("scripts cost $0 on a fresh key" — and the run of record proves the lane end-to-end); local Ollama/LM Studio/vLLM (`requiresKey: false`) |
| tts | VoiceStudio self-hosted (Apache-2.0 engines, port 3900); Zhipu GLM-TTS (studio voices + clones); HeyGen free tier (30 req/min, free until 2026-11-30); Chatterbox self-host (MIT, "CPU speed — slower than paid APIs, but $0, no rate limits"); **Kokoro local (Apache-2.0, 82M params, CPU-friendly, `requiresKey: false`)** |
| image | per-provider free/test lanes (`imageTestFreeLane`) |

None of the $0 TTS lanes was running in this sandbox at validation time
(no VoiceStudio on 3900, no Kokoro on 8880, no shared voice server env).
That is the honest boundary of this record: **the harness is complete and
the chat lane is proven live; the TTS/image stages need either gateway
quota or one of the $0 lanes running** — the harness will produce the full
PASS receipt wherever either condition holds.

## 4. Re-running

```bash
# sandbox/CI default: skipped without a server; kill-switch honored
IBISMUH_STUDIO_LIVE_AI=0 node --import tsx scripts/live-provider-production-test.mts

# provisioned environment (gateway quota, or a $0 TTS lane running):
node --import tsx scripts/live-provider-production-test.mts [--base http://localhost:3000]
```

Wire-format assurance for public providers (OpenAI/Anthropic/Gemini/open-
compatible TTS/image servers) lives in `scripts/test-providers.mjs` Part A
and does not need a key. The Part B live cross-provider run remains
sandbox-impossible by design (the internal gateway requires private
session headers) — run it from any machine with outbound HTTPS to the
public endpoint.

## 5. Honest boundary

- The chat-lane evidence is live and reproducible (script + analysis
  stages, twice through the same gateway this session).
- The TTS/image evidence is **throttle-state evidence**: the lanes are
  correctly wired (202 → job → retries → gate), but no audio/image bytes
  were produced this session because the gateway quota was exhausted.
- Machine evidence does not substitute for the S162 human visual gate;
  nothing here claims otherwise.

# S173–S176 — Programme D (the Affordable Voice Engine)

| | |
|---|---|
| Milestones | S173 — Local Voice Engine (zero per-generation cost); S174 — Voice Quality; S175 — Intelligent Voice Management; S176 — Voice Provider Router. |
| Modules | `providers/registry.ts` (the Kokoro adoption); `voice-router.ts` (NEW, pure); `voice-manager.ts` (NEW, pure). |
| Status | **CLOSED (code)** — battery 989/989 (8 new pins), typecheck + lint clean. The law held throughout: **extend the existing TTS architecture, do not build another subsystem** — the executor (`providers/tts.ts`), the registry, `pronounce.ts` and the S176-v1 advisory scorer all stay; these are the decision/planning layers they were missing. |

## S173 — Local Voice Engine

**Kokoro is adopted** — the roadmap's one named candidate requiring
adoption work. Registry entry: Apache-2.0 weights (licence review
recorded in the model hint — principle 9), OpenAI-compatible server
(kokoro-fastapi, loopback default), `requiresKey: false`, the same
$0-per-generation contract as `selfhost` (Chatterbox, MIT). The
registry-priors lockstep held: `kokoro` gained its starting-beliefs row
in `provider-score.ts` (quality 0.66 / latency 0.4 / fit 0.75 — smaller
model, faster latency, per the file's priors-are-starting-beliefs law).
The local tier contract is pinned: every tier-1 provider is
registry-present and zero-cost.

## S176 — Voice Provider Router (principle 8 by SIGNATURE)

The hierarchy as closed data: tier 1 zero-cost (`selfhost`, `kokoro`,
`voicestudio`) → tier 2 free cloud (`heygen`) → tier 3 paid. The router
is availability-aware (it never assumes a provider is reachable),
honors the user's preference WITHIN its tier, and uses the advisory
score as a tie-breaker — never across tiers.

**"Free cloud tiers must have spending limits and must never silently
become paid fallbacks" is now a function signature, not a warning:**
every chain step carries its `costClass`; a paid step requires the
caller's explicit `paidFallbackAcknowledgement` flag — the unacknowledged
chain REFUSES with the would-be chain disclosed; and the FREE operating
mode (S184) routes to zero-cost providers ONLY — a free mode with only
paid providers reachable refuses outright, stating the law. The free
tier still produces complete videos (selfhost/kokoro/voicestudio) — it
just never silently spends.

## S174 — Voice Quality (the closed profiles)

Four profiles, closed set: **nigerian-english first-class** (the
roadmap names it), british-english, american-english, neutral-multilingual.
Each compiles into the provider-facing knobs (rate 0.5–1.5, pauseScale
0.5–2, the emotion hint) with measured defaults per profile; junk knobs
refuse. **The long-form consistency law is structural:** a long-form
production must pin ONE voiceId — profiles do not drift mid-script.

## S175 — Intelligent Voice Management (the pure planner)

The Director's voice loop as data: `chunkNarration` splits on sentence
boundaries (deterministic, never splits a sentence, the 480-char wall,
**scope-namespaced chunk ids** — a production chunks many slots and the
battery caught the per-slot id collision before it could ship);
`planVoiceProduction` maps chunks onto the S170 narration slots with
per-chunk pronunciation corrections riding `pronounce.ts`'s stored-pair
format (unmapped narration is an ERROR — text no scene will speak must
not silently vanish); `chunksNeedingRegeneration` returns ONLY the
failed + stale chunk ids — **selective regeneration, never the whole
script** (the roadmap's "regenerates only failed sections").

## Acceptance evidence

Battery 989/989 — pins: the Kokoro entry + lockstep priors; the local
tier contract; the router's tier order with/without acknowledgement; the
free-mode-only-zero-cost law (both directions); profile defaults + the
closed set + range walls + the long-form voice pin; deterministic
sentence chunking with the wall and a determinism pin; the slot mapping
with corrections and selective regeneration (the successful chunk
untouched, stale verdicts caught).

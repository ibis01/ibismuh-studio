# TubeForge G0 — Verified Baseline Report

| | |
|---|---|
| Stage | G0 — baseline and architecture verification |
| Audit date | 2026-11-14 |
| Method | Read-only GitHub REST API audit (token-authenticated). No code changed, no branches, no PRs, no issues created. |
| Repos audited | `ibis01/tubeforge` (HEAD `37796ce`, branch `main`), `kaomei/stickman-video-director` (HEAD after merge `44873d1e`), `debpalash/VoiceStudio` (HEAD after `9a46ebd`) |
| Verification | Every load-bearing claim re-checked against the API; 6 claims independently spot-verified a second time |

## 1. Executive verdict

The 14 November check is **substantively correct**. All of its load-bearing claims are confirmed against the live API, with **three corrections** that change integration planning:

1. **VoiceStudio DOES accept custom voice-profile IDs on the OpenAI-compatible endpoint.** The "custom voice ID falls back to a standard voice" limitation lives entirely inside TubeForge (`sanitizeVoice` maps unknown voices to the catalog's first entry). The fix is TubeForge-side; VoiceStudio needs no change.
2. **Stickman's B6 claims live in `SKILL.md` and `references/`, not in `README.en.md`** (the README is marketing copy; the acceptance rules were deliberately moved out of localized READMEs in commit `31a17ac9`). Any future citation should point at the skill docs.
3. **TubeForge's README does not contain the G1/K1/C2-ext/R/X planned-engine table.** The README only links the S120 roadmap; the future-engine table lives solely in `docs/design/s120-2d-animation-roadmap.md`.

Also confirmed and still outstanding: the S120 documentation drift and the blind perceptual re-score.

## 2. Claim-by-claim verification

| # | Claim from the prior check | Verdict | Evidence |
|---|---|---|---|
| 1 | `37796ce` is the latest TubeForge commit, a W7 proof-script cleanup | CONFIRMED | `37796ce` = "chore(proof): drop a dead computation from the W7 proof script", 2026-11-14T03:46Z, parent `b871e01`, 5 files, +0/−5 |
| 2 | W7 landed in `b871e01` | CONFIRMED | "feat(whiteboard): W7 — the finishing layer (S120 §3)", 2026-11-14T03:44Z, +1389/−104 across 16 files incl. new `src/lib/tubeforge/whiteboard/sfx-plan.ts` and `scripts/w7-finishing-proof.mts` |
| 3 | W1–W7 all landed | CONFIRMED | W1 `e90c2c6` → W2 `e387287` → W3 `381e534` → W4 across 5 commits (`c818f75`, `5fbd134`, `d5afb69`, `41b7416`, `d45faed`) → Stage S `14b67fe` → W5 `e6fafe6` → W6 `712e0e5` → W7 `b871e01`. Entire W-track landing window: 2026-11-13T19:09 → 2026-11-14T03:46 |
| 4 | 597 unit tests | CORROBORATED | `worklog.md` L6794: "PROOF: 590 → 597 (the W7 battery …)". Pre-W-track count was 534 (commit `745b795`). Not independently re-run |
| 5 | 8 CI gates green | CONFIRMED | `ci.yml` defines exactly 8 jobs (gitleaks; typecheck·lint·unit; production build; money-path coverage; PostgreSQL integration; clean-clone P0.1; Docker smoke P0.6; Playwright e2e). HEAD actually carries **10** green check-runs (8 CI + 2 Nightly battery). Vercel combined status: success |
| 6 | S120 roadmap doc still says PLANNED / W3–W7 future | CONFIRMED verbatim | §0 line 3: "**Status:** PLANNED — the roadmap stage. … Ground truth verified 2026-11-13 against HEAD `e387287` (W2, 'the semantic beat compiler')" — i.e. the doc predates W3–W7 + Stage S entirely |
| 7 | Blind perceptual re-score outstanding | CONFIRMED | S120 §4 prescribes a per-stage blind kit (≥3 human scorers, composite ≥ 4/5, `docs/audits/wN-blind-rescore.md` per stage) and routes failures back into the W-track before G1 starts. No `wN-blind-rescore.md` exists in the tree. README agrees: "The blind re-scores and the operator-side staging drills remain." |
| 8 | README contains the planned-engine table | CORRECTED | README links S120 only; the G1/K1/C2-ext/R/X table lives solely in the S120 doc |
| 9 | Stickman B6: preflight, timing helpers, 30 fps drafts, localized repairs, audio reuse, 35 checks preserved | CONFIRMED | All six land in one change-set: `d4cef438` "Speed up B6 iteration with character preflight and 30fps drafts" (19 files: +`scripts/b6_character_preflight.py`, `scripts/b6_iteration.py`, `scripts/b6_actions.py`, 4 test files, `references/b6-*.md` docs; wires `draft`/`preflight`/`plan-iteration` into `b6_production.py`), merged as `44873d1e` 2026-11-14T10:48Z |
| 10 | Stickman preserves 35 final quality checks | CONFIRMED | `references/b6-sample-1-acceptance.md`: 8 groups × (4+4+4+4+4+5+3+7) = **35 subchecks**; drafts "cannot serve as formal review/approval evidence" (`references/b6-fast-iteration.md`) |
| 11 | Stickman is MIT | CONFIRMED | `license.spdx_id` = MIT; LICENSE verbatim "MIT License / Copyright (c) 2026 Stickman Video Director contributors" |
| 12 | VoiceStudio `001470e` route-authorization census + policy test | CONFIRMED | "test(api): fail any mutating route that ships without an authorization decision (#4130)", 2026-11-14T13:47Z; adds `scripts/dump_route_auth.py` (137 lines), `tests/test_route_authorization_policy.py` (483 lines), `docs/api-auth.md` +11 |
| 13 | VoiceStudio `9a46ebd` consumer/admin authz on model lifecycle | CONFIRMED | "fix(api): gate the model lifecycle routes (#4122)", 2026-11-14T14:17Z; `backend/api/routers/setup/download.py`: `require_consumer` on `POST /models/install` (L596) and `POST /models/install/cancel` (L1142), `require_admin` on `DELETE /models/{repo_id:path}` (L1165) |
| 14 | `/ws/tts` + `/ws/events` rely on API-key middleware; no-key bootstrap retained; share PIN is HTTP-only | CONFIRMED verbatim | `docs/api-auth.md`: "In particular, `/ws/tts` and `/ws/events` rely on the application API-key middleware and have no inline dictation guard: with no API key configured they retain the existing bootstrap behavior, and the HTTP-only share PIN does not protect them." |
| 15 | OpenAI-compatible `POST /v1/audio/speech`, port 3900, `tts-1`, `wav`, `OMNIVOICE_API_KEY` | CONFIRMED | `backend/api/routers/openai_compat.py` (router prefix `/v1` L154, route L836, `SpeechRequest` L247: `model` default `omnivoice` with `tts-1`/`tts-1-hd` as aliases; `response_format` includes `wav`); port 3900 (`backend/main.py` L2386); `BearerKeyMiddleware` (`main.py` L1987, mounted L2088); docker-compose publishes `127.0.0.1:3900:3900` and **requires** `OMNIVOICE_API_KEY` |
| 16 | "Custom VoiceStudio voice-profile IDs fall back to a standard OpenAI voice" | **CORRECTED — TubeForge-side only** | VoiceStudio accepts profile IDs on `voice`: `_resolve_voice_profile` (`openai_compat.py` L198) — "An exact profile id always wins; otherwise a unique case-insensitive profile name matches"; ambiguous names → `409`. The fallback to `alloy` happens in **TubeForge** `src/lib/tubeforge/providers/tts.ts` `sanitizeVoice` (L64–76): any voice not in the provider catalog is replaced with `catalog[0].id`; OpenAI allowlist `OPENAI_VOICES` (`registry.ts` L532–539) = alloy, echo, fable, onyx, nova, shimmer |
| 17 | VoiceStudio is AGPL-3.0 | CONFIRMED | `license.spdx_id` = `AGPL-3.0`; LICENSE header verbatim |
| 18 | VoiceStudio transcription integration | NEW FINDING | REST `POST /v1/audio/transcriptions` (`openai_compat.py` ~L1290–1355) supports `timestamp_granularities[]=word` with `response_format=verbose_json` → `words: [{word, start, end}]` (`_openai_words` L1243). WS dictation (`/ws/transcribe`) does **not** emit word timestamps. REST word timings are exactly the input TubeForge's W4-style voice-anchors consume |

## 3. Verified implementation map (TubeForge @ `37796ce`)

Full tree: 997 entries / 782 blobs, `truncated: false` — the listing is complete.

| Capability | Exact paths |
|---|---|
| W1 perceptual benchmark | `scripts/w1-whiteboard-benchmark.mts`, `src/lib/tubeforge/whiteboard/benchmark-scenarios.ts`, `docs/baselines/w1-whiteboard-baseline-2026-11-13.json`, `docs/audits/w1-blind-rubric.md` |
| W2 semantic beat compiler | `src/lib/tubeforge/whiteboard/beat-plan.ts` |
| W3 SVG asset validation | `src/lib/tubeforge/whiteboard/asset-validate.ts` (+ `assets.ts`, `asset-store.ts`, `upload.ts`) |
| W4 word-aligned timing + handwritten glyphs | `whiteboard/voice-anchors.ts`, `timing.ts`, `text-draw.ts`, `glyphs.ts` |
| W5 content-driven camera | `whiteboard/camera-director.ts` |
| W6 continuous canvas | `whiteboard/wb-page.ts`, `timing.ts`, `render.ts`, `storyboard.ts` |
| W7 finishing layer | `whiteboard/timing.ts` (`handAt`), `assets.ts`, `sfx-plan.ts`, `src/lib/tubeforge/sfx.ts`, `scripts/w7-finishing-proof.mts` |
| Stage S animation substrate | `src/lib/tubeforge/anim/{easing,keyframe,clock}.ts` (landed `14b67fe`) |
| Shared timeline (S87) | `src/lib/tubeforge/timeline.ts` (706 lines), `whiteboard/tracks.ts` (engine→tracks projection), `composition-plan.ts`, `docs/design/s87-universal-timeline.md` |
| Lanes / compositor / export | `render-lane.ts` (S119 lane resolver), `render.ts` (2,101-line compositor), `render-assembly.ts` (S117 approved-only manifest), `render-qc.ts` + `qc.ts` (13-check battery), `render3d.ts` (peer-lane precedent), `src/app/api/videos/[id]/render/route.ts` |
| AI Director | `director.ts`, `director-plan.ts`, `liveliness.ts`, `preview-lanes.ts`, `src/app/api/videos/[id]/director/route.ts` — S120 §9 Stage R per-scene router **not** implemented |
| TTS adapters | `providers/tts.ts` (zai, zhipu, **openai**, heygen, selfhost), `providers/registry.ts` (voice catalogs), `voice-clone.ts`, `shared-voice.ts`, `voice-preview.ts`, `pronounce.ts` |
| Scene editor / repair | `scene-editor.tsx`, `scene-repairs.ts`, `scene-revisions.ts`, `scene-artifacts.ts`, `scene-deps.ts`, `scene-qc.ts`, `src/app/api/videos/[id]/scenes/[n]/repair/route.ts` |
| Tests / CI | `scripts/test-unit.mts` (house battery), ~120 `scripts/sN-*` probes, `e2e/*.spec.ts` (10 suites), `.github/workflows/{ci,nightly}.yml` |
| Design docs | 13 files under `docs/design/` incl. `s120-2d-animation-roadmap.md`, `s87-universal-timeline.md`, `s93-character-rig.md` |

## 4. G1/K1 greenfield check

| Keyword scan of the full tree | Result |
|---|---|
| Motion graphics engine | **Greenfield.** No `graphics/` engine dir; closest is `slides.ts` (static PNGs + camera push) — not motion graphics |
| Keyframe/easing | Already landed: `anim/{easing,keyframe}.ts` (Stage S) — G1/K1 consume, do not duplicate |
| Cinematic motion | `motion.ts` exists — that is the C2-ext vocabulary, not motion graphics |
| Character rig | `character-rig.ts` = S93 camera-breath rig over still portraits only; no skeletal rig — K1 is greenfield |
| Character identity/poses | `characters.ts`, `character-identity.ts`, pose-sheet API routes (S82/S83) exist; real skeletal animation does not |
| Typography/diagram/viseme/IK/puppet | No hits — greenfield |

## 5. Contracts the next engines must plug into

1. **Track-kind seats already reserved** — `src/lib/tubeforge/types.ts` L580: `TimelineTrackDTO.kind` already includes `"graphics"` and `"character"`. `RENDER_MODES` (types.ts L107) does **not** yet contain `graphics`; S120 requires G1 to add it in lockstep with `render-lane.ts`.
2. **Lane contract (S119)** — `type RenderLane = "whiteboard" | "story"`; pure `resolveRenderLane(bodyMode, rowRenderMode)`, unit-pinned. G1 adds a peer lane here.
3. **Animation substrate (Stage S, landed)** — `anim/easing.ts` (`EaseName = linear | ease-in-out | ease-out | pop | ease-back`), `anim/keyframe.ts` (`Keyframe { tMs, value, ease? }`, `evalAt`, strict-ascending validation), `anim/clock.ts` (`ANIM_FRAME_BUDGET = 25_920` = 18 min @ 24 fps; "ONE wall, two engines").
4. **Projection law** — `whiteboard/tracks.ts`: one clip per scene on the 2-dp composition clock, frame-quantized, contiguous by construction, leaf-module imports only. The timeline is a projection, never the source of truth (S87).
5. **Renderer** — one compositor (`render.ts`); `render3d.ts` is the precedent for adding a peer lane without a second renderer. No `X`-stage external renderer permitted.

## 6. Risks, hygiene and security findings

- **Doc drift (confirmed):** `s120-2d-animation-roadmap.md` §0 pins ground truth at `e387287` (W2) while W3–W7 + Stage S landed hours later. Exact reconciliation edits are listed in §7.
- **Commit hygiene:** two UUID-only commit subjects (`9893364`, `5f420d8`, 2026-11-13) break the repo's descriptive-subject pattern.
- **`pushed_at` (14:47Z) is 11 h after main's tip (03:46Z)** — later pushes touched other branches; main HEAD remains `37796ce`.
- **VoiceStudio WebSocket exposure:** `/ws/tts` and `/ws/events` are middleware-only; with no `OMNIVOICE_API_KEY` set, remote callers reach them and the share PIN does not apply. Deployment rule: publish `127.0.0.1:3900:3900`, always set a long random API key, TLS/private overlay for cross-host traffic.
- **VoiceStudio policy allowlist encodes explicit KNOWN GAPS** (dub history, archetype previews, community items, several `/tools/*` routes). Only build on `/v1/*` until those gaps close.
- **AGPL §13:** run VoiceStudio unmodified as a separate sidecar behind an API boundary; linking its Python into TubeForge would trigger network copyleft. Model weights/output have separate per-model licences surfaced in its Model Manager.

## 7. G0 reconciliation edits (exact, file-by-file)

All in `docs/design/s120-2d-animation-roadmap.md`:

1. §0 status line → "**Status:** PARTIALLY EXECUTED — W1–W7 and Stage S LANDED (2026-11-14, HEAD `37796ce`); blind re-score outstanding (§4); G1/K1/C2-ext/R/X remain planned." Update the ground-truth sentence to HEAD `37796ce`.
2. §2 table row "Whiteboard W1–W7" → "W1–W7 + Stage S landed (`e90c2c6`…`b871e01`); blind re-score pending".
3. §3 heading "Stage specs — whiteboard finishing track (W3–W7)" → append "(EXECUTED 2026-11-14; audit records in `docs/audits/w3…w7-*.md`)".
4. §10 sprint order → mark items 1–5 (W3 validator … W7 finishing) done; item 6 (blind re-score) remains open and now gates G1.

No README change required (already accurate).

## 8. G0 acceptance criteria

1. Every claim in the prior check has a verdict row above (done — §2).
2. Documentation drift reproduced verbatim with the exact stale sentences (done — §2 row 6, §7).
3. Implementation map grounded in a complete, untruncated tree listing (done — §3).
4. G1 prerequisites verified present (anim substrate, lane contract, track seats) and G1/K1 scope confirmed greenfield (done — §4, §5).
5. G0 makes **no** code changes (done — read-only attestation).

**G0 verdict: COMPLETE.** The baseline is verified; the blind re-score (S120 §4) remains the only open W-track gate before G1 implementation begins.

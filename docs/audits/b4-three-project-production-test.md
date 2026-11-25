# B4 — the three-project production test (record)

Status: COMPLETE (2026-11, 13/13 checks · 0 failed) · Harness:
`scripts/b4-production-test.mts` (live stack: dev server + SQLite; JSON:
`/tmp/b4-production-test.json`, session artifact — re-runnable against any
booted server). Commissioned by the operator's directive: "Before adding more
features, we need a real product test" — three representative projects,
measured on the eight metrics, with provider-gated steps recorded honestly.

**Provider reality of the sandbox (recorded up front):** NO AI provider keys
are configured (LLM script, image gen, TTS, i2v, stock). Every number below is
the OFFLINE/NATIVE truth; where a key would change the number, the gap is
named, never papered over.

---

## P1 — Cinematic Islamic history ("The Golden Age of Al-Andalus") — story / kenburns

| Metric | Measured |
|---|---|
| Brief → first preview | Structure-only offline: the storyboard scaffolded **14 scenes** (visual/camera/mood continuity fields) deterministically; the script job is LLM-gated (still queued at the 45 s window) |
| Manual corrections | 1 — the creator-authored script through the PATCH (the product's creator-in-control path) |
| Scene continuity | The S77 fields scaffold per scene; the continuity CHECKER is LLM-gated |
| Motion quality | kenburns engine unchanged (S162/S163 receipts); no render without art |
| Audio sync | Provider-gated (no TTS key) |
| Render reliability | **The render gate refused with 400** — no voice, no art, nothing behind the file (the S75 probe wall's product-side law held) |
| Generation cost | $0 spent, $0 possible offline |
| Ease of editing | PATCH/scene/consistency routes answered <300; the workspace surfaces them (B3 receipts) |

Honest gaps: scene ART (image gen), narration (TTS), the LLM script — each is
one provider key away; the structure + gates + correction paths all measured.

## P2 — 2D educational motion graphics ("How bridges stand") — graphics lane — **full offline production**

| Metric | Measured |
|---|---|
| Brief → first preview | The hand-authored doc landed through the validated PUT and plays immediately via the canvas seam (the native scaffold honestly refused: story scenes are LLM-gated — recorded, then the creator authored the doc, the exact wire path the B4-2 Motion panel drives) |
| Manual corrections | 1 PUT (2 scenes, 5 elements, S162 measured eases, an `sfx` cue) |
| Scene continuity | The grammar's scene clock + VO tail law (S152) — no cross-scene art to drift |
| Motion quality | measured eases (`measured-out`/`expo-out`/`glide`) + the tween channels evaluated in the REAL render; the QC determinism sweep ran |
| Audio sync | **A real mixed program**: the synthesized bed + the whoosh cue via the B4-4 seam — QC loudness **−17.3 LUFS** (the −16 window), true-peak −6.3 dBTP, dead-air none; narration is the honest silence (no TTS key) |
| Render reliability | **final.mp4 landed offline end-to-end** (chromium + ffmpeg), 10.0 s program, QC battery ALL-PASS on the standing render |
| Generation cost | $0 — hand-authored doc, native render, in-app synthesized bed, zero providers |
| Ease of editing | B4-2 motion authoring surfaces in the studio; the export bundle route answered 200 |

**THE TEST EARNED ITS KEEP — it caught a latent main-branch bug:** every
fresh-seeded music bed failed at render time ("Error opening input file") —
`e78702b` (2026-11-01) had changed the music storage key to a MUSIC_DIR-relative
BARE name while `trackAbsolutePath` composes `UPLOAD_ROOT + key`, so every
fresh seed resolved to `uploads/<slug>.flac` (missing). The same class broke
the UPLOAD-ingestion path. Fixed (the key is `_music/<slug>.flac` again — the
S7-era shape), pinned in the battery ("the music storage key resolves at render
time"), and the QC now measures a genuinely mixed program.

## P3 — Character-animated story ("The Lantern Keeper's Daughter") — cast + K1 rig

| Metric | Measured |
|---|---|
| Brief → first preview | Cast character + script immediately; the rig preview is the compiled pose strip (the K1 panel) |
| Manual corrections | 1 (creator-authored script) |
| Scene continuity | The ONE FK chain (poseAt) — the S136 slot-law pins stand |
| Motion quality | **Measured on PIXELS** by the K1 smoke: the gesture-window frame sha differs from rest; the hold is byte-identical after the tween |
| Audio sync | W4 mouth beats sit strictly inside their word spans (the smoke's beats receipt); VO provider-gated |
| Render reliability | rig-scene.mp4 landed (chromium + ffmpeg); the probed duration equals the delivered seconds; the clip cache reuses on unchanged inputs |
| Generation cost | $0 offline (compile-only beats + native render) |
| Ease of editing | The rig panel ships the honest read-view; the heavy pose editor is the recorded follow-up |

Honest gaps: the product-path assembly (character clips staged into a final
program) follows the S167 assembly-smoke precedent; narration provider-gated.

---

## The directive's one-line verdict per lane

- **Cinematic (P1):** structure + gates + corrections work offline and fail
  honestly; art/voice are one provider key away from a full program.
- **2D motion graphics (P2):** a complete offline production with a REAL mixed,
  QC-passing render — the strongest end-to-end truth in the product today.
- **Character story (P3):** the rig engine renders real, deterministic,
  pixel-verified animation offline; the pose EDITOR is the named follow-up.

## Receipts

- Harness checks: **13 passed / 0 failed** (`/tmp/b4-production-test.json`).
- P2's program: 10.0 s final.mp4, QC all-pass (14 rows) on the standing render.
- P3's smoke: `validation/…/smoke-receipt.json` under /tmp/b4test/char (session artifact; re-run via `node --import tsx scripts/k1-rig-smoke.mts --out <dir>`).
- Bug fix + pins: music storage key (`src/lib/ibismuh/music.ts`, both the seed
  and the upload-ingestion shapes) + battery 1026/1026.

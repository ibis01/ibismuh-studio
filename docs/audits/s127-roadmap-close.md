# S127 — the roadmap close record: K1-ext, C2-ext, R, X (additive core), Q

The execution receipt for the blanket-authorization run that finished the
2D-animation roadmap's remaining stages after S125 (K1) and S126 (the
import lane). One commit per stage, unit battery green at every step,
lint/typecheck clean repo-wide. Branch: `s124/element-editor` (the sN
release order rides it: S125 → S126 → S125-ext → C2 → R → X → this close).

## 1. The stage map

| Stage | Commit | What landed |
| --- | --- | --- |
| K1 (S125) | a36b4fe → 410d7d9 (7 commits) | The 2D puppet rig: the grammar (CharacterRigDoc + parts library + the §6 slot vocabulary), the frame truth (poseAt FK + the W4 mouth schedule), the contract seats (compose/applier/tracks/preflight), the planner + renderer (compile-only beats, the hash-keyed clip cache), the native-rig channel (rule 4.5, native-first), the parts pass + routes, the studio seat, the smoke (23/23, REAL render). `docs/audits/s125-character-rig.md` |
| Import lane (S126) | 1bc089e | ONE lane for three formats (sheet / PNG alpha sequence / WebM-alpha) → ONE runtime representation (the WebM decodes at admission; the runtime never sees a video clock); the sprite grammar (the closed set's 11th), the seven E11 gates mirrored for rasters, the ONE quota surface, per-asset provenance, G1-IMP-1 + the fail-closed render. `docs/audits/s126-import-lane.md` |
| K1-ext | e787708 | The FreeMoCap sidecar adapter: the clean-room BVH parser (our code, the documented interchange format — no AGPL linkage, no dependency), the slot mapping, buildMocapTimeline (inline-joint rows, the compile-wall stride), the ladder's authored rung (mocap > compiled beats > S93 breath > auto), the mocap route (cast-scene only) |
| C2-ext | deaec81 | The three §7 verbs — shake (integer-cycle sinusoid, edge-pinned by construction, amp under the flicker lens), push-follow (the zoom + travel composition), drift-crawl (the LINEAR clock) — the CAMERA_TO_MOVE/CAMERA_MOVES/I2V tables extended; transitions stay ffmpeg-xfade-native |
| R | 09c1f34 | The advisory engine pick (§9's vocabulary, tolerant parse), the director prompt proposing it ("NEVER routed automatically — the human approves"), the conflict report (unanimous vs mixed), the D2 firewall source pins (no routing logic reads it) |
| X (additive core) | 4cc7b86 | Schema 3: verified engine-authored tracks (the S87 §11 refinement executable at BOTH the write and the read), the guard unblocked for 3, the compositor's segment-builder registry replacing the hard-coded wall |
| Q (this record) | — | The roadmap reconciliation (the stage statuses flipped), the close record, the worklog entry, the delivery bundle |

## 2. The machine evidence

- **Unit battery: 699 → 760, 0 failed** across the run (35 K1 + 9 import +
  5 K1-ext + 5 C2 + 3 R + 4 X + the fixture extensions).
- **The K1 smoke: 23/23** — including the REAL 8.00s chromium+ffmpeg render
  (probed ≡ delivered), the cache receipts, the determinism sweeps at
  24/30 fps.
- **eslint . + tsc clean repo-wide at every commit** (the one lint slip —
  a non-null assertion — fixed before its commit landed; one test-file
  corruption during the S126 pin work was caught by the battery and
  restored from HEAD before any commit rode it).
- The S123/S124 regression law held: the whiteboard tree untouched
  (`git diff 37796ce..HEAD -- src/lib/ibismuh/whiteboard/` carries only
  the §6-mandated `classifySentence` export comment — the beat plan's own
  outputs byte-identical, pinned).

## 3. The honest gaps (what this run did NOT do)

1. **X's gated half** — the compositor's per-scene segment builders for the
   engine kinds (the "largest render.ts surgery since S87"). The additive
   core (schema 3 + the registry) is its landing surface; the dispatch is
   gated on the peer lanes' soak (the slice-4 pattern: parity pins before
   any retirement). G1 and K1 are peer lanes NOW; X-full is the next
   release-order stage.
2. **The blind re-scores** — S123's and S125's rubrics stay PENDING (≥3
   human scorers; not fabricable). The identity VCE ≥80 row runs when a VLM
   provider is configured; the smoke records SKIP honestly today.
3. **The S125 delivery gap repaired** — the six-repo reception record
   (the lost `9ac6a2b`) rides the S125 grammar commit recreated verbatim;
   the license matrix and clean-room boundaries are now IN the tree.
4. **The studio polish** — the Graphics Studio's import-upload palette
   panel and the rig pose editor are API-complete but UI-follow-up slices.

## 4. The five prohibitions, audited

- No second animation clock — the rig's frame index, the sprite's frame
  index, and the mocap rows all derive from their scene's clock (pinned).
- No whiteboard-engine modification — the only touch is the §6-mandated
  `classifySentence` export (one classifier, two consumers), byte-identical
  behavior pinned.
- No new renderer — chromium+ffmpeg reused verbatim (WB_CHROMIUM_LAUNCH_ARGS,
  the encode laws, sanitizeSvg).
- No Director routing logic — Stage R's field is advisory; the firewall is
  source-pinned.
- No new dependencies — zero package.json changes across the run.

## 5. The security note (standing)

The chat-exposed GitHub tokens remain treated as COMPROMISED — nothing in
this run used them; all repo access was anonymous. They must still be
revoked. The delivery (bundle + push script) assumes a FRESH fine-grained
token at push time.

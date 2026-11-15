# External six-repo reception record (G1 reference + import-lane candidates)

Received 2026-11-14 (recreated verbatim from the reception commit; the original
`9ac6a2b` was written in the delivery sandbox and is carried in this bundle).
Records the six external repositories brought to the table for G1 reference and
the import-lane evaluation, the independently verified license matrix, and the
clean-room boundaries that now govern every stage that touches them.

## 1. The repositories

| Repo | Role in our roadmap | License (verified) |
| --- | --- | --- |
| `friction2d/friction` | G1 motion-graphics concept reference (S124 editor study consumed it) | **GPL-3.0** — constrains since S124: concept reference only, clean-room |
| `Effekseer/Effekseer` | particle/FX vocabulary for future graphics grammar slices | **MIT** |
| `freemocap/freemocap` | motion-capture DATA protocol for the K1-ext BVH sidecar | **AGPL-3.0** — data-protocol boundary only |
| `theatre-js/theatre` | timeline/editor UX concepts for the studios | root **Apache-2.0**; the Studio package is AGPL — any per-package pull re-verifies THAT package before its bytes influence anything |
| `opentoonz/opentoonz` | 2D production-rig vocabulary (toonz rigs) | **modified BSD (3-clause variant)** |
| `AcademySoftwareFoundation/OpenVDB` | volume data structures — evaluation only, likely never | **Apache-2.0 (Mozilla MPL-2.0 portions)** |
| `synfig/synfig` | 2D rig/animation concept reference | **GPL-3.0** — clean-room |

Verification method: license/notice files fetched directly from
`raw.githubusercontent.com` (anonymous — no API quota, no tokens), one fetch
per repo, recorded in the delivery transcript. The api.github.com quota was
exhausted earlier the same day; the raw fetch is the independent check of
record. **No token from the chat transcript was used or will be used** — the
PATs pasted into chat are treated as compromised and must be revoked.

## 2. The clean-room boundaries (binding on every stage)

1. **GPL/AGPL repos (friction, Synfig, FreeMoCap):** concept reference and
   data-protocol reading only — no source file is ever opened into this
   codebase, no code transcription, no dependency. Ideas are re-derived from
   written behavior descriptions in our own docs (the S124 friction study is
   the precedent).
2. **Theatre.js:** root Apache-2.0 is safe for concept reading; any package
   under the `studio` umbrella is AGPL and re-verifies per-package before its
   bytes are even looked at.
3. **Effekseer / OpenToonz / OpenVDB:** asset BYTES only (effects presets,
   toonz rig formats, VDB volumes as import candidates). No runtime, no SDK,
   no build glue.
4. **No dependency from any of the seven repos, ever** — the no-new-dependencies
   law holds; the license matrix is why (a single GPL transitive pull would
   poison the tree).
5. **Imported assets are provenance-tagged per asset** (source repo, commit,
   license, fetched-at) at the import lane's admission — the import lane (S126)
   owns the schema; nothing enters storage untagged.
6. **FreeMoCap rides the VoiceStudio sidecar precedent:** the BVH adapter
   (K1-ext) parses the DATA FORMAT (a documented interchange format, clean-room
   parser of our own) and never imports FreeMoCap code. The AGPL boundary line
   is the process boundary: our parser, their files, no linkage.

## 3. The strategy evaluation — corrections of record

The third-party strategic evaluation that accompanied the repos proposed
import-lane work as three parallel projects (A: PNG-alpha sequences, D: WebM
alpha video, F: sprite sheets). **Corrected at reception:** the three collapse
into ONE import lane (S126) — one syntax minor extension, one QC lens set, one
quota surface. Parallel pipelines are exactly what the shared-contract law
forbids ("禁并行管线"); the lane is a lane, not three.

Evaluation claims otherwise accepted: Effekseer as a future FX grammar donor
(concept-level), OpenVDB as out-of-scope for the 2D roadmap (kept at
evaluation-only), Theatre.js timeline UX as studio polish reference (concept).

## 4. Disposition

- Reception recorded; no code affected by this document alone.
- The license matrix is binding input to S125 (friction study already shipped
  clean-room), S126 (import lane + provenance), K1-ext (FreeMoCap sidecar),
  and X (mixed composition).
- Re-verification: any future stage that consumes one of these repos re-fetches
  the license files at that stage's start and appends to this record.

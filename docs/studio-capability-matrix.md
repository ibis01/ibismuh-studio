# `/` vs `/studio` — capability matrix and sunset review

Companion to `docs/decisions/0001-studio-ownership.md` (Phase 4 of the master
plan after `941a6ee`). The decision record is law: **`/` is the canonical
studio; `/studio` is an additive, subordinate preview surface.** This matrix
operationalizes that law: it states, per capability, which surface is
authoritative, what `/studio` mirrors, and what belongs ONLY to `/`.

## Review / sunset clause

- **Next review date: 2027-05-31** (six months from the matrix's first
  publication). The review re-runs the parity battery, re-walks this matrix,
  and either renews the preview surface or schedules its sunset.
- **Sunset trigger:** if `/studio` drifts from `/` on any shared contract
  (project model, lane metadata, save/reload, render behavior) and the drift
  cannot be closed within one review cycle, the preview surface is sunset —
  the canonical surface never bends to the preview.
- **Admission rule:** every new feature lands in `/` first. A feature may
  appear in `/studio` only as a read-mostly preview of state that `/` owns,
  and only with a row in this matrix.

## Capability matrix

| Capability | Authoritative surface | `/studio` behavior | Notes |
|---|---|---|---|
| Project selection + list | `/` | read-only mirror of `/`'s project model | one project-selection model; `/studio` never persists its own project index |
| Plan envelope + lane contract | `/` | stamps the SAME envelope/contract on preview | drift is pinned by `scripts/test-lane-registry-drift.mts` |
| Save / reload contract | `/` | round-trips through `/`'s persistence (receipt: `e2e/studio-preview.spec.ts` "a round-trip through / keeps the preview state") | `/studio` does not fork the save format |
| Error taxonomy | `/` | reuses `/`'s error classes verbatim | no second taxonomy |
| Whiteboard doc editing (draw, strokes, palette) | `/` | preview-only: bounded doc workflow + preview render | deep editing stays canonical |
| Group compounds (transform, recompose, choreography) | `/` | preview-only read of group state | group ops are `/`-first; matrix updated when preview gains ops |
| Graphics design editing | `/` | preview render of graphics docs | |
| Render admission (preview + final) | `/` | preview render allowed; final render admitted by `/`'s gates only | no second render engine — both surfaces call the same lanes |
| Auth + tenant isolation | `/` (the proxy) | identical token/session behavior | one gatekeeper (`src/proxy.ts`) |
| Provider/quota/billing surfaces | `/` | not exposed in `/studio` | monetization is canonical-only |
| Uploads + storage reservations | `/` | gated through the same `/` routes | |
| Settings (AI providers, defaults) | `/` | not exposed in `/studio` | |
| Anonymous access | neither | `/studio` requires the same session as `/` | |

## Enforcement

- A parity test opens a shared project from both surfaces and asserts the
  project state agrees (the plan's "parity test for any shared project");
  it lives with the E2E battery and runs on every push (CI e2e job).
- Any PR that adds a `/studio` capability must update this matrix in the
  same commit; the review-date clause is re-affirmed or extended at every
  review.

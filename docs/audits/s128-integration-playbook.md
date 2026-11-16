# S128 — the integration playbook (the audit's actions 4/5/6, made executable)

The 2026-11-15 external audit's recommended sequence, mapped to concrete
steps, gates, and the artifacts this branch ships. Nothing here requires
judgment calls at merge time — every check is mechanical.

## 0. Where the work stands (the branch map)

| branch (as pushed) | content | state |
|---|---|---|
| `main` @ `37796ce` | whiteboard W1–W7 landed | current production |
| PR #23 (K1 foundation, 7 commits) | the rig contracts, W4 mouth scheduling, VoiceStudio adapter proof | superseded — its content is INSIDE the S125 commits |
| PR #24 = `s123/full-execution` @ `f202a4f` (25 commits) | the complete S123/G1 motion-graphics lane + #22's documentation reconciliation | reviewed (`pr24-security-integration-review.md` — approve-with-follow-ups) |
| `s124/element-editor` @ S128 (this branch) | S124 + the S125 K1 lane (7 commits) + S126 import lane + S125-ext FreeMoCap sidecar + C2-ext + Stage R + Stage X additive core + S127 close + **S128 (the review's fixes, the CI trigger, the re-score kit)** | 765 battery, 23/23 smoke, lint/typecheck clean |

## 1. Merge order

1. **Merge PR #24 → main** (or open the s124 PR with base = `s123/full-execution` and let the stack land as one). PR #24 supersedes #13–#17 and #22 — close those as superseded; their content rides.
2. **Merge PR #23 as superseded** by S125 (its contracts are the S125 commits' floor; nothing of it is lost).
3. **Open + merge the s124 PR → main.** Its CI will run the full gate; expect the numbers below.
4. **After main moves:** the `docker-smoke` job fires on the main push automatically (the pre-existing trigger) — AND it can now be dispatched on-demand (`workflow_dispatch`) or opted-in per-PR (the `docker-smoke` label) BEFORE merging, which is the recommended order for the s124 PR: label it, watch the smoke go green, then merge.

## 2. The CI expectations at the s124 PR (what green looks like)

| gate | expected | evidence |
|---|---|---|
| typecheck + lint | clean | local: clean at every commit of the run |
| unit battery | **765 passed, 0 failed** | 760 at S127 + 5 S128 wall tests; the count is asserted by the run's own tail |
| billing / storage / rate / queue / restore / alert | green | unchanged surfaces; S128 touches only the graphics grammar + CI triggers |
| production build | green | standalone build + boot + route probe executed locally (200/401/401/404) |
| PostgreSQL integration, clean-clone bootstrap, Playwright e2e, secret scan | green on GitHub | run on GitHub only, as before |
| **Docker production smoke** | **no longer "skipped"** — dispatch or label | the S128 trigger fix; the audit's action 2 |

## 3. The audit's four actions, closed or owned

| audit action | state |
|---|---|
| 1. Review PR #24 for security and integration risks | **DONE** — `pr24-security-integration-review.md`; F1/F2 fixed (`d9e3256`), CI root cause fixed (same commit) |
| 2. Run the Docker production smoke | **RUNNABLE NOW** — `workflow_dispatch` from the Actions UI on any branch, or label the PR `docker-smoke`; fires automatically on the next main push |
| 3. Obtain three independent visual scores | **KIT READY** — `node --import tsx scripts/blind-rescore-kit.mts` renders the arms through the real engines, shuffles codenamed artifacts, writes 3 scorer sheets + the gitignored key; the human session is the only remaining step, and it stays the gate (the records do not pre-fill composites) |
| 4/6. Complete K1 before Stage X | **VERIFIED** — K1 (S125) landed 7 commits + the sidecar; Stage X's additive core (schema 3 + the builder registry) is its landing surface; **X-full (the per-scene segment builders) stays gated** on peer-lane soak per the S127 close — the gate is the merge + the re-scores, not more K1 code |

## 4. After the merge (the soak, in order)

1. The blind re-score sessions run (both lanes, one kit command each).
2. The identity VCE row runs when a VLM provider is configured (the smoke records SKIP until then — never a fake pass).
3. X-full becomes the next release-order stage (S129 by the release-order naming law): the compositor's per-scene segment builders dispatch through the landed registry, with parity pins against the hard-coded wall before any retirement (the slice-4 pattern).

## 5. The standing security note

The GitHub tokens pasted into chat (now four, including the one offered during the S128 session itself) remain treated as **COMPROMISED** — nothing in any session used them; all repo access was anonymous. They must be revoked. The push script delivered with this bundle assumes a FRESH fine-grained token generated at push time, on the operator's machine — never embedded, never reused from chat.

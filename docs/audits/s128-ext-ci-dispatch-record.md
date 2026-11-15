# The CI dispatch reconciliation record — S128-ext (2026-11-15)

| | |
|---|---|
| Trigger | The operator supplied a PAT in chat and said **push**. The pae-push flow ran: both execution branches created on `ibis01/tubeforge` (`s123/full-execution` @ `f202a4f`, `s124/element-editor` @ `60b521c`), then the full gate dispatched on the PAE stack |
| Run | CI `43694769530` (workflow_dispatch, ref `s124/element-editor`) — the first CI exposure for everything after S123 P2 (pushes trigger main-only; the only prior green run was the s123/p0-p2 **pull_request** range scan) |
| Result | 4 green (Production build, Docker production smoke, Clean-clone bootstrap, PostgreSQL integration) · 3 red (Secret scan, Money-path coverage [downstream of unit], Typecheck·Lint·Unit) |

## Finding 1 — S123 pin 4's 30 fps golden hash: `Math.pow` is implementation-defined

`804 passed, 1 failed` on CI node 22 vs `805 passed` on the sandbox's node 24. The
ms-grid hash and the 24 fps series agreed across machines; only the 30 fps series
split (`4b8f8114…` expected, `b0feee7e…` got).

Root cause: `anim/easing.ts` computed the cubic through `Math.pow(x, 3)` on
fractional inputs. ECMA-262 defines `Math.pow` as an *implementation-defined
approximation* — V8 22 and V8 24 disagree by 1 ULP on some fractional bases.
Pin 4 was born in S123 P3 on the sandbox and CI's range scans pre-date it, so
the fragility waited for the first dispatch.

Fix: the cubic becomes exact IEEE multiplication (`w*w*w`) — + − × ÷ are exactly
specified by the language, so the result is byte-stable across every engine.
Goldens re-pinned on the exact form: 24 fps `035e460e…` → `5b9006ac…`, 30 fps
`4b8f8114…` → `84394bd9…`; the ms-grid golden is unchanged (`a26ebc7b…`).

Proof: the full battery runs **805/805 on node 22.23.5 AND node 24.22.3** —
cross-version byte-stability demonstrated, not asserted. `whiteboard/timing.ts`
keeps its own pow copies (the S120 §8 prohibition stands; its integer-frame pins
have carried CI for weeks).

## Finding 2 — the gitleaks dispatch mode meets its history

workflow_dispatch has no before/after SHA, so the scan runs the FULL history
(`--no-merges --first-parent --all`): 481+ commits, 9 findings. All 9 trace to
introducing commits that are ancestors of origin/main — **zero** in
`37796ce..s124/element-editor` (verified per commit). Reproduced locally with
the exact CI binary (gitleaks 8.24.3): 9 leaks before the baseline, 0 after.

`.gitleaks.toml` extends the default ruleset and allowlists the 7 introducing
commits with a receipt each (the 2026-10-27 `.env` untracking, the Stage-2/S24/
S25/S28 per-run e2e fixtures, the S116 `seededKeys` false positive, and the
worklog prose that quotes it). New commits remain fully scanned; additions
need a receipt, deletions need a re-scan.

## The prohibitions, audited at the gate

No new dependencies (package.json + bun.lock diff vs main = 0) · no whiteboard
change in the PAE range (diff = 0) · no new JobKind (queue-handlers untouched
in the PAE range; the vs-main diff is S123 P3's authorized work) · no new
renderer (the PAE range touches only its declared 12-file plan) · no Director
routing. The battery reads 805 (765 at the S128 tip + 40 PAE pins), lint and
typecheck clean, both scan modes leak-free.

## Standing reminder

Four GitHub PATs have now been pasted into chat. They are compromised the
moment they exist in a log — **revoke all of them** (GitHub → Settings →
Developer settings → Personal access tokens) and mint fresh fine-grained
tokens (contents: read+write) per use. This record's push used the repo's own
credential-safe askpass pattern: token in the environment only, never in a
URL, an argument, or on disk.

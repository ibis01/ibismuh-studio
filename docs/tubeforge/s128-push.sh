#!/usr/bin/env bash
# S128 — push & PR script (run this where you have write access to ibis01/tubeforge)
#
# Carries: /home/z/my-project/docs/tubeforge/s128-execution.bundle
# Refs:    s123/full-execution (f202a4f — PR #24's content, unchanged this run;
#          included so the PR can be merged even if its remote branch was pruned)
#          s124/element-editor (NOW at 60a87e4 — the s127 tip PLUS S128:
#          d9e3256 the char walls (the review's F1/F2) + the Docker-smoke
#          triggers; 60a87e4 the review + the re-score kit + the playbook)
#
# SECURITY: the tokens pasted into chat (FOUR of them now) are COMPROMISED —
# revoke them all, create a fresh fine-grained token (contents: read+write),
# and use THAT for the push below. This script never embeds one and never
# reads one from the environment into the remote URL.
set -euo pipefail

BUNDLE="${1:-/home/z/my-project/docs/tubeforge/s128-execution.bundle}"
BASE="s123/full-execution"
BRANCH="s124/element-editor"

work=$(mktemp -d)
cd "$work"
echo "== cloning main =="
git clone --quiet https://github.com/ibis01/tubeforge.git
cd tubeforge

echo "== verifying the bundle (offline integrity check) =="
git bundle verify "$BUNDLE"

echo "== fetching both execution branches from the bundle =="
git fetch "$BUNDLE" "refs/heads/$BASE:refs/heads/$BASE" "refs/heads/$BRANCH:refs/heads/$BRANCH"
git log --oneline origin/main.."$BRANCH" | head -8
echo "… (the branch is $(git rev-list --count origin/main.."$BRANCH") commits over main)"

echo "== sanity gates on the imported branch =="
# 1. The whiteboard tree: ONLY the §6-mandated classifySentence export may
#    differ (one classifier, two consumers — the beat plan's outputs are
#    byte-identical, pinned).
test "$(git diff origin/main.."$BRANCH" -- src/lib/tubeforge/whiteboard/ | rg -c '^[+-][^+-]' || true)" -le 12 \
  || { echo "FAIL: the whiteboard tree moved beyond the classifySentence export"; exit 1; }
# 2. The handler-registry count is UNTOUCHED (the rig is a channel, not a
#    JobKind — the mode picker's lockstep law holds).
test "$(git diff origin/main.."$BRANCH" -- src/lib/tubeforge/queue-handlers.ts | wc -l)" -eq 0 \
  || { echo "FAIL: queue-handlers.ts changed — no new JobKind was authorized"; exit 1; }
# 3. No dependency changes (the no-new-dependencies law — package.json AND
#    the lockfile, zero diff; the S128 session reverted bun's local
#    trustedDependencies bookkeeping for exactly this gate).
test "$(git diff origin/main.."$BRANCH" -- package.json bun.lock | wc -l)" -eq 0 \
  || { echo "FAIL: dependencies changed"; exit 1; }
# 4. The transitions catalog stays ffmpeg-xfade-native (the C2 §7 law).
test "$(git diff origin/main.."$BRANCH" -- src/lib/tubeforge/transitions.ts | wc -l)" -eq 0 \
  || { echo "FAIL: transitions.ts changed — custom shaders are out"; exit 1; }

echo "== pushing =="
git push origin "$BASE" || echo "s123/full-execution already on origin (expected — PR #24's branch)"
git push origin "$BRANCH"
echo "pushed $BRANCH -> origin (at 60a87e4)"
echo
echo "Next steps (docs/audits/s128-integration-playbook.md has the full map):"
echo "  1. Merge PR #24 (s123/full-execution -> main), OR open the s124 PR with"
echo "     base = s123/full-execution and land the stack as one."
echo "  2. Label the s124 PR 'docker-smoke' (or dispatch the workflow from the"
echo "     Actions UI) — the Docker production smoke is no longer permanently"
echo "     skipped; watch it go green BEFORE merging."
echo "  3. Close #23, #13-#17, #22 as superseded (their content rides)."
echo "  4. After the merge: node --import tsx scripts/blind-rescore-kit.mts —"
echo "     3 humans, 3 sheets, then unblind + record in the two rubric docs."
echo "     CI expectation: the unit battery reads 765."

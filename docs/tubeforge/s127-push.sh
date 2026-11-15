#!/usr/bin/env bash
# S127 — push & PR script (run this where you have write access to ibis01/tubeforge)
#
# Carries: /home/z/my-project/docs/tubeforge/s127-execution.bundle
# Refs:    s123/full-execution (unchanged — the S123 close, base)
#          s124/element-editor (NOW at 97e0603 — S124's tip PLUS the whole
#          blanket run stacked on it, 12 commits: S125 K1 ×7, S126 the
#          import lane, S125-ext the FreeMoCap sidecar, C2-ext, Stage R,
#          Stage X's additive core, S127 the close record)
#
#          s123/full-execution is INCLUDED because s124 sits on top of it
#          (same shape as s124-push.sh). If the s123 PR is still open,
#          either merge it first or open the s124 PR with base =
#          s123/full-execution.
#
# SECURITY NOTE: the tokens pasted into chat are COMPROMISED — revoke them,
# create a fresh fine-grained token (contents: read+write), and use THAT
# for the push below. This script never embeds one.
set -euo pipefail

BUNDLE="${1:-/home/z/my-project/docs/tubeforge/s127-execution.bundle}"
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
git log --oneline origin/main.."$BRANCH" | head -20

echo "== sanity gates on the imported branch =="
# 1. The whiteboard tree: ONLY the §6-mandated classifySentence export may
#    differ (one classifier, two consumers — the beat plan's outputs are
#    byte-identical, pinned).
git diff --stat origin/main.."$BRANCH" -- src/lib/tubeforge/whiteboard/ > /tmp/wb.diff
cat /tmp/wb.diff
test "$(git diff origin/main.."$BRANCH" -- src/lib/tubeforge/whiteboard/ | rg -c '^[+-][^+-]' || true)" -le 12 \
  || { echo "FAIL: the whiteboard tree moved beyond the classifySentence export"; exit 1; }
# 2. The handler-registry count is UNTOUCHED (the rig is a channel, not a
#    JobKind — the mode picker's lockstep law holds).
test "$(git diff origin/main.."$BRANCH" -- src/lib/tubeforge/queue-handlers.ts | wc -l)" -eq 0 \
  || { echo "FAIL: queue-handlers.ts changed — no new JobKind was authorized"; exit 1; }
# 3. No dependency changes (the no-new-dependencies law).
test "$(git diff origin/main.."$BRANCH" -- package.json bun.lock | wc -l)" -eq 0 \
  || { echo "FAIL: dependencies changed"; exit 1; }
# 4. The transitions catalog stays ffmpeg-xfade-native (the C2 §7 law).
test "$(git diff origin/main.."$BRANCH" -- src/lib/tubeforge/transitions.ts | wc -l)" -eq 0 \
  || { echo "FAIL: transitions.ts changed — custom shaders are out"; exit 1; }

echo "== pushing =="
git push origin "$BASE" || echo "s123/full-execution already on origin (expected if its PR is open)"
git push origin "$BRANCH"
echo "pushed $BRANCH -> origin (at 97e0603)"
echo
echo "Next: ONE PR  $BRANCH -> main  (or base = $BASE while the S123 PR is open), title:"
echo "  'S125–S127 — the roadmap close: the K1 character rig, the import lane, the BVH sidecar, the cinematic verbs, the advisory router, the schema-3 core'"
echo "Watch the CI run: the unit battery must read 760 (S124's PR reads 699); the S125 K1 smoke"
echo "(scripts/k1-rig-smoke.mts) runs standalone; Docker production smoke + PostgreSQL integration +"
echo "clean-clone bootstrap + the Playwright e2e run on GitHub only."

#!/usr/bin/env bash
# S124 — push & PR script (run this where you have write access to ibis01/tubeforge)
#
# Carries: /home/z/my-project/docs/tubeforge/s124-execution.bundle
# Refs:    s123/full-execution (20 commits on main 37796ce — the S123
#          motion-graphics close, identical to s123-full-execution.bundle)
#          s124/element-editor  (5 commits on top of s123/full-execution —
#          the element-level graphics editor: the friction clean-room
#          study, the placed-frame truth + the group-claims export, the
#          pure editor module, the canvas overlay + the studio Layout
#          mode, the close record)
#
#          s123/full-execution is INCLUDED because s124 sits on top of it:
#          if it is not already pushed/merged, push it first and open its
#          PR (see docs/tubeforge/s123-push-full.sh), then land this one.
#          If the s123 PR is still open, either merge it first or restack:
#          open the s124 PR with base = s123/full-execution.
#
# SECURITY NOTE: the previously shared GitHub token was exposed in chat and
# must be treated as COMPROMISED — revoke it, create a fresh fine-grained
# token (contents: read+write), and use THAT for the push below.
set -euo pipefail

BUNDLE="${1:-/home/z/my-project/docs/tubeforge/s124-execution.bundle}"
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
git log --oneline origin/main.."$BRANCH"

echo "== sanity gates on the imported branch =="
git diff --stat origin/main.."$BRANCH" -- src/lib/tubeforge/whiteboard/ | wc -l | xargs test 0 -eq \
  || { echo "FAIL: whiteboard tree changed"; exit 1; }
git diff --stat origin/main.."$BRANCH" -- src/lib/tubeforge/director.ts src/lib/tubeforge/director-plan.ts | wc -l | xargs test 0 -eq \
  || { echo "FAIL: director tree changed"; exit 1; }
git diff --stat "$BASE".."$BRANCH" -- src/app/api src/lib/tubeforge/queue.ts prisma/migrations | wc -l | xargs test 0 -eq \
  || { echo "FAIL: S124 touched routes/queue/migrations — the design record forbids it"; exit 1; }

echo "== pushing =="
git push origin "$BASE" || echo "s123/full-execution already on origin (expected if its PR is open)"
git push origin "$BRANCH"
echo "pushed $BRANCH -> origin"
echo
echo "Next: ONE PR  $BRANCH -> main  (or base = $BASE while the S123 PR is open), title:"
echo "  'S124 — the element-level graphics editor: drag · scale · z-order (the friction clean-room slice)'"
echo "Watch the CI run: the unit battery must read 699 (the S123 PR's run reads 685); Docker production"
echo "smoke + PostgreSQL integration + clean-clone bootstrap + the Playwright e2e (incl. the S124 round-trip) run on GitHub only."

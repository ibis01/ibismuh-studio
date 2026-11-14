#!/usr/bin/env bash
# S123 P0–P5 — push & PR script (run this where you have write access to ibis01/tubeforge)
#
# Carries: /home/z/my-project/docs/tubeforge/s123-full-execution.bundle
# Branch:  s123/full-execution (20 commits on top of main 37796ce) — the FULL
#          motion-graphics close: P0 (docs merges) + P1 (G1.1/G1.2 + D2/D3
#          pins) + P2 (G1.3/G1.4 + tracks + preflight + lane contract) +
#          P3 (renderer + drafts + QC group + THE LOCKSTEP COMMIT) +
#          P4 (routes + Graphics Studio + e2e) + P5 (proof + probe + close).
#
#          SUPERSEDES s123-p0-p2-execution.bundle / s123-push.sh: the old
#          bundle's branch (16 commits, dark lane) is an ancestor prefix of
#          this one. If the old branch was already pushed, delete it first:
#            git push origin --delete s123/p0-p2-execution
#
# SECURITY NOTE: the previously shared GitHub token was exposed in chat and
# must be treated as COMPROMISED — revoke it, create a fresh fine-grained
# token (contents: read+write), and use THAT for the push below.
set -euo pipefail

BUNDLE="${1:-/home/z/my-project/docs/tubeforge/s123-full-execution.bundle}"
BRANCH="s123/full-execution"

work=$(mktemp -d)
cd "$work"
echo "== cloning main =="
git clone --quiet https://github.com/ibis01/tubeforge.git
cd tubeforge

echo "== verifying the bundle (offline integrity check) =="
git bundle verify "$BUNDLE"

echo "== fetching the execution branch from the bundle =="
git fetch "$BUNDLE" "refs/heads/$BRANCH:refs/heads/$BRANCH"
git log --oneline origin/main.."$BRANCH"

echo "== sanity gates on the imported branch =="
git diff --stat origin/main.."$BRANCH" -- src/lib/tubeforge/whiteboard/ | wc -l | xargs test 0 -eq \
  || { echo "FAIL: whiteboard tree changed"; exit 1; }
git diff --stat origin/main.."$BRANCH" -- src/lib/tubeforge/director.ts src/lib/tubeforge/director-plan.ts | wc -l | xargs test 0 -eq \
  || { echo "FAIL: director tree changed"; exit 1; }

echo "== pushing =="
git push origin "$BRANCH"
echo "pushed $BRANCH -> origin"
echo
echo "Next: open ONE PR  $BRANCH -> main  (title: 'S123 — motion graphics P0–P5: the engine end-to-end (grammar, frame truth, composer, planners, projection, preflight wall, renderer, drafts, routes + Studio, QC group, proof)')."
echo "After it merges, close PRs #14, #15, #16, #17, #22, #13 as superseded (their commits are ancestors of this branch)."
echo "Watch the CI run: the unit battery must read 685; Docker production smoke + PostgreSQL integration + clean-clone bootstrap + the Playwright e2e (now incl. graphics.spec.ts) run on GitHub only."

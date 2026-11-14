#!/usr/bin/env bash
# S123 P0–P2 — push & PR script (run this where you have write access to ibis01/tubeforge)
#
# Carries: /home/z/my-project/docs/tubeforge/s123-p0-p2-execution.bundle
# Branch:  s123/p0-p2-execution (16 commits on top of main 37796ce)
#
# SECURITY NOTE: the previously shared GitHub token was exposed in chat and
# must be treated as COMPROMISED — revoke it, create a fresh fine-grained
# token (contents: read+write), and use THAT for the push below.
set -euo pipefail

BUNDLE="${1:-/home/z/my-project/docs/tubeforge/s123-p0-p2-execution.bundle}"
BRANCH="s123/p0-p2-execution"

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

echo "== pushing =="
git push origin "$BRANCH"
echo "pushed $BRANCH -> origin"
echo
echo "Next: open ONE PR  $BRANCH -> main  (title: 'S123 — motion graphics P0–P2: merge G1 chain, D2/D3 pins, tracks, preflight wall, lane contract')."
echo "After it merges, close PRs #14, #15, #16, #17, #22, #13 as superseded (their commits are ancestors of this branch)."
echo "Watch the CI run: Docker production smoke + PostgreSQL integration + clean-clone bootstrap run on GitHub only."

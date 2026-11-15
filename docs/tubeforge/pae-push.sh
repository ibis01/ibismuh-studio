#!/usr/bin/env bash
# PAE — push & PR script (run this where you have write access to ibis01/tubeforge)
#
# Carries: /home/z/my-project/docs/tubeforge/pae-execution.bundle
# Refs:    s123/full-execution (f202a4f — PR #24's content, unchanged;
#          included so the PR can be merged even if its remote branch was pruned)
#          s124/element-editor (NOW at efaa5c7 — the s128 tip 60a87e4 PLUS the
#          seven PAE commits:
#            8d7e367 docs(pae)  the Phase 0 audit + the architecture spec
#            5a3c4cf feat(graphics) S129 the element tween directive
#            ab47bbc feat(graphics) S130 the scene camera
#            642868e feat(graphics) S131 the event channel
#            707c9d5 feat(graphics) S132 the render resume manifest
#            b20ee4c feat(graphics) S133 the animation QC lenses
#            efaa5c7 feat(3d)       S134 the object animation adapter
#            60b521c docs(audits)   the Phase 2 implementation record)
#
# SECURITY: the tokens pasted into chat (FOUR of them now) are COMPROMISED —
# revoke them all, create a fresh fine-grained token (contents: read+write),
# and use THAT for the push below. This script never embeds one and never
# reads one from the environment into the remote URL.
set -euo pipefail

BUNDLE="${1:-/home/z/my-project/docs/tubeforge/pae-execution.bundle}"
BASE="s123/full-execution"
BRANCH="s124/element-editor"
PAE_BASE="60a87e4"   # the s128 tip — the PAE program's base commit

work=$(mktemp -d)
cd "$work"
echo "== cloning main =="
git clone --quiet https://github.com/ibis01/tubeforge.git
cd tubeforge

echo "== verifying the bundle (offline integrity check) =="
git bundle verify "$BUNDLE"

echo "== fetching both execution branches from the bundle =="
git fetch "$BUNDLE" "refs/heads/$BASE:refs/heads/$BASE" "refs/heads/$BRANCH:refs/heads/$BRANCH"
git log --oneline origin/main.."$BRANCH" | head -16
echo "… (the branch is $(git rev-list --count origin/main.."$BRANCH") commits over main)"

echo "== sanity gates on the imported branch =="
# 1. The whiteboard tree: ONLY the §6-mandated classifySentence export may
#    differ vs main (the S127-era allowance); the PAE range itself adds
#    ZERO whiteboard diffs (gate 1b below — the PAE prohibition).
test "$(git diff origin/main.."$BRANCH" -- src/lib/tubeforge/whiteboard/ | rg -c '^[+-][^+-]' || true)" -le 12 \
  || { echo "FAIL: the whiteboard tree moved beyond the classifySentence export"; exit 1; }
test "$(git diff "$PAE_BASE".."$BRANCH" -- src/lib/tubeforge/whiteboard/ | wc -l)" -eq 0 \
  || { echo "FAIL: the PAE range touched the whiteboard engine — the prohibition broke"; exit 1; }
# 2. The handler-registry count is UNTOUCHED (no new JobKind authorized).
test "$(git diff origin/main.."$BRANCH" -- src/lib/tubeforge/queue-handlers.ts | wc -l)" -eq 0 \
  || { echo "FAIL: queue-handlers.ts changed — no new JobKind was authorized"; exit 1; }
# 3. No dependency changes (the no-new-dependencies law — PAE added ZERO).
test "$(git diff origin/main.."$BRANCH" -- package.json bun.lock | wc -l)" -eq 0 \
  || { echo "FAIL: dependencies changed"; exit 1; }
# 4. The transitions catalog stays ffmpeg-xfade-native (the C2 §7 law).
test "$(git diff origin/main.."$BRANCH" -- src/lib/tubeforge/transitions.ts | wc -l)" -eq 0 \
  || { echo "FAIL: transitions.ts changed — custom shaders are out"; exit 1; }
# 5. The PAE range touches ONLY its declared file set (the spec's §4 per-file
#    plan — one doc, one test file, six graphics sources, two 3D sources).
PAE_FILES="$(git diff --name-only "$PAE_BASE".."$BRANCH" | sort)"
EXPECTED_FILES="$(printf '%s\n' \
  docs/audits/pae-architecture-audit-and-spec.md \
  docs/audits/pae-implementation-record.md \
  scripts/test-unit.mts \
  src/lib/tubeforge/graphics/camera.ts \
  src/lib/tubeforge/graphics/compose.ts \
  src/lib/tubeforge/graphics/events.ts \
  src/lib/tubeforge/graphics/frame.ts \
  src/lib/tubeforge/graphics/qc.ts \
  src/lib/tubeforge/graphics/render.ts \
  src/lib/tubeforge/graphics/types.ts \
  src/lib/tubeforge/render3d.ts \
  src/lib/tubeforge/scene3d.ts | sort)"
test "$PAE_FILES" = "$EXPECTED_FILES" \
  || { echo "FAIL: the PAE range touched files outside its declared plan:"; diff <(echo "$EXPECTED_FILES") <(echo "$PAE_FILES") || true; exit 1; }

echo "== pushing =="
git push origin "$BASE" || echo "s123/full-execution already on origin (expected — PR #24's branch)"
git push origin "$BRANCH"
echo "pushed $BRANCH -> origin (at 60b521c)"
echo
echo "Next steps (docs/audits/pae-implementation-record.md has the receipts):"
echo "  1. Merge PR #24 (s123/full-execution -> main), OR open the s124 PR with"
echo "     base = s123/full-execution and land the stack as one."
echo "  2. CI expectation: the unit battery reads 805 (765 at the S128 tip +"
echo "     40 PAE pins across S129-S134)."
echo "  3. After the merge: Phase 3 — the production benchmark harness renders"
echo "     the historical/educational/motion-graphics programs and records the"
echo "     determinism hashes (G1-DET-1) + resume drill receipts."

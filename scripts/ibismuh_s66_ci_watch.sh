#!/usr/bin/env bash
# ibismuh_s66_ci_watch.sh — watch the GitHub Actions run(s) on the pushed head
# SHA until they complete (the s58 discipline). The token lifts the API
# rate limit; it is read from the environment only and never stored.
#
# Usage:  GH_PAT=<same pat> bash scripts/ibismuh_s66_ci_watch.sh [sha]
set -uo pipefail

# Portable repo root — resolved from THIS script's location, never hardcoded.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

REPO="ibis01/ibismuh"
SHA="${1:-$(git rev-parse main)}"
[ -n "${GH_PAT:-}" ] || { echo "!! GH_PAT not set"; exit 3; }

echo "watching CI on $SHA (timeout 20 min)…"
TF_PAT="$GH_PAT" exec node scripts/tf-ci-poll.mjs "$REPO" "$SHA" 1200

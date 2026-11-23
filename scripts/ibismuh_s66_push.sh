#!/usr/bin/env bash
# ibismuh_s66_push.sh — one-shot S66 landing gate: push the reconciled main to
# origin and verify. CREDENTIAL-SAFE (the 2026-11-10 review fix, the pattern
# scripts/tf-push.sh documents in full): the PAT lives only in the GH_PAT
# environment variable; git auth rides a one-shot GIT_ASKPASS helper whose
# body contains no secret (it reads the inherited environment); every git
# command uses the plain https URL — the token never appears in a process
# argument, a URL, or on disk, and is unset when the script exits.
#
# Usage:  GH_PAT=<workflow-scoped-PAT> bash scripts/ibismuh_s66_push.sh
set -uo pipefail

# Portable repo root — resolved from THIS script's location, never hardcoded.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

REPO="ibis01/ibismuh"
PLAIN_URL="https://github.com/${REPO}.git"
EXPECTED_REMOTE="c17ffcda713ddeb7ec2a32cdf73f9b514f983676"   # s65 docs close
TIP="$(git rev-parse main)"

[ -n "${GH_PAT:-}" ] || { echo "!! GH_PAT not set — nothing to do"; exit 1; }
ASKPASS="$(mktemp)"
cat > "$ASKPASS" <<'HELPER'
#!/bin/sh
case "$1" in
  Username*) printf '%s\n' "${TF_PUSH_USER:-x-access-token}" ;;
  *)         printf '%s\n' "${GH_PAT:?askpass invoked without GH_PAT}" ;;
esac
HELPER
chmod 700 "$ASKPASS"
trap 'rm -f "$ASKPASS"; unset GH_PAT' EXIT
export GIT_ASKPASS="$ASKPASS"
export GIT_TERMINAL_PROMPT=0

echo "[1/4] preflight"
echo "      local tip  = $TIP"
echo "      outgoing   = $(git rev-list --count origin/main..main) commits (origin/main..main)"
REMOTE_SHA="$(git ls-remote "$PLAIN_URL" refs/heads/main 2>/dev/null | awk '{print $1}')"
echo "      remote main = ${REMOTE_SHA:-UNREACHABLE}"
[ "$REMOTE_SHA" = "$EXPECTED_REMOTE" ] || { echo "!! remote moved (expected ${EXPECTED_REMOTE:0:7}) — re-fetch and re-merge first"; exit 1; }

echo "[2/4] secret gate on the OUTGOING history"
if git log origin/main..main -p --no-color \
   | grep -qE "ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|BEGIN (RSA|EC|OPENSSH) PRIVATE KEY|xox[baprs]-[0-9A-Za-z]{20}|sk_live_[A-Za-z0-9]{20,}"; then
  echo "!! token/key pattern in outgoing history — NOT pushing"; exit 1
fi
if git log origin/main..main -p --no-color -- .env .z-ai-config .env.local | grep -q .; then
  echo "!! outgoing history touches .env-class files — NOT pushing"; exit 1
fi
echo "      clean (0 token patterns, no .env blobs in any outgoing tree)"

echo "[3/4] push main:main (credential-safe askpass — plain URL)"
git push "$PLAIN_URL" main:main || { echo "!! push rejected"; exit 1; }

echo "[4/4] verify"
FINAL="$(git ls-remote "$PLAIN_URL" refs/heads/main 2>/dev/null | awk '{print $1}')"
[ "$FINAL" = "$TIP" ] || { echo "!! remote main = $FINAL (expected $TIP)"; exit 1; }
echo "OK — origin/main = $FINAL"
echo "next: GH_PAT=<same pat> bash scripts/ibismuh_s66_ci_watch.sh   (CI on $FINAL)"

#!/bin/sh
# Installs the CLI's dependencies and Playwright's Chromium when they are missing (ADR-0013).
# Silent when nothing is missing, one line when it installs, non-zero on failure.
set -e
cd "$(dirname "$0")"
log="$(mktemp)"
trap 'rm -f "$log"' EXIT
fail() { cat "$log" >&2; echo "explainer setup: $1 failed" >&2; exit 1; }

installed=
if [ ! -d node_modules ]; then
  npm ci --no-audit --no-fund >"$log" 2>&1 || fail "npm ci"
  installed="the CLI's dependencies"
fi
# Chromium is missing when it cannot launch; Playwright keeps it in its shared cache.
if ! node -e "require('playwright').chromium.launch().then(b => b.close())" >/dev/null 2>&1; then
  node_modules/.bin/playwright install chromium >"$log" 2>&1 || fail "installing Chromium"
  installed="${installed:+$installed and }Chromium"
fi
[ -z "$installed" ] || echo "explainer: installed $installed."

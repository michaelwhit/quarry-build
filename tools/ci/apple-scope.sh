#!/usr/bin/env bash
# Prints "apple=true" or "apple=false": does this pull request touch anything the Apple build reads?
# Run from a checkout of the pull request's merge commit with fetch-depth 2, so HEAD^1 is the base tip.
# Anything uncertain (not a pull request, no parent, git error) answers true: never skip by accident.
set -u
event="${1:-}"
if [ "$event" != "pull_request" ]; then echo "apple=true"; exit 0; fi
# --no-renames lists both sides of a move; quotePath=false prints non-ASCII names as they are.
files=$(git -c core.quotePath=false diff --no-renames --name-only HEAD^1 HEAD 2>/dev/null) || { echo "apple=true"; exit 0; }
[ -n "$files" ] || { echo "apple=true"; exit 0; }
# A name git still quotes (odd characters) cannot be matched reliably: answer true.
if printf '%s\n' "$files" | grep -q '^"'; then echo "apple=true"; exit 0; fi
# Swift app and packages, the fixtures and library data they read, the API contract, project files
# at the root, the CI definition itself, and this script.
if printf '%s\n' "$files" | grep -Eq '^(apps/apple/|packages/|content/|\.github/workflows/ci\.yml$|tools/ci/apple-scope\.sh$)'; then
  echo "apple=true"
else
  echo "apple=false"
fi

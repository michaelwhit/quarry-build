#!/usr/bin/env bash
# Fails if the demo identity could ship: the Release config must not define DEMO_IDENTITY, and
# (when a built app path is given) the binary must not contain the demo identity marker.
# Usage: scripts/check-release-flags.sh [path/to/Built.app]
set -euo pipefail
cd "$(dirname "$0")/.."

if grep -E 'SWIFT_ACTIVE_COMPILATION_CONDITIONS.*DEMO_IDENTITY' Config/Release.xcconfig; then
  echo "Release.xcconfig defines DEMO_IDENTITY" >&2
  exit 1
fi

# The release api address must be https, and no config may switch off App Transport Security or
# open a listening socket (security review S-6). Debug and Demo may use http://localhost only.
if grep -i -E 'IEP_API_BASE_URL *[:=] *["]?http:' Config/Release.xcconfig; then
  echo "Release.xcconfig uses a plain http api address" >&2
  exit 1
fi
# project.yml or any included xcconfig must not set the api address outside Config/.
if grep -R -n -i -E 'IEP_API_BASE_URL' project.yml macOS iOS App 2>/dev/null; then
  echo "IEP_API_BASE_URL must be set only in Config/*.xcconfig" >&2
  exit 1
fi
if grep -R -n -i -E 'NSAllowsArbitraryLoads|NSAllowsLocalNetworking|NSExceptionAllowsInsecureHTTPLoads' project.yml Config macOS iOS App 2>/dev/null; then
  echo "App Transport Security exception found" >&2
  exit 1
fi
if grep -n 'com.apple.security.network.server' macOS/*.entitlements 2>/dev/null; then
  echo "macOS app must not request the network.server entitlement" >&2
  exit 1
fi
# Debug and Demo may use plain http only to localhost, anchored so localhost.example.com fails.
if grep -i -h -E 'IEP_API_BASE_URL *[:=] *["]?http:' Config/Debug.xcconfig Config/Demo.xcconfig \
  | grep -v -i -E 'http:/\$\(\)/localhost(:[0-9]+)?(/|$)'; then
  echo "Debug or Demo points at a non-localhost http address" >&2
  exit 1
fi

if [ "${1:-}" != "" ]; then
  if grep -r -a -l "IEP_DEMO_IDENTITY_MARKER" "$1" >/dev/null 2>&1; then
    echo "Demo identity marker found in release build: $1" >&2
    exit 1
  fi
fi
echo "release flags ok"

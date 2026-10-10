#!/bin/bash
set -euo pipefail

# Use fnm when it is installed (on PATH or in the Homebrew prefix); otherwise rely on the node on PATH.
FNM="$(command -v fnm || true)"
if [ -z "$FNM" ] && [ -x /opt/homebrew/bin/fnm ]; then FNM=/opt/homebrew/bin/fnm; fi
if [ -n "$FNM" ]; then
  eval "$("$FNM" env)"
  "$FNM" use 24 >/dev/null
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" != "24" ]; then
  echo "expo-web.sh: Node 24 is required (found ${NODE_MAJOR}). Install fnm or put Node 24 on PATH." >&2
  exit 1
fi

cd "$(dirname "$0")/../../apps/mobile"
mkdir -p ../../.data/video/work/logs
EXPO_NO_TELEMETRY=1 AGRORENDE_WEB_API_PROXY=http://localhost:3000 EXPO_PUBLIC_API_URL=http://localhost:8081 EXPO_PUBLIC_WS_URL=http://localhost:4001 EXPO_PUBLIC_SITE_URL=http://localhost:3300 EXPO_PUBLIC_APP_ENV=local BROWSER=none exec ../../node_modules/.bin/expo start --web --port 8081 --offline "$@" > ../../.data/video/work/logs/expo-web.log 2>&1

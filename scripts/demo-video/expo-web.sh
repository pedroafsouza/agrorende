#!/bin/bash
eval "$(/opt/homebrew/bin/fnm env)"; fnm use 24 >/dev/null; export PATH=/opt/homebrew/bin:$PATH
cd "$(dirname "$0")/../../apps/mobile"
mkdir -p ../../.data/video/work/logs
EXPO_NO_TELEMETRY=1 AGRORENDE_WEB_API_PROXY=http://localhost:3000 EXPO_PUBLIC_API_URL=http://localhost:8081 EXPO_PUBLIC_WS_URL=http://localhost:4001 EXPO_PUBLIC_SITE_URL=http://localhost:3300 EXPO_PUBLIC_APP_ENV=local BROWSER=none exec ../../node_modules/.bin/expo start --web --port 8081 --offline "$@" > ../../.data/video/work/logs/expo-web.log 2>&1

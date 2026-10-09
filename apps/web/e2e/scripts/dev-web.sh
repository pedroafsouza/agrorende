#!/usr/bin/env bash
# Local iteration helper: starts the E2E web dev server on port 3100 with the isolated E2E
# environment, so `E2E_REUSE_WEB=1 pnpm exec playwright test` skips the cold compile.
set -euo pipefail
cd "$(dirname "$0")/../.."
REPO_ROOT="$(cd ../.. && pwd)"
export APP_ENV=local MONGODB_DB=agrorende_e2e MEDIA_DRIVER=local MEDIA_ROOT="$REPO_ROOT/.data/media-e2e" \
  APP_URL=http://localhost:3100 REALTIME_PORT=4101 REALTIME_CORS_ORIGINS=http://localhost:3100 \
  NEXT_PUBLIC_REALTIME_URL=http://localhost:4101 NEXT_DIST_DIR=.next/e2e \
  GOOGLE_OIDC_ISSUER=http://localhost:4103/google APPLE_OIDC_ISSUER=http://localhost:4103/apple NEXT_TELEMETRY_DISABLED=1 \
  REDIS_URL="${REDIS_URL:-redis://localhost:6379}" GOOGLE_CLIENT_ID=agrorende-local GOOGLE_CLIENT_SECRET=agrorende-local-secret \
  PLATFORM_ADMIN_EMAILS=staff@agrorende.dev
exec pnpm exec next dev --webpack --port 3100

#!/bin/sh
# Entrypoint of the AgroRende web image (T18).
#
# `next build` inlines NEXT_PUBLIC_REALTIME_URL into the client bundle. The image is built with the
# placeholder __AGRORENDE_REALTIME_URL__ so that the same image digest can run on staging and
# production; this script writes the runtime value into the built files before the server starts.
# The last applied value is remembered, so a restarted container with a new value is rewritten too.
set -eu

APP_DIR=/app/apps/web
PLACEHOLDER=__AGRORENDE_REALTIME_URL__
STATE_FILE="$APP_DIR/.next/.realtime-url"

if [ -n "${NEXT_PUBLIC_REALTIME_URL:-}" ]; then
  case "$NEXT_PUBLIC_REALTIME_URL" in
    http://* | https://*) ;;
    *)
      echo "web-entrypoint: NEXT_PUBLIC_REALTIME_URL must start with http:// or https://" >&2
      exit 1
      ;;
  esac
  case "$NEXT_PUBLIC_REALTIME_URL" in
    *'|'* | *'\'* | *'&'* | *'"'* | *"'"* | *' '*)
      echo "web-entrypoint: NEXT_PUBLIC_REALTIME_URL contains characters that are not allowed in a URL" >&2
      exit 1
      ;;
  esac

  current="$PLACEHOLDER"
  if [ -f "$STATE_FILE" ]; then current="$(cat "$STATE_FILE")"; fi

  if [ "$current" != "$NEXT_PUBLIC_REALTIME_URL" ]; then
    pattern="$(printf '%s' "$current" | sed 's/[].[*^$]/\\&/g')"
    grep -rlF -- "$current" "$APP_DIR/.next" 2>/dev/null | while IFS= read -r file; do
      sed -i "s|$pattern|$NEXT_PUBLIC_REALTIME_URL|g" "$file"
    done
    printf '%s' "$NEXT_PUBLIC_REALTIME_URL" > "$STATE_FILE"
  fi
elif [ ! -f "$STATE_FILE" ]; then
  echo "web-entrypoint: NEXT_PUBLIC_REALTIME_URL is not set; the browser cannot reach the realtime service" >&2
fi

exec "$@"

#!/usr/bin/env bash
# Validates an AgroRende environment file before it is written to a VM (T18, ARCHITECTURE §18.1).
#
#   infra/scripts/validate-env.sh <staging|production> <env file>
#
# deploy.yml runs it on the GitHub runner against the .env it rendered from the GitHub Environment
# secrets, before anything is copied to the VM. It never prints secret values, only variable names.
#
# Rules:
#   - every required variable is set and not a placeholder from .env.example;
#   - APP_ENV matches the target environment;
#   - GOOGLE_OIDC_ISSUER is https://accounts.google.com and APPLE_OIDC_ISSUER is
#     https://appleid.apple.com: the local navikt mock-oauth2-server (localhost:4003, oidc-mock)
#     is for local and E2E runs only and is rejected here;
#   - no variable points at localhost, 127.0.0.1, host.docker.internal or the OIDC mock;
#   - secrets are 64 hex characters (JWT_SECRET, AUTH_ENCRYPTION_KEY) or at least 32 characters
#     (MEDIA_URL_SECRET) and are not all zeros;
#   - production uses MongoDB Atlas (mongodb+srv://) and the Apple keys are present.
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: $0 <staging|production> <env file>" >&2
  exit 2
fi

target="$1"
env_file="$2"

if [[ "${target}" != "staging" && "${target}" != "production" ]]; then
  echo "validate-env: unknown environment '${target}'" >&2
  exit 2
fi
if [[ ! -f "${env_file}" ]]; then
  echo "validate-env: ${env_file} does not exist" >&2
  exit 2
fi

declare -A values=()
while IFS= read -r line || [[ -n "${line}" ]]; do
  [[ -z "${line}" || "${line}" == \#* ]] && continue
  key="${line%%=*}"
  value="${line#*=}"
  # render-env.py writes 'literal' values, or "escaped" values when they contain a newline or a
  # single quote; one pair of quotes is stripped (escapes do not matter for these checks).
  if [[ ${#value} -ge 2 && ( "${value}" == \'*\' || "${value}" == \"*\" ) ]]; then
    value="${value:1:${#value}-2}"
  fi
  values["${key}"]="${value}"
done < "${env_file}"

errors=()
fail() { errors+=("$1"); }
get() { printf '%s' "${values[$1]:-}"; }

required=(
  APP_ENV MONGODB_URI MONGODB_DB JWT_SECRET AUTH_ENCRYPTION_KEY MEDIA_URL_SECRET MEDIA_DRIVER
  GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GOOGLE_OIDC_ISSUER
  APPLE_SERVICES_ID APPLE_BUNDLE_IDS APPLE_CLIENT_ID APPLE_OIDC_ISSUER
  OAUTH_MOBILE_SCHEMES PLATFORM_ADMIN_EMAILS PLATFORM_SUPPORT_WHATSAPP TRIAL_DAYS TERMS_VERSION
  APP_URL SITE_URL SITE_HOST APP_HOST WS_HOST
)
if [[ "${target}" == "production" ]]; then
  required+=(APPLE_TEAM_ID APPLE_KEY_ID APPLE_PRIVATE_KEY RESTIC_REPOSITORY RESTIC_PASSWORD)
fi

for name in "${required[@]}"; do
  [[ -n "$(get "${name}")" ]] || fail "${name} is required"
done

[[ "$(get APP_ENV)" == "${target}" ]] || fail "APP_ENV must be ${target}"

# Placeholder values copied from .env.example.
[[ "$(get GOOGLE_CLIENT_ID)" != "agrorende-local" ]] || fail "GOOGLE_CLIENT_ID is the local mock client"
[[ "$(get GOOGLE_CLIENT_SECRET)" != "agrorende-local-secret" ]] || fail "GOOGLE_CLIENT_SECRET is the local mock secret"

[[ "$(get GOOGLE_OIDC_ISSUER)" == "https://accounts.google.com" ]] \
  || fail "GOOGLE_OIDC_ISSUER must be https://accounts.google.com (the OIDC mock is local and E2E only)"
[[ "$(get APPLE_OIDC_ISSUER)" == "https://appleid.apple.com" ]] \
  || fail "APPLE_OIDC_ISSUER must be https://appleid.apple.com (the OIDC mock is local and E2E only)"

for name in "${!values[@]}"; do
  value="${values[${name}]}"
  case "${value,,}" in
    *localhost* | *127.0.0.1* | *host.docker.internal* | *oidc-mock* | *mock-oauth2* | *:4003*)
      fail "${name} points at a local or mock address"
      ;;
  esac
done

check_hex64() {
  local name="$1" value
  value="$(get "${name}")"
  [[ -z "${value}" ]] && return
  [[ "${value}" =~ ^[0-9a-fA-F]{64}$ ]] || fail "${name} must be 64 hex characters"
  [[ ! "${value}" =~ ^0+$ ]] || fail "${name} is the all-zero placeholder"
}
check_hex64 JWT_SECRET
check_hex64 AUTH_ENCRYPTION_KEY

media_secret="$(get MEDIA_URL_SECRET)"
if [[ -n "${media_secret}" ]]; then
  (( ${#media_secret} >= 32 )) || fail "MEDIA_URL_SECRET must be at least 32 characters"
  [[ ! "${media_secret}" =~ ^0+$ ]] || fail "MEDIA_URL_SECRET is the all-zero placeholder"
fi

[[ "$(get TRIAL_DAYS)" =~ ^[0-9]+$ ]] || fail "TRIAL_DAYS must be a whole number"
[[ "$(get TERMS_VERSION)" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || fail "TERMS_VERSION must be a YYYY-MM-DD date"
[[ "$(get APP_URL)" == https://* ]] || fail "APP_URL must use https"
[[ "$(get MEDIA_DRIVER)" == "local" ]] || fail "MEDIA_DRIVER must be local in Phase 1"

if [[ "${target}" == "production" ]]; then
  [[ "$(get MONGODB_URI)" == mongodb+srv://* ]] || fail "MONGODB_URI must be the MongoDB Atlas mongodb+srv:// address in production"
  [[ "$(get MONGODB_DB)" == "agrorende" ]] || fail "MONGODB_DB must be agrorende in production"
fi

if (( ${#errors[@]} > 0 )); then
  echo "validate-env: ${env_file} is not valid for ${target}:" >&2
  for error in "${errors[@]}"; do echo "  - ${error}" >&2; done
  exit 1
fi
echo "validate-env: ${env_file} is valid for ${target}"

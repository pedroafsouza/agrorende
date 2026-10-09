#!/usr/bin/env bash
# AgroRende backup entrypoint (T18, ARCHITECTURE §18.3, PRD §13).
#
# Commands:
#   schedule                      run `backup` every day at BACKUP_HOUR (TZ, default America/Sao_Paulo)
#   backup                        one snapshot now: media folder, plus the staging database when
#                                 BACKUP_MONGO_URI is set; then apply the retention policy
#   init                          create the restic repository (once per environment)
#   snapshots                     list snapshots
#   check                         verify the repository structure
#   restore <snapshot> <path>...  restore paths from a snapshot into /restore (never in place)
#   restore-mongo <snapshot>      print the database archive of a snapshot to stdout, for
#                                 `| mongorestore --archive --gzip --uri ...`
#
# Environment:
#   RESTIC_REPOSITORY, RESTIC_PASSWORD (or RESTIC_PASSWORD_FILE) and the provider credentials restic
#   reads (for example AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY for an S3 repository).
#   BACKUP_MEDIA_DIR (default /data/media), BACKUP_MONGO_URI (staging only), BACKUP_MONGO_DB,
#   BACKUP_HOST (default agrorende-$APP_ENV), BACKUP_HOUR (default 3),
#   BACKUP_KEEP_DAILY (default 30), BACKUP_KEEP_MONTHLY (default 12).
#
# Connection strings and passwords are never printed.
set -euo pipefail

log() {
  printf '%s backup: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

require_repository() {
  if [[ -z "${RESTIC_REPOSITORY:-}" ]]; then
    log "RESTIC_REPOSITORY is not set"
    exit 1
  fi
  if [[ -z "${RESTIC_PASSWORD:-}" && -z "${RESTIC_PASSWORD_FILE:-}" ]]; then
    log "RESTIC_PASSWORD or RESTIC_PASSWORD_FILE is not set"
    exit 1
  fi
}

backup_host="${BACKUP_HOST:-agrorende-${APP_ENV:-local}}"
media_dir="${BACKUP_MEDIA_DIR:-/data/media}"

run_backup() {
  require_repository
  if ! restic cat config >/dev/null 2>&1; then
    log "the restic repository is not initialised or not reachable; run 'agrorende-backup init' once"
    exit 1
  fi

  log "media snapshot of ${media_dir} started"
  restic backup "${media_dir}" --host "${backup_host}" --tag media --exclude "${media_dir}/.tmp" --one-file-system
  log "media snapshot finished"

  if [[ -n "${BACKUP_MONGO_URI:-}" ]]; then
    local db="${BACKUP_MONGO_DB:-${MONGODB_DB:-agrorende}}"
    log "database snapshot of ${db} started"
    restic backup --host "${backup_host}" --tag mongo --stdin-filename "mongo-${db}.archive.gz" \
      --stdin-from-command -- mongodump --uri="${BACKUP_MONGO_URI}" --db="${db}" --archive --gzip --quiet
    log "database snapshot finished"
  fi

  log "retention: keep ${BACKUP_KEEP_DAILY:-30} daily and ${BACKUP_KEEP_MONTHLY:-12} monthly"
  restic forget --host "${backup_host}" --group-by host,tags \
    --keep-daily "${BACKUP_KEEP_DAILY:-30}" --keep-monthly "${BACKUP_KEEP_MONTHLY:-12}" --prune
}

seconds_until_next_run() {
  local hour="${BACKUP_HOUR:-3}"
  local now next
  now="$(date +%s)"
  next="$(date -d "today ${hour}:00" +%s)"
  if (( next <= now )); then next="$(date -d "tomorrow ${hour}:00" +%s)"; fi
  echo $(( next - now ))
}

command="${1:-schedule}"
shift || true

case "${command}" in
  schedule)
    require_repository
    log "scheduled daily at ${BACKUP_HOUR:-3}:00 ${TZ:-UTC} for host ${backup_host}"
    while true; do
      sleep "$(seconds_until_next_run)"
      # A failed night is logged and retried the next day; the container keeps running.
      run_backup || log "backup failed; see the messages above"
    done
    ;;
  backup)
    run_backup
    ;;
  init)
    require_repository
    if restic cat config >/dev/null 2>&1; then
      log "repository already initialised"
    else
      restic init
    fi
    ;;
  snapshots)
    require_repository
    restic snapshots --host "${backup_host}" "$@"
    ;;
  check)
    require_repository
    restic check "$@"
    ;;
  restore)
    require_repository
    if [[ $# -lt 2 ]]; then
      log "usage: agrorende-backup restore <snapshot|latest> <path> [<path>...]"
      exit 2
    fi
    snapshot="$1"
    shift
    includes=()
    for path in "$@"; do includes+=(--include "${path}"); done
    restic restore "${snapshot}" --host "${backup_host}" --target /restore "${includes[@]}"
    log "restored into /restore; copy the files back after checking them"
    ;;
  restore-mongo)
    require_repository
    if [[ $# -ne 1 ]]; then
      log "usage: agrorende-backup restore-mongo <snapshot|latest> | mongorestore --archive --gzip --uri ..."
      exit 2
    fi
    restic dump --host "${backup_host}" --tag mongo "$1" "/mongo-${BACKUP_MONGO_DB:-${MONGODB_DB:-agrorende}}.archive.gz"
    ;;
  *)
    log "unknown command '${command}'"
    exit 2
    ;;
esac

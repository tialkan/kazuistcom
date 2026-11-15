# shellcheck shell=bash
# Shared helpers for infra/backup/*.sh. Sourced, not executed.
#
# Configuration comes from the environment, optionally loaded from KAZUIST_BACKUP_ENV (default
# /etc/kazuist/backup.env, root owned, mode 600). Names are listed in infra/backup/backup.env.example; values never
# enter the repository, the command line or the logs. restic runs from its pinned official image, so the server
# needs only Docker (which Coolify installs).

set -Eeuo pipefail
umask 077

KAZUIST_BACKUP_ENV="${KAZUIST_BACKUP_ENV:-/etc/kazuist/backup.env}"
if [ -f "$KAZUIST_BACKUP_ENV" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$KAZUIST_BACKUP_ENV"
  set +a
fi

# restic 0.19.1 (BSD-2-Clause), official image, amd64 and arm64 index digest read from Docker Hub on 2026-11-15.
RESTIC_IMAGE="${KAZUIST_RESTIC_IMAGE:-restic/restic:0.19.1@sha256:136600b6ff6843d61d355f7f71f460a166429f35de6fd11b568fece3c9a4d510}"
# Snapshots are grouped under one host name, so a rebuilt server continues the same retention chain.
RESTIC_HOST="${KAZUIST_RESTIC_HOST:-kazuist}"
RESTIC_CACHE_DIR="${KAZUIST_RESTIC_CACHE_DIR:-/var/cache/kazuist-restic}"
# Optional SSH config, key and known_hosts for an SFTP repository (Hetzner Storage Box, port 23).
RESTIC_SSH_DIR="${KAZUIST_RESTIC_SSH_DIR:-/etc/kazuist/ssh}"
PG_LABEL="${KAZUIST_PG_LABEL:-kazuist.service=postgres}"
PG_USER="${KAZUIST_PG_USER:-kazuist}"
PG_DB="${KAZUIST_PG_DB:-kazuist}"
RAW_DIR="${KAZUIST_RAW_STORE_DIR:-/srv/kazuist/raw-store}"
WORK_DIR="${KAZUIST_BACKUP_WORK_DIR:-/var/lib/kazuist-backup}"

log() {
  # One JSON line per event; messages are fixed strings and counts, never data or secrets.
  printf '{"at":"%s","job":"%s","msg":"%s"%s}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${JOB:-backup}" "$1" "${2:+,$2}" >&2
}

die() {
  log "failed" "\"reason\":\"$1\""
  exit 1
}

require_env() {
  local name
  for name in "$@"; do
    [ -n "${!name:-}" ] || die "missing ${name}"
  done
}

check_config() {
  require_env RESTIC_REPOSITORY RESTIC_PASSWORD_FILE
  [ -r "$RESTIC_PASSWORD_FILE" ] || die "RESTIC_PASSWORD_FILE not readable"
  command -v docker >/dev/null || die "docker missing"
}

# restic <args...>: runs restic in a throwaway container. Extra docker flags (mounts) go in RESTIC_MOUNTS (array).
# Secrets are passed by name (-e NAME) so their values never appear in the process list.
restic_run() {
  local -a args=(run --rm -i --network "${KAZUIST_RESTIC_NETWORK:-bridge}")
  args+=(-e RESTIC_REPOSITORY -e RESTIC_PASSWORD_FILE=/run/kazuist/restic-password -e RESTIC_COMPRESSION=auto)
  args+=(-e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION)
  args+=(-v "$RESTIC_PASSWORD_FILE:/run/kazuist/restic-password:ro")
  mkdir -p "$RESTIC_CACHE_DIR"
  args+=(-v "$RESTIC_CACHE_DIR:/root/.cache/restic")
  if [ -d "$RESTIC_SSH_DIR" ]; then
    args+=(-v "$RESTIC_SSH_DIR:/root/.ssh:ro")
  fi
  # A local repository path (tests, or a mounted disk) is mounted at the same path.
  case "$RESTIC_REPOSITORY" in
    /*) mkdir -p "$RESTIC_REPOSITORY" && args+=(-v "$RESTIC_REPOSITORY:$RESTIC_REPOSITORY") ;;
  esac
  if [ "${RESTIC_MOUNTS+set}" = set ]; then
    args+=("${RESTIC_MOUNTS[@]}")
  fi
  docker "${args[@]}" "$RESTIC_IMAGE" "$@"
}

# Prints the id of the single running container with the given label; fails on zero or several.
find_container() {
  local label="$1" ids n
  ids="$(docker ps -q --filter "label=${label}" --filter status=running)"
  n="$(printf '%s' "$ids" | grep -c . || true)"
  [ "$n" = "1" ] || die "expected one running container with label ${label}, found ${n}"
  printf '%s' "$ids"
}

ping_url() {
  # Heartbeat to the external monitor (docs/runbook/izleme.md). Failure to ping never hides the job result.
  local url="${1:-}"
  [ -n "$url" ] || return 0
  curl -fsS -m 10 --retry 3 -o /dev/null "$url" || log "ping failed"
}

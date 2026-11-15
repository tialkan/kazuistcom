#!/usr/bin/env bash
# Off-server encrypted backup of the Kazuist production server (docs/runbook/yedek.md).
#
#   backup.sh          PostgreSQL dump + raw store (+ Coolify configuration when present) to the restic repository,
#                      then retention (7 daily, 4 weekly, 6 monthly, plus the last 4 runs) and, on Sundays, prune
#                      and a 5% data check.
#   backup.sh init     creates the restic repository once (the password file must exist first).
#   backup.sh snapshots
#                      lists snapshots.
#
# restic encrypts on the client (AES-256 in counter mode with Poly1305-AES, restic design document); the repository
# host never sees plain data. The dump is checked with pg_restore --list before it is uploaded and deleted from the
# server afterwards. Exit code 0 only when every step succeeded; the heartbeat goes to KAZUIST_BACKUP_PING_OK_URL on
# success and KAZUIST_BACKUP_PING_FAIL_URL on failure.

JOB=backup
# shellcheck source=infra/backup/lib.sh
. "$(dirname "$(readlink -f "$0")")/lib.sh"

dump_dir=""
finish() {
  local rc=$?
  [ -z "$dump_dir" ] || rm -rf "$dump_dir"
  if [ "$rc" -ne 0 ] && [ "${MODE:-run}" = "run" ]; then
    ping_url "${KAZUIST_BACKUP_PING_FAIL_URL:-}"
  fi
  exit "$rc"
}
trap finish EXIT
trap 'log "error" "\"line\":${LINENO}"' ERR

check_config

MODE="${1:-run}"
case "$MODE" in
  init)
    restic_run init
    exit 0
    ;;
  snapshots)
    restic_run snapshots --host "$RESTIC_HOST"
    exit 0
    ;;
  run) ;;
  *) die "unknown command" ;;
esac

# One run at a time (the timer and a manual run must not overlap).
mkdir -p "$WORK_DIR"
exec 9>"$WORK_DIR/.lock"
flock -n 9 || die "another backup is running"

started=$(date +%s)
log "start"
restic_run cat config >/dev/null || die "restic repository not reachable or not initialised (backup.sh init)"

# 1. PostgreSQL: logical dump in custom format, uncompressed so that restic can deduplicate between runs (restic
#    compresses itself). pg_dump runs inside the postgres container over the local socket.
pg="$(find_container "$PG_LABEL")"
dump_dir="$WORK_DIR/postgres"
rm -rf "$dump_dir"
mkdir -p "$dump_dir"
docker exec -u postgres "$pg" pg_dump -U "$PG_USER" -d "$PG_DB" --format=custom --compress=0 >"$dump_dir/kazuist.dump"
docker exec -u postgres "$pg" pg_dumpall -U "$PG_USER" --globals-only --no-role-passwords >"$dump_dir/globals.sql"
docker exec -i "$pg" pg_restore --list <"$dump_dir/kazuist.dump" >"$dump_dir/toc.txt"
tables=$(grep -c ' TABLE DATA ' "$dump_dir/toc.txt" || true)
[ "$tables" -gt 0 ] || die "dump has no table data"
docker exec "$pg" postgres --version >"$dump_dir/server-version.txt"
(cd "$dump_dir" && sha256sum kazuist.dump globals.sql >SHA256SUMS)
dump_bytes=$(stat -c %s "$dump_dir/kazuist.dump")
log "dump ok" "\"tables\":${tables},\"bytes\":${dump_bytes}"

RESTIC_MOUNTS=(-v "$dump_dir:/backup/postgres:ro")
restic_run backup --host "$RESTIC_HOST" --tag postgres --no-scan /backup/postgres
log "postgres uploaded"

# 2. Raw store (worker-py ingestion archive). An empty folder is valid before the first ingestion.
[ -d "$RAW_DIR" ] || die "raw store folder missing"
raw_files=$(find "$RAW_DIR" -type f | wc -l)
RESTIC_MOUNTS=(-v "$RAW_DIR:/backup/raw-store:ro")
restic_run backup --host "$RESTIC_HOST" --tag raw-store --no-scan /backup/raw-store
log "raw store uploaded" "\"files\":${raw_files}"

# 3. Coolify configuration: its .env holds APP_KEY, without which Coolify's own database backups cannot be
#    decrypted. Optional so that the script also runs where Coolify is absent (CI).
if [ -f /data/coolify/source/.env ] && [ "${KAZUIST_BACKUP_COOLIFY:-1}" = "1" ]; then
  RESTIC_MOUNTS=(-v /data/coolify/source/.env:/backup/coolify/source.env:ro)
  if [ -d /data/coolify/backups ]; then
    RESTIC_MOUNTS+=(-v /data/coolify/backups:/backup/coolify/backups:ro)
  fi
  restic_run backup --host "$RESTIC_HOST" --tag coolify --no-scan /backup/coolify
  log "coolify configuration uploaded"
fi

# 4. Retention, per tag. Prune and a partial data read once a week (Sunday), they are the expensive steps.
RESTIC_MOUNTS=()
restic_run forget --host "$RESTIC_HOST" --group-by host,tags \
  --keep-last 4 --keep-daily 7 --keep-weekly 4 --keep-monthly 6 >/dev/null
if [ "$(date +%u)" = "7" ] || [ "${KAZUIST_BACKUP_FORCE_PRUNE:-0}" = "1" ]; then
  restic_run prune >/dev/null
  restic_run check --read-data-subset=5% >/dev/null
  log "prune and check ok"
fi

date -u +%Y-%m-%dT%H:%M:%SZ >"$WORK_DIR/last-success"
log "done" "\"seconds\":$(($(date +%s) - started))"
ping_url "${KAZUIST_BACKUP_PING_OK_URL:-}"

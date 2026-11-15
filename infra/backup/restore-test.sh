#!/usr/bin/env bash
# Restore test for the off-server backup (docs/runbook/yedek.md, "Geri yükleme testi").
#
#   restore-test.sh [postgres-snapshot-id]     default: the latest postgres snapshot
#
# 1. Restores the PostgreSQL snapshot from the restic repository into a temporary folder (restic --verify) and checks
#    the dump against the SHA256SUMS written at backup time.
# 2. Starts a throwaway PostgreSQL container (same image as the running one, no network, 2 GB limit), restores the
#    dump with pg_restore --exit-on-error --single-transaction and runs the checks: migration count, table count,
#    row counts of the main tables, ledger balance, optional smoke SQL (KAZUIST_RESTORE_SMOKE_SQL, for example
#    infra/scripts/db-smoke.sql, rolled back) and an optional boolean query (KAZUIST_RESTORE_CHECK_SQL).
# 3. Restores the latest raw store snapshot (restic --verify) and compares up to 50 random files with the live folder.
# 4. Prints the timings (restore duration, snapshot age) and removes the container and every restored file.
#
# Runs as root (systemd, or sudo -E in CI). Restored data can hold personal data: it stays in a mode 700 folder
# and is deleted at the end, also on failure. Exit code 0 only when every check passed.

JOB=restore-test
# shellcheck source=infra/backup/lib.sh
. "$(dirname "$(readlink -f "$0")")/lib.sh"

[ "$(id -u)" = "0" ] || die "run as root"
check_config
command -v python3 >/dev/null || die "python3 missing"

snapshot="${1:-latest}"
tmp_root="${KAZUIST_RESTORE_TMP:-/var/tmp}"
tmp="$(mktemp -d "$tmp_root/kazuist-restore.XXXXXX")"
name="kazuist-restore-test-$$"
cleanup() {
  local rc=$?
  docker rm -f "$name" >/dev/null 2>&1 || true
  rm -rf "$tmp"
  exit "$rc"
}
trap cleanup EXIT
trap 'log "error" "\"line\":${LINENO}"' ERR

t0=$(date +%s)

# --- 1. PostgreSQL snapshot ---------------------------------------------------------------------------------------
RESTIC_MOUNTS=()
if [ "$snapshot" = "latest" ]; then
  restic_run snapshots --host "$RESTIC_HOST" --tag postgres --json >"$tmp/snap.json"
else
  restic_run snapshots --host "$RESTIC_HOST" --tag postgres --json "$snapshot" >"$tmp/snap.json"
fi
read -r snap_id snap_time < <(python3 -c '
import json, sys
s = json.load(open(sys.argv[1]))
if not s:
    sys.exit("no postgres snapshot")
s = sorted(s, key=lambda x: x["time"])[-1]
print(s["id"], s["time"])
' "$tmp/snap.json")
log "postgres snapshot" "\"id\":\"${snap_id:0:8}\",\"time\":\"${snap_time}\""

mkdir -p "$tmp/pg"
RESTIC_MOUNTS=(-v "$tmp/pg:/restore")
restic_run restore "$snap_id" --target /restore --verify >/dev/null
dump_dir="$tmp/pg/backup/postgres"
(cd "$dump_dir" && sha256sum -c --quiet SHA256SUMS) || die "dump checksum mismatch"
t_fetch=$(date +%s)
log "dump restored and verified" "\"bytes\":$(stat -c %s "$dump_dir/kazuist.dump")"

# --- 2. Restore into a throwaway PostgreSQL -----------------------------------------------------------------------
live_pg="$(docker ps -q --filter "label=${PG_LABEL}" --filter status=running | head -1)"
if [ -n "${KAZUIST_RESTORE_PG_IMAGE:-}" ]; then
  pg_image="$KAZUIST_RESTORE_PG_IMAGE"
elif [ -n "$live_pg" ]; then
  pg_image="$(docker inspect -f '{{.Config.Image}}' "$live_pg")"
else
  pg_image="pgvector/pgvector:0.8.7-pg18-trixie"
fi
throwaway_pw="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
docker run -d --name "$name" --network none --memory 2g --memory-swap 2g \
  -e POSTGRES_USER="$PG_USER" -e POSTGRES_DB="$PG_DB" -e POSTGRES_PASSWORD="$throwaway_pw" \
  --label kazuist.service=restore-test "$pg_image" >/dev/null
# The image's init phase runs a socket only server first; TCP on loopback answers only after the real start.
ready=""
for _ in $(seq 1 60); do
  if docker exec "$name" pg_isready -h 127.0.0.1 -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1; then ready=1; break; fi
  sleep 2
done
[ -n "$ready" ] || die "throwaway postgres did not start"

docker exec -i "$name" pg_restore -U "$PG_USER" -d "$PG_DB" --no-owner --exit-on-error --single-transaction \
  <"$dump_dir/kazuist.dump"
t_restore=$(date +%s)
log "pg_restore ok" "\"seconds\":$((t_restore - t_fetch))"

q() { docker exec "$name" psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 -tAq -c "$1"; }
qlive() { docker exec "$live_pg" psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 -tAq -c "$1"; }

migrations=$(q "SELECT count(*) FROM drizzle.__drizzle_migrations")
[ "$migrations" -gt 0 ] || die "no migrations in the restored database"
tables=$(q "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")
[ "$tables" -gt 0 ] || die "no tables in the restored database"
for ext in vector pg_trgm; do
  [ "$(q "SELECT count(*) FROM pg_extension WHERE extname = '$ext'")" = "1" ] || die "extension $ext missing"
done
unbalanced=$(q "SELECT count(*) FROM (SELECT transaction_id FROM ledger_entries GROUP BY 1
  HAVING sum(CASE WHEN side = 'borc' THEN credits ELSE -credits END) <> 0) x")
[ "$unbalanced" = "0" ] || die "ledger has ${unbalanced} unbalanced transactions"

counts=""
for t in users records chunks ledger_entries jobs; do
  n=$(q "SELECT CASE WHEN to_regclass('public.$t') IS NULL THEN -1 ELSE (SELECT count(*) FROM public.$t) END")
  counts="${counts}${counts:+,}\"$t\":$n"
  if [ -n "$live_pg" ] && [ "${KAZUIST_RESTORE_COMPARE_LIVE:-1}" = "1" ]; then
    live=$(qlive "SELECT CASE WHEN to_regclass('public.$t') IS NULL THEN -1 ELSE (SELECT count(*) FROM public.$t) END")
    counts="${counts},\"${t}_live\":$live"
  fi
done
log "database checks ok" "\"migrations\":${migrations},\"tables\":${tables},\"rows\":{${counts}}"
if [ -n "$live_pg" ]; then
  live_migrations=$(qlive "SELECT count(*) FROM drizzle.__drizzle_migrations")
  [ "$live_migrations" = "$migrations" ] || log "migration count differs from live" "\"live\":${live_migrations}"
fi

if [ -n "${KAZUIST_RESTORE_SMOKE_SQL:-}" ]; then
  docker exec -i "$name" psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 -q -f - <"$KAZUIST_RESTORE_SMOKE_SQL" >/dev/null
  log "smoke sql ok"
fi
if [ -n "${KAZUIST_RESTORE_CHECK_SQL:-}" ]; then
  [ "$(q "$KAZUIST_RESTORE_CHECK_SQL")" = "t" ] || die "KAZUIST_RESTORE_CHECK_SQL did not return true"
  log "check sql ok"
fi
docker rm -f "$name" >/dev/null
rm -rf "$tmp/pg"

# --- 3. Raw store -------------------------------------------------------------------------------------------------
RESTIC_MOUNTS=()
restic_run snapshots --host "$RESTIC_HOST" --tag raw-store --json >"$tmp/raw.json"
raw_id=$(python3 -c '
import json, sys
s = json.load(open(sys.argv[1]))
print(sorted(s, key=lambda x: x["time"])[-1]["id"] if s else "")
' "$tmp/raw.json")
[ -n "$raw_id" ] || die "no raw-store snapshot"
mkdir -p "$tmp/raw"
RESTIC_MOUNTS=(-v "$tmp/raw:/restore")
restic_run restore "$raw_id" --target /restore --verify >/dev/null
raw_root="$tmp/raw/backup/raw-store"
mkdir -p "$raw_root"
restored_files=$(find "$raw_root" -type f | wc -l)
compared=0
mismatch=0
if [ -d "$RAW_DIR" ]; then
  while IFS= read -r -d '' f; do
    rel="${f#"$raw_root"/}"
    [ -f "$RAW_DIR/$rel" ] || continue
    compared=$((compared + 1))
    a=$(sha256sum <"$f" | cut -d' ' -f1)
    b=$(sha256sum <"$RAW_DIR/$rel" | cut -d' ' -f1)
    [ "$a" = "$b" ] || mismatch=$((mismatch + 1))
  done < <(find "$raw_root" -type f -print0 | shuf -z -n 50)
fi
[ "$mismatch" = "0" ] || die "raw store: ${mismatch} of ${compared} sampled files differ from live"
t_end=$(date +%s)
log "raw store checks ok" "\"files\":${restored_files},\"compared\":${compared}"

snap_epoch=$(python3 -c '
import datetime, re, sys
t = re.sub(r"\.\d+", "", sys.argv[1]).replace("Z", "+00:00")
print(int(datetime.datetime.fromisoformat(t).timestamp()))
' "$snap_time")
age=$((t0 - snap_epoch))
log "done" "\"snapshot\":\"${snap_id:0:8}\",\"snapshot_age_seconds\":${age},\"fetch_seconds\":$((t_fetch - t0)),\"restore_seconds\":$((t_restore - t_fetch)),\"total_seconds\":$((t_end - t0))"

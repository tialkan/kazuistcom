#!/usr/bin/env bash
# Disk, inode and backup age heartbeat (docs/runbook/izleme.md). Runs every 5 minutes from a systemd timer.
#
# OK when the root file system is below KAZUIST_DISK_LIMIT_PCT (default 80) for both space and inodes and the last
# successful backup (infra/backup/backup.sh writes last-success) is younger than KAZUIST_BACKUP_MAX_AGE_HOURS
# (default 8: the timer runs every 6 hours). Sends KAZUIST_DISK_PING_OK_URL or KAZUIST_DISK_PING_FAIL_URL; the
# external monitor alerts on a fail ping and on missing pings, so a dead server is noticed too. Prints one JSON line.

JOB=disk-check
# shellcheck source=infra/backup/lib.sh
. "$(dirname "$(readlink -f "$0")")/lib.sh"

limit="${KAZUIST_DISK_LIMIT_PCT:-80}"
max_age_h="${KAZUIST_BACKUP_MAX_AGE_HOURS:-8}"
read -r space inodes < <(df --output=pcent,ipcent / | tail -1 | tr -d '%')

backup_age_h=-1
if [ -f "$WORK_DIR/last-success" ]; then
  last=$(date -u -d "$(cat "$WORK_DIR/last-success")" +%s)
  backup_age_h=$((($(date +%s) - last) / 3600))
fi

problems=""
[ "$space" -lt "$limit" ] || problems="${problems}disk "
[ "$inodes" -lt "$limit" ] || problems="${problems}inode "
if [ "$backup_age_h" -lt 0 ] || [ "$backup_age_h" -ge "$max_age_h" ]; then problems="${problems}backup-age "; fi

fields="\"disk_pct\":${space},\"inode_pct\":${inodes},\"backup_age_hours\":${backup_age_h}"
if [ -z "$problems" ]; then
  log "ok" "$fields"
  ping_url "${KAZUIST_DISK_PING_OK_URL:-}"
else
  log "alert" "${fields},\"problems\":\"${problems% }\""
  ping_url "${KAZUIST_DISK_PING_FAIL_URL:-}"
  exit 1
fi

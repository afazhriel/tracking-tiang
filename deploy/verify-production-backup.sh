#!/usr/bin/env bash
# Restore a server-local backup into a disposable PostgreSQL container only.
# Never connect to the production database or publish a network port.
set -Eeuo pipefail
umask 077
backup=${1:?Usage: verify-production-backup.sh PRIVATE_BACKUP_DIRECTORY}
[[ -d "$backup" && ! -L "$backup" ]] || { echo 'Backup directory required.' >&2; exit 1; }
backup=$(cd "$backup" && pwd -P)
# Invalidate previous evidence before checking any current backup contents.
rm -f "$backup/RESTORE_VERIFIED"
for file in COMPLETE SHA256SUMS backend.tar.gz frontend.tar.gz database.dump; do
  [[ -f "$backup/$file" && ! -L "$backup/$file" ]] || { echo 'Incomplete backup.' >&2; exit 1; }
done
# Do not let a modified manifest select arbitrary files outside the backup.
awk 'NF != 2 || $1 !~ /^[a-f0-9]+$/ || length($1) != 64 { exit 1 }
     $2 == "backend.tar.gz" { a++ ; next }
     $2 == "frontend.tar.gz" { b++ ; next }
     $2 == "database.dump" { c++ ; next }
     { exit 1 }
     END { if (NR != 3 || a != 1 || b != 1 || c != 1) exit 1 }' "$backup/SHA256SUMS"
(cd "$backup"; sha256sum --check --strict --status SHA256SUMS)
tar -tzf "$backup/backend.tar.gz" > /dev/null
tar -tzf "$backup/frontend.tar.gz" > /dev/null
docker_local() {
  env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
    docker --host=unix:///var/run/docker.sock "$@"
}
container=''
cleanup() {
  local status=$?
  trap - EXIT
  if [[ "$container" =~ ^[a-f0-9]{64}$ ]]; then
    if ! docker_local rm --force --volumes "$container" > /dev/null 2>&1; then
      echo 'Could not remove the isolated restore container; operator review required.' >&2
      status=1
    fi
  fi
  if [[ "$status" != 0 ]]; then
    rm -f "$backup/RESTORE_VERIFIED"
    echo 'Backup restore failed before production migration. Details remain in the private backup directory.' >&2
  fi
  exit "$status"
}
trap cleanup EXIT
# No network, no ports, no production mount, bounded resource use. The anonymous
# database volume belongs only to this newly-created container and is removed.
container=$(docker_local run --detach --network none --memory 1g --cpus 1 --pids-limit 128 \
  --label tracking-tiang.purpose=isolated-backup-restore \
  -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_USER=tracking_restore \
  -e POSTGRES_DB=tracking_recovery postgres:18)
[[ "$container" =~ ^[a-f0-9]{64}$ ]] || { echo 'Invalid isolated container ID.' >&2; exit 1; }
ready=0
for attempt in {1..60}; do
  if docker_local exec "$container" pg_isready -U tracking_restore -d tracking_recovery > /dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
[[ "$ready" = 1 ]] || { echo 'Isolated PostgreSQL did not become ready.' >&2; exit 1; }
# PostgreSQL restore validates real data and foreign keys, not just dump headers.
# Error detail can include user data, so it must never enter public Actions logs.
docker_local exec -i "$container" pg_restore --exit-on-error --no-owner --no-privileges \
  -U tracking_restore -d tracking_recovery < "$backup/database.dump" \
  > "$backup/restore-private.log" 2>&1
# Validate that the complete restore reached the application migration ledger.
docker_local exec "$container" psql -X -v ON_ERROR_STOP=1 -U tracking_restore -d tracking_recovery \
  -At -c 'SELECT count(*) FROM public.migrations' > "$backup/restore-migrations.count" 2>> "$backup/restore-private.log"
grep -Eq '^[0-9]+$' "$backup/restore-migrations.count"
sha256sum "$backup/database.dump" | awk '{print $1}' > "$backup/RESTORE_VERIFIED"
echo 'PASS: actual backup restored into an isolated PostgreSQL 18 container; no production migration was run.'

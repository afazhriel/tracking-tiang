#!/usr/bin/env bash
# Restore only into a NEW database in the selected local PostgreSQL 18 test container.
set -Eeuo pipefail
umask 077
container=${CI_POSTGRES_CONTAINER:?An isolated local PostgreSQL container ID is required}
[[ "$container" =~ ^[a-f0-9]{12,64}$ ]] || { echo 'Expected a local container ID, not a remote host.' >&2; exit 1; }
docker_local() {
  env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
    docker --host=unix:///var/run/docker.sock "$@"
}
[[ "$(docker_local inspect "$container" --format '{{.Config.Image}}')" = postgres:18 ]] || { echo 'PostgreSQL 18 test image required.' >&2; exit 1; }
workspace=$(mktemp -d "${RUNNER_TEMP:-/tmp}/tracking-recovery.XXXXXXXX")
trap 'rm -rf "$workspace"' EXIT
files=${CI_RECOVERY_FILES:?A guarded fixture file list is required}
while IFS= read -r path; do
  [[ "$path" != *..* && ( "$path" = storage/app/public/recovery-ci/* || "$path" = storage/app/private/media/recovery-ci/* ) ]] || { echo 'Recovery fixtures must remain in dedicated test directories.' >&2; exit 1; }
done < "$files"
[[ $(wc -l < "$files") -eq 2 ]] || { echo 'Expected both legacy and private fixture files.' >&2; exit 1; }
(cd backend; while IFS= read -r path; do sha256sum "$path"; done < "$files") > "$workspace/uploads.sha256"
tar -czf "$workspace/uploads.tar.gz" -C backend -T "$files"
docker_local exec "$container" pg_dump -U ci -d tracking_ci -Fc > "$workspace/database.dump"
docker_local exec -i "$container" pg_restore --list < "$workspace/database.dump" > /dev/null
target="tracking_restore_${RANDOM}${RANDOM}"
# createdb refuses existing names; no DROP, --clean or overwrite is permitted.
docker_local exec "$container" createdb -U ci "$target"
docker_local exec -i "$container" pg_restore --exit-on-error --no-owner --no-privileges -U ci -d "$target" < "$workspace/database.dump"
# Compare the complete public table inventory, then every row of every table.
# This includes teams, assignments, approved baselines and their periods,
# quantity request keys/fingerprints and all historical progress records.
# Never silently pass if a new production table is added to the schema.
catalog="SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
docker_local exec "$container" psql -X -v ON_ERROR_STOP=1 -U ci -d tracking_ci -At -c "$catalog" > "$workspace/source.tables"
docker_local exec "$container" psql -X -v ON_ERROR_STOP=1 -U ci -d "$target" -At -c "$catalog" > "$workspace/restored.tables"
test -s "$workspace/source.tables"
cmp --silent "$workspace/source.tables" "$workspace/restored.tables" || { echo "Restored table inventory differs." >&2; exit 1; }
for required in projects poles pole_progress_histories progress_photos teams team_members pole_assignments project_baselines project_baseline_periods project_quantity_entries; do
  grep -Fxq "$required" "$workspace/source.tables" || { echo "Recovery fixture is missing table: $required" >&2; exit 1; }
done
while IFS= read -r table; do
  [[ "$table" =~ ^[a-z][a-z0-9_]*$ ]] || { echo 'Unexpected public table name in the isolated fixture.' >&2; exit 1; }
  query="SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]'::jsonb) FROM \"$table\" t"
  docker_local exec "$container" psql -X -v ON_ERROR_STOP=1 -U ci -d tracking_ci -At -c "$query" > "$workspace/source.rows"
  docker_local exec "$container" psql -X -v ON_ERROR_STOP=1 -U ci -d "$target" -At -c "$query" > "$workspace/restored.rows"
  cmp --silent "$workspace/source.rows" "$workspace/restored.rows" || { echo "Restored table differs: $table" >&2; exit 1; }
done < "$workspace/source.tables"
query="SELECT sequencename,last_value FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename"
docker_local exec "$container" psql -X -v ON_ERROR_STOP=1 -U ci -d tracking_ci -At -c "$query" > "$workspace/source.sequences"
docker_local exec "$container" psql -X -v ON_ERROR_STOP=1 -U ci -d "$target" -At -c "$query" > "$workspace/restored.sequences"
cmp --silent "$workspace/source.sequences" "$workspace/restored.sequences"
mkdir "$workspace/restored-files"
tar -xzf "$workspace/uploads.tar.gz" --no-same-owner -C "$workspace/restored-files"
(cd "$workspace/restored-files"; sha256sum --check --status "$workspace/uploads.sha256")
printf 'PASS isolated PostgreSQL restore: %s tables including Quantity, baseline and teams; sequences and legacy/private uploads.\\n' "$(wc -l < "$workspace/source.tables")"

# Exercise the exact gate used for real VPS backups, with synthetic data only.
backup="$workspace/production-backup-shape"
mkdir "$backup"
cp "$workspace/database.dump" "$backup/database.dump"
cp "$workspace/uploads.tar.gz" "$backup/backend.tar.gz"
tar -czf "$backup/frontend.tar.gz" -C "$workspace" uploads.sha256
(cd "$backup"; sha256sum backend.tar.gz frontend.tar.gz database.dump > SHA256SUMS)
printf 'Synthetic backup complete.\n' > "$backup/COMPLETE"
if ! bash deploy/verify-production-backup.sh "$backup"; then
  # This directory contains only the guarded synthetic fixtures created above.
  # Production helper output remains private; never use this CI harness on VPS.
  cat "$backup/restore-private.log" >&2
  exit 1
fi
test -s "$backup/RESTORE_VERIFIED"

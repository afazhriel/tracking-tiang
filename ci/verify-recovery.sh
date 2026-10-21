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
for table in users projects project_user poles work_items pole_work_progress pole_progress_histories progress_photos notifications migrations; do
  query="SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]'::jsonb) FROM $table t"
  docker_local exec "$container" psql -X -v ON_ERROR_STOP=1 -U ci -d tracking_ci -At -c "$query" > "$workspace/source.rows"
  docker_local exec "$container" psql -X -v ON_ERROR_STOP=1 -U ci -d "$target" -At -c "$query" > "$workspace/restored.rows"
  cmp --silent "$workspace/source.rows" "$workspace/restored.rows" || { echo "Restored table differs: $table" >&2; exit 1; }
done
query="SELECT sequencename,last_value FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename"
docker_local exec "$container" psql -X -v ON_ERROR_STOP=1 -U ci -d tracking_ci -At -c "$query" > "$workspace/source.sequences"
docker_local exec "$container" psql -X -v ON_ERROR_STOP=1 -U ci -d "$target" -At -c "$query" > "$workspace/restored.sequences"
cmp --silent "$workspace/source.sequences" "$workspace/restored.sequences"
mkdir "$workspace/restored-files"
tar -xzf "$workspace/uploads.tar.gz" --no-same-owner -C "$workspace/restored-files"
(cd "$workspace/restored-files"; sha256sum --check --status "$workspace/uploads.sha256")
echo 'PASS isolated PostgreSQL restore: 10 tables, foreign keys, sequences, legacy/private upload bytes.'

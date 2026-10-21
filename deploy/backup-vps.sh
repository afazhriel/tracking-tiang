#!/usr/bin/env bash
# Read live application data into a private, server-local recovery directory.
set -Eeuo pipefail
umask 077
configuration=${DEPLOY_CONFIG:-/etc/tracking-tiang-deploy.conf}
if [[ -f "$configuration" ]]; then
  source "$configuration"
fi
repo=${DEPLOY_REPO:-/opt/tracking-tiang}
frontend=${DEPLOY_FRONTEND:-/opt/tracking-tiang/frontend-next/frontend}
exec 9> /tmp/tracking-tiang-deploy.lock
flock -n 9 || { echo 'Another deployment/backup is running' >&2; exit 1; }
# An online DB dump plus a later file archive cannot guarantee matching uploads.
# This helper does not stop production itself: an operator must approve/drain it.
if [[ "$(docker inspect tracking-tiang-backend --format '{{.State.Running}}')" != false ]]; then
  echo 'Consistent backup requires the backend to be gracefully stopped first; no backup was taken.' >&2
  exit 1
fi
backup="${DEPLOY_BACKUPS:-/opt/tracking-tiang-deploy-backups}/before-activation-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup"
cd "$repo"
git rev-parse HEAD > "$backup/backend-commit"
git diff --binary > "$backup/backend-working.patch"
git diff --cached --binary > "$backup/backend-index.patch"
git -C "$frontend" rev-parse HEAD > "$backup/frontend-commit"
git -C "$frontend" diff --binary > "$backup/frontend-working.patch"
git -C "$frontend" diff --cached --binary > "$backup/frontend-index.patch"
cp docker-compose.yml "$backup/docker-compose.yml"
tar --exclude=vendor --exclude=node_modules --exclude=backend/storage/logs \
  --exclude=backend/storage/framework -czf "$backup/backend.tar.gz" backend
tar --exclude=node_modules --exclude=.git --exclude=.gradle \
  --exclude=./android/app/build --exclude=./android/build --exclude=./.next/cache \
  -czf "$backup/frontend.tar.gz" -C "$frontend" .
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "$backup/database.dump" < /dev/null
test -s "$backup/database.dump"
docker compose exec -T postgres pg_restore --list < "$backup/database.dump" > /dev/null
printf 'BACKUP_COMPLETE %s\n' "$backup"

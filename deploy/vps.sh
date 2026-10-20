#!/usr/bin/env bash
# Matches the hybrid Docker + systemd layout recorded in RECOVERY_AUDIT.
set -Eeuo pipefail
umask 022

sha=${1:?Usage: bash deploy/vps.sh COMMIT_SHA}
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid commit SHA' >&2; exit 1; }
# This file is server-owned; never commit its secrets to Git.
if [[ -f /etc/tracking-tiang-deploy.conf ]]; then
  source /etc/tracking-tiang-deploy.conf
fi
repo=${DEPLOY_REPO:-/opt/tracking-tiang}
frontend=${DEPLOY_FRONTEND:-/opt/tracking-tiang/frontend-next/frontend}
service=${DEPLOY_SERVICE:-tracking-tiang-next}
url=${DEPLOY_URL:-https://pjl.ituiot.com}

for cmd in git docker npm node rsync curl flock systemctl tar; do
  command -v "$cmd" >/dev/null || { echo "Missing command: $cmd" >&2; exit 1; }
done
exec 9> /tmp/tracking-tiang-deploy.lock
flock -n 9 || { echo 'Another deployment is running' >&2; exit 1; }
cd "$repo"
test -f backend/.env
test -d backend/storage
test -d "$frontend"
test -z "$(git status --porcelain)" || {
  echo 'VPS repository has local changes. Reconcile and back them up before deploying.' >&2
  exit 1
}
systemctl cat "$service" >/dev/null
docker compose config --quiet
docker compose exec -T backend php -v >/dev/null < /dev/null
# Avoid overwriting a frontend checkout with local source modifications.
frontend_repo=$(git -C "$frontend" rev-parse --show-toplevel)
test -z "$(git -C "$frontend_repo" status --porcelain)" || {
  echo 'Live frontend checkout has local changes; reconcile before deploying.' >&2
  exit 1
}
# This script only supports the separate frontend checkout documented in the audit.
[[ "$frontend_repo" != "$repo" ]] || {
  echo 'Expected a separate frontend checkout. Review deploy/vps.sh for this VPS layout.' >&2
  exit 1
}

git fetch origin main
git cat-file -e "$sha^{commit}"
git merge-base --is-ancestor "$sha" origin/main
# Reject a delayed run rather than deploying an older commit over a newer one.
test "$(git rev-parse origin/main)" = "$sha" || {
  echo 'A newer main commit exists; skip this run and deploy the latest one.' >&2
  exit 1
}
git merge-base --is-ancestor HEAD "$sha"
git -C "$frontend_repo" fetch origin main
git -C "$frontend_repo" merge-base --is-ancestor HEAD "$sha"

stage=$(mktemp -d /tmp/tracking-tiang-build.XXXXXX)
trap 'rm -rf "$stage"' EXIT
git archive "$sha" frontend backend | tar -x -C "$stage"
# Preserve server-specific build configuration without printing its contents.
for envfile in .env .env.local .env.production .env.production.local; do
  if [[ -f "$frontend/$envfile" ]]; then
    cp "$frontend/$envfile" "$stage/frontend/$envfile"
  fi
done
(umask 022; cd "$stage/frontend" && npm ci && npm run build)
# Build PHP image before touching the live source.
docker build -t tracking-tiang-php:latest -f "$stage/backend/Dockerfile" "$stage/backend"

backup="${DEPLOY_BACKUPS:-/opt/tracking-tiang-deploy-backups}/auto-$(date -u +%Y%m%dT%H%M%SZ)-${sha:0:12}"
(umask 077; mkdir -p "$backup")
git rev-parse HEAD > "$backup/backend-commit"
git -C "$frontend_repo" rev-parse HEAD > "$backup/frontend-commit"
tar --exclude=node_modules --exclude=.git -czf "$backup/frontend.tar.gz" -C "$frontend" .
tar --exclude=vendor -czf "$backup/backend.tar.gz" backend
# Backup must succeed before database migrations or source changes.
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup/database.dump" < /dev/null
test -s "$backup/database.dump"

# From here failures can require operator recovery; print the backup location.
trap 'echo "Deployment failed. Recovery files: $backup. Review deploy/README.md; database rollback is manual." >&2; rm -rf "$stage"' ERR
git merge --ff-only "$sha"
git -C "$frontend_repo" merge --ff-only "$sha"
docker compose up -d --no-deps --force-recreate backend
docker compose exec -T backend composer install --no-dev --prefer-dist --no-interaction --optimize-autoloader < /dev/null
docker compose exec -T backend php artisan migrate --force < /dev/null
docker compose exec -T backend php artisan optimize:clear < /dev/null
docker compose exec -T backend php artisan config:cache < /dev/null
docker compose exec -T backend php artisan queue:restart < /dev/null
docker compose restart backend

# Only stop the frontend after the replacement build is ready.
systemctl stop "$service"
rsync -a --delete "$stage/frontend/.next/" "$frontend/.next/"
rsync -a --delete "$stage/frontend/node_modules/" "$frontend/node_modules/"
systemctl start "$service"
systemctl is-active --quiet "$service"
curl --fail --silent --show-error --connect-timeout 10 --max-time 30 --retry 8 --retry-delay 3 --retry-connrefused "$url/login" -o /dev/null
curl --fail --silent --show-error --connect-timeout 10 --max-time 30 --retry 8 --retry-delay 3 --retry-connrefused "$url/api/regions/provinces" -o /dev/null
echo "Deployed $sha. Recovery files: $backup"

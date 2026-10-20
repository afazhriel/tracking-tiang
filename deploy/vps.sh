#!/usr/bin/env bash
# Matches the hybrid Docker + systemd layout recorded in RECOVERY_AUDIT.
set -Eeuo pipefail
umask 022

sha=${1:?Usage: bash deploy/vps.sh COMMIT_SHA}
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid commit SHA' >&2; exit 1; }
mode=${2:-}
[[ -z "$mode" || "$mode" = --replace-vps ]] || { echo 'Invalid deployment mode' >&2; exit 1; }
# This file is server-owned; never commit its secrets to Git.
configuration=${DEPLOY_CONFIG:-/etc/tracking-tiang-deploy.conf}
if [[ -f "$configuration" ]]; then
  source "$configuration"
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
if [[ "$mode" != --replace-vps ]] && [[ -n "$(git status --porcelain -- backend docker-compose.yml)" ]]; then
  echo 'Backend source has local changes. Reconcile and back them up before deploying.' >&2
  exit 1
fi
systemctl cat "$service" >/dev/null
docker compose config --quiet
docker compose exec -T backend php -v >/dev/null < /dev/null
# Avoid overwriting a frontend checkout with local source modifications.
frontend_repo=$(git -C "$frontend" rev-parse --show-toplevel)
if [[ "$mode" != --replace-vps ]] && [[ -n "$(git -C "$frontend_repo" status --porcelain -- frontend)" ]]; then
  echo 'Live frontend checkout has local changes; reconcile before deploying.' >&2
  exit 1
fi
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
git -C "$frontend_repo" fetch origin main
if [[ "$mode" != --replace-vps ]]; then
  git merge-base --is-ancestor HEAD "$sha"
  git -C "$frontend_repo" merge-base --is-ancestor HEAD "$sha"
fi

check_health() {
  systemctl is-active --quiet "$service"
  for path in /login /api/regions/provinces; do
    curl --fail --silent --show-error --connect-timeout 10 --max-time 30 \
      --retry 8 --retry-delay 3 --retry-connrefused "$url$path" -o /dev/null
  done
}
# Workflow/docs-only changes need no application rebuild or service restart.
if [[ -z "$mode" ]] && git diff --quiet HEAD "$sha" -- backend docker-compose.yml \
  && git -C "$frontend_repo" diff --quiet HEAD "$sha" -- frontend; then
  git merge --ff-only "$sha"
  git -C "$frontend_repo" merge --ff-only "$sha"
  check_health
  echo "Deployed $sha; application source was unchanged."
  exit 0
fi

mkdir -p "${DEPLOY_BUILD_ROOT:-/opt/tracking-tiang-builds}"
stage=$(mktemp -d "${DEPLOY_BUILD_ROOT:-/opt/tracking-tiang-builds}/build.XXXXXX")
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
git diff --binary > "$backup/backend-working.patch"
git diff --cached --binary > "$backup/backend-index.patch"
git -C "$frontend_repo" diff --binary > "$backup/frontend-working.patch"
git -C "$frontend_repo" diff --cached --binary > "$backup/frontend-index.patch"
cp docker-compose.yml "$backup/docker-compose.yml"
docker inspect tracking-tiang-backend --format '{{.Image}}' > "$backup/php-image-id"
tar --exclude=node_modules --exclude=.git --exclude=.gradle --exclude=./.next/cache \
  --exclude=./android/app/build --exclude=./android/build \
  -czf "$backup/frontend.tar.gz" -C "$frontend" .
tar --exclude=vendor --exclude=backend/storage/logs --exclude=backend/storage/framework \
  -czf "$backup/backend.tar.gz" backend
# Backup must succeed before database migrations or source changes.
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup/database.dump" < /dev/null
test -s "$backup/database.dump"
docker compose exec -T postgres pg_restore --list < "$backup/database.dump" > /dev/null

# From here failures can require operator recovery; print the backup location.
frontend_swapping=0
on_error() {
  status=$?
  trap - ERR
  if [[ "$frontend_swapping" = 1 ]]; then
    for item in .next node_modules; do
      if [[ -d "$stage/previous-$item" ]]; then
        if [[ -d "$frontend/$item" ]]; then
          mv "$frontend/$item" "$stage/failed-$item" || true
        fi
        mv "$stage/previous-$item" "$frontend/$item" || true
      fi
    done
    systemctl start "$service" || true
  fi
  echo "Deployment failed. Recovery files: $backup. Database rollback is manual." >&2
  exit "$status"
}
trap on_error ERR
if [[ "$mode" = --replace-vps ]]; then
  # Explicit first-run choice by the owner; backups above must succeed first.
  git checkout --force --detach "$sha"
  git clean -fd -- backend
  git -C "$frontend_repo" checkout --force --detach "$sha"
  git -C "$frontend_repo" clean -fd -- frontend
else
  git merge --ff-only "$sha"
  git -C "$frontend_repo" merge --ff-only "$sha"
fi
docker compose up -d --no-deps --force-recreate backend
docker compose exec -T backend composer install --no-dev --prefer-dist --no-interaction --optimize-autoloader < /dev/null
docker compose exec -T backend php artisan migrate --force < /dev/null
docker compose exec -T backend php artisan optimize:clear < /dev/null
docker compose exec -T backend php artisan config:cache < /dev/null
docker compose exec -T backend php artisan queue:restart < /dev/null
docker compose restart backend

# Only stop the frontend after the replacement build is ready.
systemctl stop "$service"
frontend_swapping=1
for item in .next node_modules; do
  if [[ -d "$frontend/$item" ]]; then
    mv "$frontend/$item" "$stage/previous-$item"
  fi
  mv "$stage/frontend/$item" "$frontend/$item"
done
systemctl start "$service"
frontend_swapping=0
check_health
echo "Deployed $sha. Recovery files: $backup"

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

for cmd in git docker npm node rsync curl flock systemctl tar sha256sum; do
  command -v "$cmd" >/dev/null || { echo "Missing command: $cmd" >&2; exit 1; }
done
exec 9> /tmp/tracking-tiang-deploy.lock
flock -n 9 || { echo 'Another deployment is running' >&2; exit 1; }
cd "$repo"
test -f backend/.env
test -d backend/storage
test -d "$frontend"
recovery_marker=$(git rev-parse --git-path tracking-deploy-pending)
if [[ -f "$recovery_marker" ]]; then
  echo "An earlier deployment needs recovery review: $recovery_marker. No deployment was started." >&2
  exit 1
fi
if [[ "$mode" != --replace-vps ]] && [[ -n "$(git status --porcelain -- backend docker-compose.yml)" ]]; then
  echo 'Backend source has local changes. Reconcile and back them up before deploying.' >&2
  exit 1
fi
systemctl cat "$service" >/dev/null
docker compose config --quiet
docker compose exec -T backend php -v >/dev/null < /dev/null
# Refuse to override maintenance deliberately enabled by an operator.
docker compose exec -T backend php -r 'try { $app=require "bootstrap/app.php"; $app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap(); exit($app->isDownForMaintenance() ? 1 : 0); } catch (Throwable $e) { fwrite(STDERR, "Backend preflight failed.\n"); exit(1); }' < /dev/null
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
  local body status path expected kind
  body=$(mktemp)
  for kind in page regions auth; do
    case "$kind" in
      page) path=/login; expected=200 ;;
      regions) path=/api/regions/provinces; expected=200 ;;
      auth) path=/api/me; expected=401 ;;
    esac
    if ! status=$(curl --silent --show-error --connect-timeout 10 --max-time 30 \
      --retry 8 --retry-delay 3 --retry-connrefused --output "$body" --write-out '%{http_code}' "$url$path"); then
      rm -f "$body"
      return 1
    fi
    if [[ "$status" != "$expected" ]]; then
      echo "Health check failed: $path returned HTTP $status (expected $expected)." >&2
      rm -f "$body"
      return 1
    fi
    if ! node - "$body" "$kind" <<'NODE'
const fs = require('node:fs');
const [file, kind] = process.argv.slice(2);
if (kind !== 'page') {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (kind === 'regions' ? !Array.isArray(data) : data?.message !== 'Unauthenticated.') process.exit(1);
  } catch { process.exit(1); }
}
NODE
    then
      echo "Health check failed: $path did not return the expected API contract." >&2
      rm -f "$body"
      return 1
    fi
  done
  rm -f "$body"
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
live_change_started=0
cleanup() {
  local status=$?
  if [[ "$status" = 0 ]] || { [[ "$live_change_started" = 0 ]] && [[ ! -f "$recovery_marker" ]]; }; then
    rm -rf "$stage"
  else
    echo "Retained deployment artifacts for recovery: $stage" >&2
  fi
}
trap cleanup EXIT
git archive "$sha" frontend backend deploy/verify-production-backup.sh | tar -x -C "$stage"
# Preserve server-specific build configuration without printing its contents.
for envfile in .env .env.local .env.production .env.production.local; do
  if [[ -f "$frontend/$envfile" ]]; then
    cp "$frontend/$envfile" "$stage/frontend/$envfile"
  fi
done
(umask 022; cd "$stage/frontend" && npm ci && npm run build)
# Ship only runtime dependencies after the build; native CLI and audit/test tools
# must not be installed in the active web service's dependency tree.
(umask 022; cd "$stage/frontend" && npm prune --omit=dev --ignore-scripts --no-audit --no-fund)
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
# Restore the old runtime only while source/schema are still unchanged.
frontend_swapping=0
backend_paused=0
on_error() {
  status=$?
  trap - ERR
  printf 'state=failed\n' >> "$recovery_marker"
  if [[ "$live_change_started" = 0 && "$backend_paused" = 1 ]]; then
    if docker compose start backend && docker compose exec -T backend php artisan up < /dev/null; then
      rm -f "$recovery_marker"
    else
      echo 'Old backend could not be resumed; recovery review is required.' >&2
    fi
  elif [[ "$live_change_started" = 1 ]]; then
    # Fail closed after schema/source changes: do not allow further HTTP writes
    # and do not roll back the database or automatically revert backend code.
    docker compose exec -T backend php artisan down --retry=60 < /dev/null || true
  fi
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
# Journal BEFORE changing source: an interrupted rollout cannot silently become
# a docs-only retry that skips dependency installation and migrations.
printf 'sha=%s\nbackup=%s\nstage=%s\nstate=preparing-backup\n' "$sha" "$backup" "$stage" > "$recovery_marker"
backend_paused=1
docker compose exec -T backend php artisan down --retry=60 < /dev/null
# Official php:fpm uses SIGQUIT. Drain in-flight requests before the DB/file snapshot.
docker compose stop --timeout 120 backend
tar --exclude=node_modules --exclude=.git --exclude=.gradle --exclude=./.next/cache \
  --exclude=./android/app/build --exclude=./android/build \
  -czf "$backup/frontend.tar.gz" -C "$frontend" .
tar --exclude=vendor --exclude=backend/storage/logs --exclude=backend/storage/framework \
  -czf "$backup/backend.tar.gz" backend
# Backup must succeed before database migrations or source changes.
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup/database.dump" < /dev/null
test -s "$backup/database.dump"
docker compose exec -T postgres pg_restore --list < "$backup/database.dump" > /dev/null
tar -tzf "$backup/backend.tar.gz" > /dev/null
tar -tzf "$backup/frontend.tar.gz" > /dev/null
(cd "$backup"; sha256sum backend.tar.gz frontend.tar.gz database.dump > SHA256SUMS)
printf 'Archive structure and dump catalog verified.\n' > "$backup/COMPLETE"

# Restore the actual quiesced backup before changing source or production schema.
bash "$stage/deploy/verify-production-backup.sh" "$backup"

live_change_started=1
printf 'state=changing-source\n' >> "$recovery_marker"
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
# Refuse to hold production DDL locks indefinitely. A timeout leaves maintenance
# and the recovery journal in place; an operator must assess the failure.
docker compose exec -T -e 'PGOPTIONS=-c lock_timeout=5s -c statement_timeout=300s' backend php artisan migrate --force < /dev/null
docker compose exec -T backend php artisan optimize:clear < /dev/null
docker compose exec -T backend php artisan config:cache < /dev/null
docker compose exec -T backend php artisan queue:restart < /dev/null
docker compose restart backend
docker compose exec -T backend php artisan up < /dev/null

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
check_health
frontend_swapping=0
rm -f "$recovery_marker"
echo "Deployed $sha. Recovery files: $backup"

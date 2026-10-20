#!/usr/bin/env bash
# Inspect deployment prerequisites without changing application files or services.
set -Eeuo pipefail
if [[ -f /etc/tracking-tiang-deploy.conf ]]; then
  source /etc/tracking-tiang-deploy.conf
fi
repo=${DEPLOY_REPO:-/opt/tracking-tiang}
frontend=${DEPLOY_FRONTEND:-/opt/tracking-tiang/frontend-next/frontend}
service=${DEPLOY_SERVICE:-tracking-tiang-next}
url=${DEPLOY_URL:-https://pjl.ituiot.com}
printf 'SSH authenticated as: %s\n' "$(id -un)"
for cmd in git docker npm node rsync curl flock systemctl tar; do
  command -v "$cmd" || { echo "Missing prerequisite: $cmd" >&2; exit 1; }
done
node --version
npm --version
df -h "$repo" /tmp
for checkout in "$repo" "$frontend"; do
  printf '\nCheckout: %s\n' "$checkout"
  git -C "$checkout" rev-parse --show-toplevel HEAD
  git -C "$checkout" status --short --untracked-files=normal
  git -C "$checkout" diff --stat
  git -C "$checkout" fetch origin main < /dev/null
  printf 'Differences from latest GitHub main:\n'
  git -C "$checkout" diff --stat origin/main -- backend frontend
done
systemctl show "$service" -p ActiveState -p User -p WorkingDirectory
test -f "$repo/backend/.env"
test -d "$repo/backend/storage"
cd "$repo"
docker compose config --quiet
docker compose ps
docker inspect tracking-tiang-backend --format '{{range .Mounts}}{{println .Source "->" .Destination}}{{end}}'
docker compose exec -T backend php --version < /dev/null
docker compose exec -T backend composer --version < /dev/null
docker compose exec -T backend php artisan migrate:status --no-ansi < /dev/null
for path in /login /api/regions/provinces; do
  curl --fail --silent --show-error --connect-timeout 10 --max-time 30 \
    -o /dev/null -w "$path HTTP %{http_code}\n" "$url$path"
done

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
  git -C "$checkout" diff --stat origin/main -- .
done
for component in backend frontend; do
  live="$repo/backend"
  checkout="$repo"
  if [[ "$component" = frontend ]]; then
    live="$frontend"
    checkout=$(git -C "$frontend" rev-parse --show-toplevel)
  fi
  printf '\nActual content differences for %s (ignores old Git index):\n' "$component"
  while IFS=$'\t' read -r metadata path; do
    [[ "$path" = */android/* || "$path" = */.env* ]] && continue
    file="$live/${path#*/}"
    if [[ ! -f "$file" ]]; then
      printf 'MISSING %s\n' "$path"
    elif [[ "$(git hash-object "$file")" != "${metadata##* }" ]]; then
      printf 'DIFFERENT %s\n' "$path"
    fi
  done < <(git -C "$checkout" ls-tree -r origin/main -- ":(top)$component")
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

# Read-only authentication boundary probe. 401 is expected here: credentials
# are deliberately never supplied to the production smoke test.
auth_status=$(curl --silent --show-error --connect-timeout 10 --max-time 30 \
  -o /dev/null -w '%{http_code}' "$url/api/me")
if [[ "$auth_status" != 401 ]]; then
  echo "Unauthenticated /api/me returned HTTP $auth_status; expected 401." >&2
  exit 1
fi
printf 'GET /api/me unauthenticated: HTTP %s (expected).\n' "$auth_status"

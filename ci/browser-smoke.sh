#!/usr/bin/env bash
# Destructive fixture setup is guarded by Tests\Support\IsolatedDatabase.
set -Eeuo pipefail
export APP_ENV=testing APP_URL=http://localhost:3186
export BROWSER_FIXTURE_FILE="${RUNNER_TEMP:-/tmp}/tracking-browser-fixture.json"
export CHROME_BIN="${CHROME_BIN:-$(command -v google-chrome || command -v chromium)}"
for package in '@capacitor/cli' vite eslint playwright-core; do
  [[ ! -f "frontend/node_modules/$package/package.json" ]] || { echo "Development tool remains in runtime: $package" >&2; exit 1; }
done
php backend/tests/Support/prepare-browser.php > "$BROWSER_FIXTURE_FILE"
php -S 127.0.0.1:3185 -t backend/public > "${RUNNER_TEMP:-/tmp}/tracking-browser-php.log" 2>&1 &
backend_pid=$!
(cd frontend; exec node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3186) > "${RUNNER_TEMP:-/tmp}/tracking-browser-next.log" 2>&1 &
frontend_pid=$!
trap 'kill "$backend_pid" "$frontend_pid" 2>/dev/null || true' EXIT
for attempt in {1..60}; do
  if curl --fail --silent http://localhost:3186/login > /dev/null && curl --fail --silent http://127.0.0.1:3185/api/regions/provinces > /dev/null; then
    (cd frontend; node tests/browser-smoke.mjs)
    exit 0
  fi
  sleep 1
done
echo 'Isolated browser servers did not become ready.' >&2
exit 1

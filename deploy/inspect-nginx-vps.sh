#!/usr/bin/env bash
# Read effective Nginx config locally on the VPS without printing secrets.
set -Eeuo pipefail
umask 077
for program in nginx python3 mktemp; do
  command -v "$program" > /dev/null || { echo "Missing prerequisite: $program" >&2; exit 1; }
done
snapshot=$(mktemp)
trap 'rm -f "$snapshot"' EXIT
if ! nginx -T > "$snapshot" 2>&1; then
  echo 'Nginx configuration test failed. Details retained only in the server-local command output.' >&2
  exit 1
fi
python3 - "$snapshot" <<'PY'
import re
import sys
from pathlib import Path

raw = Path(sys.argv[1]).read_text(errors='replace')
files = {}
name = ''
for line in raw.splitlines():
    marker = re.match(r'# configuration file (.+):$', line)
    if marker:
        name = marker.group(1)
        files.setdefault(name, [])
    elif name:
        files[name].append(line.split('#', 1)[0])

matches = [name for name, lines in files.items()
           if any(re.search(r'\bserver_name\b[^;]*\bpjl\.ituiot\.com\b[^;]*;', line)
                  for line in lines)]
if not matches:
    print('Nginx: TLS site config for pjl.ituiot.com was not found; review required.')
    raise SystemExit(1)
for name in matches:
    lines = files[name]
    storage = []
    for index, line in enumerate(lines):
        if not re.search(r'\blocation\s+(?:\^~\s+)?/storage/\b|\blocation\s+(?:\^~\s+)?/storage/', line):
            continue
        block = line
        depth = line.count('{') - line.count('}')
        for following in lines[index + 1:]:
            if depth <= 0:
                break
            block += '\n' + following
            depth += following.count('{') - following.count('}')
        storage.append({
            'deny_404': bool(re.search(r'\breturn\s+404\s*;', block)),
            'alias_present': bool(re.search(r'\balias\b', block)),
        })
    sizes = [match.group(1) for line in lines
             if (match := re.search(r'\bclient_max_body_size\s+([0-9]+[kKmMgG]?)\s*;', line))]
    print('Nginx site configuration:', name)
    print('storage locations:', len(storage))
    print('storage denies 404:', sum(item['deny_404'] for item in storage))
    print('storage aliases:', sum(item['alias_present'] for item in storage))
    print('upload limits declared in this file:', ','.join(sizes) if sizes else 'none')
    print('API location declared:', any(re.search(r'\blocation\s+(?:\^~\s+)?/api/', line) for line in lines))
print('Nginx syntax: valid. Included snippets and effective location precedence require review before modifying the TLS vhost.')
PY

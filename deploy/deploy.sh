#!/usr/bin/env bash
# Deploys the working tree to the server and (re)builds the stack there.
#   deploy/deploy.sh root@<host>
# The server must have been prepared once with deploy/server-setup.sh, and must hold
# its two hand-made env files: /opt/forte/.env and /opt/forte/apps/api/.env.
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: deploy/deploy.sh root@<host>" >&2
  exit 1
fi

target="$1"
repo="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Copying $repo to $target:/opt/forte/"
# The first matching rule wins, so .env.example is sent and every other .env file is
# not. An excluded file is also left alone by --delete, which is what keeps the
# server's own /opt/forte/.env and /opt/forte/apps/api/.env in place.
# (Options limited to what macOS's rsync supports.)
rsync -az --delete \
  --include='.env.example' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.git' \
  --exclude='.angular' \
  --exclude='coverage' \
  --exclude='.claude' \
  --exclude='.DS_Store' \
  "$repo/" "$target:/opt/forte/"

echo "==> Building and starting the stack on $target"
ssh "$target" 'bash -s' <<'REMOTE'
set -euo pipefail
cd /opt/forte

for f in .env apps/api/.env; do
  if [ ! -f "$f" ]; then
    echo "Missing /opt/forte/$f on the server. Create it by hand (see the README), then deploy again." >&2
    exit 1
  fi
done
if ! grep -q '^SITE_HOST=.' .env; then
  echo "/opt/forte/.env must set SITE_HOST=<the public hostname>." >&2
  exit 1
fi

# </dev/null: this script arrives on stdin, and docker must not read from it.
compose() { docker compose -f compose.yaml -f compose.prod.yaml "$@" </dev/null; }

# One image at a time: built together they do not fit in 1 GB of memory.
# `migrate` reuses the layers `api` has just built.
compose build api
compose build migrate
compose build web

compose up -d --wait

compose ps -a
echo "--- migrate log (tail) ---"
compose logs --tail 15 migrate

# Keep the 25 GB disk from filling up: drop the images this deploy replaced and
# build cache no build has used for a week.
docker image prune -f
docker builder prune -f --filter until=168h
REMOTE

echo "==> Deployed."

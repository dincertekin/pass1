#!/bin/sh
# Replaces the pass1 database with a backup. Run from the repository folder on the server:
#
#   deploy/restore.sh backups/pass1-20261019T030000Z.dump
#
# The app is stopped during the restore and started again afterwards.
set -eu

file="${1:-}"
if [ -z "$file" ] || [ ! -f "$file" ]; then
  echo "Usage: deploy/restore.sh <backup file>" >&2
  exit 1
fi

if [ "${2:-}" != "--yes" ]; then
  printf "This replaces the current pass1 database with %s.\nType 'restore' to continue: " "$file"
  read -r answer
  [ "$answer" = "restore" ] || { echo "Cancelled."; exit 1; }
fi

docker compose stop app
docker compose exec -T db dropdb --username=pass1 --force --if-exists pass1
docker compose exec -T db createdb --username=pass1 pass1
docker compose exec -T db pg_restore --username=pass1 --dbname=pass1 --no-owner --exit-on-error < "$file"
docker compose start app
echo "Restored $file."

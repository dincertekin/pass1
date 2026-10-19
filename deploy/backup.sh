#!/bin/sh
# Backs up the pass1 database once a day into /backups and deletes backups older than
# BACKUP_KEEP_DAYS (14 by default). Runs as the `backup` service in compose.yaml.
#
#   docker compose run --rm backup --once     take one backup now
#
# What's inside: emails, Argon2 hashes, session token hashes and the encrypted vaults.
# Nobody can read the vaults without users' master passwords, but treat the files as
# sensitive anyway: encrypt them before they leave the server (see docs/deploy.md).
set -eu

KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

backup() {
  # Never write a backup of an empty database. After a disaster, a freshly started server
  # would otherwise produce the newest backup, and restoring "the latest one" would bring
  # back nothing.
  if [ "$(psql --tuples-only --no-align --command='select count(*) from users' 2>/dev/null || echo 0)" = "0" ]; then
    echo "backup: skipped, the database has no accounts yet"
    return 0
  fi

  file="/backups/pass1-$(date -u +%Y%m%dT%H%M%SZ).dump"
  # Write to a temporary name first, so a failed dump never looks like a good backup.
  pg_dump --format=custom --file="$file.partial"
  mv "$file.partial" "$file"
  echo "backup: wrote $file ($(du -h "$file" | cut -f1))"
  find /backups -name 'pass1-*.dump' -mtime +"$KEEP_DAYS" -print -exec rm {} \;
}

if [ "${1:-}" = "--once" ]; then
  backup
  exit 0
fi

while true; do
  backup || echo "backup: FAILED" >&2
  sleep 86400
done

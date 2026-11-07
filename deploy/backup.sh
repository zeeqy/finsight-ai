#!/usr/bin/env bash
# Daily MySQL backup: dump -> gzip -> encrypt with age -> keep the last 14 here -> copy off the server.
#
# Encryption uses an age PUBLIC key (BACKUP_AGE_RECIPIENT in .env). The matching private key stays on
# your own computer, never on the server, so a copied or stolen backup cannot be read, and neither can
# the backups if the server itself is broken into. No plain (unencrypted) dump is ever written.
#
# Off-site copy: set BACKUP_REMOTE in .env to an rclone remote (for example gdrive:finsight-backups)
# after running `rclone config` once. Without it the script still backs up, but warns every run.
#
# Run from the project folder on the server, e.g. in crontab:
#   15 3 * * * cd /home/ubuntu/finsight && bash deploy/backup.sh >> backups/backup.log 2>&1
set -euo pipefail

# Read only the two settings this script needs from .env (the file is not sourced as shell code)
env_value() { grep -E "^$1=" .env 2>/dev/null | tail -n 1 | cut -d= -f2- | tr -d '"'"'"'\r' || true; }
RECIPIENT="${BACKUP_AGE_RECIPIENT:-$(env_value BACKUP_AGE_RECIPIENT)}"
REMOTE="${BACKUP_REMOTE:-$(env_value BACKUP_REMOTE)}"

fail() { echo "$(date) backup FAILED: $*" >&2; exit 1; }
case "$RECIPIENT" in
  age1*) ;;
  *) fail "BACKUP_AGE_RECIPIENT is not set to an age public key (age1...) in .env. See DEPLOY.md step 7. Nothing was written." ;;
esac
command -v age >/dev/null 2>&1 || fail "age is not installed (sudo apt install age)."

mkdir -p backups
chmod 700 backups
stamp=$(date +%Y-%m-%d_%H%M)
out="backups/finsight_$stamp.sql.gz.age"
tmp="$out.partial"
trap 'rm -f "$tmp"' EXIT

# pipefail: if mysqldump fails, the whole backup fails instead of saving an empty file
docker compose exec -T mysql sh -c 'exec mysqldump --single-transaction --no-tablespaces -uroot -p"$MYSQL_ROOT_PASSWORD" finsight_ai' \
  | gzip \
  | age -r "$RECIPIENT" > "$tmp"

size=$(wc -c < "$tmp")
[ "$size" -gt 1024 ] || fail "the encrypted dump is only $size bytes, so something went wrong. Kept the previous backups."
mv "$tmp" "$out"
chmod 600 "$out"

# Keep the newest 14 here
ls -1t backups/finsight_*.sql.gz.age | tail -n +15 | xargs -r rm --

if [ -n "$REMOTE" ]; then
  command -v rclone >/dev/null 2>&1 || fail "BACKUP_REMOTE is set but rclone is not installed (sudo apt install rclone)."
  rclone copy "$out" "$REMOTE" || fail "saved $out here, but the copy to $REMOTE failed."
  # The off-site copy keeps 60 days
  rclone delete --min-age 60d --include 'finsight_*.sql.gz.age' "$REMOTE" || true
  echo "$(date) backup ok: $out ($size bytes), copied to $REMOTE"
else
  echo "$(date) backup ok: $out ($size bytes). WARNING: no off-site copy (set BACKUP_REMOTE in .env)."
fi

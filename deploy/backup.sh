#!/bin/sh
# Daily MySQL backup, keeping the last 14. Run from the project folder on the server, e.g. in crontab:
#   15 3 * * * cd /home/ubuntu/finsight && sh deploy/backup.sh >> backups/backup.log 2>&1
set -eu
mkdir -p backups
stamp=$(date +%Y-%m-%d_%H%M)
docker compose exec -T mysql sh -c 'exec mysqldump --single-transaction --no-tablespaces -uroot -p"$MYSQL_ROOT_PASSWORD" finsight_ai' | gzip > "backups/finsight_$stamp.sql.gz"
ls -1t backups/finsight_*.sql.gz | tail -n +15 | xargs -r rm --
echo "$(date) backup ok: finsight_$stamp.sql.gz"

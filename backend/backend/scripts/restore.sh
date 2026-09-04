#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
file="${1:?usage: restore.sh backup.dump}"
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" "$file"
echo "Restore concluído: $file"

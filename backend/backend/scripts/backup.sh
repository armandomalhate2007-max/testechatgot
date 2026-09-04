#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
out="${1:-atelier-backup-$(date +%Y%m%d-%H%M%S).dump}"
pg_dump "$DATABASE_URL" --format=custom --file="$out"
echo "Backup criado: $out"

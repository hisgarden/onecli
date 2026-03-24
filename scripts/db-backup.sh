#!/usr/bin/env bash
set -euo pipefail

################################################################################
# Database backup — pg_dump to timestamped file.
#
# Usage:
#   ./scripts/db-backup.sh                     # uses DATABASE_URL from .env
#   ./scripts/db-backup.sh /path/to/output/    # custom output directory
#   DATABASE_URL=postgres://... ./scripts/db-backup.sh
#
# Output: {output_dir}/onecli_backup_YYYYMMDD_HHMMSS.sql.gz
################################################################################

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load .env if DATABASE_URL not already set
if [ -z "${DATABASE_URL:-}" ] && [ -f "$PROJECT_ROOT/.env" ]; then
  # shellcheck disable=SC1091
  set -a; source "$PROJECT_ROOT/.env"; set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set. Set it in .env or as an environment variable."
  exit 1
fi

OUTPUT_DIR="${1:-$PROJECT_ROOT/backups}"
mkdir -p "$OUTPUT_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$OUTPUT_DIR/onecli_backup_${TIMESTAMP}.sql.gz"

echo "--- Backing up database ---"
echo "  Source: ${DATABASE_URL%%@*}@****"
echo "  Target: $BACKUP_FILE"

pg_dump "$DATABASE_URL" --no-owner --no-privileges --clean --if-exists | gzip > "$BACKUP_FILE"

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "--- Backup complete: $BACKUP_FILE ($SIZE) ---"

################################################################################
# Changelog:
# 2026-03-24  Initial creation — pg_dump backup script
################################################################################

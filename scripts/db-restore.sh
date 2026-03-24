#!/usr/bin/env bash
set -euo pipefail

################################################################################
# Database restore — load pg_dump output into PostgreSQL.
#
# Usage:
#   ./scripts/db-restore.sh backups/onecli_backup_20260324_120000.sql.gz
#   DATABASE_URL=postgres://... ./scripts/db-restore.sh backup.sql.gz
#
# WARNING: This drops and recreates all tables. All existing data will be lost.
################################################################################

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <backup_file.sql.gz>"
  echo ""
  echo "Available backups:"
  ls -lh "$PROJECT_ROOT/backups/"*.sql.gz 2>/dev/null || echo "  (none found in backups/)"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file not found: $BACKUP_FILE"
  exit 1
fi

# Load .env if DATABASE_URL not already set
if [ -z "${DATABASE_URL:-}" ] && [ -f "$PROJECT_ROOT/.env" ]; then
  # shellcheck disable=SC1091
  set -a; source "$PROJECT_ROOT/.env"; set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set. Set it in .env or as an environment variable."
  exit 1
fi

echo "--- Restoring database ---"
echo "  Source: $BACKUP_FILE"
echo "  Target: ${DATABASE_URL%%@*}@****"
echo ""
echo "  WARNING: This will DROP and recreate all tables."
read -r -p "  Continue? [y/N] " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "  Aborted."
  exit 0
fi

gunzip -c "$BACKUP_FILE" | psql "$DATABASE_URL" --quiet

echo "--- Restore complete ---"
echo ""
echo "Next steps:"
echo "  1. Run migrations to apply any newer schema changes:"
echo "     pnpm db:migrate"
echo "  2. Verify the restore:"
echo "     pnpm db:studio"

################################################################################
# Changelog:
# 2026-03-24  Initial creation — pg_dump restore script
################################################################################

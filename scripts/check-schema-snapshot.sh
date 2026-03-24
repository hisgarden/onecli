#!/usr/bin/env bash
set -euo pipefail

################################################################################
# Schema snapshot check — verify no uncommitted schema changes.
#
# Compares the current schema.prisma against git HEAD to detect modifications
# that haven't been accompanied by a migration.
#
# Usage: ./scripts/check-schema-snapshot.sh
################################################################################

SCHEMA_FILE="packages/db/prisma/schema.prisma"
MIGRATIONS_DIR="packages/db/prisma/migrations"

# Check for uncommitted schema changes
if ! git diff --quiet HEAD -- "$SCHEMA_FILE" 2>/dev/null; then
  echo "WARNING: schema.prisma has uncommitted changes"
  echo "If you modified the schema, run: pnpm --filter @onecli/db prisma migrate dev --name <description>"
  echo ""
  git diff --stat HEAD -- "$SCHEMA_FILE"
  exit 1
fi

# Check that schema changes are paired with migration changes in the same commit
LAST_SCHEMA_COMMIT=$(git log -1 --format=%H -- "$SCHEMA_FILE" 2>/dev/null || echo "")
LAST_MIGRATION_COMMIT=$(git log -1 --format=%H -- "$MIGRATIONS_DIR" 2>/dev/null || echo "")

if [ -n "$LAST_SCHEMA_COMMIT" ] && [ "$LAST_SCHEMA_COMMIT" != "$LAST_MIGRATION_COMMIT" ]; then
  echo "WARNING: Last schema change ($(git log -1 --format='%h %s' -- "$SCHEMA_FILE"))"
  echo "         differs from last migration change ($(git log -1 --format='%h %s' -- "$MIGRATIONS_DIR"))"
  echo ""
  echo "Schema and migration changes should be in the same commit."
  # Warning only — not a hard failure since rebasing can split commits
fi

echo "PASS: Schema snapshot is clean"

################################################################################
# Changelog:
# 2026-03-24  Initial creation — schema snapshot check
################################################################################

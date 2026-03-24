#!/bin/sh
set -e

# Lightweight Prisma migration runner using psql.
# Applies migration.sql files in order, tracking applied migrations
# in the _prisma_migrations table (same schema Prisma uses).
#
# This replaces `prisma migrate deploy` to avoid shipping the 100MB+
# Prisma CLI in the runtime image.

MIGRATIONS_DIR="packages/db/prisma/migrations"

# Create tracking table if it doesn't exist
psql "$DATABASE_URL" -q <<'SQL'
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  id                  VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
  checksum            VARCHAR(64) NOT NULL,
  finished_at         TIMESTAMPTZ,
  migration_name      VARCHAR(255) NOT NULL UNIQUE,
  logs                TEXT,
  rolled_back_at      TIMESTAMPTZ,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_steps_count INTEGER NOT NULL DEFAULT 0
);
SQL

# Apply each migration in order
for dir in $(ls -1d "$MIGRATIONS_DIR"/[0-9]* 2>/dev/null | sort); do
  migration_name=$(basename "$dir")
  sql_file="$dir/migration.sql"

  [ ! -f "$sql_file" ] && continue

  # Skip if already applied
  already=$(psql "$DATABASE_URL" -tAq -c "SELECT count(*) FROM _prisma_migrations WHERE migration_name = '$migration_name' AND finished_at IS NOT NULL")
  if [ "$already" -gt 0 ]; then
    continue
  fi

  echo "Applying migration: $migration_name"
  checksum=$(sha256sum "$sql_file" | cut -d' ' -f1)

  # Record start
  psql "$DATABASE_URL" -q -c "INSERT INTO _prisma_migrations (migration_name, checksum, started_at) VALUES ('$migration_name', '$checksum', now()) ON CONFLICT (migration_name) DO NOTHING"

  # Apply SQL
  psql "$DATABASE_URL" -q -f "$sql_file"

  # Record completion
  psql "$DATABASE_URL" -q -c "UPDATE _prisma_migrations SET finished_at = now(), applied_steps_count = 1 WHERE migration_name = '$migration_name'"
done

echo "Migrations complete."

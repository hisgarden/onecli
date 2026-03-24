#!/usr/bin/env bash
set -euo pipefail

################################################################################
# Lint Prisma migration directory names.
#
# Convention: YYYYMMDDHHMMSS_snake_case_description
# Legacy migrations (0_init, 1_*, 2_*) are allowed.
#
# Usage: ./scripts/lint-migrations.sh
################################################################################

MIGRATIONS_DIR="packages/db/prisma/migrations"
ERRORS=0

VALID_PATTERN='^[0-9]{14}_[a-z][a-z0-9_]*$'
LEGACY_PATTERN='^[0-9]+_[a-z]'

for dir in "$MIGRATIONS_DIR"/*/; do
  name=$(basename "$dir")
  [ "$name" = "migration_lock.toml" ] && continue

  if echo "$name" | grep -qE "$VALID_PATTERN"; then
    continue
  elif echo "$name" | grep -qE "$LEGACY_PATTERN"; then
    # Legacy migration — allowed but flagged
    continue
  else
    echo "FAIL: migration '$name' does not match convention YYYYMMDDHHMMSS_snake_case_description"
    ERRORS=$((ERRORS + 1))
  fi
done

if [ "$ERRORS" -gt 0 ]; then
  echo ""
  echo "Migration naming convention: YYYYMMDDHHMMSS_snake_case_description"
  echo "Example: 20260324200000_add_vault_session_ttl"
  exit 1
else
  echo "PASS: All migration names follow convention"
fi

################################################################################
# Changelog:
# 2026-03-24  Initial creation — migration naming lint
################################################################################

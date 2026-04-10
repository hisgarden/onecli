#!/usr/bin/env bash
set -euo pipefail

################################################################################
# Integration test runner for OneCLI.
#
# Spins up ephemeral Postgres, applies SQL migrations via psql, executes
# gateway integration tests, then tears down.
#
# Usage:
#   ./scripts/test-integration.sh          # run all integration tests
#   ./scripts/test-integration.sh --skip-teardown  # leave Postgres running
################################################################################

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/docker/docker-compose.test.yml"
SKIP_TEARDOWN=false

for arg in "$@"; do
  case "$arg" in
    --skip-teardown) SKIP_TEARDOWN=true ;;
  esac
done

export DATABASE_URL="postgresql://test:test@localhost:5433/onecli_test"
export SECRET_ENCRYPTION_KEY
SECRET_ENCRYPTION_KEY="$(bun -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"

cleanup() {
  if [ "$SKIP_TEARDOWN" = false ]; then
    echo "--- Tearing down test database ---"
    docker compose -f "$COMPOSE_FILE" down -v 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "--- Starting ephemeral Postgres on port 5433 ---"
docker compose -f "$COMPOSE_FILE" up -d --wait

echo "--- Running SQL migrations (psql) ---"
cd "$PROJECT_ROOT"
bash "$PROJECT_ROOT/docker/migrate.sh"

echo "--- Running gateway integration tests ---"
cd "$PROJECT_ROOT/apps/gateway"
cargo test -- --test-threads=1

echo "--- All integration tests passed ---"

################################################################################
# Changelog:
# 2026-04-09  Replace prisma migrate with docker/migrate.sh (raw psql)
# 2026-04-08  Use `bun run --filter @onecli/db migrate:deploy` (Phase 4 Kysely audit)
# 2026-04-08  Switch from pnpm filter to bunx for prisma migrate (Phase 2 toolchain)
# 2026-03-24  Initial creation — ephemeral Postgres + gateway integration tests
################################################################################

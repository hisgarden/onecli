#!/usr/bin/env bash
set -euo pipefail

################################################################################
# E2E dev environment for OneCLI + Claude Code.
#
# Starts Postgres, runs migrations, launches the API and Rust gateway,
# waits for health checks, then prints the env vars to wire up Claude Code.
#
# Usage:
#   ./scripts/dev-e2e.sh              # start everything
#   ./scripts/dev-e2e.sh --teardown   # stop everything
#
# After the script prints the export block, paste it into your shell and
# run `claude` — all Anthropic API traffic routes through the gateway.
################################################################################

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

API_PORT="${PORT:-10254}"
GATEWAY_PORT="${GATEWAY_PORT:-10255}"
API_PID_FILE="$PROJECT_ROOT/.dev-api.pid"
GATEWAY_PID_FILE="$PROJECT_ROOT/.dev-gateway.pid"
CA_CERT_PATH="$HOME/.onecli/gateway/ca.pem"

# ── Teardown ─────────────────────────────────────────────────────────────────

teardown() {
  echo "--- Tearing down dev environment ---"
  for pf in "$API_PID_FILE" "$GATEWAY_PID_FILE"; do
    if [ -f "$pf" ]; then
      pid=$(cat "$pf")
      if kill -0 "$pid" 2>/dev/null; then
        echo "Stopping PID $pid"
        kill "$pid" 2>/dev/null || true
      fi
      rm -f "$pf"
    fi
  done
  # Stop Postgres
  if command -v container &>/dev/null; then
    container stop onecli-postgres 2>/dev/null || true
    container rm onecli-postgres 2>/dev/null || true
  else
    cd "$PROJECT_ROOT" && bun run db:down 2>/dev/null || true
  fi
  echo "Done."
}

if [ "${1:-}" = "--teardown" ]; then
  teardown
  exit 0
fi

# ── Pre-flight checks ───────────────────────────────────────────────────────

for cmd in bun cargo curl jq; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: $cmd is not installed." >&2
    exit 1
  fi
done

if ! command -v psql &>/dev/null; then
  echo "ERROR: psql is not installed. Run: brew install libpq" >&2
  exit 1
fi

# Detect container runtime: Apple Containers preferred (native, no VM overhead),
# Docker as fallback. Requires Apple Containers >= 0.3.0 for -p/--publish.
if command -v container &>/dev/null && container system status &>/dev/null; then
  RUNTIME="apple"
elif command -v docker &>/dev/null && docker info &>/dev/null; then
  RUNTIME="docker"
else
  echo "ERROR: No container runtime found. Install Apple Containers (brew install container) or Docker." >&2
  exit 1
fi

# ── .env ─────────────────────────────────────────────────────────────────────

if [ ! -f "$PROJECT_ROOT/.env" ]; then
  echo "--- Creating .env from .env.example ---"
  cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
fi

# Ensure GATEWAY_HOST=localhost for local dev (default is host.docker.internal)
if ! grep -q '^GATEWAY_HOST=' "$PROJECT_ROOT/.env"; then
  echo "GATEWAY_HOST=localhost" >> "$PROJECT_ROOT/.env"
fi

# ── Database ─────────────────────────────────────────────────────────────────

echo "--- Starting PostgreSQL ($RUNTIME) ---"
if [ "$RUNTIME" = "apple" ]; then
  if container inspect onecli-postgres 2>/dev/null | grep -q '"state"'; then
    container start onecli-postgres 2>/dev/null || true
  else
    container run --name onecli-postgres -d \
      -p 127.0.0.1:5432:5432 \
      -e POSTGRES_USER=onecli \
      -e POSTGRES_PASSWORD=onecli \
      -e POSTGRES_DB=onecli \
      docker.io/library/postgres:17-alpine
  fi
else
  cd "$PROJECT_ROOT" && bun run db:up
fi

export DATABASE_URL="postgresql://onecli:onecli@localhost:5432/onecli"

echo "--- Waiting for PostgreSQL to accept connections ---"
for i in $(seq 1 30); do
  if psql "$DATABASE_URL" -c "SELECT 1" &>/dev/null; then
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERROR: PostgreSQL did not become ready in time." >&2
    exit 1
  fi
  sleep 1
done

echo "--- Running migrations ---"
bash "$PROJECT_ROOT/docker/migrate.sh"

# ── Encryption key ───────────────────────────────────────────────────────────

KEY_FILE="$HOME/.onecli/secret-encryption-key"
if [ -z "${SECRET_ENCRYPTION_KEY:-}" ]; then
  if [ -f "$KEY_FILE" ]; then
    export SECRET_ENCRYPTION_KEY
    SECRET_ENCRYPTION_KEY="$(cat "$KEY_FILE")"
    echo "--- Loaded SECRET_ENCRYPTION_KEY from $KEY_FILE ---"
  else
    export SECRET_ENCRYPTION_KEY
    SECRET_ENCRYPTION_KEY="$(bun -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
    mkdir -p "$(dirname "$KEY_FILE")"
    echo "$SECRET_ENCRYPTION_KEY" > "$KEY_FILE"
    chmod 600 "$KEY_FILE"
    echo "--- Generated SECRET_ENCRYPTION_KEY → $KEY_FILE ---"
  fi
fi

# ── API server ───────────────────────────────────────────────────────────────

echo "--- Starting API server (port $API_PORT) ---"
cd "$PROJECT_ROOT/apps/api"
GATEWAY_HOST=localhost bun run --watch src/index.ts &
API_PID=$!
echo "$API_PID" > "$API_PID_FILE"

echo "--- Waiting for API health check ---"
for i in $(seq 1 30); do
  if curl -sf "http://localhost:$API_PORT/api/health" &>/dev/null; then
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERROR: API did not become healthy in time." >&2
    exit 1
  fi
  sleep 1
done
echo "    API healthy."

# ── Rust gateway ─────────────────────────────────────────────────────────────

echo "--- Building and starting gateway (port $GATEWAY_PORT) ---"
cd "$PROJECT_ROOT/apps/gateway"
cargo build --release 2>&1 | tail -1
./target/release/onecli-gateway --port "$GATEWAY_PORT" &
GATEWAY_PID=$!
echo "$GATEWAY_PID" > "$GATEWAY_PID_FILE"

echo "--- Waiting for gateway health check ---"
for i in $(seq 1 30); do
  if curl -sf "http://localhost:$GATEWAY_PORT/healthz" &>/dev/null; then
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERROR: Gateway did not become healthy in time." >&2
    exit 1
  fi
  sleep 1
done
echo "    Gateway healthy."

# ── Fetch container config ───────────────────────────────────────────────────

echo "--- Fetching container config ---"
CONFIG=$(curl -sf "http://localhost:$API_PORT/api/container-config")

# Save CA certificate
mkdir -p "$(dirname "$CA_CERT_PATH")"
echo "$CONFIG" | jq -r .caCertificate > "$CA_CERT_PATH"
echo "    CA cert saved to $CA_CERT_PATH"

PROXY_URL=$(echo "$CONFIG" | jq -r .env.HTTPS_PROXY)
AUTH_ENV_KEY=$(echo "$CONFIG" | jq -r '.env | to_entries[] | select(.key != "HTTPS_PROXY" and .key != "HTTP_PROXY" and .key != "NODE_EXTRA_CA_CERTS" and .key != "NODE_USE_ENV_PROXY") | .key')
AUTH_ENV_VAL=$(echo "$CONFIG" | jq -r ".env.\"$AUTH_ENV_KEY\"")

# ── Output ───────────────────────────────────────────────────────────────────

cat <<EOF

===================================================================
  OneCLI dev environment is running
===================================================================

  Dashboard:  http://localhost:$API_PORT
  API:        http://localhost:$API_PORT/api
  Gateway:    http://localhost:$GATEWAY_PORT
  Metrics:    http://localhost:$API_PORT/metrics

-------------------------------------------------------------------
  Paste this into your shell, then run 'claude':
-------------------------------------------------------------------

  export HTTPS_PROXY="$PROXY_URL"
  export HTTP_PROXY="$PROXY_URL"
  export NODE_EXTRA_CA_CERTS="$CA_CERT_PATH"
  export NODE_USE_ENV_PROXY=1
  export $AUTH_ENV_KEY="$AUTH_ENV_VAL"

-------------------------------------------------------------------
  Teardown:  ./scripts/dev-e2e.sh --teardown
===================================================================

EOF

# Keep the script alive so Ctrl-C tears down child processes
cleanup_on_exit() {
  echo ""
  echo "--- Caught signal, stopping services ---"
  kill "$API_PID" "$GATEWAY_PID" 2>/dev/null || true
  rm -f "$API_PID_FILE" "$GATEWAY_PID_FILE"
  exit 0
}
trap cleanup_on_exit INT TERM

wait

################################################################################
# Changelog:
# 2026-04-09  Add Apple Containers support alongside Docker
# 2026-04-09  Initial creation — E2E dev script for Claude Code + OneCLI
################################################################################

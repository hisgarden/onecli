#!/usr/bin/env bash
# apple-container.sh — run OneCLI on Apple native containers (no Docker needed)
#
# Replaces docker-compose.yml with Apple's container CLI (macOS 26+).
# Each container runs in a lightweight VM via Apple's Virtualization.framework.
#
# Usage:
#   ./apple-container.sh up       # build + start the full stack
#   ./apple-container.sh down     # stop + remove containers
#   ./apple-container.sh status   # list running OneCLI containers
#   ./apple-container.sh logs <service>  # tail logs (pg, api, gw)
#   ./apple-container.sh build    # rebuild images only
#   ./apple-container.sh clean    # down + remove volumes and images
#
# Prerequisites:
#   - macOS 26+ on Apple silicon
#   - Apple container CLI installed (https://github.com/apple/container)

set -euo pipefail

# ── Version ─────────────────────────────────────────────────────────

VERSION="0.1.0"

# ── Config ──────────────────────────────────────────────────────────

CONTAINER_BIN="${CONTAINER_BIN:-/opt/homebrew/bin/container}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${ONECLI_DATA_DIR:-${HOME}/.onecli}"
NETWORK="onecli"

# Container names
PG="onecli-pg"
API="onecli-api"
GW="onecli-gw"

# Load .env if present — safe key=value parser only; we do NOT `source` it.
# `source` would execute arbitrary shell code (including $(...) command
# substitutions), so we parse the file line by line and export only entries
# that match a strict key=value shape.
if [[ -f "${PROJECT_DIR}/.env" ]]; then
  while IFS= read -r _env_line || [[ -n "$_env_line" ]]; do
    # Skip blanks and comments
    [[ -z "$_env_line" || "$_env_line" =~ ^[[:space:]]*# ]] && continue
    # Strip optional leading `export `
    _env_line="${_env_line#export }"
    # Must be KEY=VALUE where KEY is a valid shell identifier
    if [[ "$_env_line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      _env_key="${BASH_REMATCH[1]}"
      _env_val="${BASH_REMATCH[2]}"
      # Strip matching surrounding quotes (single or double) if present
      if [[ "$_env_val" =~ ^\"(.*)\"$ ]] || [[ "$_env_val" =~ ^\'(.*)\'$ ]]; then
        _env_val="${BASH_REMATCH[1]}"
      fi
      export "$_env_key=$_env_val"
    fi
  done < "${PROJECT_DIR}/.env"
  unset _env_line _env_key _env_val
fi

# Database defaults — captured AFTER .env is loaded so user overrides win.
PG_USER="${POSTGRES_USER:-onecli}"
PG_PASS="${POSTGRES_PASSWORD:-onecli}"
PG_DB="${POSTGRES_DB:-onecli}"

# ── Helpers ─────────────────────────────────────────────────────────

log()  { echo "==> $*" >&2; }
warn() { echo "WARNING: $*" >&2; }
die()  { echo "ERROR: $*" >&2; exit 1; }

# Validate CONTAINER_BIN before we ever execute it, so the user gets an
# actionable error (install hint) instead of a bare "No such file or directory"
# from bash when `set -e` propagates the failure.
if [[ ! -x "$CONTAINER_BIN" ]]; then
  die "container CLI not found or not executable at: $CONTAINER_BIN
  - Install from https://github.com/apple/container, or
  - Set CONTAINER_BIN=/absolute/path/to/container in your environment."
fi

ensure_system() {
  if ! "$CONTAINER_BIN" list &>/dev/null; then
    log "Starting container system service..."
    "$CONTAINER_BIN" system start
    sleep 2
  fi
}

ensure_network() {
  if ! "$CONTAINER_BIN" network inspect "$NETWORK" &>/dev/null; then
    log "Creating network: $NETWORK"
    "$CONTAINER_BIN" network create "$NETWORK"
  fi
}

ensure_dirs() {
  mkdir -p "${DATA_DIR}/pgdata" "${DATA_DIR}/appdata"
}

container_exists() {
  "$CONTAINER_BIN" inspect "$1" &>/dev/null
}

container_running() {
  "$CONTAINER_BIN" inspect "$1" 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.loads(sys.stdin.read())
    print(data[0].get('status', ''))
except: print('')
" | grep -q "running"
}

get_ip() {
  "$CONTAINER_BIN" inspect "$1" 2>/dev/null | python3 -c "
import sys, json
data = json.loads(sys.stdin.read())
nets = data[0].get('networks', [])
if nets:
    addr = nets[0].get('ipv4Address', nets[0].get('address', ''))
    print(addr.split('/')[0])
else:
    sys.exit(1)
"
}

stop_container() {
  if container_exists "$1"; then
    log "Stopping $1..."
    "$CONTAINER_BIN" stop "$1" 2>/dev/null || true
    "$CONTAINER_BIN" delete "$1" 2>/dev/null || true
  fi
}

wait_pg() {
  log "Waiting for PostgreSQL..."
  local max=30
  for i in $(seq 1 $max); do
    if "$CONTAINER_BIN" exec "$PG" pg_isready -U "$PG_USER" &>/dev/null; then
      log "PostgreSQL ready (${i}s)"
      return 0
    fi
    sleep 1
  done
  die "PostgreSQL failed to start after ${max}s — check: $0 logs pg"
}

wait_health() {
  local name=$1 url=$2 max=${3:-60}
  log "Waiting for $name health check..."
  for i in $(seq 1 $max); do
    # --connect-timeout caps TCP connect, --max-time caps total per-request
    # duration so a half-open TCP can't stall the entire wait budget.
    if curl -sf --connect-timeout 1 --max-time 2 "$url" >/dev/null 2>&1; then
      log "$name ready (${i}s)"
      return 0
    fi
    sleep 2
  done
  die "$name health check failed after $((max * 2))s — check: $0 logs ${name##onecli-}"
}

# ── Commands ────────────────────────────────────────────────────────

cmd_build() {
  ensure_system

  # Tear down any prior builder VM so subsequent resize flags (--cpus 4
  # --memory 8G) actually take effect — Apple's container CLI ignores
  # resource flags on an already-running builder.
  log "Starting builder with increased resources..."
  "$CONTAINER_BIN" builder stop 2>/dev/null || true
  "$CONTAINER_BIN" builder delete 2>/dev/null || true
  "$CONTAINER_BIN" builder start --cpus 4 --memory 8G

  # Fix DNS in builder VM — the built-in resolver at 192.168.64.1 doesn't
  # forward external queries, so we point buildkit at Google DNS instead.
  # Poll readiness instead of sleeping a fixed amount — on slow cold starts
  # the builder may need longer than 2s to accept exec commands.
  local _dns_tries=0
  until "$CONTAINER_BIN" exec buildkit true 2>/dev/null; do
    _dns_tries=$((_dns_tries + 1))
    if (( _dns_tries > 15 )); then
      die "buildkit never became ready for exec after 15s"
    fi
    sleep 1
  done
  "$CONTAINER_BIN" exec buildkit sh -c 'echo "nameserver 8.8.8.8" > /etc/resolv.conf' \
    || die "Failed to patch buildkit DNS — external package fetches will fail"

  log "Building API image (Bun + React dashboard)..."
  "$CONTAINER_BIN" build \
    -t onecli-api \
    -f "${PROJECT_DIR}/docker/Dockerfile.apple.bun" \
    "$PROJECT_DIR"

  log "Building gateway image (Rust)..."
  "$CONTAINER_BIN" build \
    -t onecli-gw \
    -f "${PROJECT_DIR}/docker/Dockerfile.apple.gateway" \
    "$PROJECT_DIR"

  log "Images built successfully"
}

cmd_up() {
  # On unexpected failure or Ctrl-C, don't leave containers half-started.
  # Previous behavior was to exit via `set -e` with PG still running, which
  # left the user in a wedged state on retry.
  trap 'rc=$?; [[ $rc -ne 0 ]] && { warn "up failed (exit $rc) — cleaning up"; cmd_down || true; }; trap - ERR EXIT INT TERM; exit $rc' ERR EXIT
  trap 'echo; log "Interrupted — cleaning up..."; cmd_down || true; exit 130' INT TERM

  ensure_system
  ensure_network
  ensure_dirs

  # ── PostgreSQL ──────────────────────────────────────────────────
  if container_running "$PG"; then
    log "PostgreSQL already running"
  else
    stop_container "$PG"  # clean up stopped container if exists
    log "Starting PostgreSQL..."
    "$CONTAINER_BIN" run -d \
      --name "$PG" \
      --network "$NETWORK" \
      --dns 8.8.8.8 \
      --cpus 1 --memory 512M \
      -p "127.0.0.1:5432:5432" \
      -v "${DATA_DIR}/pgdata:/var/lib/postgresql" \
      -e "POSTGRES_USER=${PG_USER}" \
      -e "POSTGRES_PASSWORD=${PG_PASS}" \
      -e "POSTGRES_DB=${PG_DB}" \
      docker.io/postgres:18-alpine
  fi

  wait_pg

  # get_ip can exit non-zero (no networks yet); without this guard the
  # command substitution swallows the error silently under set -e.
  PG_IP=$(get_ip "$PG") || die "Failed to resolve PostgreSQL container IP — check: $0 logs pg"
  if [[ -z "$PG_IP" ]]; then
    die "PostgreSQL container has no IP — network may not be attached"
  fi
  DB_URL="postgresql://${PG_USER}:${PG_PASS}@${PG_IP}:5432/${PG_DB}"
  log "PostgreSQL IP: $PG_IP"

  # ── Init (make shared data dir writable for Chainguard nonroot UID 65532) ─
  # Note: virtiofs bind mounts don't support chown to arbitrary UIDs,
  # so we chmod on the host side instead of chown inside a container.
  log "Initializing shared data directory..."
  chmod 777 "${DATA_DIR}/appdata"

  # ── Build images if not present ─────────────────────────────────
  # Single check: cmd_build builds BOTH images, so two separate guards
  # would rebuild the Rust gateway twice on cold start.
  if ! "$CONTAINER_BIN" image inspect onecli-api &>/dev/null \
     || ! "$CONTAINER_BIN" image inspect onecli-gw &>/dev/null; then
    cmd_build
  fi

  # ── API server ──────────────────────────────────────────────────
  if container_running "$API"; then
    log "API already running"
  else
    stop_container "$API"
    log "Starting API server..."
    # Only pass SECRET_ENCRYPTION_KEY when it's actually set in the host
    # environment. Passing an empty string leaves an empty `SECRET_ENCRYPTION_KEY=`
    # in the container env where the entrypoint's auto-generate branch can't
    # distinguish "unset" from "set to empty".
    local secret_flag=()
    [[ -n "${SECRET_ENCRYPTION_KEY:-}" ]] && secret_flag=(-e "SECRET_ENCRYPTION_KEY=${SECRET_ENCRYPTION_KEY}")
    "$CONTAINER_BIN" run -d \
      --name "$API" \
      --network "$NETWORK" \
      --dns 8.8.8.8 \
      --cpus 1 --memory 256M \
      -p "127.0.0.1:10254:10254" \
      -v "${DATA_DIR}/appdata:/app/data" \
      -e "DATABASE_URL=${DB_URL}" \
      ${secret_flag[@]+"${secret_flag[@]}"} \
      -e "AUTH_MODE=${AUTH_MODE:-local}" \
      -e "CORS_ORIGIN=${CORS_ORIGIN:-http://localhost:10254}" \
      -e "NEXTAUTH_SECRET=${NEXTAUTH_SECRET:-}" \
      -e "GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}" \
      -e "GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET:-}" \
      onecli-api
  fi

  wait_health "$API" "http://127.0.0.1:10254/api/health"

  # ── Gateway ─────────────────────────────────────────────────────
  if container_running "$GW"; then
    log "Gateway already running"
  else
    stop_container "$GW"
    log "Starting gateway..."
    # See the API block above for why secret_flag is conditional.
    local gw_secret_flag=()
    [[ -n "${SECRET_ENCRYPTION_KEY:-}" ]] && gw_secret_flag=(-e "SECRET_ENCRYPTION_KEY=${SECRET_ENCRYPTION_KEY}")
    "$CONTAINER_BIN" run -d \
      --name "$GW" \
      --network "$NETWORK" \
      --dns 8.8.8.8 \
      --cpus 2 --memory 256M \
      -p "127.0.0.1:10255:10255" \
      -v "${DATA_DIR}/appdata:/app/data" \
      -e "DATABASE_URL=${DB_URL}" \
      ${gw_secret_flag[@]+"${gw_secret_flag[@]}"} \
      -e "AUTH_MODE=${AUTH_MODE:-local}" \
      -e "CORS_ORIGIN=${CORS_ORIGIN:-http://localhost:10254}" \
      -e "LOG_FORMAT=${LOG_FORMAT:-}" \
      onecli-gw
  fi

  wait_health "$GW" "http://127.0.0.1:10255/healthz"

  echo ""
  echo "OneCLI is running on Apple native containers!"
  echo ""
  echo "  Dashboard:  http://localhost:10254"
  echo "  Gateway:    http://localhost:10255"
  echo "  PostgreSQL: localhost:5432 (user: ${PG_USER})"
  echo ""
  echo "  Data dir:   ${DATA_DIR}/"
  echo "  Logs:       $0 logs <pg|api|gw>"
  echo "  Stop:       $0 down"
}

cmd_down() {
  log "Stopping OneCLI containers..."
  stop_container "$GW"
  stop_container "$API"
  stop_container "$PG"
  log "All containers stopped"
}

cmd_status() {
  ensure_system
  echo "OneCLI containers:"
  echo ""
  printf "  %-15s %-12s %-20s\n" "CONTAINER" "STATUS" "IP"
  printf "  %-15s %-12s %-20s\n" "---------" "------" "--"

  for name in "$PG" "$API" "$GW"; do
    if container_running "$name"; then
      ip=$(get_ip "$name" 2>/dev/null || echo "N/A")
      printf "  %-15s %-12s %-20s\n" "$name" "running" "$ip"
    elif container_exists "$name"; then
      printf "  %-15s %-12s %-20s\n" "$name" "stopped" "-"
    else
      printf "  %-15s %-12s %-20s\n" "$name" "not found" "-"
    fi
  done
  echo ""
}

cmd_logs() {
  local target="${1:-}"
  case "$target" in
    pg|postgres)  "$CONTAINER_BIN" logs -f "$PG" ;;
    api)          "$CONTAINER_BIN" logs -f "$API" ;;
    gw|gateway)   "$CONTAINER_BIN" logs -f "$GW" ;;
    "")
      echo "Usage: $0 logs <pg|api|gw>"
      echo ""
      echo "Services:"
      echo "  pg   — PostgreSQL"
      echo "  api  — Bun API + dashboard"
      echo "  gw   — Rust gateway"
      ;;
    *)
      die "Unknown service: $target (use pg, api, or gw)"
      ;;
  esac
}

cmd_clean() {
  cmd_down

  log "Removing network..."
  "$CONTAINER_BIN" network delete "$NETWORK" 2>/dev/null || true

  log "Removing images..."
  "$CONTAINER_BIN" image delete onecli-api 2>/dev/null || true
  "$CONTAINER_BIN" image delete onecli-gw 2>/dev/null || true

  echo ""
  echo "Cleaned up containers, network, and images."
  echo "Data directory preserved at: ${DATA_DIR}/"
  echo "To remove data too: rm -rf ${DATA_DIR}"
}

# ── Main ────────────────────────────────────────────────────────────

cmd="${1:-help}"
shift || true

case "$cmd" in
  up)      cmd_up ;;
  down)    cmd_down ;;
  status)  cmd_status ;;
  logs)    cmd_logs "$@" ;;
  build)   cmd_build ;;
  clean)   cmd_clean ;;
  version|--version|-V)
    echo "apple-container.sh ${VERSION}"
    ;;
  help|--help|-h)
    cat <<EOF
Usage: $0 <command>

Commands:
  up         Build images (if needed) and start the full stack
  down       Stop and remove all containers
  status     Show container status and IPs
  logs       Tail logs for a service (pg, api, gw)
  build      Rebuild API and gateway images
  clean      Stop containers, remove network and images
  version    Print this script's version and exit
  help       Show this help

Examples:
  $0 up                       # bring the stack up
  $0 logs api                 # stream API logs
  $0 status                   # see container state
  $0 down && $0 up            # full restart without rebuild
  CONTAINER_BIN=/my/path $0 up   # override container CLI path

Exit codes:
  0  success
  1  generic error (see stderr)
  130  interrupted (Ctrl-C)

Environment:
  CONTAINER_BIN      Path to container CLI (default: /opt/homebrew/bin/container)
  ONECLI_DATA_DIR    Data directory (default: ~/.onecli)
  POSTGRES_USER      DB user (default: onecli) — honored from .env
  POSTGRES_PASSWORD  DB password (default: onecli) — honored from .env
  POSTGRES_DB        DB name (default: onecli) — honored from .env
  SECRET_ENCRYPTION_KEY  AES-256-GCM key (auto-generated in the container if unset)
  AUTH_MODE          local|oauth|cloud (default: local)
  LOG_FORMAT         Gateway log format (passthrough; blank for default)
EOF
    ;;
  *)
    die "Unknown command: $cmd (try: $0 help)"
    ;;
esac

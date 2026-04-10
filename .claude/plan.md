# OneCLI E2E Setup Plan

## Goal

Run the full OneCLI stack locally so Claude Code routes all outbound HTTPS traffic through the gateway, with secrets injected transparently. No Rancher Desktop -- use Apple Containers natively on macOS 26.

---

## Phase 1: Upgrade Apple Containers (BLOCKED)

The bundled `/usr/local/bin/container` is **v0.1.0** -- missing `-p`/`--publish` (added v0.3.0), `--network` (v0.6.0), DNS improvements (v0.8.0), and `host.docker.internal` (v0.9.0). Current release is **v0.11.0**.

### Steps

1. `brew install container` (installs v0.11.0 to `/opt/homebrew/bin/container`)
2. `container system stop && container system start`
3. Verify: `container --version` shows 0.11.0+
4. **System Settings -> Privacy & Security -> Local Network** -- enable access for:
   - `container-runtime-linux`
   - Terminal app (Terminal.app / iTerm2 / VS Code)
5. Kernel is already installed (`vmlinux-6.12.28-153`), DNS domain `test` already configured

### Verify

```bash
container run --rm -p 127.0.0.1:5432:5432 -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=test docker.io/library/postgres:17-alpine &
sleep 3
psql "postgresql://test:test@127.0.0.1:5432/test" -c "SELECT 1"
```

---

## Phase 2: Update `scripts/dev-e2e.sh` for Apple Containers

Once Phase 1 is verified, update the script to use `-p` flag.

### Changes needed

- Apple Containers `container run` command: add `-p 127.0.0.1:5432:5432`
- `DB_HOST` for Apple runtime: change from `onecli-postgres.test` to `localhost` (since port is published to 127.0.0.1)
- Pre-flight check: verify `container --version` >= 0.3.0 when using Apple runtime
- Runtime detection: prefer Apple Containers over Docker (flip the current order)

### Current script state

- `scripts/dev-e2e.sh` -- auto-detects Docker vs Apple Containers
- Currently prefers Docker (because Apple Containers networking was broken on v0.1.0)
- Generates/persists `SECRET_ENCRYPTION_KEY` in `~/.onecli/secret-encryption-key`
- Builds gateway with `cargo build --release` (cached after first build)
- Outputs copy-paste env vars for Claude Code

---

## Phase 3: Claude Code Integration

Make the proxy env vars automatic so `claude` always routes through the gateway.

### Option A: Shell wrapper in `~/.zshrc`

```bash
claude() {
  if curl -sf http://localhost:10255/healthz &>/dev/null; then
    HTTPS_PROXY="http://x:$(curl -sf http://localhost:10254/api/container-config | jq -r '.env.HTTPS_PROXY' | sed 's|.*://x:||;s|@.*||')@localhost:10255" \
    HTTP_PROXY="$HTTPS_PROXY" \
    NODE_EXTRA_CA_CERTS="$HOME/.onecli/gateway/ca.pem" \
    NODE_USE_ENV_PROXY=1 \
    command claude "$@"
  else
    command claude "$@"
  fi
}
```

- Gateway up -> routes through OneCLI
- Gateway down -> runs Claude Code normally
- No `ANTHROPIC_API_KEY` needed (Claude Code subscription handles its own auth)

### Option B: macOS Launch Agent for auto-start

Create `~/Library/LaunchAgents/sh.onecli.dev.plist` to auto-start Postgres + API + gateway on login so the gateway is always available.

---

## Phase 4: Remove Prisma from CI (follow-up)

Integration test script and CI workflow still reference Prisma in places.

### Done

- [x] `scripts/test-integration.sh` -- uses `docker/migrate.sh` (raw psql) instead of `prisma migrate deploy`
- [x] `docker/migrate.sh` -- fixed `sha256sum` portability for macOS (`shasum -a 256` fallback)
- [x] `scripts/test-integration.sh` -- uses `bun` instead of `node` for key generation

### Remaining

- [ ] `.github/workflows/ci.yml` -- integration job still uses `prisma migrate deploy`
- [ ] `packages/db/package.json` -- `migrate:deploy` script still calls `prisma migrate deploy`
- [ ] Consider removing `prisma` devDependency from `packages/db` if only used for `migrate:dev`

---

## Phase 5: Static asset serving fix (DONE)

### Problem

`@elysiajs/static` plugin with `prefix: "/"` set prefix to `""` internally, causing the `*` wildcard catch-all to intercept `/assets/*` routes. JS/CSS served with `Content-Type: text/html`, breaking the SPA.

### Fix applied

Replaced `@elysiajs/static` with direct `Bun.file()` serving in `apps/api/src/index.ts`. The `*` catch-all now checks if the requested path is a real file in the SPA build directory before falling back to `index.html`. `Bun.file()` auto-sets correct MIME types.

---

## E2E Verification Checklist

- [x] Postgres starts and accepts connections
- [x] Migrations run via raw psql (`docker/migrate.sh`)
- [x] API starts and `/api/health` returns 200
- [x] Gateway starts and `/healthz` returns 200
- [x] Dashboard loads at `http://localhost:10254` (MIME type fix applied)
- [x] Secrets can be added via dashboard
- [x] Gateway injects secrets (verified with Kagi API -- `injections_applied=1`, real key used, `api_balance` decremented)
- [ ] Apple Containers with `-p` flag (blocked on upgrade)
- [ ] Claude Code auto-integration via shell wrapper
- [ ] Launch Agent for auto-start on login

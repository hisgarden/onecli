# OneCLI Engineering Log

---

## 2026-04-09 — E2E dev environment, Apple Containers, SPA fix

### Done

- Created `scripts/dev-e2e.sh` — full E2E setup (Postgres, API, gateway) with Apple Containers and Docker support
- Replaced `@elysiajs/static` with direct `Bun.file()` serving — fixed MIME type issue (JS/CSS served as `text/html`)
- Replaced `prisma migrate deploy` with `docker/migrate.sh` (raw psql) in integration tests
- Fixed `sha256sum` portability in `docker/migrate.sh` for macOS (`shasum -a 256` fallback)
- Switched key generation from `node` to `bun` in `scripts/test-integration.sh`
- Upgraded Apple Containers from v0.1.0 to v0.11.0 (`brew install container`), removed stale system binary
- Verified E2E: Postgres on Apple Containers with `-p` port publishing, migrations, API, gateway, dashboard, Kagi secret injection
- Added `claude()` shell wrapper in `~/.zshrc` — auto-proxies through gateway when running
- Committed pnpm-to-bun migration, test suite, gateway hardening

### Commits

- `ed90e49` feat: add E2E dev script, fix SPA serving, and replace Prisma in tests
- `9253414` chore: migrate pnpm to bun, add comprehensive test suite, and harden gateway

### E2E verification

- [x] Postgres starts and accepts connections (Apple Containers + Docker)
- [x] Migrations run via raw psql (`docker/migrate.sh`)
- [x] API healthy at `:10254`
- [x] Gateway healthy at `:10255`
- [x] Dashboard loads (MIME fix applied)
- [x] Secrets added via dashboard
- [x] Gateway injects secrets (Kagi API — `injections_applied=1`, `api_balance` decremented)
- [x] Apple Containers v0.11.0 with `-p` port publishing
- [x] Claude Code shell wrapper in `~/.zshrc`

---

## 2026-04-10 — Planned

### Tasks

1. Pull upstream to fork and merge
2. Set up Bitwarden Vault integration

### Bitwarden Vault setup

- Review `docs/vault-integration.md` for integration design
- Review gateway vault code (`apps/gateway/src/vault/`) for Bitwarden AP protocol
- Connect Bitwarden via dashboard (Vault section)
- Test credential injection from vault through the gateway
- Verify session TTL and auto-reconnect behavior

### References

- `apps/gateway/src/vault/bitwarden.rs` — Bitwarden AP client
- `apps/gateway/src/vault/bitwarden_db.rs` — vault connection persistence
- `docs/vault-integration.md` — user-facing docs
- `packages/db/prisma/schema.prisma` — `vault_connections` table

---

## Backlog

### Remove Prisma from CI

- [x] `scripts/test-integration.sh` — uses `docker/migrate.sh` instead of `prisma migrate deploy`
- [x] `docker/migrate.sh` — `sha256sum` portability for macOS
- [x] `scripts/test-integration.sh` — `bun` instead of `node` for key generation
- [x] `.github/workflows/ci.yml` — integration job now invokes `migrate:deploy` which shells to `docker/migrate.sh`
- [x] `packages/db/package.json` — `migrate:deploy` now runs `sh docker/migrate.sh` (raw psql)
- [ ] Consider removing `prisma` devDependency from `packages/db` if only used for `migrate:dev`

### Launch Agent for auto-start

- Create `~/Library/LaunchAgents/sh.onecli.dev.plist` to auto-start Postgres + API + gateway on login

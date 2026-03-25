<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/onecli-logo-dark.gif">
  <source media="(prefers-color-scheme: light)" srcset="assets/onecli-logo-light.gif">
  <img alt="OneCLI" src="assets/onecli-logo-light.gif" width="100%">
</picture>

<p align="center">
  <b>The secret vault for AI agents.</b><br/>
  Store once. Inject anywhere. Agents never see the keys.
</p>

<p align="center">
  <a href="https://onecli.sh">Website</a> &middot;
  <a href="https://onecli.sh/docs">Docs</a> &middot;
  <a href="https://discord.gg/txVbnfHZCd">Discord</a>
</p>

---

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/onecli-flow-dark.gif">
  <source media="(prefers-color-scheme: light)" srcset="assets/onecli-flow-light.gif">
  <img alt="How OneCLI works" src="assets/onecli-flow-light.gif" width="100%">
</picture>

## What is OneCLI?

OneCLI is an open-source gateway that sits between your AI agents and the services they call. Instead of baking API keys into every agent, you store credentials once in OneCLI and the gateway injects them transparently. Agents never see the secrets.

**Why we built it:** AI agents need to call dozens of APIs, but giving each agent raw credentials is a security risk. OneCLI solves this with a single gateway that handles auth, so you get one place to manage access, rotate keys, and see what every agent is doing.

**How it works:** You store your real API credentials in OneCLI and give your agents placeholder keys (e.g. `FAKE_KEY`). When an agent makes an HTTP call through the gateway, the OneCLI gateway matches the request to the right credentials, swaps the `FAKE_KEY` for the `REAL_KEY`, decrypts them, and injects them into the outbound request. The agent never touches the real secrets. It just makes normal HTTP calls and the gateway handles the swap.

## Architecture

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/onecli-architecture-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="assets/onecli-architecture-light.svg">
  <img alt="OneCLI Architecture" src="assets/onecli-architecture-dark.svg" width="100%">
</picture>

- **[Rust Gateway](apps/gateway)**: fast HTTP gateway that intercepts outbound requests and injects credentials. Agents authenticate with access tokens via `Proxy-Authorization` headers.
- **[Elysia API + Dashboard](apps/api)**: Bun/Elysia API with a React SPA dashboard for managing agents, secrets, and permissions. Provides the API the gateway uses to resolve which credentials to inject for each request.
- **Secret Store**: AES-256-GCM encrypted credential storage. Secrets are decrypted only at request time, matched by host and path patterns, and injected by the gateway as headers.

## Quick Start

The fastest way to run OneCLI locally:

```bash
git clone https://github.com/hisgarden/onecli.git
cd onecli
docker compose -f docker/docker-compose.yml up
```

Open **http://localhost:10254**, create an agent, add your secrets, and point your agent's HTTP gateway to `localhost:10255`.

## Features

- **Transparent credential injection**: agents make normal HTTP calls, the gateway handles auth
- **Encrypted secret storage**: AES-256-GCM encryption at rest, decrypted only at request time
- **Host & path matching**: route secrets to the right API endpoints with pattern matching
- **Multi-agent support**: each agent gets its own access token with scoped permissions
- **Easy setup**: `docker compose -f docker/docker-compose.yml up` starts everything
- **Two auth modes**: single-user (no login) for local use, or Google OAuth for teams
- **Rust gateway**: fast, memory-safe HTTP gateway with MITM interception for HTTPS
- **Prometheus metrics**: API + gateway expose `/metrics` for VictoriaMetrics/Prometheus
- **[Vault integration](docs/vault-integration.md)**: connect Bitwarden (or other password managers) for on-demand credential injection without storing secrets on the server

## Project Structure

```
apps/
  api/            # Elysia API (Bun, port 10254) — serves API + React SPA
  dashboard/      # React SPA (Vite, port 3000 dev)
  gateway/        # Rust gateway (credential injection, port 10255)
packages/
  services/       # Shared service layer (business logic, validations, crypto)
  db/             # Prisma ORM + migrations
  ui/             # Shared UI components (shadcn/ui)
docker/
  Dockerfile.bun      # API + SPA image (~80MB)
  Dockerfile.gateway  # Standalone gateway image (~20MB)
```

## Local Development

### Prerequisites

- **[mise](https://mise.jdx.dev)** (installs Bun, Node.js, pnpm, Rust)
- **Docker** (for PostgreSQL)

### Setup

```bash
mise install
pnpm install
cp .env.example .env
pnpm db:generate
pnpm db:up          # Start PostgreSQL
pnpm db:migrate     # Apply migrations
pnpm dev
```

Dashboard at **http://localhost:10254**, gateway at **http://localhost:10255**.

### Commands

| Command              | Description                        |
| -------------------- | ---------------------------------- |
| `pnpm dev`           | Start API + dashboard in dev mode  |
| `pnpm dev:api`       | Start Elysia API (Bun, port 10254) |
| `pnpm dev:dashboard` | Start Vite dashboard (port 3000)   |
| `pnpm build`         | Build dashboard SPA                |
| `pnpm check`         | Type check + format check          |
| `pnpm db:up`         | Start PostgreSQL (Docker)          |
| `pnpm db:down`       | Stop PostgreSQL                    |
| `pnpm db:generate`   | Generate Prisma client             |
| `pnpm db:migrate`    | Run database migrations            |
| `pnpm db:studio`     | Open Prisma Studio                 |
| `pnpm db:backup`     | Back up database to gzip           |
| `pnpm db:restore`    | Restore database from backup       |
| `pnpm test`          | Run all tests (services + API)     |
| `pnpm test:unit`     | Run service layer unit tests       |

## Configuration

All environment variables are optional for local development:

| Variable                | Description                       | Default            |
| ----------------------- | --------------------------------- | ------------------ |
| `DATABASE_URL`          | PostgreSQL connection string      | See `.env.example` |
| `NEXTAUTH_SECRET`       | Enables Google OAuth (multi-user) | Single-user mode   |
| `GOOGLE_CLIENT_ID`      | Google OAuth client ID            | —                  |
| `GOOGLE_CLIENT_SECRET`  | Google OAuth client secret        | —                  |
| `SECRET_ENCRYPTION_KEY` | AES-256-GCM encryption key        | Auto-generated     |

## Contributing

We welcome contributions! Please read our [Contributing Guide](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md) before getting started.

## License

[Apache-2.0](LICENSE)

# Contributing to OneCLI

Thank you for your interest in contributing to OneCLI! We'd love to have you contribute. Here are some resources and guidance to help you get started.

- [Getting Started](#getting-started)
- [Issues](#issues)
- [Pull Requests](#pull-requests)

## Getting Started

To ensure a positive and inclusive environment, please read our [Code of Conduct](CODE_OF_CONDUCT.md) before contributing.

### Local Development Setup

```bash
git clone https://github.com/onecli/onecli.git
cd onecli
bun install
cp .env.example .env
bun run db:up                                  # Start PostgreSQL
bun run --filter @onecli/db migrate:deploy     # Apply migrations
```

**Run API + dashboard:**

```bash
bun run dev:api         # Elysia API on port 10254
bun run dev:dashboard   # Vite SPA on port 3000
```

Or both at once:

```bash
bun run dev
```

See the [README](README.md) for more details on prerequisites and configuration.

## Issues

If you find a bug, please create an issue and we'll triage it.

- Please search [existing issues](https://github.com/onecli/onecli/issues) before creating a new one.
- Please include a clear description of the problem along with steps to reproduce it. Screenshots and URLs really help.

## Pull Requests

We actively welcome your Pull Requests! A couple of things to keep in mind before you submit:

- If you're fixing an issue, make sure someone else hasn't already created a PR fixing the same issue. Link your PR to the related issue(s).
- If you're new, we encourage you to take a look at issues tagged with [good first issue](https://github.com/onecli/onecli/labels/good%20first%20issue).
- If you're submitting a new feature, please open an [issue](https://github.com/onecli/onecli/issues/new) first to discuss it before opening a PR.

Before submitting your PR, please run these checks locally:

```bash
bun run build     # Ensure the project builds
bun run check     # Type check + format check
```

Running these before you create the PR will help reduce back and forth during review.

## Database Schema Changes

OneCLI uses **Kysely** as the runtime ORM and **Prisma** as a dev-only tool to manage `schema.prisma` and generate migration SQL files. The Prisma client is **not** generated or used at runtime — never `import` from `@prisma/client`.

When modifying the schema (`packages/db/prisma/schema.prisma`), follow this workflow:

1. **Edit the schema** — add/modify models in `schema.prisma`.
2. **Generate a migration**:
   ```bash
   bun run --filter @onecli/db migrate:dev -- --name <description>
   ```
   This creates a timestamped migration in `packages/db/prisma/migrations/`.
3. **Review the SQL** — open the generated `migration.sql` and verify it does what you expect. Watch for unintended drops, renames, or data loss.
4. **Update Kysely types** — edit `packages/db/src/types.ts` by hand to mirror the new schema (no codegen). The CamelCasePlugin in `kysely.ts` maps camelCase fields to snake_case columns.
5. **Commit all three together**: the `schema.prisma` change, the new migration directory, and the `types.ts` update.

### Migration Naming Convention

Migrations follow the format: `YYYYMMDDHHMMSS_snake_case_description`

Examples:

- `20260324200000_add_vault_session_ttl`
- `20260319084027_add_policy_rules`

CI enforces this via `scripts/lint-migrations.sh`.

### Schema Drift Check

CI runs `prisma migrate diff` on every PR that touches `packages/db/prisma/` to ensure the schema and migrations are in sync. If you modify `schema.prisma` without generating a migration, the CI check will fail.

## License

By contributing to OneCLI, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).

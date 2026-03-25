# ADR-001: Replace Prisma ORM with Kysely Query Builder

**Status:** Accepted
**Date:** 2026-03-25

## Context

OneCLI uses Prisma as its ORM layer across 8 files with 63 total database queries. While Prisma provided rapid initial development, it has become the single largest source of friction in the Docker packaging and deployment story.

## Problem

1. **Docker image bloat**: Prisma ships a ~93MB platform-specific query engine binary. The API image is 401MB — Prisma accounts for nearly a quarter of it. The gateway image (same codebase, no Prisma) is only 38MB.

2. **Platform coupling**: Prisma generates different native binaries per OS/arch/libc/OpenSSL combination. Moving from Alpine (musl) to Chainguard (glibc) required adding explicit `binaryTargets` to the schema and shipping multiple engine binaries, further inflating the image.

3. **Build complexity**: `prisma generate` must run in the Docker builder stage, the generated client must be carefully copied to the runtime stage, and the correct engine binary must match the runtime OS. This creates a fragile multi-step build with silent failure modes.

4. **Cold start overhead**: The Prisma query engine is a standalone Rust binary that communicates with Node.js via a custom protocol. This adds startup latency and memory overhead compared to a pure-JS driver.

5. **No raw SQL escape hatch used**: The codebase uses zero raw queries — every operation is a standard CRUD pattern (findMany, findFirst, create, update, delete, count, upsert) with a few transactions. Prisma's query engine abstraction provides no value for this workload.

## Decision

Replace Prisma with **Kysely**, a type-safe SQL query builder for TypeScript.

## Why Kysely

| Criteria            | Prisma                                     | Kysely                                      |
| ------------------- | ------------------------------------------ | ------------------------------------------- |
| Runtime binary      | ~93MB native engine                        | 0 (pure TypeScript)                         |
| Docker image impact | +93MB + platform targeting                 | +~500KB (kysely + pg)                       |
| Type safety         | Generated types from schema                | Hand-written or codegen types               |
| Query style         | Custom DSL (`db.user.findMany`)            | SQL-like builder (`db.selectFrom('users')`) |
| Transactions        | Array-based (`$transaction([...])`)        | Callback-based (`db.transaction()`)         |
| JSON columns        | `Prisma.InputJsonValue`, `Prisma.JsonNull` | Plain objects, `null`                       |
| Migration tooling   | Prisma Migrate (100MB+ CLI)                | Already using psql runner — no change       |
| Learning curve      | Higher (custom concepts)                   | Lower (maps directly to SQL)                |

### What we keep

- **Existing SQL migration files** — the psql-based migration runner (`docker/migrate.sh`) is Prisma-independent and stays as-is.
- **Database schema** — no schema changes needed. Kysely reads the same tables.
- **The Rust gateway** — uses its own SQLx driver, completely unaffected.

### What we lose

- **Prisma Studio** — browser-based DB explorer. Replace with pgAdmin or `psql` directly.
- **Auto `@updatedAt`** — Prisma silently sets this. We add a PostgreSQL trigger instead (database-level, more reliable).
- **Auto `@default(cuid())`** — ID generation moves to application code via `cuid2`.
- **Nested relation reads** — `include: { memberships: true }` becomes explicit JOINs or two queries. Only 2 instances in the codebase.

## Migration Scope

- **63 queries** across 8 files
- **15 database models** (typed in a new `types.ts`)
- **2 transactions** (convert from array-based to callback-based)
- **6 JSON column operations** (simplify from Prisma types to plain objects)
- **1 unique constraint error check** (P2002 → PostgreSQL 23505)
- **0 raw queries, 0 middleware, 0 stored procedures** — clean migration

## Expected Outcome

- API Docker image: **401MB → ~280MB** (drop ~93MB Prisma engine + ~30MB related deps)
- Build pipeline: remove `prisma generate` step
- Zero platform-specific binaries — same image works on any Linux arch
- Simpler dependency tree — `kysely` + `pg` vs `@prisma/client` + engine binaries

## Risks and Mitigations

| Risk                        | Mitigation                                                   |
| --------------------------- | ------------------------------------------------------------ |
| `@updatedAt` regression     | Add PostgreSQL trigger (`set_updated_at()`) in a migration   |
| Column name mapping errors  | CamelCasePlugin + validation test for all 15 tables          |
| ID generation compatibility | Use `cuid2` — same algorithm as Prisma's default             |
| Transaction semantics       | Code review: ensure `trx` is used inside callbacks, not `db` |

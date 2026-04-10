# OneCLI

Cloud backend for OneCLI — manages authentication, integrations, and permissions for the OneCLI agent gateway.

## Commands

```bash
bun run dev                                      # Start API + dashboard
bun run build                                    # Build dashboard SPA
bun run check                                    # Type check + format check
bun run format                                   # Auto-format
cd packages/db && bunx prisma generate           # Generate Prisma client
cd packages/db && bunx prisma migrate dev        # Run migrations (dev)
cd packages/db && bunx prisma studio             # Open Prisma Studio
```

## Structure

```
apps/api/         # Elysia API (Bun runtime, port 10254)
apps/dashboard/   # Vite + React 19 SPA (port 3000 dev)
apps/gateway/     # Rust agent gateway (data plane — port 10255)
packages/db/      # Kysely query builder + SQL migrations
packages/services/# Shared service layer (TypeScript)
packages/ui/      # Shared components (shadcn/ui)
packages/eslint-config/
packages/typescript-config/
```

## Data-plane isolation (security invariant)

`apps/gateway/` is the only component that handles plaintext secrets. It MUST remain pure Rust + Cargo. No JavaScript, no Bun runtime, no transitive npm deps. Any feature that needs JS belongs in `apps/api/` (control plane) and must communicate with the gateway via the documented HTTP/JWT interface only.

## Database — Kysely + Prisma (split roles)

- **Runtime ORM**: [Kysely](https://kysely.dev) — `packages/db/src/kysely.ts`. All application queries go through Kysely. Hand-written types in `packages/db/src/types.ts` mirror the schema.
- **Schema definition**: `packages/db/prisma/schema.prisma` (dev-only source of truth).
- **Migration generation** (dev): `bun run --filter @onecli/db migrate:dev -- --name <description>` — creates a SQL file under `packages/db/prisma/migrations/`.
- **Migration application**:
  - Local dev / CI integration: `bun run --filter @onecli/db migrate:deploy`
  - **Production runtime**: `docker/migrate.sh` (raw psql, no Prisma CLI ships in the image — see `docker/Dockerfile.bun` runtime stage).
- **Schema drift check** (CI): `bun run --filter @onecli/db migrate:diff` — fails PRs that change the schema without a matching migration.
- **Prisma client is NOT generated or used.** No code imports from `@prisma/client`. If you find yourself wanting one, use Kysely instead.

## Environment Variables

- `DATABASE_URL`: PostgreSQL connection string
- `NEXT_PUBLIC_COGNITO_*`: AWS Cognito config (injected at build time in CI)
- `STRIPE_SECRET_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: Third-party credentials

## Code Style

- **Use strong typing** - leverage types from external packages; avoid `any` and type assertions
- Prefer named exports over default exports (except Next.js pages/layouts where required)
- Use `@onecli/ui/*` for shared UI imports, `@/` for app-local imports
- Use `cn()` for class merging
- Mark client components with `"use client"`
- Prefer Tailwind utilities over custom CSS
- Use const arrow functions, not function declarations (for components and utilities)

## Component Structure

- **One component per file** - never put multiple components in the same file (includes page.tsx)
- **Page-specific components** - create `_components/` subdirectory in the route folder:
  ```
  app/(dashboard)/overview/
  ├── page.tsx
  └── _components/
      ├── overview-header.tsx
      └── recent-activity.tsx
  ```
- **Props typing** - use base types directly, only create named interface when adding custom props:

  ```tsx
  // ✓ No custom props - use base type directly
  export const Card = ({ className, children, ...props }: React.ComponentProps<"div">) => { ... };

  // ✓ Custom props - create interface
  export interface ServiceCardProps extends React.ComponentProps<"div"> {
    connected?: boolean;
  }
  ```

- **Multi-component features**: Create a directory with an `index.ts` barrel export

## IMPORTANT: shadcn/ui Components

Components in `packages/ui/src/components/` are from shadcn/ui.

**Allowed:**

- Adding new variants/sizes to CVA definitions
- Customizing via `className` when using components
- Wrapping in your own component

**NOT Allowed:**

- Changing existing variant styles
- Modifying component structure or logic
- Removing existing functionality

When adding components, use shadcn CLI or copy from ui.shadcn.com.

## Dependencies

- Use Radix UI only through shadcn/ui, never import directly
- Check shadcn for components before adding dependencies
- Keep bundle size small - prefer lightweight alternatives

## Web App Patterns

- Server components by default, add `"use client"` only when needed
- Pages export `default function` (async for data fetching)
- Auth: AWS Amplify + Cognito (React context in `providers/`)
- Server-side auth: `getServerSession()` from `lib/auth.ts`
- Validation: Zod for API inputs
- **Button loading states** - replace icon with spinner, update text (e.g., "Connecting..."), and disable
- **Verify library APIs are current** - check official docs for deprecated/legacy patterns before implementing

## Database (see "Database — Kysely + Prisma" above)

- Schema source of truth: `packages/db/prisma/schema.prisma`
- After editing the schema, hand-update `packages/db/src/types.ts` to keep Kysely types in sync (no codegen — these are written by hand on purpose)
- Generate a new migration: `bun run --filter @onecli/db migrate:dev -- --name <description>`
- Migrations run automatically on container startup via `entrypoint.sh` → `migrate.sh` (raw psql, no Prisma CLI in the runtime image)

## Infrastructure & Deployment

- Environment passed via CDK context: `--context env=dev|prod`
- **IMPORTANT: Never modify AWS resources directly** — all changes go through CDK stacks and GitHub Actions workflows
- Both deploy workflows (`deploy-app.yml`, `deploy-infra.yml`) are manual with environment choice (dev/prod)

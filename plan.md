# OneCLI — Remaining Work

## Tomorrow (2026-03-26)

### Understand how Better Auth works with the new components

Walk through the full auth flow end-to-end to build a mental model:

1. **How Better Auth mounts in Elysia** — `apps/api/src/auth.ts` config → `.mount(auth.handler)` in `index.ts`
   - What routes does Better Auth register under `/api/auth/*`?
   - How does `auth.api.getSession({ headers })` resolve a session from cookies?
   - How does `cookieCache` work — what's in the cookie vs what's in the DB?

2. **How the derive block resolves auth** — `index.ts` derive order:
   - API key (`Authorization: Bearer oc_...`) → `validateApiKey()`
   - Local mode → `resolveLocalAuth()` (auto-creates user + account)
   - Better Auth session → `auth.api.getSession()` → looks up `accountMembers` for `accountId`

3. **How the SPA interacts with auth** — dashboard flow:
   - `AuthProvider` (`lib/auth.tsx`) calls `GET /api/session` on mount
   - `/api/session` bootstraps account + defaults if missing (idempotent)
   - Login page (`routes/login.tsx`) redirects to `/api/auth/sign-in/social?provider=google`
   - Better Auth handles OAuth callback → creates user in `users` table + session in `ba_sessions`
   - After callback, redirects to `/overview` → SPA mounts → calls `/api/session` → bootstraps account
   - Sign out: `POST /api/auth/sign-out` → Better Auth deletes session from DB

4. **How the tables relate** — schema:
   - `users` — shared between Better Auth (auth) and our business logic
   - `ba_sessions` — Better Auth manages (session tokens, expiry, IP, user-agent)
   - `ba_accounts` — Better Auth manages (OAuth provider linkage, NOT our business accounts)
   - `accounts` — our business entity (tenant), linked via `account_members`
   - `account_members` — links `users.id` → `accounts.id` with role

5. **Key files to read:**
   - `apps/api/src/auth.ts` — Better Auth config (social providers, session, table mapping)
   - `apps/api/src/index.ts` — derive block (lines ~280-340), `/api/session` endpoint
   - `apps/dashboard/src/lib/auth.tsx` — AuthProvider, session check, signout
   - `apps/dashboard/src/routes/login.tsx` — Google sign-in redirect
   - `apps/dashboard/src/lib/api.ts` — Eden treaty client (no CSRF headers needed)
   - `docs/adr-002-adopt-better-auth.md` — rationale and migration plan
   - `/Users/jwen/workspace/ml/context-hub/content/better-auth/docs/api/DOC.md` — API reference

### Login page — Docker test + push

- 2 commits sitting local: login page + plan.md
- Docker rebuild + regression test, then push

## Backlog

### P1 — Dashboard OAuth UX polish

- Add error handling for OAuth failures (callback errors, provider not configured)
- Show "Local mode — no login required" message when `AUTH_MODE=local` instead of briefly flashing login page
- Add sign-in loading state while redirecting to Google
- Test the full sign-in → account bootstrap → dashboard flow end-to-end with real Google credentials

### P2 — Better Auth account bootstrapping for OAuth users

- When an OAuth user signs in for the first time via Better Auth, they need an OneCLI account + membership created
- Currently the `/api/session` endpoint handles this, but it needs to be called after OAuth callback redirect
- Verify the flow: Google sign-in → Better Auth creates user → redirect to `/overview` → SPA calls `/api/session` → account bootstrapped

### P3 — Rust gateway token verification

- Gateway currently has no session verification (was using direct JWT decode)
- Options: Better Auth JWT plugin, cookie cache in `jwt` mode, or gateway calls API to validate
- See ADR-002 for details

### P4 — Secret rotation / versioning

- Rotate secrets without downtime
- Version history for audit trail

### P5 — Audit log dashboard UI

- View audit logs in the SPA (currently only written, not displayed)

### P6 — Remove stale Prisma schema file

- `packages/db/prisma/schema.prisma` is no longer used for code generation
- Keep migration SQL files, consider removing or renaming the schema to `.reference`

### P7 — Update CONTRIBUTING.md for new stack

- Document Kysely query patterns (not Prisma)
- Document Better Auth configuration
- Remove references to `prisma generate`, `prisma studio`, `prisma migrate dev`

# ADR-002: Adopt Better Auth for Authentication

**Status:** Backlog
**Date:** 2026-03-25

## Context

OneCLI currently uses hand-rolled auth (~300 lines in `apps/api/src/index.ts`):

- `@elysiajs/jwt` for stateless JWT sessions
- `arctic` for manual Google OAuth (state, PKCE, token exchange, userinfo)
- Custom double-submit CSRF cookie pattern
- Manual session refresh endpoint
- No MFA, no session revocation, single OAuth provider

This works for local/single-user mode but lacks the features needed for team use: multi-provider OAuth, MFA, session revocation, and device management.

## Decision

Adopt **Better Auth** when multi-provider OAuth or MFA is required.

## Why Better Auth

| Criteria           | Current                       | Better Auth                             |
| ------------------ | ----------------------------- | --------------------------------------- |
| OAuth providers    | Google only (manual)          | 40+ built-in (config-driven)            |
| Session management | Stateless JWT (no revocation) | DB-backed (instant revocation)          |
| CSRF protection    | Hand-rolled double-submit     | Origin + Fetch Metadata + SameSite      |
| MFA                | None                          | TOTP + backup codes via plugin          |
| Elysia integration | Custom `.derive()` ~70 lines  | Official macro, ~10 lines               |
| DB layer           | Kysely                        | Uses Kysely internally                  |
| Self-hosted        | Yes                           | Yes (MIT, no SaaS dependency)           |
| Maintenance        | Us                            | 800+ contributors, YC-backed, 27k stars |

### Stack alignment

- Uses Kysely internally — same query builder we already use
- Official Elysia plugin — first-class, not a community wrapper
- Runs on Bun — tested and supported
- MIT licensed — no restrictions

## What changes

### Replaced

- `@elysiajs/jwt` plugin
- `arctic` Google OAuth library
- Manual cookie helpers (`sessionCookie()`, `csrfCookie()`, `clearSessionCookies()`)
- CSRF double-submit logic in `onBeforeHandle`
- `/auth/login`, `/auth/callback`, `/auth/signout` routes
- `/api/auth/refresh` endpoint
- User upsert in OAuth callback
- ~70-line `.derive()` auth resolution block

### Kept

- API key authentication (`validateApiKey()`) — orthogonal to user auth
- Local auth mode (`resolveLocalAuth()`) — development convenience
- Account/membership business logic — not auth
- All service layer code

## Risks and Mitigations

### 1. Rust gateway token verification (HIGH)

The gateway currently decodes JWTs directly via `jsonwebtoken` crate. Better Auth uses DB sessions by default.

**Mitigation:** Use Better Auth's cookie caching in `jwt` mode. The gateway can verify the signed cookie without DB access, using `BETTER_AUTH_SECRET` instead of `NEXTAUTH_SECRET`.

### 2. Schema table name conflict (MEDIUM)

Better Auth creates `user`, `session`, `account`, `verification` tables. Our `accounts` table (business entity) conflicts with Better Auth's `account` table (OAuth provider linkage).

**Mitigation:** Use `modelName` config to prefix Better Auth tables: `ba_user`, `ba_session`, `ba_account`, `ba_verification`.

### 3. Frontend CSRF model change (LOW)

The SPA currently sends `X-CSRF-Token` headers on mutations. Better Auth uses Origin + Fetch Metadata instead of explicit CSRF tokens.

**Mitigation:** Remove CSRF header injection from `apps/dashboard/src/lib/api.ts` Eden treaty config. Browser Fetch Metadata headers are sent automatically.

## Migration Plan

1. Install Better Auth, configure with prefixed tables alongside existing auth
2. Validate Elysia macro integration + JWT cookie caching
3. Test gateway token verification with new signing key
4. Migrate OAuth flow (remove arctic, add `socialProviders.google`)
5. Add MFA plugin if needed
6. Update frontend — remove CSRF header, update auth redirects
7. Remove old auth code (~300 lines)

## Trigger

Implement when any of these are needed:

- Second OAuth provider (GitHub, Microsoft, etc.)
- MFA/TOTP requirement
- Session revocation (e.g., "sign out all devices")
- Team/org onboarding with multiple auth methods

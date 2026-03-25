/**
 * Better Auth configuration.
 *
 * Uses our existing `users` table (with added emailVerified/image columns).
 * OAuth provider accounts go to `ba_accounts` to avoid conflict with our
 * business `accounts` table. Sessions in `ba_sessions`.
 */
import { betterAuth } from "better-auth";
import pg from "pg";
import { createId } from "@paralleldrive/cuid2";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const BASE_URL =
  process.env.BETTER_AUTH_URL ??
  process.env.NEXTAUTH_URL ??
  `http://localhost:${process.env.PORT ?? 10254}`;

// Build social providers config — only include Google if credentials are set
const socialProviders: Record<string, unknown> = {};
if (process.env.GOOGLE_CLIENT_ID) {
  socialProviders.google = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    prompt: "select_account",
  };
}

export const auth = betterAuth({
  appName: "OneCLI",
  baseURL: BASE_URL,
  basePath: "/api/auth",
  secret:
    process.env.BETTER_AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    process.env.SECRET_ENCRYPTION_KEY ??
    "local-dev-secret-not-for-production",
  database: pool,

  // Map Better Auth models to our table names
  user: {
    modelName: "users",
    fields: {
      emailVerified: "email_verified",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    additionalFields: {
      externalAuthId: {
        type: "string",
        fieldName: "external_auth_id",
        required: false,
      },
    },
  },
  account: {
    modelName: "ba_accounts",
  },
  session: {
    modelName: "ba_sessions",
    expiresIn: 60 * 60 * 24, // 24 hours
    updateAge: 60 * 60, // refresh if > 1 hour old
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 min cache to reduce DB lookups
    },
  },
  verification: {
    modelName: "ba_verifications",
  },

  advanced: {
    database: {
      generateId: () => createId(),
    },
    cookiePrefix: "onecli",
  },

  socialProviders: socialProviders as any,

  trustedOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((s) => s.trim()),
});

export type Session = typeof auth.$Infer.Session;

import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { jwt } from "@elysiajs/jwt";
import { staticPlugin } from "@elysiajs/static";
import { db, generateId } from "@onecli/db";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { Google } from "arctic";
import {
  registry,
  httpRequestsTotal,
  httpRequestDuration,
  authTotal,
  csrfFailures,
  sessionRefreshes,
} from "./metrics";

// Shared service layer (extracted to packages/services)
import {
  listAgents,
  createAgent,
  deleteAgent,
  renameAgent,
  regenerateAgentToken,
  getDefaultAgent,
  getAgentSecrets,
  updateAgentSecrets,
  updateAgentSecretMode,
  generateAccessToken,
  listSecrets,
  createSecret,
  updateSecret,
  deleteSecret,
  listPolicyRules,
  createPolicyRule,
  updatePolicyRule,
  deletePolicyRule,
  getUser,
  updateProfile,
  generateApiKey,
  getApiKey,
  regenerateApiKey,
  getGatewayCounts,
  ServiceError,
  cryptoService,
  parseAnthropicMetadata,
  createAgentSchema,
  renameAgentSchema,
  secretModeSchema,
  updateAgentSecretsSchema,
  createSecretSchema,
  updateSecretSchema,
  createPolicyRuleSchema,
  updatePolicyRuleSchema,
  updateProfileSchema,
} from "@onecli/services";

// ── Config ──────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 10254);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:3000";
const AUTH_MODE = process.env.AUTH_MODE ?? "local";
const LOCAL_AUTH_ID = "local-user";
const JWT_SECRET = process.env.NEXTAUTH_SECRET || "local-mode-fallback-unused";
const DEFAULT_AGENT_NAME = "Default Agent";
const DEMO_SECRET_NAME = "Demo Secret (httpbin)";
const DEMO_SECRET_VALUE = "WELCOME-TO-ONECLI-SECRETS-ARE-WORKING";
const GATEWAY_PORT = process.env.GATEWAY_PORT ?? "10255";
const CA_CONTAINER_PATH = "/tmp/onecli-gateway-ca.pem";
const IS_CLOUD = process.env.NEXT_PUBLIC_EDITION === "cloud";

// ── Cookie / Session Config ─────────────────────────────────────────────
const IS_SECURE =
  process.env.NODE_ENV === "production" ||
  !!process.env.NEXTAUTH_URL?.startsWith("https://");
const SESSION_COOKIE_NAME = IS_SECURE
  ? "__Secure-authjs.session-token"
  : "authjs.session-token";
const CSRF_COOKIE_NAME = IS_SECURE ? "__Host-csrf" : "csrf";
const SESSION_MAX_AGE = 86400; // 24 hours (seconds)
const SESSION_REFRESH_THRESHOLD = 3600; // refresh if < 1 hour remaining

/** Build a hardened Set-Cookie string for the session JWT. */
function sessionCookie(token: string): string {
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax${IS_SECURE ? "; Secure" : ""}; Max-Age=${SESSION_MAX_AGE}`;
}

/** Build a CSRF double-submit cookie (readable by JS, not HttpOnly). */
function csrfCookie(csrfToken: string): string {
  return `${CSRF_COOKIE_NAME}=${csrfToken}; Path=/; SameSite=Lax${IS_SECURE ? "; Secure" : ""}; Max-Age=${SESSION_MAX_AGE}`;
}

/** Clear session + CSRF cookies. */
function clearSessionCookies(): string[] {
  return [
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax${IS_SECURE ? "; Secure" : ""}; Max-Age=0`,
    `${CSRF_COOKIE_NAME}=; Path=/; SameSite=Lax${IS_SECURE ? "; Secure" : ""}; Max-Age=0`,
  ];
}

/** Generate a random CSRF token (hex). */
function generateCsrfToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Google OAuth via arctic (only initialized if credentials are set)
const google = process.env.GOOGLE_CLIENT_ID
  ? new Google(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET!,
      `${process.env.NEXTAUTH_URL ?? `http://localhost:${PORT}`}/auth/callback`,
    )
  : null;

// ── Helpers ─────────────────────────────────────────────────────────────

interface AuthContext {
  userId: string;
  accountId: string;
}

function requireAuth(auth: AuthContext | null): asserts auth is AuthContext {
  if (!auth) throw new Error("UNAUTHORIZED");
}

function generateRequestId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function validateApiKey(request: Request): Promise<AuthContext | null> {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token || !token.startsWith("oc_")) return null;
  const apiKey = await db
    .selectFrom("apiKeys")
    .select(["userId", "accountId"])
    .where("key", "=", token)
    .executeTakeFirst();
  if (!apiKey) return null;
  return { userId: apiKey.userId, accountId: apiKey.accountId };
}

async function resolveLocalAuth(): Promise<AuthContext | null> {
  let user = await db
    .selectFrom("users")
    .select("id")
    .where("externalAuthId", "=", LOCAL_AUTH_ID)
    .executeTakeFirst();

  // Bootstrap local user + account on first request (fresh database)
  if (!user) {
    user = await db
      .insertInto("users")
      .values({
        id: generateId(),
        email: "local@onecli.dev",
        name: "Local User",
        externalAuthId: LOCAL_AUTH_ID,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
  }

  const membership = await db
    .selectFrom("accountMembers")
    .select("accountId")
    .where("userId", "=", user.id)
    .executeTakeFirst();

  if (!membership) {
    const accountId = generateId();
    await db
      .insertInto("accounts")
      .values({ id: accountId, name: "Local Account" })
      .execute();
    await db
      .insertInto("accountMembers")
      .values({ accountId, userId: user.id, role: "owner" })
      .execute();
    await db
      .insertInto("apiKeys")
      .values({
        id: generateId(),
        key: generateApiKey(),
        userId: user.id,
        accountId,
      })
      .execute();
    return { userId: user.id, accountId };
  }

  return { userId: user.id, accountId: membership.accountId };
}

async function loadCaCertificate(): Promise<string | null> {
  const envCert = process.env.GATEWAY_CA_CERT;
  if (envCert) return envCert;
  const pemFile = process.env.GATEWAY_CA_PEM_FILE;
  if (pemFile) {
    try {
      return await Bun.file(pemFile).text();
    } catch {
      return null;
    }
  }
  const paths = ["/app/data/gateway/ca.pem"];
  const home = process.env.HOME;
  if (home) paths.push(`${home}/.onecli/gateway/ca.pem`);
  for (const p of paths) {
    try {
      const f = Bun.file(p);
      if (await f.exists()) return await f.text();
    } catch {
      continue;
    }
  }
  return null;
}

/** Synchronous CA cert load (for container-config — same logic as loadCaCertificate). */
function loadCaCertificateSync(): string | null {
  const envCert = process.env.GATEWAY_CA_CERT?.trim();
  if (envCert) return envCert;
  if (IS_CLOUD) return null;
  const pemFile = process.env.GATEWAY_CA_PEM_FILE;
  const path =
    pemFile ??
    (existsSync("/app/data")
      ? "/app/data/gateway/ca.pem"
      : `${process.env.HOME}/.onecli/gateway/ca.pem`);
  try {
    const pem = readFileSync(path, "utf-8").trim();
    return pem || null;
  } catch {
    return null;
  }
}

function getGatewayHost(): string {
  if (process.env.GATEWAY_HOST) return process.env.GATEWAY_HOST;
  if (IS_CLOUD)
    throw new Error("GATEWAY_HOST env var is required in cloud edition");
  return "host.docker.internal";
}

// ── Error mapping ───────────────────────────────────────────────────────

const STATUS_MAP: Record<string, number> = {
  NOT_FOUND: 404,
  BAD_REQUEST: 400,
  CONFLICT: 409,
  FORBIDDEN: 403,
};

// ── App ─────────────────────────────────────────────────────────────────

const app = new Elysia()
  .use(
    cors({
      origin: CORS_ORIGIN.split(",").map((s) => s.trim()),
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization", "Accept"],
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    }),
  )
  .use(
    jwt({
      name: "jwt",
      secret: process.env.NEXTAUTH_SECRET || "local-mode-fallback-unused",
    }),
  )

  // Global error handler
  .onError(({ error, set }) => {
    if (error instanceof ServiceError) {
      set.status = STATUS_MAP[error.code] ?? 500;
      return { error: error.message };
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      set.status = 401;
      return { error: "Unauthorized" };
    }
    console.error("unhandled error:", error);
    set.status = 500;
    return { error: "Internal server error" };
  })

  // Derive: request ID + auth context + auth source
  .derive(async ({ request, jwt: jwtService, cookie }) => {
    const requestId =
      request.headers.get("x-request-id") ?? generateRequestId();

    // Resolve auth — track source for CSRF exemption.
    // Auth errors (DB down, Prisma timeout) are non-fatal: treat as unauthenticated.
    // Routes that need auth will call requireAuth() and return 401.
    let auth: AuthContext | null = null;
    let authSource: "api-key" | "local" | "cookie" | null = null;
    let jwtCsrf: string | null = null;

    try {
      auth = await validateApiKey(request);
      if (auth) authSource = "api-key";

      if (!auth && AUTH_MODE === "local") {
        auth = await resolveLocalAuth();
        if (auth) authSource = "local";
      }

      if (!auth) {
        const token = cookie[SESSION_COOKIE_NAME]?.value as string | undefined;
        if (token) {
          const payload = await jwtService.verify(token);
          if (payload && payload.authId) {
            const exp = payload.exp as number | undefined;
            if (exp && exp < Math.floor(Date.now() / 1000)) {
              // Token expired — treat as unauthenticated
            } else {
              const row = await db
                .selectFrom("users")
                .innerJoin(
                  "accountMembers",
                  "accountMembers.userId",
                  "users.id",
                )
                .select(["users.id as userId", "accountMembers.accountId"])
                .where("users.externalAuthId", "=", payload.authId as string)
                .executeTakeFirst();
              if (row) {
                auth = {
                  userId: row.userId,
                  accountId: row.accountId,
                };
                authSource = "cookie";
                jwtCsrf = (payload.csrf as string) ?? null;
              }
            }
          }
        }
      }

      if (auth) {
        authTotal.inc({ source: authSource!, result: "success" });
      }
    } catch (err) {
      // Auth resolution failed (DB unreachable, etc.) — continue unauthenticated
      console.error(
        "auth resolution error:",
        err instanceof Error ? err.message : err,
      );
    }

    return {
      auth,
      authSource,
      jwtCsrf,
      requestId,
      requestStart: performance.now(),
    };
  })

  // CSRF validation for state-changing requests using cookie auth.
  // API key and local-mode auth are exempt (no browser cookie to forge).
  .onBeforeHandle(({ request, authSource, jwtCsrf, cookie, set }) => {
    if (authSource !== "cookie") return; // exempt non-cookie auth
    const method = request.method;
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;

    // Skip CSRF for auth endpoints (callback sets cookies, not reads them)
    const url = new URL(request.url);
    if (url.pathname.startsWith("/auth/")) return;

    // Double-submit: X-CSRF-Token header must match csrf cookie
    const headerToken = request.headers.get("x-csrf-token");
    const cookieToken = cookie[CSRF_COOKIE_NAME]?.value as string | undefined;

    if (!headerToken || !cookieToken || headerToken !== cookieToken) {
      csrfFailures.inc();
      set.status = 403;
      return { error: "CSRF token mismatch" };
    }

    // Also verify CSRF in JWT matches cookie (triple check)
    if (jwtCsrf && jwtCsrf !== cookieToken) {
      csrfFailures.inc();
      set.status = 403;
      return { error: "CSRF token mismatch" };
    }
  })

  // Response header: x-request-id
  .onAfterHandle(({ request, requestId, requestStart, set }) => {
    set.headers["x-request-id"] = requestId;

    // Record request metrics (skip /metrics endpoint to avoid self-instrumentation)
    const url = new URL(request.url);
    if (url.pathname !== "/metrics") {
      const duration = (performance.now() - requestStart) / 1000;
      const path = url.pathname.replace(/\/[0-9a-f-]{20,}/, "/:id");
      httpRequestsTotal.inc({
        method: request.method,
        path,
        status: String(set.status ?? 200),
      });
      httpRequestDuration.observe({ method: request.method, path }, duration);
    }
  })

  // ── Health ──────────────────────────────────────────────────────────
  .get("/api/health", () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
  }))

  // ── Metrics ──────────────────────────────────────────────────────────
  .get("/metrics", async ({ set }) => {
    set.headers["content-type"] = registry.contentType;
    return registry.metrics();
  })

  // ── Gateway ─────────────────────────────────────────────────────────
  .get("/api/counts", async ({ auth }) => {
    requireAuth(auth);
    return getGatewayCounts(auth.accountId);
  })
  .get("/api/demo-info", async ({ auth, set }) => {
    requireAuth(auth);
    const agent = await getDefaultAgent(auth.accountId);
    if (!agent) {
      set.status = 404;
      return { error: "No default agent" };
    }
    const host = process.env.GATEWAY_HOST ?? "localhost";
    return {
      agentToken: agent.accessToken,
      gatewayUrl: `${host}:${GATEWAY_PORT}`,
    };
  })
  .get("/api/gateway/ca", async ({ set }) => {
    const pem = await loadCaCertificate();
    if (!pem) {
      set.status = 503;
      return { error: "CA certificate not available" };
    }
    set.headers["content-type"] = "application/x-pem-file";
    set.headers["content-disposition"] = 'attachment; filename="onecli-ca.pem"';
    return pem;
  })

  // ── Agents ──────────────────────────────────────────────────────────
  .get("/api/agents", async ({ auth }) => {
    requireAuth(auth);
    return listAgents(auth.accountId);
  })
  .post("/api/agents", async ({ auth, body }) => {
    requireAuth(auth);
    const parsed = createAgentSchema.parse(body);
    return createAgent(auth.accountId, parsed.name, parsed.identifier);
  })
  .get("/api/agents/default", async ({ auth, set }) => {
    requireAuth(auth);
    const agent = await getDefaultAgent(auth.accountId);
    if (!agent) {
      set.status = 404;
      return { error: "Default agent not found" };
    }
    return agent;
  })
  .patch(
    "/api/agents/:agentId",
    async ({ auth, params: { agentId }, body }) => {
      requireAuth(auth);
      const parsed = renameAgentSchema.parse(body);
      await renameAgent(auth.accountId, agentId, parsed.name);
      return { success: true };
    },
  )
  .delete(
    "/api/agents/:agentId",
    async ({ auth, params: { agentId }, set }) => {
      requireAuth(auth);
      await deleteAgent(auth.accountId, agentId);
      set.status = 204;
    },
  )
  .post(
    "/api/agents/:agentId/regenerate-token",
    async ({ auth, params: { agentId } }) => {
      requireAuth(auth);
      return regenerateAgentToken(auth.accountId, agentId);
    },
  )
  .patch(
    "/api/agents/:agentId/secret-mode",
    async ({ auth, params: { agentId }, body }) => {
      requireAuth(auth);
      const parsed = secretModeSchema.parse(body);
      await updateAgentSecretMode(auth.accountId, agentId, parsed.mode);
      return { success: true };
    },
  )
  .get(
    "/api/agents/:agentId/secrets",
    async ({ auth, params: { agentId } }) => {
      requireAuth(auth);
      return getAgentSecrets(auth.accountId, agentId);
    },
  )
  .put(
    "/api/agents/:agentId/secrets",
    async ({ auth, params: { agentId }, body }) => {
      requireAuth(auth);
      const parsed = updateAgentSecretsSchema.parse(body);
      await updateAgentSecrets(auth.accountId, agentId, parsed.secretIds);
      return { success: true };
    },
  )

  // ── Secrets ─────────────────────────────────────────────────────────
  .get("/api/secrets", async ({ auth }) => {
    requireAuth(auth);
    return listSecrets(auth.accountId);
  })
  .post("/api/secrets", async ({ auth, body }) => {
    requireAuth(auth);
    const parsed = createSecretSchema.parse(body);
    return createSecret(auth.accountId, parsed);
  })
  .patch(
    "/api/secrets/:secretId",
    async ({ auth, params: { secretId }, body }) => {
      requireAuth(auth);
      const parsed = updateSecretSchema.parse(body);
      await updateSecret(auth.accountId, secretId, parsed);
      return { success: true };
    },
  )
  .delete(
    "/api/secrets/:secretId",
    async ({ auth, params: { secretId }, set }) => {
      requireAuth(auth);
      await deleteSecret(auth.accountId, secretId);
      set.status = 204;
    },
  )

  // ── Policy Rules ────────────────────────────────────────────────────
  .get("/api/rules", async ({ auth }) => {
    requireAuth(auth);
    return listPolicyRules(auth.accountId);
  })
  .post("/api/rules", async ({ auth, body }) => {
    requireAuth(auth);
    const parsed = createPolicyRuleSchema.parse(body);
    return createPolicyRule(auth.accountId, parsed);
  })
  .patch("/api/rules/:ruleId", async ({ auth, params: { ruleId }, body }) => {
    requireAuth(auth);
    const parsed = updatePolicyRuleSchema.parse(body);
    await updatePolicyRule(auth.accountId, ruleId, parsed);
    return { success: true };
  })
  .delete("/api/rules/:ruleId", async ({ auth, params: { ruleId }, set }) => {
    requireAuth(auth);
    await deletePolicyRule(auth.accountId, ruleId);
    set.status = 204;
  })

  // ── User ────────────────────────────────────────────────────────────
  .get("/api/user", async ({ auth }) => {
    requireAuth(auth);
    return getUser(auth.userId);
  })
  .patch("/api/user", async ({ auth, body }) => {
    requireAuth(auth);
    const parsed = updateProfileSchema.parse(body);
    return updateProfile(auth.userId, parsed.name);
  })
  .get("/api/user/api-key", async ({ auth }) => {
    requireAuth(auth);
    return getApiKey(auth.userId, auth.accountId);
  })
  .post("/api/user/api-key/regenerate", async ({ auth }) => {
    requireAuth(auth);
    return regenerateApiKey(auth.userId, auth.accountId);
  })

  // ── Auth / Session Sync ─────────────────────────────────────────────
  // Called on first login and dashboard mount. Upserts user, creates
  // account + defaults. Replaces Next.js /api/auth/session.
  .get("/api/auth/session", async ({ auth, jwt: jwtService, set }) => {
    // In local mode, auth is already resolved from the derive block
    if (AUTH_MODE === "local" && auth) {
      const user = await db
        .selectFrom("users")
        .select(["id", "email", "name"])
        .where("id", "=", auth.userId)
        .executeTakeFirst();
      return user ?? { error: "User not found" };
    }

    // OAuth mode — require auth
    if (!auth) {
      set.status = 401;
      return { error: "Not authenticated" };
    }

    // Ensure account + defaults exist (idempotent)
    let memberRow = await db
      .selectFrom("accountMembers")
      .innerJoin("accounts", "accounts.id", "accountMembers.accountId")
      .select(["accountMembers.accountId", "accounts.demoSeeded"])
      .where("accountMembers.userId", "=", auth.userId)
      .executeTakeFirst();

    if (!memberRow) {
      const user = await db
        .selectFrom("users")
        .select("name")
        .where("id", "=", auth.userId)
        .executeTakeFirst();
      const accountId = generateId();
      await db
        .insertInto("accounts")
        .values({ id: accountId, name: user?.name ?? null })
        .execute();
      await db
        .insertInto("accountMembers")
        .values({
          accountId,
          userId: auth.userId,
          role: "owner",
        })
        .execute();
      await db
        .insertInto("apiKeys")
        .values({
          id: generateId(),
          key: generateApiKey(),
          userId: auth.userId,
          accountId,
        })
        .execute();
      memberRow = { accountId, demoSeeded: false };
    }

    const accountId = memberRow.accountId;

    const hasDefault = await db
      .selectFrom("agents")
      .select("id")
      .where("accountId", "=", accountId)
      .where("isDefault", "=", true)
      .executeTakeFirst();

    const needsSeeding = !memberRow.demoSeeded;

    if (!hasDefault || needsSeeding) {
      await db.transaction().execute(async (trx) => {
        if (!hasDefault) {
          await trx
            .insertInto("agents")
            .values({
              id: generateId(),
              name: DEFAULT_AGENT_NAME,
              accessToken: generateAccessToken(),
              isDefault: true,
              accountId,
            })
            .execute();
        }
        if (needsSeeding) {
          await trx
            .insertInto("secrets")
            .values({
              id: generateId(),
              name: DEMO_SECRET_NAME,
              type: "generic",
              encryptedValue: await cryptoService.encrypt(DEMO_SECRET_VALUE),
              hostPattern: "httpbin.org",
              pathPattern: "/anything/*",
              injectionConfig: JSON.stringify({
                headerName: "Authorization",
                valueFormat: "Bearer {value}",
              }),
              accountId,
            })
            .execute();
          await trx
            .updateTable("accounts")
            .set({ demoSeeded: true })
            .where("id", "=", accountId)
            .execute();
        }
      });
    }

    const user = await db
      .selectFrom("users")
      .select(["id", "email", "name"])
      .where("id", "=", auth.userId)
      .executeTakeFirst();
    return user;
  })

  // ── Google OAuth ────────────────────────────────────────────────────
  .get("/auth/login", async ({ set }) => {
    if (!google) {
      set.status = 503;
      return {
        error:
          "OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
      };
    }
    const state = crypto.randomUUID();
    const codeVerifier = crypto.randomUUID() + crypto.randomUUID();
    const url = google.createAuthorizationURL(state, codeVerifier, [
      "openid",
      "email",
      "profile",
    ]);
    // Store state + verifier in a short-lived cookie
    set.headers["set-cookie"] = [
      `oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
      `oauth_verifier=${codeVerifier}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
    ].join(", ");
    set.redirect = url.toString();
  })

  .get("/auth/callback", async ({ query, cookie, jwt: jwtService, set }) => {
    if (!google) {
      set.status = 503;
      return { error: "OAuth not configured" };
    }

    const { code, state } = query as { code?: string; state?: string };
    const savedState = cookie.oauth_state?.value as string | undefined;
    const codeVerifier = cookie.oauth_verifier?.value as string | undefined;

    if (!code || !state || state !== savedState || !codeVerifier) {
      set.status = 400;
      return { error: "Invalid OAuth callback" };
    }

    const tokens = await google.validateAuthorizationCode(code, codeVerifier);
    const accessToken = tokens.accessToken();

    // Fetch user info from Google
    const userInfoResp = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    const userInfo = (await userInfoResp.json()) as {
      sub: string;
      email: string;
      name?: string;
    };

    // Upsert user
    const user = await db
      .insertInto("users")
      .values({
        id: generateId(),
        externalAuthId: userInfo.sub,
        email: userInfo.email,
        name: userInfo.name ?? null,
      })
      .onConflict((oc) =>
        oc.column("email").doUpdateSet({
          externalAuthId: userInfo.sub,
          name: userInfo.name ?? null,
        }),
      )
      .returning(["id", "email", "name"])
      .executeTakeFirstOrThrow();

    // Issue JWT with expiry
    const csrfToken = generateCsrfToken();
    const token = await jwtService.sign({
      sub: user.id,
      authId: userInfo.sub,
      email: user.email,
      csrf: csrfToken,
      exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
    });

    // Clear OAuth cookies, set hardened session + CSRF cookies
    set.headers["set-cookie"] = [
      sessionCookie(token),
      csrfCookie(csrfToken),
      `oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
      `oauth_verifier=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    ].join(", ");

    set.redirect = "/overview";
  })

  .get("/auth/signout", async ({ set }) => {
    set.headers["set-cookie"] = clearSessionCookies().join(", ");
    set.redirect = "/auth/login";
  })

  // ── Session Refresh ──────────────────────────────────────────────────
  // Called by the SPA to silently refresh a session nearing expiry.
  // Issues a new JWT + CSRF pair if the current token is valid but within
  // the refresh threshold.
  .post(
    "/api/auth/refresh",
    async ({ auth, authSource, cookie, jwt: jwtService, set }) => {
      requireAuth(auth);
      if (authSource !== "cookie") {
        return { refreshed: false, reason: "not-cookie-auth" };
      }

      const token = cookie[SESSION_COOKIE_NAME]?.value as string | undefined;
      if (!token) {
        set.status = 401;
        return { error: "No session" };
      }

      const payload = await jwtService.verify(token);
      if (!payload || !payload.authId) {
        set.status = 401;
        return { error: "Invalid session" };
      }

      const exp = payload.exp as number | undefined;
      const now = Math.floor(Date.now() / 1000);
      if (exp && exp - now > SESSION_REFRESH_THRESHOLD) {
        return { refreshed: false, reason: "not-near-expiry" };
      }

      // Issue fresh token
      const csrfToken = generateCsrfToken();
      const newToken = await jwtService.sign({
        sub: payload.sub,
        authId: payload.authId,
        email: payload.email,
        csrf: csrfToken,
        exp: now + SESSION_MAX_AGE,
      });

      set.headers["set-cookie"] = [
        sessionCookie(newToken),
        csrfCookie(csrfToken),
      ].join(", ");

      sessionRefreshes.inc();
      return { refreshed: true };
    },
  )

  // ── Container Config ────────────────────────────────────────────────
  .get("/api/container-config", async ({ auth, query, set }) => {
    requireAuth(auth);

    const agentIdentifier = (query as Record<string, string>).agent;

    let agent = agentIdentifier
      ? await db
          .selectFrom("agents")
          .select(["id", "accessToken", "secretMode"])
          .where("accountId", "=", auth.accountId)
          .where("identifier", "=", agentIdentifier)
          .executeTakeFirst()
      : await db
          .selectFrom("agents")
          .select(["id", "accessToken", "secretMode"])
          .where("accountId", "=", auth.accountId)
          .where("isDefault", "=", true)
          .executeTakeFirst();

    if (!agent && agentIdentifier) {
      set.status = 404;
      return { error: "Agent with the given identifier not found." };
    }

    if (!agent) {
      agent = await db
        .insertInto("agents")
        .values({
          id: generateId(),
          name: DEFAULT_AGENT_NAME,
          accessToken: generateAccessToken(),
          isDefault: true,
          accountId: auth.accountId,
        })
        .returning(["id", "accessToken", "secretMode"])
        .executeTakeFirstOrThrow();
    }

    const gatewayHost = getGatewayHost();
    const gatewayUrl = `http://x:${agent.accessToken}@${gatewayHost}:${GATEWAY_PORT}`;

    const caCertificate = loadCaCertificateSync();
    if (!caCertificate) {
      set.status = 503;
      return {
        error: "CA certificate not available. Start the gateway first.",
      };
    }

    const anthropicSecret =
      agent.secretMode === "selective"
        ? await db
            .selectFrom("secrets")
            .select("metadata")
            .where("type", "=", "anthropic")
            .where((eb) =>
              eb.exists(
                eb
                  .selectFrom("agentSecrets")
                  .whereRef("agentSecrets.secretId", "=", "secrets.id")
                  .where("agentSecrets.agentId", "=", agent!.id)
                  .select(eb.lit(1).as("one")),
              ),
            )
            .executeTakeFirst()
        : await db
            .selectFrom("secrets")
            .select("metadata")
            .where("accountId", "=", auth.accountId)
            .where("type", "=", "anthropic")
            .executeTakeFirst();

    const meta = parseAnthropicMetadata(anthropicSecret?.metadata);
    const authEnv: Record<string, string> =
      meta?.authMode === "oauth"
        ? { CLAUDE_CODE_OAUTH_TOKEN: "placeholder" }
        : { ANTHROPIC_API_KEY: "placeholder" };

    return {
      env: {
        HTTPS_PROXY: gatewayUrl,
        HTTP_PROXY: gatewayUrl,
        NODE_EXTRA_CA_CERTS: CA_CONTAINER_PATH,
        NODE_USE_ENV_PROXY: "1",
        ...authEnv,
      },
      caCertificate,
      caCertificateContainerPath: CA_CONTAINER_PATH,
    };
  });

// ── Static SPA serving (production) ──────────────────────────────────
// In production, serve the pre-built Vite SPA from ../dashboard/dist.
// In development, the Vite dev server handles this via proxy.
const SPA_DIR = resolve(import.meta.dir, "../../dashboard/dist");

if (existsSync(SPA_DIR)) {
  const spaIndex = resolve(SPA_DIR, "index.html");
  app
    .use(staticPlugin({ assets: SPA_DIR, prefix: "/" }))
    // Explicit root — static plugin doesn't serve index.html for "/"
    .get("/", async ({ set }) => {
      set.headers["content-type"] = "text/html";
      return Bun.file(spaIndex);
    })
    // SPA fallback — serve index.html for all non-API, non-file routes
    .get("*", async ({ set }) => {
      set.headers["content-type"] = "text/html";
      return Bun.file(spaIndex);
    });
  console.log(`serving SPA from ${SPA_DIR}`);
}

app.listen({ port: PORT, hostname: "0.0.0.0" });

console.log(`onecli-api running on http://0.0.0.0:${PORT}`);

// Eden treaty type export — clients import this for end-to-end type safety
export type App = typeof app;

import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { staticPlugin } from "@elysiajs/static";
import { db, generateId } from "@onecli/db";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { auth } from "./auth";
import {
  registry,
  httpRequestsTotal,
  httpRequestDuration,
  authTotal,
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
const DEFAULT_AGENT_NAME = "Default Agent";
const DEMO_SECRET_NAME = "Demo Secret (httpbin)";
const DEMO_SECRET_VALUE = "WELCOME-TO-ONECLI-SECRETS-ARE-WORKING";
const GATEWAY_PORT = process.env.GATEWAY_PORT ?? "10255";
const CA_CONTAINER_PATH = "/tmp/onecli-gateway-ca.pem";
const IS_CLOUD = process.env.NEXT_PUBLIC_EDITION === "cloud";

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

  // Mount Better Auth handler (handles /api/auth/* routes, CSRF, sessions)
  .mount(auth.handler)

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

  // Derive: request ID + auth context
  .derive(async ({ request }) => {
    const requestId =
      request.headers.get("x-request-id") ?? generateRequestId();

    // Resolve auth — try API key first, then local mode, then Better Auth session.
    // Auth errors are non-fatal: treat as unauthenticated.
    let authCtx: AuthContext | null = null;
    let authSource: "api-key" | "local" | "session" | null = null;

    try {
      authCtx = await validateApiKey(request);
      if (authCtx) authSource = "api-key";

      if (!authCtx && AUTH_MODE === "local") {
        authCtx = await resolveLocalAuth();
        if (authCtx) authSource = "local";
      }

      if (!authCtx) {
        // Better Auth session — resolves from cookie automatically
        const session = await auth.api.getSession({
          headers: request.headers,
        });
        if (session?.user) {
          // Map Better Auth user to our AuthContext (need accountId from membership)
          const membership = await db
            .selectFrom("accountMembers")
            .select("accountId")
            .where("userId", "=", session.user.id)
            .executeTakeFirst();
          if (membership) {
            authCtx = {
              userId: session.user.id,
              accountId: membership.accountId,
            };
            authSource = "session";
          }
        }
      }

      if (authCtx) {
        authTotal.inc({ source: authSource!, result: "success" });
      }
    } catch (err) {
      console.error(
        "auth resolution error:",
        err instanceof Error ? err.message : err,
      );
    }

    return {
      auth: authCtx,
      authSource,
      requestId,
      requestStart: performance.now(),
    };
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

  // ── Session Sync ───────────────────────────────────────────────────
  // Called on dashboard mount. Ensures account + defaults exist for the
  // authenticated user (idempotent). In local mode, returns user directly.
  // In OAuth mode, bootstraps account/agent/demo data on first login.
  .get("/api/session", async ({ auth, set }) => {
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
        .values({ accountId, userId: auth.userId, role: "owner" })
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

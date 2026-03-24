import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { jwt } from "@elysiajs/jwt";
import { staticPlugin } from "@elysiajs/static";
import { db } from "@onecli/db";
import { existsSync } from "fs";
import { resolve } from "path";

// Shared service layer (framework-agnostic — lives in apps/web/src/lib for now)
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
} from "../../web/src/lib/services/agent-service";
import {
  listSecrets,
  createSecret,
  updateSecret,
  deleteSecret,
} from "../../web/src/lib/services/secret-service";
import {
  listPolicyRules,
  createPolicyRule,
  updatePolicyRule,
  deletePolicyRule,
} from "../../web/src/lib/services/policy-rule-service";
import {
  getUser,
  updateProfile,
} from "../../web/src/lib/services/user-service";
import {
  getApiKey,
  regenerateApiKey,
} from "../../web/src/lib/services/api-key-service";
import { getGatewayCounts } from "../../web/src/lib/services/counts-service";
import { ServiceError } from "../../web/src/lib/services/errors";

// Zod schemas for validation
import {
  createAgentSchema,
  renameAgentSchema,
  secretModeSchema,
  updateAgentSecretsSchema,
} from "../../web/src/lib/validations/agent";
import {
  createSecretSchema,
  updateSecretSchema,
} from "../../web/src/lib/validations/secret";
import {
  createPolicyRuleSchema,
  updatePolicyRuleSchema,
} from "../../web/src/lib/validations/policy-rule";
import { updateProfileSchema } from "../../web/src/lib/validations/user";

// ── Config ──────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 10254);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:3000";
const AUTH_MODE = process.env.AUTH_MODE ?? "local";
const LOCAL_AUTH_ID = "local-user";

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
  const apiKey = await db.apiKey.findUnique({
    where: { key: token },
    select: { userId: true, accountId: true },
  });
  if (!apiKey) return null;
  return { userId: apiKey.userId, accountId: apiKey.accountId };
}

async function resolveLocalAuth(): Promise<AuthContext | null> {
  const user = await db.user.findUnique({
    where: { externalAuthId: LOCAL_AUTH_ID },
    select: { id: true, memberships: { select: { accountId: true }, take: 1 } },
  });
  if (!user || user.memberships.length === 0) return null;
  return { userId: user.id, accountId: user.memberships[0]!.accountId };
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

  // Derive: request ID + auth context
  .derive(async ({ request, jwt: jwtService, cookie }) => {
    const requestId =
      request.headers.get("x-request-id") ?? generateRequestId();

    // Resolve auth
    let auth: AuthContext | null = null;
    auth = await validateApiKey(request);
    if (!auth && AUTH_MODE === "local") {
      auth = await resolveLocalAuth();
    }
    if (!auth) {
      const cookieName =
        process.env.NODE_ENV === "production"
          ? "__Secure-authjs.session-token"
          : "authjs.session-token";
      const token = cookie[cookieName]?.value as string | undefined;
      if (token) {
        const payload = await jwtService.verify(token);
        if (payload && payload.authId) {
          const user = await db.user.findUnique({
            where: { externalAuthId: payload.authId as string },
            select: {
              id: true,
              memberships: { select: { accountId: true }, take: 1 },
            },
          });
          if (user && user.memberships.length > 0) {
            auth = {
              userId: user.id,
              accountId: user.memberships[0]!.accountId,
            };
          }
        }
      }
    }

    return { auth, requestId };
  })

  // Response header: x-request-id
  .onAfterHandle(({ requestId, set }) => {
    set.headers["x-request-id"] = requestId;
  })

  // ── Health ──────────────────────────────────────────────────────────
  .get("/api/health", () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
  }))

  // ── Gateway ─────────────────────────────────────────────────────────
  .get("/api/counts", async ({ auth }) => {
    requireAuth(auth);
    return getGatewayCounts(auth.accountId);
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
  });

// ── Static SPA serving (production) ──────────────────────────────────
// In production, serve the pre-built Vite SPA from ../dashboard/dist.
// In development, the Vite dev server handles this via proxy.
const SPA_DIR = resolve(import.meta.dir, "../../dashboard/dist");

if (existsSync(SPA_DIR)) {
  app
    .use(staticPlugin({ assets: SPA_DIR, prefix: "/" }))
    // SPA fallback — serve index.html for all non-API, non-file routes
    .get("*", async ({ set }) => {
      set.headers["content-type"] = "text/html";
      return Bun.file(resolve(SPA_DIR, "index.html"));
    });
  console.log(`serving SPA from ${SPA_DIR}`);
}

app.listen(PORT);

console.log(`onecli-api running on http://localhost:${PORT}`);

// Eden treaty type export — clients import this for end-to-end type safety
export type App = typeof app;

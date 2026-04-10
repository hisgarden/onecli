/**
 * Test preload — sets up module mocks BEFORE app.ts is imported by any test.
 *
 * Loaded via apps/api/bunfig.toml [test] preload. This guarantees that when a
 * test file does `import { app } from "../app"` (transitively, via test-app.ts),
 * the heavy modules (`@onecli/db`, `@onecli/services`, `./auth`) have already
 * been replaced and no real pg.Pool / Better Auth instance is constructed.
 *
 * Stable references rule:
 *   The exported `services`, `mockDb`, and `auth` objects are created ONCE
 *   at preload time. Their function references never change. Tests adjust
 *   per-test behavior with `.mockImplementation(...)` (or `.mockImplementationOnce`),
 *   not by reassigning. This is required because Bun's `mock.module` factory is
 *   evaluated once and the resulting export shape is cached.
 */
import { mock } from "bun:test";
import { createMockDb, type MockDb } from "./mock-db";

// Default AUTH_MODE to "test" so the derive() middleware doesn't try
// resolveLocalAuth (which queries the db on every request and adds noise).
// The ??= operator ensures that an explicit AUTH_MODE=local from the shell
// (used by the local-mode test) takes precedence.
process.env.AUTH_MODE ??= "test";

// ── ServiceError class (same shape as packages/services/src/services/errors.ts) ──

class ServiceError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "ServiceError";
  }
}

// ── Stable service mock functions ──────────────────────────────────────
// These references are created once and reused across all tests. Tests
// change behavior via .mockImplementation, not reassignment.

export const services = {
  // Agent service
  listAgents: mock(async (_accountId?: string) => [] as unknown[]),
  createAgent: mock(async () => ({}) as unknown),
  deleteAgent: mock(async () => {}),
  renameAgent: mock(async () => {}),
  regenerateAgentToken: mock(async () => ({}) as unknown),
  getDefaultAgent: mock(async () => null as unknown),
  getAgentSecrets: mock(async () => [] as unknown[]),
  updateAgentSecrets: mock(async () => {}),
  updateAgentSecretMode: mock(async () => {}),
  generateAccessToken: mock(() => "test_access_token"),

  // Secret service
  listSecrets: mock(async () => [] as unknown[]),
  createSecret: mock(async () => ({}) as unknown),
  updateSecret: mock(async () => {}),
  deleteSecret: mock(async () => {}),

  // Policy rule service
  listPolicyRules: mock(async () => [] as unknown[]),
  createPolicyRule: mock(async () => ({}) as unknown),
  updatePolicyRule: mock(async () => {}),
  deletePolicyRule: mock(async () => {}),

  // User service
  getUser: mock(async () => ({}) as unknown),
  updateProfile: mock(async () => ({}) as unknown),

  // API key service
  generateApiKey: mock(() => "oc_test_apikey"),
  getApiKey: mock(async () => ({}) as unknown),
  regenerateApiKey: mock(async () => ({}) as unknown),

  // Counts service
  getGatewayCounts: mock(async () => ({ agents: 0, secrets: 0 })),

  // Crypto + helpers
  cryptoService: {
    encrypt: mock(async (v: string) => `enc(${v})`),
    decrypt: mock(async (v: string) => v.replace(/^enc\(|\)$/g, "")),
  },
  parseAnthropicMetadata: mock(() => null as unknown),
};

// ── Stable auth mock ────────────────────────────────────────────────────

export const auth = {
  handler: mock(async () => new Response(null, { status: 404 })),
  api: {
    getSession: mock(
      async (_args: { headers: Headers }) =>
        null as { user?: { id: string; email?: string; name?: string } } | null,
    ),
  },
};

// ── Stable db mock ──────────────────────────────────────────────────────
// Created ONCE. Reset between tests via mockDb.reset() (clears queued
// results + call history) without ever replacing the identity. This is
// required because `import { mockDb } from "./preload"` captures the
// binding at import time, and replacing the local `mockDb` would not
// propagate to the test files.

export const mockDb: MockDb = createMockDb();

/**
 * Reset all mocks to their default behavior between tests.
 * Call from beforeEach in every test file.
 */
export function resetMocks() {
  // Reset every service mock's implementation back to its default.
  services.listAgents.mockImplementation(async () => []);
  services.createAgent.mockImplementation(async () => ({}));
  services.deleteAgent.mockImplementation(async () => {});
  services.renameAgent.mockImplementation(async () => {});
  services.regenerateAgentToken.mockImplementation(async () => ({}));
  services.getDefaultAgent.mockImplementation(async () => null);
  services.getAgentSecrets.mockImplementation(async () => []);
  services.updateAgentSecrets.mockImplementation(async () => {});
  services.updateAgentSecretMode.mockImplementation(async () => {});
  services.generateAccessToken.mockImplementation(() => "test_access_token");
  services.listSecrets.mockImplementation(async () => []);
  services.createSecret.mockImplementation(async () => ({}));
  services.updateSecret.mockImplementation(async () => {});
  services.deleteSecret.mockImplementation(async () => {});
  services.listPolicyRules.mockImplementation(async () => []);
  services.createPolicyRule.mockImplementation(async () => ({}));
  services.updatePolicyRule.mockImplementation(async () => {});
  services.deletePolicyRule.mockImplementation(async () => {});
  services.getUser.mockImplementation(async () => ({}));
  services.updateProfile.mockImplementation(async () => ({}));
  services.generateApiKey.mockImplementation(() => "oc_test_apikey");
  services.getApiKey.mockImplementation(async () => ({}));
  services.regenerateApiKey.mockImplementation(async () => ({}));
  services.getGatewayCounts.mockImplementation(async () => ({
    agents: 0,
    secrets: 0,
  }));
  services.cryptoService.encrypt.mockImplementation(
    async (v: string) => `enc(${v})`,
  );
  services.cryptoService.decrypt.mockImplementation(async (v: string) =>
    v.replace(/^enc\(|\)$/g, ""),
  );
  services.parseAnthropicMetadata.mockImplementation(() => null);

  // Clear call history on all service mocks
  Object.values(services).forEach((v) => {
    if (typeof v === "function" && "mockClear" in v) {
      (v as { mockClear: () => void }).mockClear();
    }
  });
  services.cryptoService.encrypt.mockClear();
  services.cryptoService.decrypt.mockClear();

  // Reset auth mock
  auth.handler.mockImplementation(
    async () => new Response(null, { status: 404 }),
  );
  auth.api.getSession.mockImplementation(async () => null);
  auth.handler.mockClear();
  auth.api.getSession.mockClear();

  // Drain db queue + history
  mockDb.reset();
}

// ── Pass-through schemas ────────────────────────────────────────────────
// Route handlers do `createAgentSchema.parse(body)`. We don't want to test
// validation here (the schemas are tested in packages/services tests), but
// .parse() must exist and return the body unchanged.

const passThroughSchema = { parse: <T>(value: T): T => value };

// ── mock.module: @onecli/db ────────────────────────────────────────────

mock.module("@onecli/db", () => ({
  // mockDb is created once and never reassigned — direct reference is safe.
  db: mockDb,
  generateId: () => `test_${Math.random().toString(36).slice(2, 10)}`,
}));

// ── mock.module: @onecli/services ──────────────────────────────────────
// Spread the stable `services` object so each export points at the SAME
// mock function reference for the lifetime of the test process. Tests
// change behavior via `services.X.mockImplementation(...)`.

mock.module("@onecli/services", () => ({
  // Schemas — pass-through (validation tested elsewhere)
  createAgentSchema: passThroughSchema,
  renameAgentSchema: passThroughSchema,
  secretModeSchema: passThroughSchema,
  updateAgentSecretsSchema: passThroughSchema,
  createSecretSchema: passThroughSchema,
  updateSecretSchema: passThroughSchema,
  createPolicyRuleSchema: passThroughSchema,
  updatePolicyRuleSchema: passThroughSchema,
  updateProfileSchema: passThroughSchema,

  // Error class (route handlers and the global error handler both use this)
  ServiceError,

  // Service functions — stable references from the `services` object above
  listAgents: services.listAgents,
  createAgent: services.createAgent,
  deleteAgent: services.deleteAgent,
  renameAgent: services.renameAgent,
  regenerateAgentToken: services.regenerateAgentToken,
  getDefaultAgent: services.getDefaultAgent,
  getAgentSecrets: services.getAgentSecrets,
  updateAgentSecrets: services.updateAgentSecrets,
  updateAgentSecretMode: services.updateAgentSecretMode,
  generateAccessToken: services.generateAccessToken,
  listSecrets: services.listSecrets,
  createSecret: services.createSecret,
  updateSecret: services.updateSecret,
  deleteSecret: services.deleteSecret,
  listPolicyRules: services.listPolicyRules,
  createPolicyRule: services.createPolicyRule,
  updatePolicyRule: services.updatePolicyRule,
  deletePolicyRule: services.deletePolicyRule,
  getUser: services.getUser,
  updateProfile: services.updateProfile,
  generateApiKey: services.generateApiKey,
  getApiKey: services.getApiKey,
  regenerateApiKey: services.regenerateApiKey,
  getGatewayCounts: services.getGatewayCounts,
  cryptoService: services.cryptoService,
  parseAnthropicMetadata: services.parseAnthropicMetadata,
}));

// ── mock.module: ./auth ────────────────────────────────────────────────
// app.ts imports `from "./auth"`. This preload file lives at
// apps/api/src/__tests__/helpers/preload.ts, so the relative path to
// apps/api/src/auth.ts is "../../auth". Bun normalizes both to the same
// absolute path, so this match works.

mock.module("../../auth", () => ({
  auth,
}));

// Re-export ServiceError so tests can throw the same class the handler
// instanceof-checks. (Importing it from "@onecli/services" in a test would
// also work, but this is more direct.)
export { ServiceError };
export type { MockDb };

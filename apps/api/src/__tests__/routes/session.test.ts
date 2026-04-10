/**
 * Route: GET /api/session
 *
 * Idempotent bootstrap called by the dashboard on mount. Branches:
 *   - auth null → 401 (uses `if (!auth)`, NOT requireAuth, so the response
 *     shape differs from the global UNAUTHORIZED path)
 *   - already-bootstrapped fast path: memberRow exists + hasDefault + demoSeeded
 *     → no transaction, just returns the user
 *   - new user: no memberRow → creates account + member + apiKey
 *     (sequence of inserts), then runs the bootstrap transaction
 *   - has memberRow but no default agent → transaction creates default agent
 *   - has memberRow but demoSeeded=false → transaction seeds demo secret
 *     (calls cryptoService.encrypt) and updates demoSeeded
 *
 * The route makes several db calls in a specific order. The mock-db helper
 * delivers queued results FIFO, so each test queues exactly the values the
 * route reads.
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { services, mockDb, resetMocks } from "../helpers/preload";
import { request } from "../helpers/test-app";

const TEST_USER = "u_session_test";
const TEST_ACCOUNT = "a_session_test";

function withApiKeyAuth() {
  // validateApiKey() consumes one db result before the route handler runs.
  mockDb.queueResult({ userId: TEST_USER, accountId: TEST_ACCOUNT });
  return { bearer: "oc_test" };
}

describe("GET /api/session", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("returns 401 when auth is null (no token, no session)", async () => {
    const res = await request("GET", "/api/session");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Not authenticated");
  });

  it("fast path: existing member + default agent + demoSeeded → no transaction, returns user", async () => {
    const opts = withApiKeyAuth();
    // 1. memberRow query → already a member, demo already seeded
    mockDb.queueResult({ accountId: TEST_ACCOUNT, demoSeeded: true });
    // 2. hasDefault query → default agent exists
    mockDb.queueResult({ id: "agent_default" });
    // 3. final user query
    mockDb.queueResult({
      id: TEST_USER,
      email: "test@onecli.dev",
      name: "Test",
    });

    const res = await request("GET", "/api/session", opts);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; email: string };
    expect(body.id).toBe(TEST_USER);
    expect(body.email).toBe("test@onecli.dev");

    // No demo seeding should have happened on the fast path.
    expect(services.cryptoService.encrypt).not.toHaveBeenCalled();
  });

  it("bootstrap path: no memberRow → creates account, member, apiKey, default agent, demo secret", async () => {
    const opts = withApiKeyAuth();
    // 1. memberRow query → undefined (no membership)
    mockDb.queueResult(undefined);
    // 2. user lookup for the new account name
    mockDb.queueResult({ name: "New User" });
    // (inserts for accounts, accountMembers, apiKeys all use .execute() which
    // returns [] when nothing is queued — no setup needed)
    // 3. hasDefault query → undefined (no default agent yet on the new account)
    mockDb.queueResult(undefined);
    // (transaction inserts use .execute() too — no queue needed)
    // 4. final user query
    mockDb.queueResult({
      id: TEST_USER,
      email: "new@onecli.dev",
      name: "New User",
    });

    const res = await request("GET", "/api/session", opts);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe(TEST_USER);

    // The bootstrap path runs the transaction with !hasDefault AND !demoSeeded
    // (memberRow created with demoSeeded:false), so the demo secret is seeded
    // and cryptoService.encrypt is called.
    expect(services.cryptoService.encrypt).toHaveBeenCalledTimes(1);
  });

  it("existing member, no default agent → transaction creates default (no demo seeding if already seeded)", async () => {
    const opts = withApiKeyAuth();
    // 1. memberRow → exists, demo already seeded
    mockDb.queueResult({ accountId: TEST_ACCOUNT, demoSeeded: true });
    // 2. hasDefault → undefined (no default agent)
    mockDb.queueResult(undefined);
    // (transaction.insertInto agents .execute() → [] default)
    // 3. final user
    mockDb.queueResult({
      id: TEST_USER,
      email: "u@x.z",
      name: "U",
    });

    const res = await request("GET", "/api/session", opts);
    expect(res.status).toBe(200);

    // hasDefault was false → transaction ran, but only the agent insert
    // (demoSeeded was already true). cryptoService.encrypt should NOT have
    // been called because the demo seed branch was skipped.
    expect(services.cryptoService.encrypt).not.toHaveBeenCalled();
  });

  it("existing member, has default agent, but demoSeeded=false → transaction seeds demo only", async () => {
    const opts = withApiKeyAuth();
    // 1. memberRow → exists, demo NOT yet seeded
    mockDb.queueResult({ accountId: TEST_ACCOUNT, demoSeeded: false });
    // 2. hasDefault → exists
    mockDb.queueResult({ id: "agent_default" });
    // (transaction runs because needsSeeding is true; only the secret seed
    // branch runs because hasDefault is truthy.)
    // 3. final user
    mockDb.queueResult({ id: TEST_USER, email: "u@x.z", name: "U" });

    const res = await request("GET", "/api/session", opts);
    expect(res.status).toBe(200);

    // The demo seed branch should have called cryptoService.encrypt exactly once.
    expect(services.cryptoService.encrypt).toHaveBeenCalledTimes(1);
    expect(services.cryptoService.encrypt).toHaveBeenCalledWith(
      "WELCOME-TO-ONECLI-SECRETS-ARE-WORKING",
    );
  });

  it("calls generateAccessToken when creating the default agent in the bootstrap transaction", async () => {
    const opts = withApiKeyAuth();
    mockDb.queueResult({ accountId: TEST_ACCOUNT, demoSeeded: true });
    mockDb.queueResult(undefined); // hasDefault → undefined
    mockDb.queueResult({ id: TEST_USER, email: "u@x.z", name: "U" });

    const res = await request("GET", "/api/session", opts);
    expect(res.status).toBe(200);

    // The transaction ran the !hasDefault branch which calls generateAccessToken
    expect(services.generateAccessToken).toHaveBeenCalled();
  });
});

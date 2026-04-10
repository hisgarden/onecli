/**
 * Auth derive() middleware tests.
 *
 * Verifies the auth-resolution chain in app.ts (lines ~242-298). The chain
 * tries each auth source in order:
 *   1. API key — `Authorization: Bearer oc_*` validated against db.apiKeys
 *   2. Local mode — only when AUTH_MODE === "local" (skipped here, tested
 *      separately because AUTH_MODE is captured at app.ts module-load time)
 *   3. Better Auth session — `auth.api.getSession({ headers })` + db.accountMembers
 *
 * On success, increments the `authTotal` Prometheus counter labeled by
 * source. On error, the chain swallows exceptions (logged via console.error)
 * and falls through with a null auth context.
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { services, mockDb, auth, resetMocks } from "./helpers/preload";
import { request } from "./helpers/test-app";
import { authTotal } from "../metrics";

describe("auth derive() middleware", () => {
  beforeEach(() => {
    resetMocks();
    // Reset the prom-client counter so per-test deltas are clean.
    authTotal.reset();
  });

  describe("API key path", () => {
    it("populates auth context from a valid oc_ token", async () => {
      mockDb.queueResult({ userId: "u1", accountId: "a1" });
      services.listAgents.mockImplementation(async (accountId) => {
        // Capture the accountId so we can assert it came from the API key
        return [{ _accountId: accountId }];
      });

      const res = await request("GET", "/api/agents", {
        bearer: "oc_valid_token",
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as Array<{ _accountId: string }>;
      expect(body[0]._accountId).toBe("a1");
      expect(services.listAgents).toHaveBeenCalledWith("a1");
    });

    it("rejects a token without the oc_ prefix as no-auth", async () => {
      // No db result queued — validateApiKey will return null because the
      // token doesn't start with "oc_", so it never reaches the db.
      const res = await request("GET", "/api/agents", {
        bearer: "Bearer-but-wrong-prefix-token",
      });
      expect(res.status).toBe(401);
    });

    it("rejects a token whose db lookup returns nothing", async () => {
      mockDb.queueResult(undefined); // executeTakeFirst → undefined
      const res = await request("GET", "/api/agents", {
        bearer: "oc_token_not_in_db",
      });
      expect(res.status).toBe(401);
    });
  });

  describe("Better Auth session path", () => {
    it("populates auth context from a valid session + membership", async () => {
      // No api key header → falls through to session path.
      auth.api.getSession.mockImplementation(async () => ({
        user: { id: "u_session", email: "x@y.z", name: "Sess" },
      }));
      // The session path then queries accountMembers for the userId.
      mockDb.queueResult({ accountId: "a_session" });

      services.listAgents.mockImplementation(async (accountId) => [
        { _accountId: accountId },
      ]);

      const res = await request("GET", "/api/agents");
      expect(res.status).toBe(200);
      const body = (await res.json()) as Array<{ _accountId: string }>;
      expect(body[0]._accountId).toBe("a_session");
    });

    it("falls through to no-auth when session has no user", async () => {
      auth.api.getSession.mockImplementation(async () => null);
      const res = await request("GET", "/api/agents");
      expect(res.status).toBe(401);
    });

    it("falls through to no-auth when user has no membership", async () => {
      auth.api.getSession.mockImplementation(async () => ({
        user: { id: "u_orphan" },
      }));
      mockDb.queueResult(undefined); // accountMembers lookup returns nothing
      const res = await request("GET", "/api/agents");
      expect(res.status).toBe(401);
    });
  });

  describe("error swallowing", () => {
    it("does not 500 when an auth source throws", async () => {
      // Make the session lookup throw
      auth.api.getSession.mockImplementation(async () => {
        throw new Error("better-auth blew up");
      });
      // Suppress the console.error from the catch block
      const originalConsoleError = console.error;
      console.error = () => {};
      try {
        const res = await request("GET", "/api/agents");
        // Should fall through to no-auth → 401, not 500
        expect(res.status).toBe(401);
      } finally {
        console.error = originalConsoleError;
      }
    });
  });

  describe("metrics + request id", () => {
    it("increments authTotal{source=api-key,result=success} on api-key auth", async () => {
      mockDb.queueResult({ userId: "u1", accountId: "a1" });
      await request("GET", "/api/agents", { bearer: "oc_valid" });

      const metric = await authTotal.get();
      const successApiKey = metric.values.find(
        (v) => v.labels.source === "api-key" && v.labels.result === "success",
      );
      expect(successApiKey?.value).toBe(1);
    });

    it("propagates x-request-id from request header to response header", async () => {
      const res = await request("GET", "/api/health", {
        headers: { "x-request-id": "req-test-123" },
      });
      expect(res.headers.get("x-request-id")).toBe("req-test-123");
    });

    it("generates an x-request-id when none is provided", async () => {
      const res = await request("GET", "/api/health");
      const id = res.headers.get("x-request-id");
      expect(id).toBeTruthy();
      expect(id!.length).toBeGreaterThan(0);
    });
  });
});

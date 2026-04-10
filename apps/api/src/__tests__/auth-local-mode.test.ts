/**
 * Local auth mode tests.
 *
 * Requires: AUTH_MODE=local set BEFORE this process starts, because app.ts
 * captures AUTH_MODE as a module-level const. The preload.ts uses ??= so an
 * explicit AUTH_MODE=local from the shell takes precedence.
 *
 * Run with:
 *   AUTH_MODE=local bun test src/__tests__/auth-local-mode.test.ts
 *
 * Or via the package.json script:
 *   bun run test:local-auth
 *
 * These tests exercise the `resolveLocalAuth()` code path in the derive()
 * middleware, which is skipped by all other tests (AUTH_MODE=test).
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { mockDb, resetMocks, services } from "./helpers/preload";
import { request } from "./helpers/test-app";

const isLocalMode = process.env.AUTH_MODE === "local";

describe("local auth mode", () => {
  beforeEach(() => {
    resetMocks();
  });

  (isLocalMode ? it : it.skip)(
    "resolveLocalAuth populates auth context from db when AUTH_MODE=local",
    async () => {
      // resolveLocalAuth flow:
      // 1. selectFrom("users").where(externalAuthId = "local-user").executeTakeFirst()
      // 2. selectFrom("accountMembers").where(userId).executeTakeFirst()
      mockDb.queueResult({ id: "local-user-id" });
      mockDb.queueResult({ accountId: "local-account-id" });

      services.listAgents.mockImplementation(async (accountId) => [
        { _accountId: accountId },
      ]);

      // No bearer token — API key path returns null, falls through to local mode
      const res = await request("GET", "/api/agents");
      expect(res.status).toBe(200);
      const body = (await res.json()) as Array<{ _accountId: string }>;
      expect(body[0]._accountId).toBe("local-account-id");
    },
  );

  (isLocalMode ? it : it.skip)(
    "resolveLocalAuth bootstraps user+account on first request when user missing",
    async () => {
      // 1. user lookup → undefined (no local user yet)
      mockDb.queueResult(undefined);
      // 2. insertInto("users").returning("id").executeTakeFirstOrThrow()
      mockDb.queueResult({ id: "new-local-user" });
      // 3. membership lookup → undefined (no account yet)
      mockDb.queueResult(undefined);
      // (inserts for accounts, accountMembers, apiKeys use execute() — no queue drain)
      // The route handler then runs with auth = { userId: "new-local-user", accountId: <generated> }

      services.listAgents.mockImplementation(async () => [{ id: "a1" }]);

      const res = await request("GET", "/api/agents");
      expect(res.status).toBe(200);
    },
  );

  // Guard: this file should always be runnable (even under AUTH_MODE=test),
  // the tests just skip. This test always runs as a sanity check.
  it("detects the current AUTH_MODE", () => {
    expect(["local", "test"]).toContain(process.env.AUTH_MODE as string);
  });
});

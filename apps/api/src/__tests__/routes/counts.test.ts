/**
 * Route: GET /api/counts
 *
 * Thin wrapper around getGatewayCounts(accountId). Asserts auth gate +
 * happy-path delegation.
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { services, mockDb, resetMocks } from "../helpers/preload";
import { request } from "../helpers/test-app";

const TEST_USER = "u_test";
const TEST_ACCOUNT = "a_test";

function authed() {
  mockDb.queueResult({ userId: TEST_USER, accountId: TEST_ACCOUNT });
  return { bearer: "oc_test" };
}

describe("GET /api/counts", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("rejects without auth → 401", async () => {
    const res = await request("GET", "/api/counts");
    expect(res.status).toBe(401);
  });

  it("returns the getGatewayCounts result and passes the auth account id", async () => {
    services.getGatewayCounts.mockImplementation(async () => ({
      agents: 5,
      secrets: 13,
    }));

    const res = await request("GET", "/api/counts", authed());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { agents: number; secrets: number };
    expect(body).toEqual({ agents: 5, secrets: 13 });
    expect(services.getGatewayCounts).toHaveBeenCalledWith(TEST_ACCOUNT);
  });
});

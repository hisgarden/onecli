/**
 * Route: GET /api/demo-info
 *
 * Returns the default agent's access token + the gateway URL. Used by the
 * dashboard's "try the demo" CTA. 404 when there is no default agent.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { services, mockDb, resetMocks } from "../helpers/preload";
import { request } from "../helpers/test-app";

const TEST_USER = "u_test";
const TEST_ACCOUNT = "a_test";

function authed() {
  mockDb.queueResult({ userId: TEST_USER, accountId: TEST_ACCOUNT });
  return { bearer: "oc_test" };
}

describe("GET /api/demo-info", () => {
  const ORIGINAL_GATEWAY_HOST = process.env.GATEWAY_HOST;

  beforeEach(() => {
    resetMocks();
    process.env.GATEWAY_HOST = "test.gateway.local";
  });

  afterEach(() => {
    if (ORIGINAL_GATEWAY_HOST === undefined) delete process.env.GATEWAY_HOST;
    else process.env.GATEWAY_HOST = ORIGINAL_GATEWAY_HOST;
  });

  it("rejects without auth → 401", async () => {
    const res = await request("GET", "/api/demo-info");
    expect(res.status).toBe(401);
  });

  it("returns the default agent token + gateway URL", async () => {
    services.getDefaultAgent.mockImplementation(async () => ({
      id: "agent_default",
      accessToken: "tok_secret",
      name: "Default Agent",
    }));

    const res = await request("GET", "/api/demo-info", authed());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      agentToken: string;
      gatewayUrl: string;
    };
    expect(body.agentToken).toBe("tok_secret");
    // GATEWAY_PORT default is 10255 — see app.ts config block
    expect(body.gatewayUrl).toBe("test.gateway.local:10255");
    expect(services.getDefaultAgent).toHaveBeenCalledWith(TEST_ACCOUNT);
  });

  it("returns 404 when there is no default agent", async () => {
    services.getDefaultAgent.mockImplementation(async () => null);

    const res = await request("GET", "/api/demo-info", authed());
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("No default agent");
  });
});

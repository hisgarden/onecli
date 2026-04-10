/**
 * Routes: /api/secrets and /api/secrets/:secretId
 *
 *   GET    /api/secrets               → listSecrets(accountId)
 *   POST   /api/secrets               → createSecret(accountId, body)
 *   PATCH  /api/secrets/:secretId     → updateSecret(accountId, secretId, body) → {success:true}
 *   DELETE /api/secrets/:secretId     → deleteSecret(accountId, secretId) → 204
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { services, mockDb, resetMocks } from "../helpers/preload";
import { request } from "../helpers/test-app";

const TEST_USER = "u_secrets_test";
const TEST_ACCOUNT = "a_secrets_test";

function authed() {
  mockDb.queueResult({ userId: TEST_USER, accountId: TEST_ACCOUNT });
  return { bearer: "oc_test" };
}

describe("secret routes", () => {
  beforeEach(() => {
    resetMocks();
  });

  describe("GET /api/secrets", () => {
    it("rejects without auth → 401", async () => {
      const res = await request("GET", "/api/secrets");
      expect(res.status).toBe(401);
    });

    it("returns the listSecrets result and passes the auth account id", async () => {
      services.listSecrets.mockImplementation(async () => [
        { id: "s1", name: "API key", type: "generic" },
        { id: "s2", name: "DB pass", type: "generic" },
      ]);

      const res = await request("GET", "/api/secrets", authed());
      expect(res.status).toBe(200);
      const body = (await res.json()) as Array<{ id: string }>;
      expect(body).toHaveLength(2);
      expect(services.listSecrets).toHaveBeenCalledWith(TEST_ACCOUNT);
    });
  });

  describe("POST /api/secrets", () => {
    it("rejects without auth → 401", async () => {
      const res = await request("POST", "/api/secrets", { body: {} });
      expect(res.status).toBe(401);
    });

    it("creates a secret with the body forwarded to the service", async () => {
      services.createSecret.mockImplementation(async () => ({
        id: "s_new",
        name: "Stripe key",
      }));

      const secretBody = {
        name: "Stripe key",
        type: "generic",
        value: "sk_live_xxx",
        hostPattern: "api.stripe.com",
      };
      const res = await request("POST", "/api/secrets", {
        ...authed(),
        body: secretBody,
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: string };
      expect(body.id).toBe("s_new");
      expect(services.createSecret).toHaveBeenCalledWith(
        TEST_ACCOUNT,
        secretBody,
      );
    });
  });

  describe("PATCH /api/secrets/:secretId", () => {
    it("rejects without auth → 401", async () => {
      const res = await request("PATCH", "/api/secrets/s1", { body: {} });
      expect(res.status).toBe(401);
    });

    it("updates a secret with accountId, secretId, and body forwarded", async () => {
      const updateBody = { name: "Renamed Secret" };
      const res = await request("PATCH", "/api/secrets/s_target", {
        ...authed(),
        body: updateBody,
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { success: boolean };
      expect(body.success).toBe(true);
      expect(services.updateSecret).toHaveBeenCalledWith(
        TEST_ACCOUNT,
        "s_target",
        updateBody,
      );
    });
  });

  describe("DELETE /api/secrets/:secretId", () => {
    it("rejects without auth → 401", async () => {
      const res = await request("DELETE", "/api/secrets/s1");
      expect(res.status).toBe(401);
    });

    it("deletes a secret and returns 204", async () => {
      const res = await request("DELETE", "/api/secrets/s_doomed", authed());
      expect(res.status).toBe(204);
      expect(services.deleteSecret).toHaveBeenCalledWith(
        TEST_ACCOUNT,
        "s_doomed",
      );
    });
  });
});

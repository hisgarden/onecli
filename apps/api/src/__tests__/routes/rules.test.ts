/**
 * Routes: /api/rules and /api/rules/:ruleId
 *
 *   GET    /api/rules                  → listPolicyRules(accountId)
 *   POST   /api/rules                  → createPolicyRule(accountId, body)
 *   PATCH  /api/rules/:ruleId          → updatePolicyRule(accountId, ruleId, body) → {success:true}
 *   DELETE /api/rules/:ruleId          → deletePolicyRule(accountId, ruleId) → 204
 *
 * Each route: 401 without auth + happy path + arg propagation. Verifies
 * that path params and body are forwarded correctly to the service layer.
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { services, mockDb, resetMocks } from "../helpers/preload";
import { request } from "../helpers/test-app";

const TEST_USER = "u_rules_test";
const TEST_ACCOUNT = "a_rules_test";

function authed() {
  mockDb.queueResult({ userId: TEST_USER, accountId: TEST_ACCOUNT });
  return { bearer: "oc_test" };
}

describe("policy rule routes", () => {
  beforeEach(() => {
    resetMocks();
  });

  describe("GET /api/rules", () => {
    it("rejects without auth → 401", async () => {
      const res = await request("GET", "/api/rules");
      expect(res.status).toBe(401);
    });

    it("returns the listPolicyRules result and passes the auth account id", async () => {
      services.listPolicyRules.mockImplementation(async () => [
        { id: "r1", action: "block" },
        { id: "r2", action: "allow" },
      ]);

      const res = await request("GET", "/api/rules", authed());
      expect(res.status).toBe(200);
      const body = (await res.json()) as Array<{ id: string }>;
      expect(body).toHaveLength(2);
      expect(services.listPolicyRules).toHaveBeenCalledWith(TEST_ACCOUNT);
    });
  });

  describe("POST /api/rules", () => {
    it("rejects without auth → 401", async () => {
      const res = await request("POST", "/api/rules", { body: {} });
      expect(res.status).toBe(401);
    });

    it("creates a rule with the body forwarded to the service", async () => {
      services.createPolicyRule.mockImplementation(async () => ({
        id: "r_new",
        action: "block",
      }));

      const ruleBody = { action: "block", hostPattern: "*.evil.com" };
      const res = await request("POST", "/api/rules", {
        ...authed(),
        body: ruleBody,
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: string };
      expect(body.id).toBe("r_new");
      expect(services.createPolicyRule).toHaveBeenCalledWith(
        TEST_ACCOUNT,
        ruleBody,
      );
    });
  });

  describe("PATCH /api/rules/:ruleId", () => {
    it("rejects without auth → 401", async () => {
      const res = await request("PATCH", "/api/rules/r1", { body: {} });
      expect(res.status).toBe(401);
    });

    it("updates a rule with accountId, ruleId, and body forwarded", async () => {
      const updateBody = { action: "allow" };
      const res = await request("PATCH", "/api/rules/r_target", {
        ...authed(),
        body: updateBody,
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { success: boolean };
      expect(body.success).toBe(true);
      expect(services.updatePolicyRule).toHaveBeenCalledWith(
        TEST_ACCOUNT,
        "r_target",
        updateBody,
      );
    });
  });

  describe("DELETE /api/rules/:ruleId", () => {
    it("rejects without auth → 401", async () => {
      const res = await request("DELETE", "/api/rules/r1");
      expect(res.status).toBe(401);
    });

    it("deletes a rule and returns 204", async () => {
      const res = await request("DELETE", "/api/rules/r_doomed", authed());
      expect(res.status).toBe(204);
      expect(services.deletePolicyRule).toHaveBeenCalledWith(
        TEST_ACCOUNT,
        "r_doomed",
      );
    });
  });
});

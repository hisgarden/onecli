/**
 * Routes: /api/agents and /api/agents/:agentId/*
 *
 *   GET    /api/agents                          → listAgents(accountId)
 *   POST   /api/agents                          → createAgent(accountId, name, identifier)
 *   GET    /api/agents/default                  → getDefaultAgent(accountId) | 404
 *   PATCH  /api/agents/:agentId                 → renameAgent(accountId, agentId, name) → {success}
 *   DELETE /api/agents/:agentId                 → deleteAgent(accountId, agentId) → 204
 *   POST   /api/agents/:agentId/regenerate-token → regenerateAgentToken(accountId, agentId)
 *   PATCH  /api/agents/:agentId/secret-mode     → updateAgentSecretMode(accountId, agentId, mode)
 *   GET    /api/agents/:agentId/secrets         → getAgentSecrets(accountId, agentId)
 *   PUT    /api/agents/:agentId/secrets         → updateAgentSecrets(accountId, agentId, secretIds)
 *
 * Each route: 401 without auth + happy path + arg propagation. Largest file
 * in Block B (9 routes, ~24 tests).
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { services, mockDb, resetMocks } from "../helpers/preload";
import { request } from "../helpers/test-app";

const TEST_USER = "u_agents_test";
const TEST_ACCOUNT = "a_agents_test";

function authed() {
  mockDb.queueResult({ userId: TEST_USER, accountId: TEST_ACCOUNT });
  return { bearer: "oc_test" };
}

describe("agent routes", () => {
  beforeEach(() => {
    resetMocks();
  });

  // ── GET /api/agents ──────────────────────────────────────────────────
  describe("GET /api/agents", () => {
    it("rejects without auth → 401", async () => {
      const res = await request("GET", "/api/agents");
      expect(res.status).toBe(401);
    });

    it("returns the listAgents result and passes the auth account id", async () => {
      services.listAgents.mockImplementation(async () => [
        { id: "a1", name: "Agent 1" },
        { id: "a2", name: "Agent 2" },
      ]);

      const res = await request("GET", "/api/agents", authed());
      expect(res.status).toBe(200);
      const body = (await res.json()) as Array<{ id: string }>;
      expect(body).toHaveLength(2);
      expect(services.listAgents).toHaveBeenCalledWith(TEST_ACCOUNT);
    });
  });

  // ── POST /api/agents ─────────────────────────────────────────────────
  describe("POST /api/agents", () => {
    it("rejects without auth → 401", async () => {
      const res = await request("POST", "/api/agents", { body: {} });
      expect(res.status).toBe(401);
    });

    it("creates an agent with name + identifier from body", async () => {
      services.createAgent.mockImplementation(async () => ({
        id: "a_new",
        name: "New Agent",
        identifier: "new-agent",
      }));

      const res = await request("POST", "/api/agents", {
        ...authed(),
        body: { name: "New Agent", identifier: "new-agent" },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: string };
      expect(body.id).toBe("a_new");
      expect(services.createAgent).toHaveBeenCalledWith(
        TEST_ACCOUNT,
        "New Agent",
        "new-agent",
      );
    });
  });

  // ── GET /api/agents/default ──────────────────────────────────────────
  describe("GET /api/agents/default", () => {
    it("rejects without auth → 401", async () => {
      const res = await request("GET", "/api/agents/default");
      expect(res.status).toBe(401);
    });

    it("returns the default agent when one exists", async () => {
      services.getDefaultAgent.mockImplementation(async () => ({
        id: "a_default",
        name: "Default Agent",
        isDefault: true,
      }));

      const res = await request("GET", "/api/agents/default", authed());
      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: string; isDefault: boolean };
      expect(body.id).toBe("a_default");
      expect(body.isDefault).toBe(true);
      expect(services.getDefaultAgent).toHaveBeenCalledWith(TEST_ACCOUNT);
    });

    it("returns 404 when there is no default agent", async () => {
      services.getDefaultAgent.mockImplementation(async () => null);

      const res = await request("GET", "/api/agents/default", authed());
      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Default agent not found");
    });
  });

  // ── PATCH /api/agents/:agentId ───────────────────────────────────────
  describe("PATCH /api/agents/:agentId", () => {
    it("rejects without auth → 401", async () => {
      const res = await request("PATCH", "/api/agents/a1", {
        body: { name: "x" },
      });
      expect(res.status).toBe(401);
    });

    it("renames an agent with accountId + agentId + name forwarded", async () => {
      const res = await request("PATCH", "/api/agents/a_target", {
        ...authed(),
        body: { name: "Renamed" },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { success: boolean };
      expect(body.success).toBe(true);
      expect(services.renameAgent).toHaveBeenCalledWith(
        TEST_ACCOUNT,
        "a_target",
        "Renamed",
      );
    });
  });

  // ── DELETE /api/agents/:agentId ──────────────────────────────────────
  describe("DELETE /api/agents/:agentId", () => {
    it("rejects without auth → 401", async () => {
      const res = await request("DELETE", "/api/agents/a1");
      expect(res.status).toBe(401);
    });

    it("deletes an agent and returns 204", async () => {
      const res = await request("DELETE", "/api/agents/a_doomed", authed());
      expect(res.status).toBe(204);
      expect(services.deleteAgent).toHaveBeenCalledWith(
        TEST_ACCOUNT,
        "a_doomed",
      );
    });
  });

  // ── POST /api/agents/:agentId/regenerate-token ───────────────────────
  describe("POST /api/agents/:agentId/regenerate-token", () => {
    it("rejects without auth → 401", async () => {
      const res = await request("POST", "/api/agents/a1/regenerate-token");
      expect(res.status).toBe(401);
    });

    it("regenerates the token and returns the new value", async () => {
      services.regenerateAgentToken.mockImplementation(async () => ({
        accessToken: "tok_brand_new",
      }));

      const res = await request(
        "POST",
        "/api/agents/a_target/regenerate-token",
        authed(),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { accessToken: string };
      expect(body.accessToken).toBe("tok_brand_new");
      expect(services.regenerateAgentToken).toHaveBeenCalledWith(
        TEST_ACCOUNT,
        "a_target",
      );
    });
  });

  // ── PATCH /api/agents/:agentId/secret-mode ───────────────────────────
  describe("PATCH /api/agents/:agentId/secret-mode", () => {
    it("rejects without auth → 401", async () => {
      const res = await request("PATCH", "/api/agents/a1/secret-mode", {
        body: { mode: "all" },
      });
      expect(res.status).toBe(401);
    });

    it("updates the secret mode with accountId + agentId + mode", async () => {
      const res = await request("PATCH", "/api/agents/a_target/secret-mode", {
        ...authed(),
        body: { mode: "selective" },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { success: boolean };
      expect(body.success).toBe(true);
      expect(services.updateAgentSecretMode).toHaveBeenCalledWith(
        TEST_ACCOUNT,
        "a_target",
        "selective",
      );
    });
  });

  // ── GET /api/agents/:agentId/secrets ─────────────────────────────────
  describe("GET /api/agents/:agentId/secrets", () => {
    it("rejects without auth → 401", async () => {
      const res = await request("GET", "/api/agents/a1/secrets");
      expect(res.status).toBe(401);
    });

    it("returns the agent's secrets list", async () => {
      services.getAgentSecrets.mockImplementation(async () => [
        { id: "s1", name: "Secret 1" },
        { id: "s2", name: "Secret 2" },
      ]);

      const res = await request(
        "GET",
        "/api/agents/a_target/secrets",
        authed(),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as Array<{ id: string }>;
      expect(body).toHaveLength(2);
      expect(services.getAgentSecrets).toHaveBeenCalledWith(
        TEST_ACCOUNT,
        "a_target",
      );
    });
  });

  // ── PUT /api/agents/:agentId/secrets ─────────────────────────────────
  describe("PUT /api/agents/:agentId/secrets", () => {
    it("rejects without auth → 401", async () => {
      const res = await request("PUT", "/api/agents/a1/secrets", {
        body: { secretIds: [] },
      });
      expect(res.status).toBe(401);
    });

    it("updates the agent's secrets with accountId + agentId + secretIds", async () => {
      const res = await request("PUT", "/api/agents/a_target/secrets", {
        ...authed(),
        body: { secretIds: ["s1", "s2", "s3"] },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { success: boolean };
      expect(body.success).toBe(true);
      expect(services.updateAgentSecrets).toHaveBeenCalledWith(
        TEST_ACCOUNT,
        "a_target",
        ["s1", "s2", "s3"],
      );
    });
  });
});

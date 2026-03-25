import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb, type MockDb } from "../helpers/mock-db";

let mockDb: MockDb;

mock.module("@onecli/db", () => {
  mockDb = createMockDb();
  return { db: mockDb };
});

mock.module("@onecli/db/id", () => ({
  generateId: () => "mock-id",
}));

mock.module("@onecli/db/errors", () => ({
  isUniqueViolation: (err: unknown) =>
    err instanceof Error && "code" in err && (err as any).code === "23505",
}));

import {
  generateAccessToken,
  listAgents,
  getDefaultAgent,
  createAgent,
  deleteAgent,
  renameAgent,
  regenerateAgentToken,
  getAgentSecrets,
  updateAgentSecretMode,
  updateAgentSecrets,
} from "../../services/agent-service";
import { ServiceError } from "../../services/errors";

const ACCOUNT_ID = "acc_test123";
const AGENT_ID = "agent_test456";

describe("agent-service", () => {
  beforeEach(() => {
    mockDb = createMockDb();
    const dbMod = require("@onecli/db");
    Object.assign(dbMod.db, mockDb);
  });

  describe("generateAccessToken", () => {
    it("should generate token with aoc_ prefix", () => {
      const token = generateAccessToken();
      expect(token.startsWith("aoc_")).toBe(true);
    });

    it("should generate 64 hex chars after prefix (32 bytes)", () => {
      const token = generateAccessToken();
      const hex = token.slice(4);
      expect(hex).toMatch(/^[0-9a-f]{64}$/);
    });

    it("should generate unique tokens", () => {
      const token1 = generateAccessToken();
      const token2 = generateAccessToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe("listAgents", () => {
    it("should return agents with secretMode cast", async () => {
      mockDb.queueResult([
        {
          id: "1",
          name: "Agent 1",
          identifier: "agent-1",
          accessToken: "aoc_abc",
          isDefault: true,
          secretMode: "all",
          createdAt: new Date(),
          agentSecretsCount: 2,
        },
      ]);

      const result = await listAgents(ACCOUNT_ID);
      expect(result).toHaveLength(1);
      expect(result[0]!.secretMode).toBe("all");
      expect(result[0]!._count.agentSecrets).toBe(2);
    });
  });

  describe("createAgent", () => {
    it("should reject empty name", async () => {
      try {
        await createAgent(ACCOUNT_ID, "   ", "my-agent");
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ServiceError);
        expect((e as ServiceError).code).toBe("BAD_REQUEST");
      }
    });

    it("should reject name longer than 255 chars", async () => {
      try {
        await createAgent(ACCOUNT_ID, "a".repeat(256), "my-agent");
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ServiceError);
        expect((e as ServiceError).code).toBe("BAD_REQUEST");
      }
    });

    it("should reject invalid identifier (starts with number)", async () => {
      try {
        await createAgent(ACCOUNT_ID, "My Agent", "1-invalid");
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ServiceError);
        expect((e as ServiceError).code).toBe("BAD_REQUEST");
      }
    });

    it("should reject invalid identifier (uppercase)", async () => {
      try {
        await createAgent(ACCOUNT_ID, "My Agent", "MyAgent");
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ServiceError);
        expect((e as ServiceError).code).toBe("BAD_REQUEST");
      }
    });

    it("should reject duplicate identifier", async () => {
      mockDb.queueResult({ id: "existing" }); // existing agent found

      try {
        await createAgent(ACCOUNT_ID, "My Agent", "my-agent");
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ServiceError);
        expect((e as ServiceError).code).toBe("CONFLICT");
      }
    });

    it("should create agent and auto-assign anthropic secret", async () => {
      mockDb.queueResult(undefined); // no duplicate
      mockDb.queueResult({
        id: "new-agent",
        name: "My Agent",
        identifier: "my-agent",
        createdAt: new Date(),
      }); // insertInto returning
      mockDb.queueResult({ id: "secret-1" }); // anthropic secret found

      const result = await createAgent(ACCOUNT_ID, "My Agent", "my-agent");
      expect(result.id).toBe("new-agent");
    });

    it("should create agent without auto-assign if no anthropic secret", async () => {
      mockDb.queueResult(undefined); // no duplicate
      mockDb.queueResult({
        id: "new-agent",
        name: "My Agent",
        identifier: "my-agent",
        createdAt: new Date(),
      }); // insertInto returning
      mockDb.queueResult(undefined); // no anthropic secret

      const result = await createAgent(ACCOUNT_ID, "My Agent", "my-agent");
      expect(result.id).toBe("new-agent");
    });
  });

  describe("deleteAgent", () => {
    it("should throw NOT_FOUND for missing agent", async () => {
      mockDb.queueResult(undefined);

      try {
        await deleteAgent(ACCOUNT_ID, AGENT_ID);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ServiceError);
        expect((e as ServiceError).code).toBe("NOT_FOUND");
      }
    });

    it("should reject deleting the default agent", async () => {
      mockDb.queueResult({ id: AGENT_ID, isDefault: true });

      try {
        await deleteAgent(ACCOUNT_ID, AGENT_ID);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ServiceError);
        expect((e as ServiceError).code).toBe("BAD_REQUEST");
        expect((e as ServiceError).message).toContain("default agent");
      }
    });

    it("should delete a non-default agent", async () => {
      mockDb.queueResult({ id: AGENT_ID, isDefault: false });

      await deleteAgent(ACCOUNT_ID, AGENT_ID);
      // Success — no error thrown
    });
  });

  describe("renameAgent", () => {
    it("should reject empty name", async () => {
      try {
        await renameAgent(ACCOUNT_ID, AGENT_ID, "");
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as ServiceError).code).toBe("BAD_REQUEST");
      }
    });

    it("should rename agent successfully", async () => {
      mockDb.queueResult({ id: AGENT_ID }); // found

      await renameAgent(ACCOUNT_ID, AGENT_ID, "New Name");
      // Success — no error thrown
    });

    it("should throw NOT_FOUND for missing agent", async () => {
      mockDb.queueResult(undefined);

      try {
        await renameAgent(ACCOUNT_ID, AGENT_ID, "New Name");
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as ServiceError).code).toBe("NOT_FOUND");
      }
    });
  });

  describe("regenerateAgentToken", () => {
    it("should throw NOT_FOUND for missing agent", async () => {
      mockDb.queueResult(undefined);

      try {
        await regenerateAgentToken(ACCOUNT_ID, AGENT_ID);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as ServiceError).code).toBe("NOT_FOUND");
      }
    });

    it("should return new access token", async () => {
      mockDb.queueResult({ id: AGENT_ID }); // found
      mockDb.queueResult({ accessToken: "aoc_newtokenabc123" }); // update returning

      const result = await regenerateAgentToken(ACCOUNT_ID, AGENT_ID);
      expect(result.accessToken).toBe("aoc_newtokenabc123");
    });
  });

  describe("getAgentSecrets", () => {
    it("should throw NOT_FOUND for missing agent", async () => {
      mockDb.queueResult(undefined);

      try {
        await getAgentSecrets(ACCOUNT_ID, AGENT_ID);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as ServiceError).code).toBe("NOT_FOUND");
      }
    });

    it("should return secret IDs", async () => {
      mockDb.queueResult({ id: AGENT_ID }); // agent found
      mockDb.queueResult([{ secretId: "s1" }, { secretId: "s2" }]); // agentSecrets

      const result = await getAgentSecrets(ACCOUNT_ID, AGENT_ID);
      expect(result).toEqual(["s1", "s2"]);
    });
  });

  describe("updateAgentSecretMode", () => {
    it("should throw NOT_FOUND for missing agent", async () => {
      mockDb.queueResult(undefined);

      try {
        await updateAgentSecretMode(ACCOUNT_ID, AGENT_ID, "all");
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as ServiceError).code).toBe("NOT_FOUND");
      }
    });

    it("should update secret mode", async () => {
      mockDb.queueResult({ id: AGENT_ID, secretMode: "selective" }); // found

      await updateAgentSecretMode(ACCOUNT_ID, AGENT_ID, "all");
      // Success — no error thrown
    });
  });

  describe("updateAgentSecrets", () => {
    it("should throw NOT_FOUND for missing agent", async () => {
      mockDb.queueResult(undefined);

      try {
        await updateAgentSecrets(ACCOUNT_ID, AGENT_ID, ["s1"]);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as ServiceError).code).toBe("NOT_FOUND");
      }
    });

    it("should throw BAD_REQUEST for secrets not in account", async () => {
      mockDb.queueResult({ id: AGENT_ID }); // agent found
      mockDb.queueResult([{ id: "s1" }]); // only s1 found

      try {
        await updateAgentSecrets(ACCOUNT_ID, AGENT_ID, ["s1", "s2"]);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as ServiceError).code).toBe("BAD_REQUEST");
        expect((e as ServiceError).message).toContain("not found");
      }
    });

    it("should replace secrets via transaction", async () => {
      mockDb.queueResult({ id: AGENT_ID }); // agent found
      mockDb.queueResult([{ id: "s1" }, { id: "s2" }]); // secrets validated

      await updateAgentSecrets(ACCOUNT_ID, AGENT_ID, ["s1", "s2"]);
      // Success — transaction executed without error
    });
  });
});

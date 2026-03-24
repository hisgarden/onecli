import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb, type MockDb } from "../helpers/mock-db";

// Mock @onecli/db before importing service
let mockDb: MockDb;

mock.module("@onecli/db", () => {
  mockDb = createMockDb();
  return {
    db: mockDb,
    Prisma: {
      PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
        code: string;
        constructor(message: string, { code }: { code: string }) {
          super(message);
          this.code = code;
        }
      },
    },
  };
});

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
    // Re-wire the mock module's db reference
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
      const agents = [
        {
          id: "1",
          name: "Agent 1",
          identifier: "agent-1",
          accessToken: "aoc_abc",
          isDefault: true,
          secretMode: "all",
          createdAt: new Date(),
          _count: { agentSecrets: 2 },
        },
      ];
      mockDb.agent.findMany.mockResolvedValueOnce(agents);

      const result = await listAgents(ACCOUNT_ID);
      expect(result).toHaveLength(1);
      expect(result[0]!.secretMode).toBe("all");
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
      mockDb.agent.findFirst.mockResolvedValueOnce({ id: "existing" });

      try {
        await createAgent(ACCOUNT_ID, "My Agent", "my-agent");
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ServiceError);
        expect((e as ServiceError).code).toBe("CONFLICT");
      }
    });

    it("should create agent and auto-assign anthropic secret", async () => {
      mockDb.agent.findFirst.mockResolvedValueOnce(null); // no duplicate
      mockDb.agent.create.mockResolvedValueOnce({
        id: "new-agent",
        name: "My Agent",
        identifier: "my-agent",
        createdAt: new Date(),
      });
      mockDb.secret.findFirst.mockResolvedValueOnce({ id: "secret-1" });
      mockDb.agentSecret.create.mockResolvedValueOnce({});

      const result = await createAgent(ACCOUNT_ID, "My Agent", "my-agent");
      expect(result.id).toBe("new-agent");
      expect(mockDb.agentSecret.create).toHaveBeenCalled();
    });

    it("should create agent without auto-assign if no anthropic secret", async () => {
      mockDb.agent.findFirst.mockResolvedValueOnce(null);
      mockDb.agent.create.mockResolvedValueOnce({
        id: "new-agent",
        name: "My Agent",
        identifier: "my-agent",
        createdAt: new Date(),
      });
      mockDb.secret.findFirst.mockResolvedValueOnce(null); // no anthropic secret

      const result = await createAgent(ACCOUNT_ID, "My Agent", "my-agent");
      expect(result.id).toBe("new-agent");
      expect(mockDb.agentSecret.create).not.toHaveBeenCalled();
    });
  });

  describe("deleteAgent", () => {
    it("should throw NOT_FOUND for missing agent", async () => {
      mockDb.agent.findFirst.mockResolvedValueOnce(null);

      try {
        await deleteAgent(ACCOUNT_ID, AGENT_ID);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ServiceError);
        expect((e as ServiceError).code).toBe("NOT_FOUND");
      }
    });

    it("should reject deleting the default agent", async () => {
      mockDb.agent.findFirst.mockResolvedValueOnce({
        id: AGENT_ID,
        isDefault: true,
      });

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
      mockDb.agent.findFirst.mockResolvedValueOnce({
        id: AGENT_ID,
        isDefault: false,
      });

      await deleteAgent(ACCOUNT_ID, AGENT_ID);
      expect(mockDb.agent.delete).toHaveBeenCalled();
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
      mockDb.agent.findFirst.mockResolvedValueOnce({ id: AGENT_ID });

      await renameAgent(ACCOUNT_ID, AGENT_ID, "New Name");
      expect(mockDb.agent.update).toHaveBeenCalled();
    });

    it("should throw NOT_FOUND for missing agent", async () => {
      mockDb.agent.findFirst.mockResolvedValueOnce(null);

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
      mockDb.agent.findFirst.mockResolvedValueOnce(null);

      try {
        await regenerateAgentToken(ACCOUNT_ID, AGENT_ID);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as ServiceError).code).toBe("NOT_FOUND");
      }
    });

    it("should return new access token", async () => {
      mockDb.agent.findFirst.mockResolvedValueOnce({ id: AGENT_ID });
      mockDb.agent.update.mockResolvedValueOnce({
        accessToken: "aoc_newtokenabc123",
      });

      const result = await regenerateAgentToken(ACCOUNT_ID, AGENT_ID);
      expect(result.accessToken).toBe("aoc_newtokenabc123");
    });
  });

  describe("getAgentSecrets", () => {
    it("should throw NOT_FOUND for missing agent", async () => {
      mockDb.agent.findFirst.mockResolvedValueOnce(null);

      try {
        await getAgentSecrets(ACCOUNT_ID, AGENT_ID);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as ServiceError).code).toBe("NOT_FOUND");
      }
    });

    it("should return secret IDs", async () => {
      mockDb.agent.findFirst.mockResolvedValueOnce({ id: AGENT_ID });
      mockDb.agentSecret.findMany.mockResolvedValueOnce([
        { secretId: "s1" },
        { secretId: "s2" },
      ]);

      const result = await getAgentSecrets(ACCOUNT_ID, AGENT_ID);
      expect(result).toEqual(["s1", "s2"]);
    });
  });

  describe("updateAgentSecretMode", () => {
    it("should throw NOT_FOUND for missing agent", async () => {
      mockDb.agent.findFirst.mockResolvedValueOnce(null);

      try {
        await updateAgentSecretMode(ACCOUNT_ID, AGENT_ID, "all");
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as ServiceError).code).toBe("NOT_FOUND");
      }
    });

    it("should update secret mode", async () => {
      mockDb.agent.findFirst.mockResolvedValueOnce({ id: AGENT_ID });

      await updateAgentSecretMode(ACCOUNT_ID, AGENT_ID, "all");
      expect(mockDb.agent.update).toHaveBeenCalled();
    });
  });

  describe("updateAgentSecrets", () => {
    it("should throw NOT_FOUND for missing agent", async () => {
      mockDb.agent.findFirst.mockResolvedValueOnce(null);

      try {
        await updateAgentSecrets(ACCOUNT_ID, AGENT_ID, ["s1"]);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as ServiceError).code).toBe("NOT_FOUND");
      }
    });

    it("should throw BAD_REQUEST for secrets not in account", async () => {
      mockDb.agent.findFirst.mockResolvedValueOnce({ id: AGENT_ID });
      mockDb.secret.findMany.mockResolvedValueOnce([{ id: "s1" }]); // only s1 found

      try {
        await updateAgentSecrets(ACCOUNT_ID, AGENT_ID, ["s1", "s2"]);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as ServiceError).code).toBe("BAD_REQUEST");
        expect((e as ServiceError).message).toContain("not found");
      }
    });

    it("should replace secrets via transaction", async () => {
      mockDb.agent.findFirst.mockResolvedValueOnce({ id: AGENT_ID });
      mockDb.secret.findMany.mockResolvedValueOnce([
        { id: "s1" },
        { id: "s2" },
      ]);

      await updateAgentSecrets(ACCOUNT_ID, AGENT_ID, ["s1", "s2"]);
      expect(mockDb.$transaction).toHaveBeenCalled();
    });
  });
});

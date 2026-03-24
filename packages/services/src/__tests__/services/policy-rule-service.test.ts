import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb, type MockDb } from "../helpers/mock-db";

let mockDb: MockDb;

mock.module("@onecli/db", () => {
  mockDb = createMockDb();
  return { db: mockDb, Prisma: {} };
});

import {
  listPolicyRules,
  createPolicyRule,
  updatePolicyRule,
  deletePolicyRule,
} from "../../services/policy-rule-service";
import { ServiceError } from "../../services/errors";

const ACCOUNT_ID = "acc_test123";
const RULE_ID = "rule_test456";
const AGENT_ID = "agent_test789";

describe("policy-rule-service", () => {
  beforeEach(() => {
    mockDb = createMockDb();
    const dbMod = require("@onecli/db");
    Object.assign(dbMod.db, mockDb);
  });

  describe("listPolicyRules", () => {
    it("should return policy rules for account", async () => {
      const rules = [
        {
          id: "1",
          name: "Block OpenAI",
          hostPattern: "api.openai.com",
          pathPattern: null,
          method: null,
          action: "block",
          enabled: true,
          agentId: null,
          rateLimit: null,
          rateLimitWindow: null,
          createdAt: new Date(),
        },
      ];
      mockDb.policyRule.findMany.mockResolvedValueOnce(rules);

      const result = await listPolicyRules(ACCOUNT_ID);
      expect(result).toHaveLength(1);
      expect(result[0]!.action).toBe("block");
    });
  });

  describe("createPolicyRule", () => {
    it("should validate agent belongs to account", async () => {
      mockDb.agent.findFirst.mockResolvedValueOnce(null); // agent not found

      try {
        await createPolicyRule(ACCOUNT_ID, {
          name: "Rate Limit",
          hostPattern: "api.example.com",
          action: "rate_limit",
          enabled: true,
          agentId: "nonexistent-agent",
          rateLimit: 100,
          rateLimitWindow: "minute",
        });
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as ServiceError).code).toBe("NOT_FOUND");
        expect((e as ServiceError).message).toContain("Agent");
      }
    });

    it("should create a block rule", async () => {
      mockDb.policyRule.create.mockResolvedValueOnce({
        id: "new-rule",
        name: "Block OpenAI",
        hostPattern: "api.openai.com",
        pathPattern: null,
        method: null,
        action: "block",
        enabled: true,
        agentId: null,
        rateLimit: null,
        rateLimitWindow: null,
        createdAt: new Date(),
      });

      const result = await createPolicyRule(ACCOUNT_ID, {
        name: "Block OpenAI",
        hostPattern: "api.openai.com",
        action: "block",
        enabled: true,
      });

      expect(result.id).toBe("new-rule");
      expect(result.action).toBe("block");
    });

    it("should create a rate_limit rule with limit fields", async () => {
      mockDb.policyRule.create.mockResolvedValueOnce({
        id: "new-rule",
        name: "Rate Limit API",
        hostPattern: "api.example.com",
        pathPattern: "/v1/*",
        method: "POST",
        action: "rate_limit",
        enabled: true,
        agentId: null,
        rateLimit: 100,
        rateLimitWindow: "minute",
        createdAt: new Date(),
      });

      const result = await createPolicyRule(ACCOUNT_ID, {
        name: "Rate Limit API",
        hostPattern: "api.example.com",
        pathPattern: "/v1/*",
        method: "POST",
        action: "rate_limit",
        enabled: true,
        rateLimit: 100,
        rateLimitWindow: "minute",
      });

      expect(result.rateLimit).toBe(100);
      expect(result.rateLimitWindow).toBe("minute");
    });

    it("should null rate limit fields when action is block", async () => {
      mockDb.policyRule.create.mockResolvedValueOnce({
        id: "new-rule",
        name: "Block",
        hostPattern: "api.example.com",
        pathPattern: null,
        method: null,
        action: "block",
        enabled: true,
        agentId: null,
        rateLimit: null,
        rateLimitWindow: null,
        createdAt: new Date(),
      });

      await createPolicyRule(ACCOUNT_ID, {
        name: "Block",
        hostPattern: "api.example.com",
        action: "block",
        enabled: true,
      });

      const createCall = mockDb.policyRule.create.mock.calls[0]![0] as {
        data: { rateLimit: number | null; rateLimitWindow: string | null };
      };
      expect(createCall.data.rateLimit).toBeNull();
      expect(createCall.data.rateLimitWindow).toBeNull();
    });

    it("should create rule scoped to agent", async () => {
      mockDb.agent.findFirst.mockResolvedValueOnce({ id: AGENT_ID });
      mockDb.policyRule.create.mockResolvedValueOnce({
        id: "new-rule",
        name: "Agent Block",
        hostPattern: "api.example.com",
        pathPattern: null,
        method: null,
        action: "block",
        enabled: true,
        agentId: AGENT_ID,
        rateLimit: null,
        rateLimitWindow: null,
        createdAt: new Date(),
      });

      const result = await createPolicyRule(ACCOUNT_ID, {
        name: "Agent Block",
        hostPattern: "api.example.com",
        action: "block",
        enabled: true,
        agentId: AGENT_ID,
      });

      expect(result.agentId).toBe(AGENT_ID);
    });
  });

  describe("updatePolicyRule", () => {
    it("should throw NOT_FOUND for missing rule", async () => {
      mockDb.policyRule.findFirst.mockResolvedValueOnce(null);

      try {
        await updatePolicyRule(ACCOUNT_ID, RULE_ID, { name: "Updated" });
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as ServiceError).code).toBe("NOT_FOUND");
      }
    });

    it("should validate agent on agentId change", async () => {
      mockDb.policyRule.findFirst.mockResolvedValueOnce({ id: RULE_ID });
      mockDb.agent.findFirst.mockResolvedValueOnce(null); // agent not in account

      try {
        await updatePolicyRule(ACCOUNT_ID, RULE_ID, {
          agentId: "nonexistent",
        });
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as ServiceError).code).toBe("NOT_FOUND");
      }
    });

    it("should clear rate limit fields when changing action to block", async () => {
      mockDb.policyRule.findFirst.mockResolvedValueOnce({ id: RULE_ID });

      await updatePolicyRule(ACCOUNT_ID, RULE_ID, { action: "block" });

      const updateCall = mockDb.policyRule.update.mock.calls[0]![0] as {
        data: { action: string; rateLimit: null; rateLimitWindow: null };
      };
      expect(updateCall.data.action).toBe("block");
      expect(updateCall.data.rateLimit).toBeNull();
      expect(updateCall.data.rateLimitWindow).toBeNull();
    });

    it("should update name only", async () => {
      mockDb.policyRule.findFirst.mockResolvedValueOnce({ id: RULE_ID });

      await updatePolicyRule(ACCOUNT_ID, RULE_ID, { name: "  Updated  " });

      const updateCall = mockDb.policyRule.update.mock.calls[0]![0] as {
        data: { name: string };
      };
      expect(updateCall.data.name).toBe("Updated");
    });
  });

  describe("deletePolicyRule", () => {
    it("should throw NOT_FOUND for missing rule", async () => {
      mockDb.policyRule.findFirst.mockResolvedValueOnce(null);

      try {
        await deletePolicyRule(ACCOUNT_ID, RULE_ID);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as ServiceError).code).toBe("NOT_FOUND");
      }
    });

    it("should delete existing rule", async () => {
      mockDb.policyRule.findFirst.mockResolvedValueOnce({ id: RULE_ID });

      await deletePolicyRule(ACCOUNT_ID, RULE_ID);
      expect(mockDb.policyRule.delete).toHaveBeenCalled();
    });
  });
});

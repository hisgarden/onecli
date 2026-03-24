import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb, type MockDb } from "../helpers/mock-db";

let mockDb: MockDb;

mock.module("@onecli/db", () => {
  mockDb = createMockDb();
  return { db: mockDb, Prisma: {} };
});

import {
  generateApiKey,
  getApiKey,
  regenerateApiKey,
} from "../../services/api-key-service";
import { ServiceError } from "../../services/errors";

const USER_ID = "user_test123";
const ACCOUNT_ID = "acc_test456";

describe("api-key-service", () => {
  beforeEach(() => {
    mockDb = createMockDb();
    const dbMod = require("@onecli/db");
    Object.assign(dbMod.db, mockDb);
  });

  describe("generateApiKey", () => {
    it("should generate key with oc_ prefix", () => {
      const key = generateApiKey();
      expect(key.startsWith("oc_")).toBe(true);
    });

    it("should generate 64 hex chars after prefix (32 bytes)", () => {
      const key = generateApiKey();
      const hex = key.slice(3);
      expect(hex).toMatch(/^[0-9a-f]{64}$/);
    });

    it("should generate unique keys", () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();
      expect(key1).not.toBe(key2);
    });
  });

  describe("getApiKey", () => {
    it("should return key when found", async () => {
      mockDb.apiKey.findFirst.mockResolvedValueOnce({ key: "oc_abc123" });

      const result = await getApiKey(USER_ID, ACCOUNT_ID);
      expect(result.apiKey).toBe("oc_abc123");
    });

    it("should throw NOT_FOUND when no key exists", async () => {
      mockDb.apiKey.findFirst.mockResolvedValueOnce(null);

      try {
        await getApiKey(USER_ID, ACCOUNT_ID);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as ServiceError).code).toBe("NOT_FOUND");
      }
    });
  });

  describe("regenerateApiKey", () => {
    it("should update existing key", async () => {
      mockDb.apiKey.findFirst.mockResolvedValueOnce({ id: "existing-key-id" });

      const result = await regenerateApiKey(USER_ID, ACCOUNT_ID);
      expect(result.apiKey.startsWith("oc_")).toBe(true);
      expect(mockDb.apiKey.update).toHaveBeenCalled();
      expect(mockDb.apiKey.create).not.toHaveBeenCalled();
    });

    it("should create new key when none exists", async () => {
      mockDb.apiKey.findFirst.mockResolvedValueOnce(null);

      const result = await regenerateApiKey(USER_ID, ACCOUNT_ID);
      expect(result.apiKey.startsWith("oc_")).toBe(true);
      expect(mockDb.apiKey.create).toHaveBeenCalled();
      expect(mockDb.apiKey.update).not.toHaveBeenCalled();
    });
  });
});

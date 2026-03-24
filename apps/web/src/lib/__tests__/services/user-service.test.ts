import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb, type MockDb } from "../helpers/mock-db";

let mockDb: MockDb;

mock.module("@onecli/db", () => {
  mockDb = createMockDb();
  return { db: mockDb, Prisma: {} };
});

import { getUser, updateProfile } from "@/lib/services/user-service";
import { ServiceError } from "@/lib/services/errors";

const USER_ID = "user_test123";

describe("user-service", () => {
  beforeEach(() => {
    mockDb = createMockDb();
    const dbMod = require("@onecli/db");
    Object.assign(dbMod.db, mockDb);
  });

  describe("getUser", () => {
    it("should return user when found", async () => {
      const user = {
        id: USER_ID,
        email: "test@example.com",
        name: "Test User",
        createdAt: new Date(),
      };
      mockDb.user.findUnique.mockResolvedValueOnce(user);

      const result = await getUser(USER_ID);
      expect(result.id).toBe(USER_ID);
      expect(result.email).toBe("test@example.com");
    });

    it("should throw NOT_FOUND when user missing", async () => {
      mockDb.user.findUnique.mockResolvedValueOnce(null);

      try {
        await getUser(USER_ID);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as ServiceError).code).toBe("NOT_FOUND");
      }
    });
  });

  describe("updateProfile", () => {
    it("should reject empty name", async () => {
      try {
        await updateProfile(USER_ID, "   ");
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as ServiceError).code).toBe("BAD_REQUEST");
      }
    });

    it("should reject name longer than 255 chars", async () => {
      try {
        await updateProfile(USER_ID, "a".repeat(256));
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as ServiceError).code).toBe("BAD_REQUEST");
      }
    });

    it("should trim and update name", async () => {
      mockDb.user.update.mockResolvedValueOnce({
        id: USER_ID,
        email: "test@example.com",
        name: "New Name",
      });

      const result = await updateProfile(USER_ID, "  New Name  ");
      expect(result.name).toBe("New Name");
    });
  });
});

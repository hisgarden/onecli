import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb, type MockDb } from "./helpers/mock-db";

let mockDb: MockDb;

mock.module("@onecli/db", () => {
  mockDb = createMockDb();
  return { db: mockDb, Prisma: {} };
});

// Track validateApiKey and getServerSession mocks
const mockValidateApiKey = mock(() => Promise.resolve(null));
const mockGetServerSession = mock(() => Promise.resolve(null));

mock.module("@/lib/validate-api-key", () => ({
  validateApiKey: mockValidateApiKey,
}));

mock.module("@/lib/auth/server", () => ({
  getServerSession: mockGetServerSession,
}));

import { resolveApiAuth } from "@/lib/api-auth";

const USER_ID = "user_test123";
const ACCOUNT_ID = "acc_test456";

describe("resolveApiAuth", () => {
  beforeEach(() => {
    mockDb = createMockDb();
    const dbMod = require("@onecli/db");
    Object.assign(dbMod.db, mockDb);
    mockValidateApiKey.mockReset();
    mockGetServerSession.mockReset();
    mockValidateApiKey.mockResolvedValue(null);
    mockGetServerSession.mockResolvedValue(null);
  });

  it("should return API key auth when valid", async () => {
    mockValidateApiKey.mockResolvedValueOnce({
      userId: USER_ID,
      accountId: ACCOUNT_ID,
    });

    const request = new Request("http://localhost/api/test", {
      headers: { authorization: "Bearer oc_validkey" },
    });

    const result = await resolveApiAuth(request);
    expect(result).toEqual({ userId: USER_ID, accountId: ACCOUNT_ID });
    // Should not fall through to session auth
    expect(mockGetServerSession).not.toHaveBeenCalled();
  });

  it("should fall back to session auth when no API key", async () => {
    mockGetServerSession.mockResolvedValueOnce({ id: "ext-auth-id" });
    mockDb.user.findUnique.mockResolvedValueOnce({
      id: USER_ID,
      memberships: [{ accountId: ACCOUNT_ID }],
    });

    const request = new Request("http://localhost/api/test");
    const result = await resolveApiAuth(request);

    expect(result).toEqual({ userId: USER_ID, accountId: ACCOUNT_ID });
  });

  it("should return null when no session", async () => {
    const request = new Request("http://localhost/api/test");
    const result = await resolveApiAuth(request);
    expect(result).toBeNull();
  });

  it("should return null when user has no memberships", async () => {
    mockGetServerSession.mockResolvedValueOnce({ id: "ext-auth-id" });
    mockDb.user.findUnique.mockResolvedValueOnce({
      id: USER_ID,
      memberships: [],
    });

    const request = new Request("http://localhost/api/test");
    const result = await resolveApiAuth(request);
    expect(result).toBeNull();
  });

  it("should return null when user not found in db", async () => {
    mockGetServerSession.mockResolvedValueOnce({ id: "ext-auth-id" });
    mockDb.user.findUnique.mockResolvedValueOnce(null);

    const request = new Request("http://localhost/api/test");
    const result = await resolveApiAuth(request);
    expect(result).toBeNull();
  });
});

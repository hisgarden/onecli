import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb, type MockDb } from "./helpers/mock-db";

let mockDb: MockDb;

mock.module("@onecli/db", () => {
  mockDb = createMockDb();
  return { db: mockDb };
});

import { validateApiKey } from "../validate-api-key";

const USER_ID = "user_test123";
const ACCOUNT_ID = "acc_test456";

describe("validateApiKey", () => {
  beforeEach(() => {
    mockDb = createMockDb();
    const dbMod = require("@onecli/db");
    Object.assign(dbMod.db, mockDb);
  });

  it("should return null when no Authorization header", async () => {
    const request = new Request("http://localhost/api/test");
    const result = await validateApiKey(request);
    expect(result).toBeNull();
  });

  it("should return null for non-Bearer auth", async () => {
    const request = new Request("http://localhost/api/test", {
      headers: { authorization: "Basic abc123" },
    });
    const result = await validateApiKey(request);
    expect(result).toBeNull();
  });

  it("should return null for Bearer token without oc_ prefix", async () => {
    const request = new Request("http://localhost/api/test", {
      headers: { authorization: "Bearer sk-some-other-key" },
    });
    const result = await validateApiKey(request);
    expect(result).toBeNull();
  });

  it("should return null when key not found in database", async () => {
    mockDb.queueResult(undefined);

    const request = new Request("http://localhost/api/test", {
      headers: { authorization: "Bearer oc_notfound" },
    });
    const result = await validateApiKey(request);
    expect(result).toBeNull();
  });

  it("should return userId and accountId for valid key", async () => {
    mockDb.queueResult({ userId: USER_ID, accountId: ACCOUNT_ID });

    const request = new Request("http://localhost/api/test", {
      headers: { authorization: "Bearer oc_validkey123" },
    });
    const result = await validateApiKey(request);
    expect(result).toEqual({ userId: USER_ID, accountId: ACCOUNT_ID });
  });

  it("should trim whitespace from token", async () => {
    mockDb.queueResult({ userId: USER_ID, accountId: ACCOUNT_ID });

    const request = new Request("http://localhost/api/test", {
      headers: { authorization: "Bearer  oc_validkey123  " },
    });
    const result = await validateApiKey(request);
    expect(result).toEqual({ userId: USER_ID, accountId: ACCOUNT_ID });
  });
});

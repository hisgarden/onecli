/**
 * Routes: /api/user/*
 *
 *   GET    /api/user                       → getUser(userId)
 *   PATCH  /api/user                       → updateProfile(userId, name)
 *   GET    /api/user/api-key               → getApiKey(userId, accountId)
 *   POST   /api/user/api-key/regenerate    → regenerateApiKey(userId, accountId)
 *
 * Each route: 401 without auth + happy path + arg propagation.
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { services, mockDb, resetMocks, ServiceError } from "../helpers/preload";
import { request } from "../helpers/test-app";

const TEST_USER = "u_user_test";
const TEST_ACCOUNT = "a_user_test";

function authed() {
  mockDb.queueResult({ userId: TEST_USER, accountId: TEST_ACCOUNT });
  return { bearer: "oc_test" };
}

describe("user routes", () => {
  beforeEach(() => {
    resetMocks();
  });

  describe("GET /api/user", () => {
    it("rejects without auth → 401", async () => {
      const res = await request("GET", "/api/user");
      expect(res.status).toBe(401);
    });

    it("returns the user from getUser(userId)", async () => {
      services.getUser.mockImplementation(async () => ({
        id: TEST_USER,
        email: "user@example.com",
        name: "Test User",
      }));

      const res = await request("GET", "/api/user", authed());
      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: string; email: string };
      expect(body.id).toBe(TEST_USER);
      expect(body.email).toBe("user@example.com");
      expect(services.getUser).toHaveBeenCalledWith(TEST_USER);
    });

    it("propagates a ServiceError NOT_FOUND from the service → 404", async () => {
      services.getUser.mockImplementation(async () => {
        throw new ServiceError("NOT_FOUND", "user gone");
      });
      const res = await request("GET", "/api/user", authed());
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /api/user", () => {
    it("rejects without auth → 401", async () => {
      const res = await request("PATCH", "/api/user", { body: { name: "x" } });
      expect(res.status).toBe(401);
    });

    it("calls updateProfile with userId + name from body", async () => {
      services.updateProfile.mockImplementation(async () => ({
        id: TEST_USER,
        name: "New Name",
      }));

      const res = await request("PATCH", "/api/user", {
        ...authed(),
        body: { name: "New Name" },
      });
      expect(res.status).toBe(200);
      expect(services.updateProfile).toHaveBeenCalledWith(
        TEST_USER,
        "New Name",
      );
      const body = (await res.json()) as { name: string };
      expect(body.name).toBe("New Name");
    });
  });

  describe("GET /api/user/api-key", () => {
    it("rejects without auth → 401", async () => {
      const res = await request("GET", "/api/user/api-key");
      expect(res.status).toBe(401);
    });

    it("returns the api key from getApiKey(userId, accountId)", async () => {
      services.getApiKey.mockImplementation(async () => ({
        key: "oc_existing_key",
        createdAt: "2026-04-08T00:00:00.000Z",
      }));

      const res = await request("GET", "/api/user/api-key", authed());
      expect(res.status).toBe(200);
      const body = (await res.json()) as { key: string };
      expect(body.key).toBe("oc_existing_key");
      expect(services.getApiKey).toHaveBeenCalledWith(TEST_USER, TEST_ACCOUNT);
    });
  });

  describe("POST /api/user/api-key/regenerate", () => {
    it("rejects without auth → 401", async () => {
      const res = await request("POST", "/api/user/api-key/regenerate");
      expect(res.status).toBe(401);
    });

    it("returns the new api key from regenerateApiKey(userId, accountId)", async () => {
      services.regenerateApiKey.mockImplementation(async () => ({
        key: "oc_brand_new_key",
      }));

      const res = await request(
        "POST",
        "/api/user/api-key/regenerate",
        authed(),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { key: string };
      expect(body.key).toBe("oc_brand_new_key");
      expect(services.regenerateApiKey).toHaveBeenCalledWith(
        TEST_USER,
        TEST_ACCOUNT,
      );
    });
  });
});

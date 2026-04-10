/**
 * Global error handler tests.
 *
 * Verifies the `.onError(...)` handler in app.ts maps thrown errors to the
 * correct HTTP status codes. The handler distinguishes:
 *   - ServiceError → STATUS_MAP[code] (404 / 400 / 409 / 403)
 *   - Error("UNAUTHORIZED") → 401
 *   - anything else → 500
 *
 * We exercise these paths by stubbing a service function (listAgents) to
 * throw each error type, then calling GET /api/agents (which simply
 * delegates to listAgents).
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { services, mockDb, resetMocks, ServiceError } from "./helpers/preload";
import { request } from "./helpers/test-app";

/**
 * FakeZodError — matches the duck-type the error handler checks for.
 * We deliberately don't import zod (apps/api dropped that dep in Phase 1)
 * because the handler should recognize ZodError by shape, not by class
 * identity. This also avoids cross-module-boundary instanceof issues if
 * services and api ever drift to different zod versions.
 */
class FakeZodError extends Error {
  override name = "ZodError";
  issues: Array<{ path: Array<string | number>; message: string }>;
  constructor(
    issues: Array<{ path: Array<string | number>; message: string }>,
  ) {
    super("Validation failed");
    this.issues = issues;
  }
}

const TEST_USER = "u_test";
const TEST_ACCOUNT = "a_test";

function authenticatedRequest() {
  // validateApiKey() pulls one row from the db queue.
  mockDb.queueResult({ userId: TEST_USER, accountId: TEST_ACCOUNT });
  return request("GET", "/api/agents", { bearer: "oc_test_token" });
}

describe("global error handler", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("maps ServiceError NOT_FOUND → 404", async () => {
    services.listAgents.mockImplementation(async () => {
      throw new ServiceError("NOT_FOUND", "agent missing");
    });
    const res = await authenticatedRequest();
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("agent missing");
  });

  it("maps ServiceError BAD_REQUEST → 400", async () => {
    services.listAgents.mockImplementation(async () => {
      throw new ServiceError("BAD_REQUEST", "name is required");
    });
    const res = await authenticatedRequest();
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "name is required",
    );
  });

  it("maps ServiceError CONFLICT → 409", async () => {
    services.listAgents.mockImplementation(async () => {
      throw new ServiceError("CONFLICT", "duplicate identifier");
    });
    const res = await authenticatedRequest();
    expect(res.status).toBe(409);
  });

  it("maps ServiceError FORBIDDEN → 403", async () => {
    services.listAgents.mockImplementation(async () => {
      throw new ServiceError("FORBIDDEN", "not your account");
    });
    const res = await authenticatedRequest();
    expect(res.status).toBe(403);
  });

  it("maps Error('UNAUTHORIZED') → 401 (used by requireAuth guard)", async () => {
    // Send NO bearer token — requireAuth() throws Error("UNAUTHORIZED")
    const res = await request("GET", "/api/agents");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  it("maps ZodError → 400 with the validation issue messages", async () => {
    // Regression: the global error handler previously had no branch for
    // ZodError, so a body that failed schema parsing would fall through to
    // the generic 500 path. Routes call `schema.parse(body)` synchronously
    // and a failure throws ZodError, which the handler should now map to 400.
    services.listAgents.mockImplementation(async () => {
      throw new FakeZodError([
        { path: ["name"], message: "String must contain at least 1 char" },
      ]);
    });
    const res = await authenticatedRequest();
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    // The handler should surface a useful message — either the issue message
    // or a structured error object. We just assert it's not the generic
    // "Internal server error" string.
    expect(body.error).not.toBe("Internal server error");
    expect(body.error.length).toBeGreaterThan(0);
  });

  it("maps an unknown thrown error → 500 with generic message", async () => {
    services.listAgents.mockImplementation(async () => {
      throw new Error("something else broke");
    });
    // Suppress the console.error from the handler so test output stays clean.
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      const res = await authenticatedRequest();
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Internal server error");
    } finally {
      console.error = originalConsoleError;
    }
  });
});

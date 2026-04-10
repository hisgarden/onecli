/**
 * Test request helper.
 *
 * Wraps the Elysia app's `.handle(request)` method with an ergonomic API for
 * making test requests with auth, JSON bodies, and headers.
 *
 * Auth strategy: tests pass a `Bearer oc_test_<userId>_<accountId>` token,
 * and the test mock for db.selectFrom("apiKeys") (configured per-test via
 * mockState.db.queueResult) returns the corresponding userId/accountId.
 *
 * Tests that don't need auth simply omit the `auth` option.
 */
import { app } from "../../app";

const BASE = "http://test.local";

export interface RequestOptions {
  /** JSON body — will be stringified and sent with content-type: application/json */
  body?: unknown;
  /** Bearer token to send in Authorization header */
  bearer?: string;
  /** Additional headers */
  headers?: Record<string, string>;
}

/**
 * Make a request against the Elysia app under test.
 *
 * Returns the raw Response object so callers can inspect status, headers,
 * and body shape (use `await res.json()` or `await res.text()`).
 */
export async function request(
  method: string,
  path: string,
  opts: RequestOptions = {},
): Promise<Response> {
  const headers = new Headers(opts.headers ?? {});
  if (opts.bearer) {
    headers.set("authorization", `Bearer ${opts.bearer}`);
  }
  const init: RequestInit = { method, headers };
  if (opts.body !== undefined) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(opts.body);
  }
  return app.handle(new Request(`${BASE}${path}`, init));
}

/**
 * Build a test bearer token in the `oc_test_<userId>_<accountId>` format.
 * The mocked validateApiKey path needs the queued db result to map back
 * to these IDs.
 */
export function bearerToken(userId: string, accountId: string): string {
  return `oc_test_${userId}_${accountId}`;
}

export { app };

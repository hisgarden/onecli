/**
 * SPA fallback route tests.
 *
 * In production, `apps/api/src/index.ts` registers static SPA routes when
 * `apps/dashboard/dist/index.html` exists. These routes (GET / and GET *)
 * are intentionally NOT registered in `app.ts` (which tests import), so
 * this file only verifies that the test app does NOT accidentally serve a
 * fallback for unknown paths.
 *
 * The SPA fallback is conditionally loaded in `index.ts` via
 * `if (existsSync(SPA_DIR))`, which is verified in the dashboard's build
 * check (`bun run build` in CI). True E2E SPA serving is best tested via
 * the integration test harness or a deployed staging environment.
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { resetMocks } from "./helpers/preload";
import { request } from "./helpers/test-app";

describe("SPA fallback (app.ts, no SPA registered)", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("unknown path returns 404 when SPA is not registered", async () => {
    const res = await request("GET", "/some/random/path");
    expect(res.status).toBe(404);
  });

  it("root path / returns 404 when SPA is not registered", async () => {
    const res = await request("GET", "/");
    expect(res.status).toBe(404);
  });
});

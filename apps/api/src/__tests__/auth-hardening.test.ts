/**
 * Auth hardening tests — STRUCTURAL invariants only.
 *
 * These are intentionally grep-style assertions against the source. They
 * guard against accidental deletion of code paths that don't have full
 * behavior coverage elsewhere.
 *
 * Removed during Block C (replaced by behavior tests):
 *   - "uses Better Auth for session resolution"        → auth-middleware.test.ts
 *   - "validates oc_ prefix" / "checks Bearer header"  → auth-middleware.test.ts
 *   - "uses requireAuth for protected routes"          → error-handler.test.ts
 *   - "throws UNAUTHORIZED when not authenticated"     → error-handler.test.ts
 *
 * Kept here:
 *   - Better Auth mount + cookie cache + expiry + trustedOrigins
 *     (config-only, not exercised by behavior tests)
 *   - Local auth mode bootstrap signals
 *     (behavior tests deliberately set AUTH_MODE=test, so the local mode
 *     code path has no behavior coverage; these greps protect it)
 */
import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";

const SOURCE = readFileSync(resolve(__dirname, "../app.ts"), "utf-8");
const AUTH_SOURCE = readFileSync(resolve(__dirname, "../auth.ts"), "utf-8");

describe("Better Auth configuration", () => {
  it("mounts the Better Auth handler on the app", () => {
    expect(SOURCE).toContain(".mount(auth.handler)");
  });

  it("configures session cookie caching", () => {
    expect(AUTH_SOURCE).toContain("cookieCache");
  });

  it("sets session expiry to 24 hours", () => {
    expect(AUTH_SOURCE).toContain("expiresIn: 60 * 60 * 24");
  });

  it("configures trusted origins from CORS_ORIGIN", () => {
    expect(AUTH_SOURCE).toContain("trustedOrigins");
  });
});

describe("Local auth mode (no behavior coverage — grep-only guard)", () => {
  it("bootstraps a local user on first request when AUTH_MODE=local", () => {
    expect(SOURCE).toContain("resolveLocalAuth");
    expect(SOURCE).toContain("local@onecli.dev");
  });

  it("only activates in local AUTH_MODE", () => {
    expect(SOURCE).toContain('AUTH_MODE === "local"');
  });
});

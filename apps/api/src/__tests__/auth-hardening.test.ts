import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Auth hardening tests — verify that session cookie configuration in the
 * Elysia API matches the security requirements from Gap 6.
 *
 * These tests read the source file directly to ensure flags aren't
 * accidentally removed during refactoring (same approach as the NextAuth
 * cookie flag tests in apps/web).
 */

const SOURCE = readFileSync(resolve(__dirname, "../index.ts"), "utf-8");

describe("Session cookie flags", () => {
  it("should set HttpOnly on session cookie", () => {
    // The sessionCookie helper must include HttpOnly
    expect(SOURCE).toContain("HttpOnly; SameSite=Lax");
  });

  it("should set SameSite=Lax on session cookie", () => {
    expect(SOURCE).toContain("SameSite=Lax");
  });

  it("should use __Secure- prefix in production", () => {
    expect(SOURCE).toContain("__Secure-authjs.session-token");
  });

  it("should derive IS_SECURE from NODE_ENV or NEXTAUTH_URL", () => {
    expect(SOURCE).toContain('process.env.NODE_ENV === "production"');
    expect(SOURCE).toContain(
      'process.env.NEXTAUTH_URL?.startsWith("https://")',
    );
  });

  it("should set Secure flag when IS_SECURE is true", () => {
    // The sessionCookie function conditionally adds "; Secure"
    expect(SOURCE).toContain('IS_SECURE ? "; Secure" : ""');
  });
});

describe("JWT expiry", () => {
  it("should include exp claim when signing JWT", () => {
    // The /auth/callback route must set exp in the JWT payload
    expect(SOURCE).toContain(
      "exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE",
    );
  });

  it("should validate exp on verify", () => {
    // The derive block must check exp < now
    expect(SOURCE).toContain("exp < Math.floor(Date.now() / 1000)");
  });

  it("should define SESSION_MAX_AGE", () => {
    expect(SOURCE).toContain("SESSION_MAX_AGE = 86400");
  });
});

describe("CSRF protection", () => {
  it("should generate CSRF token on login", () => {
    expect(SOURCE).toContain("csrf: csrfToken");
  });

  it("should set CSRF cookie (not HttpOnly — readable by JS)", () => {
    // csrfCookie must NOT include HttpOnly
    const csrfCookieFn = SOURCE.match(/function csrfCookie[\s\S]*?^}/m)?.[0];
    expect(csrfCookieFn).toBeDefined();
    expect(csrfCookieFn).not.toContain("HttpOnly");
  });

  it("should validate X-CSRF-Token header on state-changing requests", () => {
    expect(SOURCE).toContain('request.headers.get("x-csrf-token")');
    expect(SOURCE).toContain("CSRF token mismatch");
  });

  it("should exempt API key auth from CSRF checks", () => {
    expect(SOURCE).toContain('authSource !== "cookie"');
  });

  it("should exempt GET/HEAD/OPTIONS from CSRF checks", () => {
    expect(SOURCE).toContain('"GET"');
    expect(SOURCE).toContain('"HEAD"');
    expect(SOURCE).toContain('"OPTIONS"');
  });
});

describe("Session refresh", () => {
  it("should have /api/auth/refresh endpoint", () => {
    expect(SOURCE).toContain("/api/auth/refresh");
  });

  it("should define SESSION_REFRESH_THRESHOLD", () => {
    expect(SOURCE).toContain("SESSION_REFRESH_THRESHOLD");
  });
});

describe("Signout clears all cookies", () => {
  it("should clear session and CSRF cookies on signout", () => {
    expect(SOURCE).toContain("clearSessionCookies");
    // clearSessionCookies must clear both session and CSRF
    const clearFn = SOURCE.match(
      /function clearSessionCookies[\s\S]*?^}/m,
    )?.[0];
    expect(clearFn).toBeDefined();
    expect(clearFn).toContain(SESSION_COOKIE_REF);
    expect(clearFn).toContain(CSRF_COOKIE_REF);
  });
});

// Constants referenced in assertions
const SESSION_COOKIE_REF = "SESSION_COOKIE_NAME";
const CSRF_COOKIE_REF = "CSRF_COOKIE_NAME";

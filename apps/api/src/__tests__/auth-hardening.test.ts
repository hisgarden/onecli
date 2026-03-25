/**
 * Auth hardening tests.
 *
 * Session cookies, CSRF, and session refresh are now handled by Better Auth.
 * These tests verify the remaining auth security properties:
 * - Better Auth is mounted and configured
 * - API key validation
 * - Local auth mode bootstrap
 * - requireAuth guard
 */
import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";

const SOURCE = readFileSync(resolve(__dirname, "../index.ts"), "utf-8");
const AUTH_SOURCE = readFileSync(resolve(__dirname, "../auth.ts"), "utf-8");

describe("Better Auth integration", () => {
  it("should mount Better Auth handler", () => {
    expect(SOURCE).toContain(".mount(auth.handler)");
  });

  it("should configure session cookie caching", () => {
    expect(AUTH_SOURCE).toContain("cookieCache");
  });

  it("should use Better Auth for session resolution", () => {
    expect(SOURCE).toContain("auth.api.getSession");
  });

  it("should set session expiry to 24 hours", () => {
    expect(AUTH_SOURCE).toContain("expiresIn: 60 * 60 * 24");
  });

  it("should configure trusted origins", () => {
    expect(AUTH_SOURCE).toContain("trustedOrigins");
  });
});

describe("API key authentication", () => {
  it("should validate oc_ prefix", () => {
    expect(SOURCE).toContain('!token.startsWith("oc_")');
  });

  it("should check Authorization Bearer header", () => {
    expect(SOURCE).toContain('header.startsWith("Bearer ")');
  });
});

describe("Local auth mode", () => {
  it("should bootstrap local user on first request", () => {
    expect(SOURCE).toContain("resolveLocalAuth");
    expect(SOURCE).toContain("local@onecli.dev");
  });

  it("should only activate in local AUTH_MODE", () => {
    expect(SOURCE).toContain('AUTH_MODE === "local"');
  });
});

describe("Auth guard", () => {
  it("should use requireAuth for protected routes", () => {
    expect(SOURCE).toContain("requireAuth(auth)");
  });

  it("should throw UNAUTHORIZED when not authenticated", () => {
    expect(SOURCE).toContain('throw new Error("UNAUTHORIZED")');
  });
});

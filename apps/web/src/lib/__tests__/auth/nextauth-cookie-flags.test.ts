import { describe, it, expect, beforeEach, afterEach } from "bun:test";

/**
 * Verify that NextAuth cookie configuration is explicitly hardened.
 * These tests read the config source to ensure flags aren't accidentally removed.
 */

describe("NextAuth cookie flags", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.NODE_ENV = process.env.NODE_ENV;
    savedEnv.NEXTAUTH_URL = process.env.NEXTAUTH_URL;
    savedEnv.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET;
  });

  afterEach(() => {
    process.env.NODE_ENV = savedEnv.NODE_ENV;
    process.env.NEXTAUTH_URL = savedEnv.NEXTAUTH_URL;
    process.env.NEXTAUTH_SECRET = savedEnv.NEXTAUTH_SECRET;
  });

  it("should set httpOnly: true on session cookie", async () => {
    // Read the source file and verify the cookie config is present
    const fs = require("fs");
    const source = fs.readFileSync(
      require.resolve("@/lib/auth/nextauth-config.ts"),
      "utf8",
    );

    expect(source).toContain("httpOnly: true");
  });

  it("should set sameSite: lax on session cookie", async () => {
    const fs = require("fs");
    const source = fs.readFileSync(
      require.resolve("@/lib/auth/nextauth-config.ts"),
      "utf8",
    );

    expect(source).toContain('sameSite: "lax"');
  });

  it("should use __Secure- prefix when secure cookies enabled", async () => {
    const fs = require("fs");
    const source = fs.readFileSync(
      require.resolve("@/lib/auth/nextauth-config.ts"),
      "utf8",
    );

    expect(source).toContain("__Secure-authjs.session-token");
  });

  it("should derive secure flag from NODE_ENV or NEXTAUTH_URL", async () => {
    const fs = require("fs");
    const source = fs.readFileSync(
      require.resolve("@/lib/auth/nextauth-config.ts"),
      "utf8",
    );

    // Verify the logic: production or https URL → secure cookies
    expect(source).toContain(
      'isProduction || process.env.NEXTAUTH_URL?.startsWith("https://")',
    );
    expect(source).toContain("secure: !!useSecureCookies");
  });
});

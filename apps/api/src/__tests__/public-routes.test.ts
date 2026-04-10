/**
 * Public route tests — endpoints that don't require auth.
 *
 * Covers:
 *   - GET /api/health        → trivial OK response
 *   - GET /metrics           → Prometheus format
 *   - GET /api/gateway/ca    → 200 (PEM payload) or 503 (cert missing)
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { resetMocks } from "./helpers/preload";
import { request } from "./helpers/test-app";

describe("public routes", () => {
  beforeEach(() => {
    resetMocks();
  });

  describe("GET /api/health", () => {
    it("returns 200 with status:ok and an ISO timestamp", async () => {
      const res = await request("GET", "/api/health");
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string; timestamp: string };
      expect(body.status).toBe("ok");
      // ISO 8601 starts with YYYY-MM-DDTHH:mm:ss
      expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      // Round-trippable as a Date
      expect(Number.isFinite(new Date(body.timestamp).getTime())).toBe(true);
    });
  });

  describe("GET /metrics", () => {
    it("returns 200 with the prom-client content type and a non-empty body", async () => {
      const res = await request("GET", "/metrics");
      expect(res.status).toBe(200);
      const ct = res.headers.get("content-type") ?? "";
      // prom-client default: "text/plain; version=0.0.4; charset=utf-8"
      expect(ct).toContain("text/plain");
      expect(ct).toContain("version=0.0.4");
      const body = await res.text();
      // The body should contain at least the default Node.js process metrics
      // and our custom counters' HELP lines.
      expect(body.length).toBeGreaterThan(0);
      expect(body).toContain("onecli_api_requests_total");
    });
  });

  describe("GET /api/gateway/ca", () => {
    const ORIGINAL_CERT = process.env.GATEWAY_CA_CERT;
    const ORIGINAL_PEM_FILE = process.env.GATEWAY_CA_PEM_FILE;
    const ORIGINAL_HOME = process.env.HOME;

    afterEach(() => {
      // Restore env vars between tests so we never leak state into other
      // test files (or other tests in this file).
      if (ORIGINAL_CERT === undefined) delete process.env.GATEWAY_CA_CERT;
      else process.env.GATEWAY_CA_CERT = ORIGINAL_CERT;

      if (ORIGINAL_PEM_FILE === undefined)
        delete process.env.GATEWAY_CA_PEM_FILE;
      else process.env.GATEWAY_CA_PEM_FILE = ORIGINAL_PEM_FILE;

      if (ORIGINAL_HOME === undefined) delete process.env.HOME;
      else process.env.HOME = ORIGINAL_HOME;
    });

    it("returns 200 with PEM payload + Content-Disposition when GATEWAY_CA_CERT is set", async () => {
      const fakePem =
        "-----BEGIN CERTIFICATE-----\nMIIFAKE...\n-----END CERTIFICATE-----\n";
      process.env.GATEWAY_CA_CERT = fakePem;

      const res = await request("GET", "/api/gateway/ca");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/x-pem-file");
      expect(res.headers.get("content-disposition")).toContain("onecli-ca.pem");
      const body = await res.text();
      expect(body).toBe(fakePem);
    });

    it("returns 503 when no CA certificate is available", async () => {
      // Remove all env-driven sources
      delete process.env.GATEWAY_CA_CERT;
      // Point GATEWAY_CA_PEM_FILE at a path that definitely doesn't exist
      // so the function enters the file branch, fails to read, and returns
      // null without consulting the filesystem fallbacks.
      process.env.GATEWAY_CA_PEM_FILE =
        "/var/empty/onecli-test-nonexistent.pem";

      const res = await request("GET", "/api/gateway/ca");
      expect(res.status).toBe(503);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("CA certificate");
    });
  });
});

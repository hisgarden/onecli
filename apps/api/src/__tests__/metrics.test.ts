/**
 * Metrics module tests — verifies the Prometheus metric definitions in
 * apps/api/src/metrics.ts are registered correctly and produce the expected
 * metric names, labels, and output format.
 *
 * These are NOT testing prom-client internals (well-tested upstream). They
 * guard against accidental changes to metric names/labels, which would
 * silently break Grafana dashboards and alerting rules that query by name.
 */
import { describe, it, expect, beforeEach } from "bun:test";
import {
  registry,
  httpRequestsTotal,
  httpRequestDuration,
  authTotal,
} from "../metrics";

describe("metrics module", () => {
  beforeEach(() => {
    httpRequestsTotal.reset();
    httpRequestDuration.reset();
    authTotal.reset();
  });

  describe("registry", () => {
    it("has the onecli-api default label", async () => {
      const output = await registry.metrics();
      // The default label should appear on every metric line
      expect(output).toContain('app="onecli-api"');
    });

    it("uses the standard Prometheus content type", () => {
      expect(registry.contentType).toContain("text/plain");
      expect(registry.contentType).toContain("version=0.0.4");
    });
  });

  describe("httpRequestsTotal", () => {
    it("is named onecli_api_requests_total", async () => {
      httpRequestsTotal.inc({ method: "GET", path: "/test", status: "200" });
      const output = await registry.metrics();
      expect(output).toContain("onecli_api_requests_total");
    });

    it("has method, path, and status labels", async () => {
      httpRequestsTotal.inc({ method: "POST", path: "/api/x", status: "201" });
      const snap = await httpRequestsTotal.get();
      const sample = snap.values[0];
      expect(sample.labels).toHaveProperty("method", "POST");
      expect(sample.labels).toHaveProperty("path", "/api/x");
      expect(sample.labels).toHaveProperty("status", "201");
    });
  });

  describe("httpRequestDuration", () => {
    it("is named onecli_api_request_duration_seconds", async () => {
      httpRequestDuration.observe({ method: "GET", path: "/test" }, 0.05);
      const output = await registry.metrics();
      expect(output).toContain("onecli_api_request_duration_seconds");
    });

    it("has method and path labels", async () => {
      httpRequestDuration.observe({ method: "DELETE", path: "/api/y" }, 0.1);
      const snap = await httpRequestDuration.get();
      // Histogram creates _bucket, _count, _sum samples — find _count
      const count = snap.values.find(
        (v) =>
          v.metricName === "onecli_api_request_duration_seconds_count" &&
          v.labels.method === "DELETE",
      );
      expect(count).toBeDefined();
      expect(count!.labels).toHaveProperty("path", "/api/y");
    });
  });

  describe("authTotal", () => {
    it("is named onecli_api_auth_total", async () => {
      authTotal.inc({ source: "api-key", result: "success" });
      const output = await registry.metrics();
      expect(output).toContain("onecli_api_auth_total");
    });

    it("has source and result labels", async () => {
      authTotal.inc({ source: "session", result: "failure" });
      const snap = await authTotal.get();
      const sample = snap.values.find((v) => v.labels.source === "session");
      expect(sample).toBeDefined();
      expect(sample!.labels).toHaveProperty("result", "failure");
    });
  });
});

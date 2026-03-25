import {
  Registry,
  Counter,
  Histogram,
  collectDefaultMetrics,
} from "prom-client";

/**
 * Prometheus metrics for the Elysia API.
 *
 * Complements the Rust gateway metrics (port 10255) with API-level
 * observability on port 10254.
 *
 * Scrape: GET http://localhost:10254/metrics
 */

export const registry = new Registry();
registry.setDefaultLabels({ app: "onecli-api" });

// Collect default Node.js/Bun process metrics (GC, event loop, memory)
collectDefaultMetrics({ register: registry });

// ── Custom Metrics ──────────────────────────────────────────────────────

/** Total HTTP requests handled by the API. */
export const httpRequestsTotal = new Counter({
  name: "onecli_api_requests_total",
  help: "Total HTTP requests handled by the API",
  labelNames: ["method", "path", "status"] as const,
  registers: [registry],
});

/** HTTP request duration in seconds. */
export const httpRequestDuration = new Histogram({
  name: "onecli_api_request_duration_seconds",
  help: "HTTP request round-trip latency",
  labelNames: ["method", "path"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

/** Authentication attempts. */
export const authTotal = new Counter({
  name: "onecli_api_auth_total",
  help: "Total authentication attempts",
  labelNames: ["source", "result"] as const,
  registers: [registry],
});

// CSRF and session refresh are now handled by Better Auth.

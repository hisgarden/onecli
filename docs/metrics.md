# Metrics

OneCLI exposes Prometheus-format metrics from both the Elysia API (port 10254)
and the Rust gateway (port 10255). Scrape with VictoriaMetrics, Prometheus, or
any compatible collector.

## Endpoints

```
GET http://localhost:10254/metrics   # API metrics (prom-client)
GET http://localhost:10255/metrics   # Gateway metrics (prometheus crate)
Content-Type: text/plain; version=0.0.4; charset=utf-8
```

No authentication required — both metrics endpoints are public. If running
behind a firewall, restrict access at the network level.

## API Metrics (port 10254)

| Metric                                | Type      | Labels                     | Description                               |
| ------------------------------------- | --------- | -------------------------- | ----------------------------------------- |
| `onecli_api_requests_total`           | counter   | `method`, `path`, `status` | Total HTTP requests handled by the API    |
| `onecli_api_request_duration_seconds` | histogram | `method`, `path`           | API request round-trip latency            |
| `onecli_api_auth_total`               | counter   | `source`, `result`         | Authentication attempts (by auth source)  |
| `onecli_api_csrf_failures_total`      | counter   | —                          | CSRF validation failures                  |
| `onecli_api_session_refreshes_total`  | counter   | —                          | Session token refreshes                   |
| `process_*`, `nodejs_*`               | various   | —                          | Default process metrics (memory, GC, etc) |

## Gateway Metrics (port 10255)

| Metric                            | Type      | Labels                     | Description                                             |
| --------------------------------- | --------- | -------------------------- | ------------------------------------------------------- |
| `onecli_connect_total`            | counter   | `mode`, `authenticated`    | Total CONNECT requests (mitm/tunnel, with/without auth) |
| `onecli_requests_total`           | counter   | `host`, `method`, `status` | Total MITM-forwarded HTTP requests                      |
| `onecli_request_duration_seconds` | histogram | `host`, `method`           | MITM request round-trip latency (buckets: 10ms–10s)     |
| `onecli_secrets_injected_total`   | counter   | `host`                     | Total header injections applied                         |
| `onecli_policy_decisions_total`   | counter   | `decision`                 | Policy enforcement actions (`blocked`, `rate_limited`)  |
| `onecli_auth_failures_total`      | counter   | `reason`                   | Authentication failures (`invalid_token`)               |

## VictoriaMetrics Setup

### Docker Compose

Add VictoriaMetrics alongside the OneCLI stack:

```yaml
services:
  # ... existing postgres and app services ...

  victoriametrics:
    image: victoriametrics/victoria-metrics:v1.109.0
    ports:
      - "8428:8428"
    volumes:
      - vmdata:/victoria-metrics-data
      - ./docker/prometheus.yml:/etc/prometheus/prometheus.yml
    command:
      - "-promscrape.config=/etc/prometheus/prometheus.yml"
      - "-retentionPeriod=30d"
    networks:
      - onecli

volumes:
  vmdata:
```

### Scrape Config

Create `docker/prometheus.yml`:

```yaml
scrape_configs:
  - job_name: "onecli-api"
    scrape_interval: 15s
    static_configs:
      - targets: ["api:10254"]
        labels:
          instance: "onecli-api"

  - job_name: "onecli-gateway"
    scrape_interval: 15s
    static_configs:
      - targets: ["gateway:10255"]
        labels:
          instance: "onecli-gateway"
```

If the gateway runs on a separate host or container, replace `app:10255` with
the appropriate hostname.

### Verify Scraping

```bash
# Check VictoriaMetrics is receiving data
curl -s 'http://localhost:8428/api/v1/query?query=onecli_connect_total' | jq .

# Check raw metrics from gateway
curl -s http://localhost:10255/metrics
```

## Querying

VictoriaMetrics supports PromQL. Example queries:

```promql
# ── API queries ──────────────────────────────────────────

# API request rate by path
rate(onecli_api_requests_total[5m])

# API P99 latency
histogram_quantile(0.99, rate(onecli_api_request_duration_seconds_bucket[5m]))

# CSRF failure rate
rate(onecli_api_csrf_failures_total[5m])

# ── Gateway queries ──────────────────────────────────────

# Request rate per host (5m window)
rate(onecli_requests_total[5m])

# P99 latency by host
histogram_quantile(0.99, rate(onecli_request_duration_seconds_bucket[5m]))

# Policy blocks per hour
increase(onecli_policy_decisions_total{decision="blocked"}[1h])

# Auth failures per minute
rate(onecli_auth_failures_total[1m])

# Total secrets injected by host
sum by (host) (onecli_secrets_injected_total)

# MITM vs tunnel ratio
sum(onecli_connect_total{mode="mitm"}) / sum(onecli_connect_total)
```

## Alerting

VictoriaMetrics supports alerting via `vmalert`. Example alert rules:

```yaml
groups:
  - name: onecli
    rules:
      - alert: HighAuthFailureRate
        expr: rate(onecli_auth_failures_total[5m]) > 1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High auth failure rate ({{ $value }}/s)"

      - alert: HighPolicyBlockRate
        expr: rate(onecli_policy_decisions_total{decision="blocked"}[5m]) > 10
        for: 5m
        labels:
          severity: info
        annotations:
          summary: "Elevated policy blocks ({{ $value }}/s)"

      - alert: HighP99Latency
        expr: histogram_quantile(0.99, rate(onecli_request_duration_seconds_bucket[5m])) > 5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "P99 latency above 5s"
```

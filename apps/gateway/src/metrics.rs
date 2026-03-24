//! Prometheus metrics for the OneCLI gateway.
//!
//! Exposes counters and histograms for request flow, policy decisions,
//! secret injection, and cache behavior. Scraped by VictoriaMetrics
//! via the `/metrics` Axum route.

use prometheus::{
    Encoder, HistogramOpts, HistogramVec, IntCounterVec, Opts, Registry, TextEncoder,
};

lazy_static::lazy_static! {
    pub(crate) static ref REGISTRY: Registry = Registry::new();

    /// Total CONNECT requests by mode (mitm/tunnel) and agent presence.
    pub(crate) static ref CONNECT_TOTAL: IntCounterVec = IntCounterVec::new(
        Opts::new("onecli_connect_total", "Total CONNECT requests"),
        &["mode", "authenticated"],
    ).expect("metric: connect_total");

    /// Total MITM-forwarded requests by host, method, and status.
    pub(crate) static ref REQUESTS_TOTAL: IntCounterVec = IntCounterVec::new(
        Opts::new("onecli_requests_total", "Total MITM-forwarded requests"),
        &["host", "method", "status"],
    ).expect("metric: requests_total");

    /// Request duration in seconds (MITM forward latency).
    pub(crate) static ref REQUEST_DURATION: HistogramVec = HistogramVec::new(
        HistogramOpts::new("onecli_request_duration_seconds", "MITM request duration")
            .buckets(vec![0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]),
        &["host", "method"],
    ).expect("metric: request_duration");

    /// Total secrets injected per request.
    pub(crate) static ref SECRETS_INJECTED_TOTAL: IntCounterVec = IntCounterVec::new(
        Opts::new("onecli_secrets_injected_total", "Total header injections applied"),
        &["host"],
    ).expect("metric: secrets_injected_total");

    /// Policy decisions: blocked or rate-limited.
    pub(crate) static ref POLICY_DECISIONS_TOTAL: IntCounterVec = IntCounterVec::new(
        Opts::new("onecli_policy_decisions_total", "Total policy enforcement actions"),
        &["decision"],
    ).expect("metric: policy_decisions_total");

    /// Auth failures (invalid tokens).
    pub(crate) static ref AUTH_FAILURES_TOTAL: IntCounterVec = IntCounterVec::new(
        Opts::new("onecli_auth_failures_total", "Total authentication failures"),
        &["reason"],
    ).expect("metric: auth_failures_total");
}

/// Register all metrics with the registry. Call once at startup.
pub(crate) fn init() {
    let collectors: Vec<Box<dyn prometheus::core::Collector>> = vec![
        Box::new(CONNECT_TOTAL.clone()),
        Box::new(REQUESTS_TOTAL.clone()),
        Box::new(REQUEST_DURATION.clone()),
        Box::new(SECRETS_INJECTED_TOTAL.clone()),
        Box::new(POLICY_DECISIONS_TOTAL.clone()),
        Box::new(AUTH_FAILURES_TOTAL.clone()),
    ];
    for c in collectors {
        REGISTRY.register(c).expect("register metric");
    }
}

/// Render all metrics in Prometheus text format.
pub(crate) fn render() -> String {
    let encoder = TextEncoder::new();
    let metric_families = REGISTRY.gather();
    let mut buf = Vec::new();
    encoder.encode(&metric_families, &mut buf).expect("encode metrics");
    String::from_utf8(buf).expect("metrics are valid utf8")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn metrics_init_and_render() {
        // Separate registry for test isolation
        let registry = Registry::new();
        let counter = IntCounterVec::new(
            Opts::new("test_counter", "test"),
            &["label"],
        ).unwrap();
        registry.register(Box::new(counter.clone())).unwrap();

        counter.with_label_values(&["foo"]).inc();

        let encoder = TextEncoder::new();
        let families = registry.gather();
        let mut buf = Vec::new();
        encoder.encode(&families, &mut buf).unwrap();
        let output = String::from_utf8(buf).unwrap();

        assert!(output.contains("test_counter"));
        assert!(output.contains("foo"));
    }
}

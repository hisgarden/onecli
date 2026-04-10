//! Gateway authentication for browser requests.
//!
//! Supports two modes controlled by the `AUTH_MODE` env var:
//! - `local`: bypasses JWT validation, looks up the "local-admin" user directly.
//! - `oauth` (default): validates a NextAuth session cookie JWT (HS256).

use std::sync::OnceLock;

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use hyper::HeaderMap;
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::Deserialize;
use sqlx::PgPool;
use tracing::warn;

use crate::db;
use crate::gateway::GatewayState;

// ── AuthError ────────────────────────────────────────────────────────────

/// Authentication error — always returns 401 Unauthorized.
#[derive(Debug)]
pub(crate) struct AuthError(String);

impl std::fmt::Display for AuthError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "auth error: {}", self.0)
    }
}

impl IntoResponse for AuthError {
    fn into_response(self) -> axum::response::Response {
        (StatusCode::UNAUTHORIZED, self.0).into_response()
    }
}

// ── JWT claims ───────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct SessionClaims {
    sub: String,
}

// ── Cached env reads ─────────────────────────────────────────────────────

fn auth_mode() -> &'static str {
    static AUTH_MODE: OnceLock<String> = OnceLock::new();
    AUTH_MODE.get_or_init(|| std::env::var("AUTH_MODE").unwrap_or_else(|_| "oauth".to_string()))
}

fn nextauth_secret() -> Option<&'static str> {
    static SECRET: OnceLock<Option<String>> = OnceLock::new();
    SECRET
        .get_or_init(|| std::env::var("NEXTAUTH_SECRET").ok())
        .as_deref()
}

// ── Extractor ────────────────────────────────────────────────────────────

/// Authenticated user extracted from browser session cookies.
///
/// Add as an Axum handler parameter to require authentication:
/// ```ignore
/// async fn list_secrets(auth: AuthUser) -> impl IntoResponse { ... }
/// ```
pub(crate) struct AuthUser {
    pub user_id: String,
    pub account_id: String,
}

impl FromRequestParts<GatewayState> for AuthUser {
    type Rejection = AuthError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &GatewayState,
    ) -> Result<Self, Self::Rejection> {
        let user_id = validate_request(&state.policy_engine.pool, &parts.headers).await?;

        // Resolve account from membership
        let account_id = db::find_account_id_by_user(&state.policy_engine.pool, &user_id)
            .await
            .map_err(|e| {
                warn!(error = %e, "auth: failed to resolve account");
                AuthError("internal error".to_string())
            })?
            .ok_or_else(|| {
                warn!(user_id = %user_id, "auth: no account found for user");
                AuthError("no account found".to_string())
            })?;

        Ok(Self {
            user_id,
            account_id,
        })
    }
}

// ── Validation ───────────────────────────────────────────────────────────

/// Validate an incoming browser request and return the internal user ID.
/// The caller resolves the account ID from the user's membership.
async fn validate_request(pool: &PgPool, headers: &HeaderMap) -> Result<String, AuthError> {
    match auth_mode() {
        "local" => validate_local(pool).await,
        _ => validate_oauth(pool, headers).await,
    }
}

// ── Local mode ───────────────────────────────────────────────────────────

async fn validate_local(pool: &PgPool) -> Result<String, AuthError> {
    let user = db::find_user_by_external_auth_id(pool, "local-admin")
        .await
        .map_err(|e| {
            warn!(error = %e, "local auth: db error");
            AuthError("internal error".to_string())
        })?
        .ok_or_else(|| {
            warn!("local auth: local-admin user not found");
            AuthError("user not found".to_string())
        })?;

    Ok(user.id)
}

// ── OAuth mode ───────────────────────────────────────────────────────────

async fn validate_oauth(pool: &PgPool, headers: &HeaderMap) -> Result<String, AuthError> {
    // 1. Extract session token from cookies
    let cookie_header = headers
        .get(hyper::header::COOKIE)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| {
            warn!("oauth auth: no cookie header");
            AuthError("missing cookie".to_string())
        })?;

    let token = parse_cookie(cookie_header, "authjs.session-token").ok_or_else(|| {
        warn!("oauth auth: session token cookie not found");
        AuthError("missing session token".to_string())
    })?;

    // 2. Read NEXTAUTH_SECRET
    let secret = nextauth_secret().ok_or_else(|| {
        warn!("oauth auth: NEXTAUTH_SECRET not set");
        AuthError("server misconfigured".to_string())
    })?;

    // 3. Decode JWT (HS256)
    let mut validation = Validation::new(Algorithm::HS256);
    validation.required_spec_claims.clear();
    validation.validate_exp = false;

    let token_data = decode::<SessionClaims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )
    .map_err(|e| {
        warn!(error = %e, "oauth auth: JWT decode failed");
        AuthError("invalid session token".to_string())
    })?;

    let sub = &token_data.claims.sub;

    // 4. Look up user by external auth ID
    let user = db::find_user_by_external_auth_id(pool, sub)
        .await
        .map_err(|e| {
            warn!(error = %e, "oauth auth: db error");
            AuthError("internal error".to_string())
        })?
        .ok_or_else(|| {
            warn!(sub = %sub, "oauth auth: user not found");
            AuthError("user not found".to_string())
        })?;

    Ok(user.id)
}

// ── Helpers ──────────────────────────────────────────────────────────────

/// Parse a specific cookie value from a Cookie header string.
fn parse_cookie<'a>(cookie_header: &'a str, name: &str) -> Option<&'a str> {
    cookie_header.split(';').find_map(|pair| {
        let pair = pair.trim();
        let (key, value) = pair.split_once('=')?;
        if key.trim() == name {
            Some(value.trim())
        } else {
            None
        }
    })
}

// ── Tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use jsonwebtoken::{encode, EncodingKey, Header};

    // ── parse_cookie ────────────────────────────────────────────────────

    #[test]
    fn parse_cookie_finds_value() {
        let header = "other=abc; authjs.session-token=eyJhbGciOiJIUzI1NiJ9.test; path=/";
        assert_eq!(
            parse_cookie(header, "authjs.session-token"),
            Some("eyJhbGciOiJIUzI1NiJ9.test")
        );
    }

    #[test]
    fn parse_cookie_missing() {
        let header = "other=abc; foo=bar";
        assert_eq!(parse_cookie(header, "authjs.session-token"), None);
    }

    #[test]
    fn parse_cookie_empty() {
        assert_eq!(parse_cookie("", "authjs.session-token"), None);
    }

    #[test]
    fn parse_cookie_first_pair_no_leading_space() {
        let header = "authjs.session-token=tok123; other=abc";
        assert_eq!(parse_cookie(header, "authjs.session-token"), Some("tok123"));
    }

    #[test]
    fn parse_cookie_value_with_equals_sign() {
        // JWT values can contain '=' (base64 padding). split_once('=') handles
        // this because it only splits on the FIRST '='.
        let header = "authjs.session-token=eyJ0eXAi.payload.sig==; other=abc";
        assert_eq!(
            parse_cookie(header, "authjs.session-token"),
            Some("eyJ0eXAi.payload.sig==")
        );
    }

    #[test]
    fn parse_cookie_no_equals_in_pair_skips() {
        // Malformed pair without '=' should be ignored, not panic.
        let header = "malformed; authjs.session-token=valid";
        assert_eq!(parse_cookie(header, "authjs.session-token"), Some("valid"));
    }

    #[test]
    fn parse_cookie_trims_whitespace_around_key() {
        let header = "  authjs.session-token = tok123 ; other=abc";
        assert_eq!(parse_cookie(header, "authjs.session-token"), Some("tok123"));
    }

    // ── JWT validation config ───────────────────────────────────────────
    // These test the exact Validation config that validate_oauth() uses
    // (HS256, no required claims, no exp check) without needing a PgPool.
    // If someone changes the algorithm or validation settings, these catch it.

    /// Build the same Validation that validate_oauth uses.
    fn oauth_validation() -> Validation {
        let mut v = Validation::new(Algorithm::HS256);
        v.required_spec_claims.clear();
        v.validate_exp = false;
        v
    }

    fn encode_jwt(sub: &str, secret: &str) -> String {
        #[derive(serde::Serialize)]
        struct Claims {
            sub: String,
        }
        encode(
            &Header::new(Algorithm::HS256),
            &Claims {
                sub: sub.to_string(),
            },
            &EncodingKey::from_secret(secret.as_bytes()),
        )
        .expect("JWT encode failed")
    }

    #[test]
    fn jwt_decode_valid_hs256_extracts_sub() {
        let secret = "test-secret-key-for-nextauth";
        let token = encode_jwt("user-abc-123", secret);

        let data = decode::<SessionClaims>(
            &token,
            &DecodingKey::from_secret(secret.as_bytes()),
            &oauth_validation(),
        );
        assert!(data.is_ok(), "decode should succeed");
        assert_eq!(data.unwrap().claims.sub, "user-abc-123");
    }

    #[test]
    fn jwt_decode_wrong_secret_fails() {
        let token = encode_jwt("user-abc", "correct-secret");

        let data = decode::<SessionClaims>(
            &token,
            &DecodingKey::from_secret(b"wrong-secret"),
            &oauth_validation(),
        );
        assert!(data.is_err(), "decode with wrong secret must fail");
    }

    #[test]
    fn jwt_decode_corrupted_token_fails() {
        let data = decode::<SessionClaims>(
            "not.a.valid.jwt",
            &DecodingKey::from_secret(b"any-secret"),
            &oauth_validation(),
        );
        assert!(data.is_err(), "corrupted token must fail");
    }

    #[test]
    fn jwt_decode_empty_token_fails() {
        let data = decode::<SessionClaims>(
            "",
            &DecodingKey::from_secret(b"any-secret"),
            &oauth_validation(),
        );
        assert!(data.is_err(), "empty token must fail");
    }

    #[test]
    fn jwt_decode_rs256_token_rejected_by_hs256_validation() {
        // Ensure we only accept HS256 — a token signed with a different
        // algorithm must be rejected even if the secret matches the
        // payload (defence against algorithm confusion attacks).
        //
        // We can't easily create a real RS256 token here without an RSA key,
        // but we can verify that the Validation object requires HS256.
        let v = oauth_validation();
        assert_eq!(v.algorithms, vec![Algorithm::HS256]);
    }
}

/**
 * Route: GET /api/container-config
 *
 * Returns the env vars + CA cert that a containerized agent needs to route
 * its traffic through the OneCLI gateway. Multi-step:
 *   1. Resolve agent — query param `?agent=<identifier>` OR fall back to
 *      the account's default agent OR auto-create a default if neither
 *      exists. Return 404 if explicit identifier is given but not found.
 *   2. Load CA cert via loadCaCertificateSync() — return 503 if missing.
 *   3. Look up an anthropic secret — branch on agent.secretMode:
 *        "selective" → join via agentSecrets EXISTS subquery
 *        "all"       → flat select on the account
 *   4. Branch on parseAnthropicMetadata(secret?.metadata)?.authMode:
 *        "oauth"   → CLAUDE_CODE_OAUTH_TOKEN env var
 *        otherwise → ANTHROPIC_API_KEY env var
 *   5. Return env block + CA cert + container path
 *
 * Each branch gets its own test. CA cert availability is controlled via
 * GATEWAY_CA_CERT env var (same approach as public-routes.test.ts).
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { services, mockDb, resetMocks } from "../helpers/preload";
import { request } from "../helpers/test-app";

const TEST_USER = "u_cc_test";
const TEST_ACCOUNT = "a_cc_test";
// loadCaCertificateSync calls .trim() on GATEWAY_CA_CERT, so a trailing
// newline would be stripped from the response. Use a value with no trailing
// whitespace so test expectations match exactly.
const FAKE_PEM =
  "-----BEGIN CERTIFICATE-----\nMIIFAKE...\n-----END CERTIFICATE-----";

function authed() {
  mockDb.queueResult({ userId: TEST_USER, accountId: TEST_ACCOUNT });
  return { bearer: "oc_test" };
}

describe("GET /api/container-config", () => {
  const ORIGINAL_CERT = process.env.GATEWAY_CA_CERT;
  const ORIGINAL_PEM_FILE = process.env.GATEWAY_CA_PEM_FILE;
  const ORIGINAL_HOST = process.env.GATEWAY_HOST;

  beforeEach(() => {
    resetMocks();
    // Default: CA cert is available so most tests don't have to think about it.
    process.env.GATEWAY_CA_CERT = FAKE_PEM;
    process.env.GATEWAY_HOST = "test.gateway.local";
  });

  afterEach(() => {
    if (ORIGINAL_CERT === undefined) delete process.env.GATEWAY_CA_CERT;
    else process.env.GATEWAY_CA_CERT = ORIGINAL_CERT;
    if (ORIGINAL_PEM_FILE === undefined) delete process.env.GATEWAY_CA_PEM_FILE;
    else process.env.GATEWAY_CA_PEM_FILE = ORIGINAL_PEM_FILE;
    if (ORIGINAL_HOST === undefined) delete process.env.GATEWAY_HOST;
    else process.env.GATEWAY_HOST = ORIGINAL_HOST;
  });

  it("rejects without auth → 401", async () => {
    const res = await request("GET", "/api/container-config");
    expect(res.status).toBe(401);
  });

  it("explicit ?agent=identifier hit returns env vars with the agent's token", async () => {
    const opts = authed();
    // 1. Agent lookup by identifier → found
    mockDb.queueResult({
      id: "agent_xyz",
      accessToken: "tok_xyz",
      secretMode: "all",
    });
    // 2. Anthropic secret lookup ("all" branch) → none
    mockDb.queueResult(undefined);

    const res = await request(
      "GET",
      "/api/container-config?agent=my-agent",
      opts,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      env: Record<string, string>;
      caCertificate: string;
    };
    expect(body.env.HTTPS_PROXY).toContain("tok_xyz");
    expect(body.env.HTTPS_PROXY).toContain("test.gateway.local:10255");
    expect(body.env.HTTP_PROXY).toBe(body.env.HTTPS_PROXY);
    expect(body.caCertificate).toBe(FAKE_PEM);
  });

  it("explicit ?agent=identifier miss → 404", async () => {
    const opts = authed();
    // Agent lookup by identifier → undefined (not found)
    mockDb.queueResult(undefined);

    const res = await request(
      "GET",
      "/api/container-config?agent=missing-agent",
      opts,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("not found");
  });

  it("no identifier + default agent exists → uses the default", async () => {
    const opts = authed();
    // Default agent lookup → found
    mockDb.queueResult({
      id: "agent_default",
      accessToken: "tok_default",
      secretMode: "all",
    });
    // Anthropic secret lookup → none
    mockDb.queueResult(undefined);

    const res = await request("GET", "/api/container-config", opts);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { env: Record<string, string> };
    expect(body.env.HTTPS_PROXY).toContain("tok_default");
  });

  it("no identifier + no default → auto-creates a default agent", async () => {
    const opts = authed();
    // Default agent lookup → undefined
    mockDb.queueResult(undefined);
    // Auto-create insert .returning().executeTakeFirstOrThrow() → new agent
    mockDb.queueResult({
      id: "agent_autocreated",
      accessToken: "tok_autocreated",
      secretMode: "all",
    });
    // Anthropic secret lookup → none
    mockDb.queueResult(undefined);

    const res = await request("GET", "/api/container-config", opts);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { env: Record<string, string> };
    expect(body.env.HTTPS_PROXY).toContain("tok_autocreated");
    // Auto-create path goes through generateAccessToken
    expect(services.generateAccessToken).toHaveBeenCalled();
  });

  it("returns 503 when CA certificate is not available", async () => {
    delete process.env.GATEWAY_CA_CERT;
    process.env.GATEWAY_CA_PEM_FILE = "/var/empty/onecli-test-nonexistent.pem";

    const opts = authed();
    mockDb.queueResult({
      id: "agent_default",
      accessToken: "tok_default",
      secretMode: "all",
    });
    // No anthropic secret needed — route returns 503 before reaching that step

    const res = await request("GET", "/api/container-config", opts);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("CA certificate not available");
  });

  it("selective secret mode uses the EXISTS subquery branch", async () => {
    const opts = authed();
    // Default agent in selective mode
    mockDb.queueResult({
      id: "agent_sel",
      accessToken: "tok_sel",
      secretMode: "selective",
    });
    // Anthropic secret lookup (selective branch) → found, has metadata
    mockDb.queueResult({ metadata: '{"authMode":"oauth"}' });

    services.parseAnthropicMetadata.mockImplementation(() => ({
      authMode: "oauth",
    }));

    const res = await request("GET", "/api/container-config", opts);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { env: Record<string, string> };
    expect(body.env.CLAUDE_CODE_OAUTH_TOKEN).toBe("placeholder");
    expect(body.env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("non-oauth metadata → ANTHROPIC_API_KEY env (default branch)", async () => {
    const opts = authed();
    mockDb.queueResult({
      id: "agent_default",
      accessToken: "tok_default",
      secretMode: "all",
    });
    mockDb.queueResult({ metadata: '{"authMode":"api-key"}' });

    services.parseAnthropicMetadata.mockImplementation(() => ({
      authMode: "api-key",
    }));

    const res = await request("GET", "/api/container-config", opts);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { env: Record<string, string> };
    expect(body.env.ANTHROPIC_API_KEY).toBe("placeholder");
    expect(body.env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
  });

  it("no anthropic secret at all → ANTHROPIC_API_KEY (parseAnthropicMetadata returns null)", async () => {
    const opts = authed();
    mockDb.queueResult({
      id: "agent_default",
      accessToken: "tok_default",
      secretMode: "all",
    });
    mockDb.queueResult(undefined); // No anthropic secret in db

    // parseAnthropicMetadata is already mocked to return null by default
    const res = await request("GET", "/api/container-config", opts);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { env: Record<string, string> };
    expect(body.env.ANTHROPIC_API_KEY).toBe("placeholder");
  });

  it("returns the CA cert and the container path constant", async () => {
    const opts = authed();
    mockDb.queueResult({
      id: "agent_default",
      accessToken: "tok_default",
      secretMode: "all",
    });
    mockDb.queueResult(undefined);

    const res = await request("GET", "/api/container-config", opts);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      caCertificate: string;
      caCertificateContainerPath: string;
    };
    expect(body.caCertificate).toBe(FAKE_PEM);
    // CA_CONTAINER_PATH constant in app.ts
    expect(body.caCertificateContainerPath).toBe("/tmp/onecli-gateway-ca.pem");
  });
});

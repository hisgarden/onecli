# CA Key Rotation

The OneCLI gateway uses a self-signed Certificate Authority (CA) to intercept
HTTPS traffic (MITM) and inject credentials. The CA private key is
security-critical — if compromised, all intercepted traffic can be decrypted.

## Key Storage

| Mode              | Location                    | Notes                                                                       |
| ----------------- | --------------------------- | --------------------------------------------------------------------------- |
| OSS (self-hosted) | `{data_dir}/gateway/ca.key` | Default: `~/.onecli/gateway/ca.key` or `/app/data/gateway/ca.key` in Docker |
| Cloud             | `GATEWAY_CA_KEY` env var    | Injected from Secrets Manager, never written to disk                        |

The key file is created with `0600` permissions (owner read/write only).
On startup, the gateway warns if permissions are more permissive.

## When to Rotate

- The CA key is suspected of being compromised
- A team member with key access leaves the organization
- Periodic rotation per organizational policy (e.g., annually)
- After a security incident involving the host running the gateway

## Rotation Procedure

### OSS / Self-Hosted

1. **Stop the gateway**

   ```bash
   docker compose -f docker/docker-compose.yml down
   ```

2. **Back up the old CA** (in case agents need time to transition)

   ```bash
   cp ~/.onecli/gateway/ca.key ~/.onecli/gateway/ca.key.bak
   cp ~/.onecli/gateway/ca.pem ~/.onecli/gateway/ca.pem.bak
   ```

3. **Delete the existing CA files**

   ```bash
   rm ~/.onecli/gateway/ca.key ~/.onecli/gateway/ca.pem
   ```

4. **Restart the gateway** — a new CA is auto-generated on first startup

   ```bash
   docker compose -f docker/docker-compose.yml up -d
   ```

5. **Update all agents** to trust the new CA certificate

   Agents download the CA cert from `GET http://gateway:10255/api/gateway/ca`.
   Most agent SDKs fetch this automatically on connection. For manual setups:

   ```bash
   curl -s http://localhost:10255/api/gateway/ca > /path/to/onecli-ca.pem
   ```

6. **Remove the backup** once all agents are updated

   ```bash
   rm ~/.onecli/gateway/ca.key.bak ~/.onecli/gateway/ca.pem.bak
   ```

### Cloud (AWS)

1. Generate a new CA key pair:

   ```bash
   openssl ecparam -genkey -name prime256v1 -noout -out new-ca.key
   openssl req -new -x509 -key new-ca.key -out new-ca.pem -days 3650 \
     -subj "/CN=OneCLI Gateway CA/O=OneCLI"
   ```

2. Update the secrets in AWS Secrets Manager:

   ```bash
   aws secretsmanager update-secret --secret-id onecli/gateway-ca-key \
     --secret-string "$(cat new-ca.key)"
   aws secretsmanager update-secret --secret-id onecli/gateway-ca-cert \
     --secret-string "$(cat new-ca.pem)"
   ```

3. Restart the ECS service to pick up the new secrets.

4. Securely delete local copies:

   ```bash
   shred -u new-ca.key new-ca.pem
   ```

## File Permissions

The CA key must have restrictive permissions:

```bash
chmod 600 ~/.onecli/gateway/ca.key
```

The gateway checks permissions on startup and logs a warning if the key is
group-readable or world-readable. This is a warning, not an error — the
gateway still starts to avoid blocking in edge cases (e.g., Docker volume
permissions).

## Security Considerations

- **Never commit** `ca.key` to version control
- **Never share** `ca.key` over unencrypted channels
- The CA certificate (`ca.pem`) is public — agents need it to trust the gateway
- Consider encrypting the CA key at rest with `SECRET_ENCRYPTION_KEY` (future enhancement)
- In Docker, the `/app/data` volume should be backed up separately from the database

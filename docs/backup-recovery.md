# Backup & Disaster Recovery

OneCLI has two categories of critical state that must be backed up:

1. **PostgreSQL database** — accounts, agents, encrypted secrets, policy rules, vault connections
2. **CA private key** — the MITM certificate authority key used by the gateway

Loss of the database means losing all configuration. Loss of the CA key means
agents must re-trust a new certificate. Both should be backed up regularly.

## What to Back Up

| Asset               | Location                                                             | Sensitivity                                | Backup Method                                 |
| ------------------- | -------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------- |
| PostgreSQL database | `DATABASE_URL` connection                                            | Contains encrypted secrets (not plaintext) | `pg_dump` or managed DB snapshots             |
| CA private key      | `{data_dir}/gateway/ca.key`                                          | **Critical** — enables MITM decryption     | File copy, encrypted                          |
| CA certificate      | `{data_dir}/gateway/ca.pem`                                          | Public (agents need it)                    | File copy                                     |
| Encryption key      | `SECRET_ENCRYPTION_KEY` env var or `/app/data/secret-encryption-key` | **Critical** — decrypts all stored secrets | Secure vault (1Password, AWS Secrets Manager) |

## Database Backup

### Manual Backup

```bash
# From the project root (uses DATABASE_URL from .env)
pnpm db:backup

# Custom output directory
./scripts/db-backup.sh /mnt/backups/

# With explicit DATABASE_URL
DATABASE_URL=postgresql://user:pass@host:5432/onecli ./scripts/db-backup.sh
```

Output: `backups/onecli_backup_YYYYMMDD_HHMMSS.sql.gz`

### Automated Backup (Cron)

Add to the host's crontab or a sidecar container:

```bash
# Daily at 2 AM, keep 30 days
0 2 * * * cd /path/to/onecli && ./scripts/db-backup.sh /mnt/backups/ && find /mnt/backups/ -name 'onecli_backup_*.sql.gz' -mtime +30 -delete
```

### Managed Database Snapshots

If using a managed PostgreSQL (AWS RDS, GCP Cloud SQL, etc.), enable automated
snapshots at the provider level. This is preferred for production as it provides
point-in-time recovery.

## CA Key Backup

The CA private key (`ca.key`) must be backed up separately from the database
and stored encrypted.

```bash
# Back up CA key (encrypt with GPG)
gpg --symmetric --cipher-algo AES256 -o ca.key.gpg ~/.onecli/gateway/ca.key

# Store ca.key.gpg in a separate location (different host, cloud storage, etc.)
```

For Docker deployments, the CA key is in the `app-data` volume:

```bash
# Copy from Docker volume
docker cp onecli-app-1:/app/data/gateway/ca.key ./ca.key.backup
gpg --symmetric --cipher-algo AES256 -o ca.key.gpg ./ca.key.backup
shred -u ./ca.key.backup
```

## Encryption Key Backup

The `SECRET_ENCRYPTION_KEY` is required to decrypt all stored secrets. Without
it, encrypted secret values in the database are unrecoverable.

- **OSS mode**: auto-generated at `/app/data/secret-encryption-key` on first start
- **Cloud mode**: provided via environment variable (AWS Secrets Manager)

Back up this key in a secure vault (1Password, AWS Secrets Manager, HashiCorp
Vault). Never store it alongside the database backup.

## Restore Procedure

### Prerequisites

- A running PostgreSQL instance (empty or existing)
- The backup file (`onecli_backup_*.sql.gz`)
- The CA key file (`ca.key`) and certificate (`ca.pem`)
- The `SECRET_ENCRYPTION_KEY` value

### Steps

1. **Start PostgreSQL**

   ```bash
   pnpm db:up
   ```

2. **Restore the database**

   ```bash
   pnpm db:restore backups/onecli_backup_20260324_120000.sql.gz
   ```

   This drops and recreates all tables from the backup.

3. **Apply any newer migrations**

   If the backup was taken before recent schema changes:

   ```bash
   pnpm db:migrate
   ```

4. **Restore CA key**

   ```bash
   # Decrypt the backup
   gpg --decrypt ca.key.gpg > ~/.onecli/gateway/ca.key
   chmod 600 ~/.onecli/gateway/ca.key

   # Copy certificate (public, no decryption needed)
   cp ca.pem.backup ~/.onecli/gateway/ca.pem
   ```

   For Docker, copy into the volume:

   ```bash
   docker cp ca.key onecli-gateway-1:/app/data/gateway/ca.key
   docker cp ca.pem onecli-gateway-1:/app/data/gateway/ca.pem
   ```

5. **Set the encryption key**

   Ensure `SECRET_ENCRYPTION_KEY` is set in `.env` or the environment.

6. **Start the application**

   ```bash
   pnpm dev
   # or
   docker compose -f docker/docker-compose.yml up -d
   ```

7. **Verify the restore**

   ```bash
   # Check the web dashboard loads
   curl -s http://localhost:10254/api/health

   # Check the gateway responds
   curl -s http://localhost:10255/healthz

   # Check agents and secrets are present
   pnpm db:studio
   ```

## Recovery Time Objectives

| Scenario            | RTO               | Notes                                                                            |
| ------------------- | ----------------- | -------------------------------------------------------------------------------- |
| Database corruption | ~15 min           | Restore from latest backup + run migrations                                      |
| CA key loss         | ~5 min            | Restore from encrypted backup; agents may need to re-trust if key is regenerated |
| Full host failure   | ~30 min           | New host + restore DB + restore CA key + deploy                                  |
| Encryption key loss | **Unrecoverable** | All encrypted secrets must be re-entered manually                                |

## Testing the Recovery Plan

Run a recovery drill periodically:

```bash
# 1. Take a backup
pnpm db:backup

# 2. Nuke the database
pnpm db:nuke

# 3. Start a fresh database
pnpm db:up

# 4. Restore
pnpm db:restore backups/onecli_backup_*.sql.gz

# 5. Verify
pnpm db:studio
```

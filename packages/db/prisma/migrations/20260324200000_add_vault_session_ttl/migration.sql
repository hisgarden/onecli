-- Add TTL and usage tracking to vault sessions
ALTER TABLE "vault_connections" ADD COLUMN "last_used_at" TIMESTAMP(3);
ALTER TABLE "vault_connections" ADD COLUMN "expires_at" TIMESTAMP(3);

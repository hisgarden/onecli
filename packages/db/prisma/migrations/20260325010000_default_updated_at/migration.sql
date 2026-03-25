-- Add DEFAULT NOW() to updated_at columns so INSERTs work without Prisma.
-- The set_updated_at trigger handles UPDATEs.

ALTER TABLE accounts ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE users ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE agents ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE secrets ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE policy_rules ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE connected_services ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE vault_connections ALTER COLUMN updated_at SET DEFAULT NOW();

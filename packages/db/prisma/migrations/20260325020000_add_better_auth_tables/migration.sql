-- Better Auth tables + user columns.
-- OAuth accounts in ba_accounts (avoids conflict with business accounts table).
-- Sessions in ba_sessions. Verifications in ba_verifications.

-- Add columns Better Auth expects on the users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS image TEXT;

-- Make external_auth_id nullable (Better Auth uses ba_accounts for provider linkage)
ALTER TABLE users ALTER COLUMN external_auth_id DROP NOT NULL;

-- Better Auth sessions
CREATE TABLE IF NOT EXISTS ba_sessions (
  id TEXT PRIMARY KEY,
  expires_at TIMESTAMP NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ba_sessions_user_id_idx ON ba_sessions(user_id);
CREATE INDEX IF NOT EXISTS ba_sessions_token_idx ON ba_sessions(token);

-- Better Auth OAuth provider accounts (NOT our business accounts)
CREATE TABLE IF NOT EXISTS ba_accounts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at TIMESTAMP,
  refresh_token_expires_at TIMESTAMP,
  scope TEXT,
  password TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ba_accounts_user_id_idx ON ba_accounts(user_id);

-- Better Auth verification tokens (email verification, password reset, etc.)
CREATE TABLE IF NOT EXISTS ba_verifications (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add updated_at triggers for new tables
CREATE TRIGGER set_updated_at BEFORE UPDATE ON ba_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON ba_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON ba_verifications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

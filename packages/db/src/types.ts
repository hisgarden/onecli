/**
 * Kysely database type definitions — generated from Prisma schema.
 *
 * Column names use snake_case (matching PostgreSQL). The CamelCasePlugin
 * in kysely.ts maps these to camelCase in application code automatically.
 *
 * `Generated<T>` marks columns that have a database-level default
 * (e.g. @default(cuid()), @default(now()), @updatedAt). These are
 * optional on INSERT but always present on SELECT.
 */
import type { Generated, Insertable, Selectable, Updateable } from "kysely";

// ── JSON helper type ──────────────────────────────────────────────────

export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

// ── Table types ───────────────────────────────────────────────────────

export interface AccountTable {
  id: Generated<string>;
  name: string | null;
  stripe_customer_id: string | null;
  subscription_status: Generated<string>;
  demo_seeded: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AccountMemberTable {
  account_id: string;
  user_id: string;
  role: string;
  created_at: Generated<Date>;
}

export interface UserTable {
  id: Generated<string>;
  email: string;
  name: string | null;
  external_auth_id: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ApiKeyTable {
  id: Generated<string>;
  key: string;
  user_id: string;
  account_id: string;
  name: string | null;
  created_at: Generated<Date>;
}

export interface AgentTable {
  id: Generated<string>;
  account_id: string;
  name: string;
  identifier: string | null;
  access_token: string;
  is_default: Generated<boolean>;
  secret_mode: Generated<string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SecretTable {
  id: Generated<string>;
  account_id: string;
  name: string;
  type: string;
  encrypted_value: string;
  host_pattern: string;
  path_pattern: string | null;
  injection_config: Json | null;
  metadata: Json | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PolicyRuleTable {
  id: Generated<string>;
  account_id: string;
  name: string;
  host_pattern: string;
  path_pattern: string | null;
  method: string | null;
  action: string;
  enabled: boolean;
  agent_id: string | null;
  rate_limit: number | null;
  rate_limit_window: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AgentSecretTable {
  agent_id: string;
  secret_id: string;
}

export interface ConnectedServiceTable {
  id: Generated<string>;
  account_id: string;
  provider: string;
  status: Generated<string>;
  access_token: string | null;
  refresh_token: string | null;
  token_expiry: Date | null;
  scopes: Generated<string[]>;
  metadata: Json | null;
  connected_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AuditLogTable {
  id: Generated<string>;
  account_id: string;
  user_id: string;
  action: string;
  service: string;
  status: string;
  source: Generated<string>;
  metadata: Json | null;
  created_at: Generated<Date>;
}

export interface VaultConnectionTable {
  id: Generated<string>;
  account_id: string;
  provider: string;
  name: string | null;
  status: string;
  connection_data: Json | null;
  last_connected_at: Date | null;
  last_used_at: Date | null;
  expires_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OnboardingSurveyTable {
  id: Generated<string>;
  account_id: string;
  use_case: string | null;
  discovery: Generated<string[]>;
  created_at: Generated<Date>;
}

export interface ResendBadEmailTable {
  id: Generated<string>;
  email: string;
  event_type: string;
  created_at: Generated<Date>;
}

export interface ResendWebhookTable {
  id: Generated<string>;
  event_type: string;
  email_subject: string | null;
  email_from: string | null;
  email_to: string | null;
  event_data: Json | null;
  created_at: Generated<Date>;
}

// ── Database interface ────────────────────────────────────────────────

export interface Database {
  accounts: AccountTable;
  account_members: AccountMemberTable;
  users: UserTable;
  api_keys: ApiKeyTable;
  agents: AgentTable;
  secrets: SecretTable;
  policy_rules: PolicyRuleTable;
  agent_secrets: AgentSecretTable;
  connected_services: ConnectedServiceTable;
  audit_logs: AuditLogTable;
  vault_connections: VaultConnectionTable;
  onboarding_surveys: OnboardingSurveyTable;
  resend_bad_emails: ResendBadEmailTable;
  resend_webhooks: ResendWebhookTable;
}

// ── Row types (SELECT result shapes) ──────────────────────────────────

export type Account = Selectable<AccountTable>;
export type NewAccount = Insertable<AccountTable>;
export type AccountUpdate = Updateable<AccountTable>;

export type User = Selectable<UserTable>;
export type NewUser = Insertable<UserTable>;
export type UserUpdate = Updateable<UserTable>;

export type Agent = Selectable<AgentTable>;
export type NewAgent = Insertable<AgentTable>;
export type AgentUpdate = Updateable<AgentTable>;

export type Secret = Selectable<SecretTable>;
export type NewSecret = Insertable<SecretTable>;
export type SecretUpdate = Updateable<SecretTable>;

export type PolicyRule = Selectable<PolicyRuleTable>;
export type NewPolicyRule = Insertable<PolicyRuleTable>;
export type PolicyRuleUpdate = Updateable<PolicyRuleTable>;

export type ApiKey = Selectable<ApiKeyTable>;
export type ConnectedService = Selectable<ConnectedServiceTable>;
export type AuditLog = Selectable<AuditLogTable>;
export type VaultConnection = Selectable<VaultConnectionTable>;

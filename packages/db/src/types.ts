/**
 * Kysely database type definitions — derived from Prisma schema.
 *
 * Column names use camelCase here. The CamelCasePlugin in kysely.ts
 * automatically maps these to snake_case in generated SQL and back
 * to camelCase in query results.
 *
 * `Generated<T>` marks columns with database-level defaults
 * (auto-generated IDs, timestamps, etc.). Optional on INSERT,
 * always present on SELECT.
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
  stripeCustomerId: string | null;
  subscriptionStatus: Generated<string>;
  demoSeeded: Generated<boolean>;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface AccountMemberTable {
  accountId: string;
  userId: string;
  role: string;
  createdAt: Generated<Date>;
}

export interface UserTable {
  id: Generated<string>;
  email: string;
  name: string | null;
  externalAuthId: string;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface ApiKeyTable {
  id: Generated<string>;
  key: string;
  userId: string;
  accountId: string;
  name: string | null;
  createdAt: Generated<Date>;
}

export interface AgentTable {
  id: Generated<string>;
  accountId: string;
  name: string;
  identifier: string | null;
  accessToken: string;
  isDefault: Generated<boolean>;
  secretMode: Generated<string>;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface SecretTable {
  id: Generated<string>;
  accountId: string;
  name: string;
  type: string;
  encryptedValue: string;
  hostPattern: string;
  pathPattern: string | null;
  injectionConfig: Json | null;
  metadata: Json | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface PolicyRuleTable {
  id: Generated<string>;
  accountId: string;
  name: string;
  hostPattern: string;
  pathPattern: string | null;
  method: string | null;
  action: string;
  enabled: boolean;
  agentId: string | null;
  rateLimit: number | null;
  rateLimitWindow: string | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface AgentSecretTable {
  agentId: string;
  secretId: string;
}

export interface ConnectedServiceTable {
  id: Generated<string>;
  accountId: string;
  provider: string;
  status: Generated<string>;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiry: Date | null;
  scopes: Generated<string[]>;
  metadata: Json | null;
  connectedAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface AuditLogTable {
  id: Generated<string>;
  accountId: string;
  userId: string;
  action: string;
  service: string;
  status: string;
  source: Generated<string>;
  metadata: Json | null;
  createdAt: Generated<Date>;
}

export interface VaultConnectionTable {
  id: Generated<string>;
  accountId: string;
  provider: string;
  name: string | null;
  status: string;
  connectionData: Json | null;
  lastConnectedAt: Date | null;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface OnboardingSurveyTable {
  id: Generated<string>;
  accountId: string;
  useCase: string | null;
  discovery: Generated<string[]>;
  createdAt: Generated<Date>;
}

export interface ResendBadEmailTable {
  id: Generated<string>;
  email: string;
  eventType: string;
  createdAt: Generated<Date>;
}

export interface ResendWebhookTable {
  id: Generated<string>;
  eventType: string;
  emailSubject: string | null;
  emailFrom: string | null;
  emailTo: string | null;
  eventData: Json | null;
  createdAt: Generated<Date>;
}

// ── Database interface ────────────────────────────────────────────────

export interface Database {
  accounts: AccountTable;
  accountMembers: AccountMemberTable;
  users: UserTable;
  apiKeys: ApiKeyTable;
  agents: AgentTable;
  secrets: SecretTable;
  policyRules: PolicyRuleTable;
  agentSecrets: AgentSecretTable;
  connectedServices: ConnectedServiceTable;
  auditLogs: AuditLogTable;
  vaultConnections: VaultConnectionTable;
  onboardingSurveys: OnboardingSurveyTable;
  resendBadEmails: ResendBadEmailTable;
  resendWebhooks: ResendWebhookTable;
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

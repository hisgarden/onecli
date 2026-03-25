export { db } from "./kysely.js";
export type { Database } from "./types.js";
export { generateId } from "./id.js";
export { isUniqueViolation } from "./errors.js";

// Re-export row types for consumers
export type {
  Account,
  User,
  Agent,
  Secret,
  PolicyRule,
  ApiKey,
  ConnectedService,
  AuditLog,
  VaultConnection,
  Json,
} from "./types.js";

// ── Services ────────────────────────────────────────────────────────────
export {
  listAgents,
  createAgent,
  deleteAgent,
  renameAgent,
  regenerateAgentToken,
  getDefaultAgent,
  getAgentSecrets,
  updateAgentSecrets,
  updateAgentSecretMode,
  generateAccessToken,
  type SecretMode,
} from "./services/agent-service";

export {
  listSecrets,
  createSecret,
  updateSecret,
  deleteSecret,
  type CreateSecretInput,
  type UpdateSecretInput,
} from "./services/secret-service";

export {
  listPolicyRules,
  createPolicyRule,
  updatePolicyRule,
  deletePolicyRule,
  type CreatePolicyRuleInput,
  type UpdatePolicyRuleInput,
} from "./services/policy-rule-service";

export { getUser, updateProfile } from "./services/user-service";

export {
  generateApiKey,
  getApiKey,
  regenerateApiKey,
} from "./services/api-key-service";

export { getGatewayCounts } from "./services/counts-service";

export { ServiceError, type ServiceErrorCode } from "./services/errors";

// ── Crypto ──────────────────────────────────────────────────────────────
export { cryptoService, type CryptoService } from "./crypto";

// ── Validations ─────────────────────────────────────────────────────────
export {
  createAgentSchema,
  renameAgentSchema,
  secretModeSchema,
  updateAgentSecretsSchema,
  IDENTIFIER_REGEX,
} from "./validations/agent";

export {
  createSecretSchema,
  updateSecretSchema,
  detectAnthropicAuthMode,
  parseAnthropicMetadata,
  anthropicAuthModes,
  type AnthropicAuthMode,
  type AnthropicSecretMetadata,
} from "./validations/secret";

export {
  createPolicyRuleSchema,
  updatePolicyRuleSchema,
} from "./validations/policy-rule";

export { updateProfileSchema } from "./validations/user";

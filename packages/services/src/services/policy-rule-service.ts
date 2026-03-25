import { db } from "@onecli/db";
import { generateId } from "@onecli/db/id";
import { ServiceError } from "./errors";
import {
  type CreatePolicyRuleInput,
  type UpdatePolicyRuleInput,
} from "../validations/policy-rule";

export type { CreatePolicyRuleInput, UpdatePolicyRuleInput };

export const listPolicyRules = async (accountId: string) => {
  return db
    .selectFrom("policyRules")
    .select([
      "id",
      "name",
      "hostPattern",
      "pathPattern",
      "method",
      "action",
      "enabled",
      "agentId",
      "rateLimit",
      "rateLimitWindow",
      "createdAt",
    ])
    .where("accountId", "=", accountId)
    .orderBy("createdAt", "desc")
    .execute();
};

export const createPolicyRule = async (
  accountId: string,
  input: CreatePolicyRuleInput,
) => {
  const name = input.name.trim();

  // Validate agent belongs to account if specified
  if (input.agentId) {
    const agent = await db
      .selectFrom("agents")
      .select("id")
      .where("id", "=", input.agentId)
      .where("accountId", "=", accountId)
      .executeTakeFirst();
    if (!agent) throw new ServiceError("NOT_FOUND", "Agent not found");
  }

  return db
    .insertInto("policyRules")
    .values({
      id: generateId(),
      name,
      hostPattern: input.hostPattern.trim(),
      pathPattern: input.pathPattern?.trim() || null,
      method: input.method || null,
      action: input.action,
      enabled: input.enabled,
      agentId: input.agentId || null,
      rateLimit:
        input.action === "rate_limit" ? (input.rateLimit ?? null) : null,
      rateLimitWindow:
        input.action === "rate_limit" ? (input.rateLimitWindow ?? null) : null,
      accountId,
    })
    .returning([
      "id",
      "name",
      "hostPattern",
      "pathPattern",
      "method",
      "action",
      "enabled",
      "agentId",
      "rateLimit",
      "rateLimitWindow",
      "createdAt",
    ])
    .executeTakeFirstOrThrow();
};

export const updatePolicyRule = async (
  accountId: string,
  ruleId: string,
  input: UpdatePolicyRuleInput,
) => {
  const rule = await db
    .selectFrom("policyRules")
    .select("id")
    .where("id", "=", ruleId)
    .where("accountId", "=", accountId)
    .executeTakeFirst();

  if (!rule) throw new ServiceError("NOT_FOUND", "Policy rule not found");

  // Validate agent belongs to account if changing agentId
  if (input.agentId) {
    const agent = await db
      .selectFrom("agents")
      .select("id")
      .where("id", "=", input.agentId)
      .where("accountId", "=", accountId)
      .executeTakeFirst();
    if (!agent) throw new ServiceError("NOT_FOUND", "Agent not found");
  }

  const data: Record<string, unknown> = {};

  if (input.name !== undefined) data.name = input.name.trim();
  if (input.hostPattern !== undefined)
    data.hostPattern = input.hostPattern.trim();
  if (input.pathPattern !== undefined)
    data.pathPattern = input.pathPattern?.trim() || null;
  if (input.method !== undefined) data.method = input.method || null;
  if (input.action !== undefined) {
    data.action = input.action;
    if (input.action === "block") {
      data.rateLimit = null;
      data.rateLimitWindow = null;
    }
  }
  if (input.enabled !== undefined) data.enabled = input.enabled;
  if (input.agentId !== undefined) data.agentId = input.agentId || null;
  if (input.rateLimit !== undefined) data.rateLimit = input.rateLimit;
  if (input.rateLimitWindow !== undefined)
    data.rateLimitWindow = input.rateLimitWindow;

  await db
    .updateTable("policyRules")
    .set(data)
    .where("id", "=", ruleId)
    .execute();
};

export const deletePolicyRule = async (accountId: string, ruleId: string) => {
  const rule = await db
    .selectFrom("policyRules")
    .select("id")
    .where("id", "=", ruleId)
    .where("accountId", "=", accountId)
    .executeTakeFirst();

  if (!rule) throw new ServiceError("NOT_FOUND", "Policy rule not found");

  await db.deleteFrom("policyRules").where("id", "=", ruleId).execute();
};

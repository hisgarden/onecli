import { randomBytes } from "crypto";
import { db } from "@onecli/db";
import { generateId } from "@onecli/db/id";
import { isUniqueViolation } from "@onecli/db/errors";
import { logger } from "../logger";
import { ServiceError } from "./errors";
import { IDENTIFIER_REGEX } from "../validations/agent";

const audit = logger.child({ component: "audit", service: "agent" });

export type SecretMode = "all" | "selective";

export const generateAccessToken = () =>
  `aoc_${randomBytes(32).toString("hex")}`;

export const listAgents = async (accountId: string) => {
  const agents = await db
    .selectFrom("agents")
    .select([
      "id",
      "name",
      "identifier",
      "accessToken",
      "isDefault",
      "secretMode",
      "createdAt",
    ])
    .select((eb) =>
      eb
        .selectFrom("agentSecrets")
        .whereRef("agentSecrets.agentId", "=", "agents.id")
        .select(eb.fn.countAll<number>().as("count"))
        .as("agentSecretsCount"),
    )
    .where("accountId", "=", accountId)
    .orderBy("isDefault", "desc")
    .orderBy("createdAt", "desc")
    .execute();

  return agents.map((a) => ({
    ...a,
    secretMode: a.secretMode as SecretMode,
    _count: { agentSecrets: Number(a.agentSecretsCount ?? 0) },
  }));
};

export const getDefaultAgent = async (accountId: string) => {
  return db
    .selectFrom("agents")
    .select(["id", "name", "accessToken", "isDefault", "createdAt"])
    .where("accountId", "=", accountId)
    .where("isDefault", "=", true)
    .executeTakeFirst();
};

export const createAgent = async (
  accountId: string,
  name: string,
  identifier: string,
) => {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 255) {
    throw new ServiceError(
      "BAD_REQUEST",
      "Name must be between 1 and 255 characters",
    );
  }

  const trimmedIdentifier = identifier.trim();
  if (!IDENTIFIER_REGEX.test(trimmedIdentifier)) {
    throw new ServiceError(
      "BAD_REQUEST",
      "Identifier must be 1-50 characters, start with a letter, and contain only lowercase letters, numbers, and hyphens",
    );
  }

  const existing = await db
    .selectFrom("agents")
    .select("id")
    .where("accountId", "=", accountId)
    .where("identifier", "=", trimmedIdentifier)
    .executeTakeFirst();
  if (existing) {
    throw new ServiceError(
      "CONFLICT",
      "An agent with this identifier already exists",
    );
  }

  const accessToken = generateAccessToken();

  try {
    const agent = await db
      .insertInto("agents")
      .values({
        id: generateId(),
        name: trimmed,
        identifier: trimmedIdentifier,
        accessToken,
        secretMode: "selective",
        accountId,
      })
      .returning(["id", "name", "identifier", "createdAt"])
      .executeTakeFirstOrThrow();

    // Auto-assign the first anthropic secret if one exists
    const anthropicSecret = await db
      .selectFrom("secrets")
      .select("id")
      .where("accountId", "=", accountId)
      .where("type", "=", "anthropic")
      .orderBy("createdAt", "asc")
      .executeTakeFirst();

    if (anthropicSecret) {
      await db
        .insertInto("agentSecrets")
        .values({ agentId: agent.id, secretId: anthropicSecret.id })
        .execute();
    }

    audit.info(
      { accountId, agentId: agent.id, identifier: trimmedIdentifier },
      "agent created",
    );

    return agent;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ServiceError(
        "CONFLICT",
        "An agent with this identifier already exists",
      );
    }
    throw err;
  }
};

export const deleteAgent = async (accountId: string, agentId: string) => {
  const agent = await db
    .selectFrom("agents")
    .select(["id", "isDefault"])
    .where("id", "=", agentId)
    .where("accountId", "=", accountId)
    .executeTakeFirst();

  if (!agent) throw new ServiceError("NOT_FOUND", "Agent not found");
  if (agent.isDefault)
    throw new ServiceError("BAD_REQUEST", "Cannot delete the default agent");

  await db.deleteFrom("agents").where("id", "=", agentId).execute();

  audit.info({ accountId, agentId }, "agent deleted");
};

export const renameAgent = async (
  accountId: string,
  agentId: string,
  name: string,
) => {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 255) {
    throw new ServiceError(
      "BAD_REQUEST",
      "Name must be between 1 and 255 characters",
    );
  }

  const agent = await db
    .selectFrom("agents")
    .select("id")
    .where("id", "=", agentId)
    .where("accountId", "=", accountId)
    .executeTakeFirst();

  if (!agent) throw new ServiceError("NOT_FOUND", "Agent not found");

  await db
    .updateTable("agents")
    .set({ name: trimmed })
    .where("id", "=", agentId)
    .execute();
};

export const regenerateAgentToken = async (
  accountId: string,
  agentId: string,
) => {
  const agent = await db
    .selectFrom("agents")
    .select("id")
    .where("id", "=", agentId)
    .where("accountId", "=", accountId)
    .executeTakeFirst();

  if (!agent) throw new ServiceError("NOT_FOUND", "Agent not found");

  const accessToken = generateAccessToken();

  const updated = await db
    .updateTable("agents")
    .set({ accessToken })
    .where("id", "=", agentId)
    .returning("accessToken")
    .executeTakeFirstOrThrow();

  return { accessToken: updated.accessToken };
};

export const getAgentSecrets = async (accountId: string, agentId: string) => {
  const agent = await db
    .selectFrom("agents")
    .select("id")
    .where("id", "=", agentId)
    .where("accountId", "=", accountId)
    .executeTakeFirst();

  if (!agent) throw new ServiceError("NOT_FOUND", "Agent not found");

  const rows = await db
    .selectFrom("agentSecrets")
    .select("secretId")
    .where("agentId", "=", agentId)
    .execute();

  return rows.map((r) => r.secretId);
};

export const updateAgentSecretMode = async (
  accountId: string,
  agentId: string,
  mode: SecretMode,
) => {
  const agent = await db
    .selectFrom("agents")
    .select(["id", "secretMode"])
    .where("id", "=", agentId)
    .where("accountId", "=", accountId)
    .executeTakeFirst();

  if (!agent) throw new ServiceError("NOT_FOUND", "Agent not found");

  const previousMode = agent.secretMode;

  await db
    .updateTable("agents")
    .set({ secretMode: mode })
    .where("id", "=", agentId)
    .execute();

  audit.info(
    { accountId, agentId, previousMode, newMode: mode },
    "agent secret_mode changed",
  );
};

export const updateAgentSecrets = async (
  accountId: string,
  agentId: string,
  secretIds: string[],
) => {
  const agent = await db
    .selectFrom("agents")
    .select("id")
    .where("id", "=", agentId)
    .where("accountId", "=", accountId)
    .executeTakeFirst();

  if (!agent) throw new ServiceError("NOT_FOUND", "Agent not found");

  // Validate all secrets belong to this account
  const secrets = await db
    .selectFrom("secrets")
    .select("id")
    .where("id", "in", secretIds)
    .where("accountId", "=", accountId)
    .execute();

  const validIds = new Set(secrets.map((s) => s.id));
  const invalid = secretIds.filter((id) => !validIds.has(id));
  if (invalid.length > 0) {
    throw new ServiceError("BAD_REQUEST", "One or more secrets not found");
  }

  await db.transaction().execute(async (trx) => {
    await trx
      .deleteFrom("agentSecrets")
      .where("agentId", "=", agentId)
      .execute();
    for (const secretId of secretIds) {
      await trx
        .insertInto("agentSecrets")
        .values({ agentId, secretId })
        .execute();
    }
  });
};

import { randomBytes } from "crypto";
import { db } from "@onecli/db";
import { generateId } from "@onecli/db/id";
import { ServiceError } from "./errors";

export const generateApiKey = () => `oc_${randomBytes(32).toString("hex")}`;

/**
 * Get the API key for a user in a specific account.
 */
export const getApiKey = async (userId: string, accountId: string) => {
  const apiKey = await db
    .selectFrom("apiKeys")
    .select("key")
    .where("userId", "=", userId)
    .where("accountId", "=", accountId)
    .executeTakeFirst();

  if (!apiKey) throw new ServiceError("NOT_FOUND", "API key not found");

  return { apiKey: apiKey.key };
};

/**
 * Regenerate the API key for a user in a specific account.
 */
export const regenerateApiKey = async (userId: string, accountId: string) => {
  const key = generateApiKey();

  const existing = await db
    .selectFrom("apiKeys")
    .select("id")
    .where("userId", "=", userId)
    .where("accountId", "=", accountId)
    .executeTakeFirst();

  if (existing) {
    await db
      .updateTable("apiKeys")
      .set({ key })
      .where("id", "=", existing.id)
      .execute();
  } else {
    await db
      .insertInto("apiKeys")
      .values({ id: generateId(), key, userId, accountId })
      .execute();
  }

  return { apiKey: key };
};

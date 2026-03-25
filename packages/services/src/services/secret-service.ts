import { db } from "@onecli/db";
import { generateId } from "@onecli/db/id";
import { cryptoService } from "../crypto";
import { logger } from "../logger";
import { ServiceError } from "./errors";
import {
  detectAnthropicAuthMode,
  type CreateSecretInput,
  type UpdateSecretInput,
} from "../validations/secret";

const audit = logger.child({ component: "audit", service: "secret" });

const SECRET_TYPE_LABELS: Record<string, string> = {
  anthropic: "Anthropic API Key",
  generic: "Generic Secret",
};

/**
 * Build a masked preview of a plaintext value.
 * Shows first 4 and last 4 characters: "sk-ant-a--------xxxx"
 */
const buildPreview = (plaintext: string): string => {
  if (plaintext.length <= 8) return "\u2022".repeat(plaintext.length);
  return `${plaintext.slice(0, 4)}${"\u2022".repeat(8)}${plaintext.slice(-4)}`;
};

export const listSecrets = async (accountId: string) => {
  const secrets = await db
    .selectFrom("secrets")
    .select([
      "id",
      "name",
      "type",
      "hostPattern",
      "pathPattern",
      "injectionConfig",
      "createdAt",
    ])
    .where("accountId", "=", accountId)
    .orderBy("createdAt", "desc")
    .execute();

  return secrets.map((s) => ({
    ...s,
    typeLabel: SECRET_TYPE_LABELS[s.type] ?? s.type,
  }));
};

export type { CreateSecretInput, UpdateSecretInput };

export const createSecret = async (
  accountId: string,
  input: CreateSecretInput,
) => {
  const name = input.name.trim();
  if (!name || name.length > 255) {
    throw new ServiceError(
      "BAD_REQUEST",
      "Name must be between 1 and 255 characters",
    );
  }

  const value = input.value.trim();
  if (!value) throw new ServiceError("BAD_REQUEST", "Secret value is required");

  const hostPattern = input.hostPattern.trim();
  if (!hostPattern)
    throw new ServiceError("BAD_REQUEST", "Host pattern is required");

  if (input.type === "generic") {
    if (!input.injectionConfig?.headerName?.trim()) {
      throw new ServiceError(
        "BAD_REQUEST",
        "Header name is required for generic secrets",
      );
    }
  }

  const encryptedValue = await cryptoService.encrypt(value);
  const preview = buildPreview(value);
  const pathPattern = input.pathPattern?.trim() || null;
  const injectionConfig =
    input.type === "generic" && input.injectionConfig
      ? JSON.stringify({
          headerName: input.injectionConfig.headerName.trim(),
          valueFormat: input.injectionConfig.valueFormat?.trim() || "{value}",
        })
      : null;

  const metadata =
    input.type === "anthropic"
      ? JSON.stringify({ authMode: detectAnthropicAuthMode(value) })
      : null;

  const secret = await db
    .insertInto("secrets")
    .values({
      id: generateId(),
      name,
      type: input.type,
      encryptedValue,
      hostPattern,
      pathPattern,
      injectionConfig,
      metadata,
      accountId,
    })
    .returning([
      "id",
      "name",
      "type",
      "hostPattern",
      "pathPattern",
      "createdAt",
    ])
    .executeTakeFirstOrThrow();

  audit.info(
    { accountId, secretId: secret.id, type: input.type, hostPattern },
    "secret created",
  );

  return { ...secret, preview };
};

export const deleteSecret = async (accountId: string, secretId: string) => {
  const secret = await db
    .selectFrom("secrets")
    .select("id")
    .where("id", "=", secretId)
    .where("accountId", "=", accountId)
    .executeTakeFirst();

  if (!secret) throw new ServiceError("NOT_FOUND", "Secret not found");

  await db.deleteFrom("secrets").where("id", "=", secretId).execute();

  audit.info({ accountId, secretId }, "secret deleted");
};

export const updateSecret = async (
  accountId: string,
  secretId: string,
  input: UpdateSecretInput,
) => {
  const secret = await db
    .selectFrom("secrets")
    .select(["id", "type"])
    .where("id", "=", secretId)
    .where("accountId", "=", accountId)
    .executeTakeFirst();

  if (!secret) throw new ServiceError("NOT_FOUND", "Secret not found");

  const data: Record<string, unknown> = {};

  if (input.value !== undefined) {
    const value = input.value.trim();
    if (!value)
      throw new ServiceError("BAD_REQUEST", "Secret value is required");
    data.encryptedValue = await cryptoService.encrypt(value);

    if (secret.type === "anthropic") {
      data.metadata = JSON.stringify({
        authMode: detectAnthropicAuthMode(value),
      });
    }
  }

  if (input.hostPattern !== undefined) {
    const hostPattern = input.hostPattern.trim();
    if (!hostPattern)
      throw new ServiceError("BAD_REQUEST", "Host pattern is required");
    data.hostPattern = hostPattern;
  }

  if (input.pathPattern !== undefined) {
    data.pathPattern = input.pathPattern?.trim() || null;
  }

  if (input.injectionConfig !== undefined && secret.type === "generic") {
    data.injectionConfig = input.injectionConfig
      ? JSON.stringify({
          headerName: input.injectionConfig.headerName.trim(),
          valueFormat: input.injectionConfig.valueFormat?.trim() || "{value}",
        })
      : null;
  }

  if (Object.keys(data).length === 0) {
    throw new ServiceError("BAD_REQUEST", "No fields to update");
  }

  await db
    .updateTable("secrets")
    .set(data)
    .where("id", "=", secretId)
    .execute();
};

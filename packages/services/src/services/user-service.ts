import { db } from "@onecli/db";
import { ServiceError } from "./errors";

export const getUser = async (userId: string) => {
  const user = await db
    .selectFrom("users")
    .select(["id", "email", "name", "createdAt"])
    .where("id", "=", userId)
    .executeTakeFirst();

  if (!user) throw new ServiceError("NOT_FOUND", "User not found");

  return user;
};

export const updateProfile = async (userId: string, name: string) => {
  const trimmed = name.trim();

  if (trimmed.length === 0 || trimmed.length > 255) {
    throw new ServiceError(
      "BAD_REQUEST",
      "Name must be between 1 and 255 characters",
    );
  }

  const user = await db
    .updateTable("users")
    .set({ name: trimmed })
    .where("id", "=", userId)
    .returning(["id", "email", "name"])
    .executeTakeFirstOrThrow();

  return user;
};

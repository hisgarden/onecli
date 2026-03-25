/**
 * Database error helpers — replaces Prisma.PrismaClientKnownRequestError.
 */

/** Check if an error is a PostgreSQL unique constraint violation (23505). */
export function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Error &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

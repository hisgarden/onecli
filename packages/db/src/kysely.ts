/**
 * Kysely database client — replaces PrismaClient.
 *
 * Uses CamelCasePlugin so application code uses camelCase property names
 * while PostgreSQL columns remain snake_case.
 */
import { CamelCasePlugin, Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { Database } from "./types.js";

// Construct DATABASE_URL from individual env vars (ECS/Secrets Manager)
if (!process.env.DATABASE_URL && process.env.DB_HOST) {
  const user = process.env.DB_USERNAME;
  const pass = encodeURIComponent(process.env.DB_PASSWORD ?? "");
  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT ?? "5432";
  const name = process.env.DB_NAME;
  process.env.DATABASE_URL = `postgresql://${user}:${pass}@${host}:${port}/${name}`;
}

const globalForKysely = globalThis as unknown as {
  kysely: Kysely<Database> | undefined;
};

function initDb(): Kysely<Database> {
  if (globalForKysely.kysely) return globalForKysely.kysely;

  const dialect = new PostgresDialect({
    pool: new pg.Pool({
      connectionString: process.env.DATABASE_URL,
    }),
  });

  const client = new Kysely<Database>({
    dialect,
    plugins: [new CamelCasePlugin()],
  });

  // Cache in development to avoid exhausting database connections on hot reload
  if (process.env.NODE_ENV !== "production") {
    globalForKysely.kysely = client;
  }

  return client;
}

export const db = initDb();
export type { Database };

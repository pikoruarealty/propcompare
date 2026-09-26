import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

/**
 * The read-only connection for developer analytics (schema v21, `DECISIONS.md`
 * 2026-09-26). It is bound to `propcompare_developer_reader`, which can select
 * the two released-analytics tables and nothing else: no raw event, no catalog
 * or account table, no `private` schema. So a developer query that reaches for
 * anything else fails in the database instead of leaking.
 *
 * Who the developer is still comes from `requirePortalRole("developer", …)` on
 * the normal `@/db` connection; this one only reads released figures.
 */

const url = process.env.DATABASE_DEVELOPER_READER_URL;

if (!url) {
  throw new Error("DATABASE_DEVELOPER_READER_URL is not set");
}

for (const other of [
  "DATABASE_URL",
  "DATABASE_SERVICE_URL",
  "DATABASE_ADMIN_URL",
] as const) {
  if (process.env[other] && process.env[other] === url) {
    throw new Error(
      `DATABASE_DEVELOPER_READER_URL must use its own read-only role, not ${other}`,
    );
  }
}

export const developerReaderDbClient = postgres(url);

export const developerReaderDb = drizzle(developerReaderDbClient);

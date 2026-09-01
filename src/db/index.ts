import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

if (
  process.env.DATABASE_SERVICE_URL &&
  process.env.DATABASE_URL === process.env.DATABASE_SERVICE_URL
) {
  throw new Error(
    "DATABASE_URL must use the restricted application role, not DATABASE_SERVICE_URL",
  );
}

export const dbClient = postgres(process.env.DATABASE_URL);

export const db = drizzle(dbClient);

import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const databaseAdminUrl =
  process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;

if (!databaseAdminUrl) {
  throw new Error("DATABASE_ADMIN_URL or DATABASE_URL is not set");
}

export default defineConfig({
  schema: "./src/db/schema/*.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseAdminUrl,
  },
  schemaFilter: ["public", "private"],
});

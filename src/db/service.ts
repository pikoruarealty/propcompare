import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { JSONB_DRIVER_TYPES } from "./jsonb-types";

/**
 * The sole `BYPASSRLS` service-role connection, reserved for two code paths: the
 * Phase 3 discovery/comparison matching service and the pricing module
 * (`src/lib/pricing/`, `DECISIONS.md` 2026-09-24 "price data"), which reaches it
 * only through `getPricingDb`. Nothing else may import this module — every other
 * code path uses `@/db`, which is bound to `propcompare_app` and has no
 * `private` schema access.
 */

if (!process.env.DATABASE_SERVICE_URL) {
  throw new Error("DATABASE_SERVICE_URL is not set");
}

if (process.env.DATABASE_SERVICE_URL === process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_SERVICE_URL must not use the restricted DATABASE_URL app role",
  );
}

export const serviceDbClient = postgres(process.env.DATABASE_SERVICE_URL, {
  types: JSONB_DRIVER_TYPES,
});

export const serviceDb = drizzle(serviceDbClient);

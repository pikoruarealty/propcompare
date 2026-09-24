import type { ServiceDb } from "@/lib/matching/budget-range";

/**
 * The service-role connection for the pricing module: the second code path allowed
 * to use it, after the budget matcher (`DECISIONS.md` 2026-09-24, "price data";
 * `AGENTS.md`). Everything in `src/lib/pricing/` takes the handle as a parameter so
 * it can be tested against the real database, and reaches for this only at the
 * edges (the admin routes and the after-publish step).
 *
 * The connection module throws at import when `DATABASE_SERVICE_URL` is unset, so it
 * is imported lazily and an unset variable means "no pricing here" (null), not a
 * crash of whatever imported this file, such as the publisher.
 */
export const getPricingDb = async (): Promise<ServiceDb | null> => {
  if (!process.env.DATABASE_SERVICE_URL) return null;
  try {
    const { serviceDb } = await import("@/db/service");
    return serviceDb as ServiceDb;
  } catch {
    return null;
  }
};

import { and, eq, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { unitVariants } from "@/db/schema/catalog";
import { unitPriceHistory } from "@/db/schema/private";

/**
 * The Phase 3 discovery/comparison budget-range matcher
 * (`docs/tasklists/2026-09-01-phase-3-budget-range-matching.md`,
 * `ARCHITECTURE.md`'s "Budget bucketing" section).
 *
 * This is the *only* code path allowed to compute a buyer's inclusive ±20%
 * match range against exact unit prices. It must only ever be called with the
 * service-role connection (`@/db/service`) — the database handle is a
 * parameter rather than a module import so this stays testable and so the
 * caller, not this module, is responsible for choosing the right connection.
 *
 * `private.unit_current_bucket` remains a coarse classification aid and is
 * deliberately not used here: adjacent buckets cannot guarantee an exact
 * ±20% tolerance at their edges (2026-09-01 DECISIONS.md entry), so this
 * queries `private.unit_price_history` directly instead.
 *
 * The result carries identifiers only. Nothing here may return a price, a
 * price-per-square-foot, or a derived bound — there is no field to leak
 * because none is selected.
 */

export type ServiceDb = PostgresJsDatabase<Record<string, never>>;

export interface BudgetRangeMatchParams {
  /** The buyer's stated lower bound, in whole INR. Must be positive. */
  minInr: number;
  /** The buyer's stated upper bound, in whole INR. Must be positive and >= minInr. */
  maxInr: number;
}

export interface BudgetRangeMatch {
  propertyId: string;
  unitVariantId: string;
}

export class InvalidBudgetRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBudgetRangeError";
  }
}

const assertValidRange = (params: BudgetRangeMatchParams): void => {
  const { minInr, maxInr } = params;
  if (
    !Number.isFinite(minInr) ||
    !Number.isFinite(maxInr) ||
    minInr <= 0 ||
    maxInr <= 0
  ) {
    throw new InvalidBudgetRangeError(
      "minInr and maxInr must be finite positive numbers",
    );
  }
  if (minInr > maxInr) {
    throw new InvalidBudgetRangeError("minInr must be <= maxInr");
  }
};

/**
 * Matches published unit variants whose *current* price (the
 * `unit_price_history` row with no `effective_to`) falls inside the
 * inclusive range `[minInr * 0.80, maxInr * 1.20]`. The multiplication is
 * done in Postgres against the `numeric` column, not in JavaScript, so the
 * boundary comparison never crosses a floating-point value.
 *
 * A property is published by virtue of having a `properties` row — see the
 * note on that in `src/lib/properties/queries.ts` — so no separate status
 * filter is needed here either; `unit_variants` only ever contains rows for
 * properties that reached that state through the publish transaction.
 */
export const matchPropertiesByBudgetRange = async (
  db: ServiceDb,
  params: BudgetRangeMatchParams,
): Promise<BudgetRangeMatch[]> => {
  assertValidRange(params);

  const rows = await db
    .selectDistinct({
      propertyId: unitVariants.propertyId,
      unitVariantId: unitVariants.id,
    })
    .from(unitPriceHistory)
    .innerJoin(
      unitVariants,
      eq(unitVariants.id, unitPriceHistory.unitVariantId),
    )
    .where(
      and(
        isNull(unitPriceHistory.effectiveTo),
        sql`${unitPriceHistory.priceInr} >= (${params.minInr}::numeric * 0.80)`,
        sql`${unitPriceHistory.priceInr} <= (${params.maxInr}::numeric * 1.20)`,
      ),
    );

  return rows;
};

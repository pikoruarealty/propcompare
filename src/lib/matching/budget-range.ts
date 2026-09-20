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

/**
 * `maxInr` is the buyer's stated upper bound. `maxUnbounded: true` instead
 * requests "no upper limit" — resolved, inside Postgres, against the
 * catalog's current maximum *current* price (2026-09-18 DECISIONS.md entry).
 * That resolved figure is a derived commercial value like any bound or
 * bucket: it is used only inside the `WHERE` clause below and is never
 * selected, returned, or logged — the caller cannot get it back even by
 * accident, because this function never has it as a JS value to leak.
 */
export type BudgetRangeMatchParams =
  | {
      /** The buyer's stated lower bound, in whole INR. Must be positive. */
      minInr: number;
      /** The buyer's stated upper bound, in whole INR. Must be positive and >= minInr. */
      maxInr: number;
    }
  | {
      minInr: number;
      maxUnbounded: true;
    };

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
  const { minInr } = params;
  if (!Number.isFinite(minInr) || minInr <= 0) {
    throw new InvalidBudgetRangeError(
      "minInr must be a finite positive number",
    );
  }
  if ("maxInr" in params) {
    const { maxInr } = params;
    if (!Number.isFinite(maxInr) || maxInr <= 0) {
      throw new InvalidBudgetRangeError(
        "maxInr must be a finite positive number",
      );
    }
    if (minInr > maxInr) {
      throw new InvalidBudgetRangeError("minInr must be <= maxInr");
    }
  }
};

/**
 * Matches published unit variants whose *current* price (the
 * `unit_price_history` row with no `effective_to`) falls inside the
 * inclusive range `[minInr * 0.80, upperBound]`, where `upperBound` is
 * `maxInr * 1.20` for a stated max, or the catalog's current maximum current
 * price for `maxUnbounded`. Both the multiplication and the `maxUnbounded`
 * resolution happen in Postgres against the `numeric` column, not in
 * JavaScript, so the boundary comparison never crosses a floating-point
 * value and the resolved figure never exists as a value this function could
 * return.
 *
 * A removed unit type (`removed_at` set) never matches. Whether the property
 * itself is listed is NOT decided here: this role reads only the tables the
 * matcher needs, not `properties`, and `matchPublishedProperties` applies the
 * listing check to the ids this returns. `unit_variants` only ever contains rows
 * for properties that reached publication through the publish transaction.
 */
export const matchPropertiesByBudgetRange = async (
  db: ServiceDb,
  params: BudgetRangeMatchParams,
): Promise<BudgetRangeMatch[]> => {
  assertValidRange(params);

  const upperBound =
    "maxInr" in params
      ? sql`${unitPriceHistory.priceInr} <= (${params.maxInr}::numeric * 1.20)`
      : sql`${unitPriceHistory.priceInr} <= (
          select max(${unitPriceHistory.priceInr})
          from ${unitPriceHistory}
          where ${unitPriceHistory.effectiveTo} is null
        )`;

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
        // A removed unit type never matches. Whether the PROPERTY is listed is not
        // checked here: this role can read only the tables the matcher needs, not
        // `properties`. `matchPublishedProperties` applies `isListed` to the ids
        // this returns, so an unlisted property never reaches a buyer.
        isNull(unitVariants.removedAt),
        sql`${unitPriceHistory.priceInr} >= (${params.minInr}::numeric * 0.80)`,
        upperBound,
      ),
    );

  return rows;
};

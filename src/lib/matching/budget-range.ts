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
 * A property with no current price on any of its unit types has no unit-level
 * answer, so it falls back to the price range its regulator states for the whole
 * project (`private.rera_price_ranges`, `DECISIONS.md` 2026-09-24): every live unit
 * type of it matches when that range overlaps the buyer's band. As soon as any unit
 * type of a property has an admin-entered price the range no longer applies to it,
 * and an unpriced unit type of such a property does not match at all.
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

  // The regulator's project range, for each unit type nobody has typed a price for.
  // A stated max bounds the band from above; "no upper limit" leaves it open.
  const upperOverlap =
    "maxInr" in params
      ? sql`and r.min_inr <= (${params.maxInr}::numeric * 1.20)`
      : sql``;
  const fallback = await db.execute<{
    propertyId: string;
    unitVariantId: string;
  }>(sql`
    select distinct p.id as "propertyId", uv.id as "unitVariantId"
    from private.rera_price_ranges r
    join public.properties p
      on upper(regexp_replace(trim(p.rera_registration_number), '[[:space:]]+', ' ', 'g'))
        = r.registration_number
    join public.unit_variants uv
      on uv.property_id = p.id and uv.removed_at is null
    where r.max_inr >= (${params.minInr}::numeric * 0.80)
      ${upperOverlap}
      -- Per unit type (owner direction, 2026-09-25): a typed price always wins, and
      -- a unit type nobody has priced falls back to the regulator's project range.
      and not exists (
        select 1
        from private.unit_price_history ph
        where ph.unit_variant_id = uv.id and ph.effective_to is null
      )
  `);

  const seen = new Set(
    rows.map((row) => `${row.propertyId}:${row.unitVariantId}`),
  );
  for (const row of fallback) {
    const key = `${row.propertyId}:${row.unitVariantId}`;
    if (!seen.has(key)) rows.push(row);
  }
  return rows;
};

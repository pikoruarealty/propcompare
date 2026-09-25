import { and, eq, isNull, sql } from "drizzle-orm";
import { unitVariants } from "@/db/schema/catalog";
import { stagedUnitPrices, unitPriceHistory } from "@/db/schema/private";
import type { ServiceDb } from "@/lib/matching/budget-range";
import { getPricingDb } from "./db";
import { nameKey } from "./staged";

export interface ApplyPricesResult {
  /** Unit types whose price changed (a new current price row was written). */
  applied: string[];
  /** Unit types that already had exactly this price. */
  unchanged: string[];
  /** Staged names no live unit type of the property carries (renamed or removed). */
  unknown: string[];
}

const empty = (): ApplyPricesResult => ({
  applied: [],
  unchanged: [],
  unknown: [],
});

/**
 * Copies a submission's staged prices into `private.unit_price_history` for the
 * property it published as, in one service-role transaction. A staged price whose
 * unit type now has that exact current price is just marked applied; otherwise the
 * current row is ended today and a new one (source `admin_manual`, created by the
 * admin who typed it) starts today, so the one-current-price-per-unit-type index
 * always holds. A staged name matching no live unit type is left staged and
 * reported. Safe to run again: applied rows are skipped.
 */
export const applyStagedPrices = async (
  db: ServiceDb,
  input: { submissionId: string; propertyId: string },
): Promise<ApplyPricesResult> =>
  db.transaction(async (tx) => {
    const staged = await tx
      .select()
      .from(stagedUnitPrices)
      .where(
        and(
          eq(stagedUnitPrices.submissionId, input.submissionId),
          isNull(stagedUnitPrices.appliedAt),
        ),
      );
    if (staged.length === 0) return empty();

    const variants = await tx
      .select({ id: unitVariants.id, name: unitVariants.variantName })
      .from(unitVariants)
      .where(
        and(
          eq(unitVariants.propertyId, input.propertyId),
          isNull(unitVariants.removedAt),
        ),
      );
    const idByName = new Map(variants.map((v) => [nameKey(v.name), v.id]));

    const result = empty();
    for (const row of staged) {
      const variantId = idByName.get(nameKey(row.unitVariantName));
      if (!variantId) {
        result.unknown.push(row.unitVariantName);
        continue;
      }
      const [same] = await tx
        .select({ id: unitPriceHistory.id })
        .from(unitPriceHistory)
        .where(
          and(
            eq(unitPriceHistory.unitVariantId, variantId),
            isNull(unitPriceHistory.effectiveTo),
            sql`${unitPriceHistory.priceInr} = ${row.priceInr}::numeric`,
          ),
        );
      if (same) {
        result.unchanged.push(row.unitVariantName);
      } else {
        await tx
          .update(unitPriceHistory)
          .set({ effectiveTo: sql`current_date` })
          .where(
            and(
              eq(unitPriceHistory.unitVariantId, variantId),
              isNull(unitPriceHistory.effectiveTo),
            ),
          );
        await tx.insert(unitPriceHistory).values({
          unitVariantId: variantId,
          priceInr: row.priceInr,
          effectiveFrom: sql`current_date`,
          source: "admin_manual",
          createdBy: row.enteredBy,
        });
        result.applied.push(row.unitVariantName);
      }
      await tx
        .update(stagedUnitPrices)
        .set({ appliedAt: new Date() })
        .where(eq(stagedUnitPrices.id, row.id));
    }
    return result;
  });

/**
 * The step `publishSubmission` runs once its transaction has committed. It never
 * throws: the property is already published, and a failed apply leaves the staged
 * prices as they were for the admin to retry from the Prices tab. `failed` is true
 * only when the apply could not run.
 */
export const applyPricesAfterPublish = async (input: {
  submissionId: string;
  propertyId: string;
}): Promise<ApplyPricesResult & { failed: boolean }> => {
  try {
    const db = await getPricingDb();
    if (!db) return { ...empty(), failed: false };
    return { ...(await applyStagedPrices(db, input)), failed: false };
  } catch {
    return { ...empty(), failed: true };
  }
};

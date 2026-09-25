import { and, eq, isNull } from "drizzle-orm";
import { unitVariants } from "@/db/schema/catalog";
import { stagedUnitPrices, unitPriceHistory } from "@/db/schema/private";
import type { ServiceDb } from "@/lib/matching/budget-range";

/**
 * Prices an admin has typed for a submission's unit types, and the price each of a
 * property's unit types has now. Both are commercial data: they are read and
 * written on the service role only, and reach nothing but the admin routes.
 */

/** Unit type names compare without regard to case or stray spaces. */
export const nameKey = (name: string): string =>
  name.trim().replace(/\s+/g, " ").toLocaleLowerCase();

const tidy = (name: string): string => name.trim().replace(/\s+/g, " ");

export interface StagedPrice {
  unitVariantName: string;
  priceInr: string;
  appliedAt: Date | null;
}

export const listStagedPrices = async (
  db: ServiceDb,
  submissionId: string,
): Promise<StagedPrice[]> =>
  db
    .select({
      unitVariantName: stagedUnitPrices.unitVariantName,
      priceInr: stagedUnitPrices.priceInr,
      appliedAt: stagedUnitPrices.appliedAt,
    })
    .from(stagedUnitPrices)
    .where(eq(stagedUnitPrices.submissionId, submissionId));

/** Sets (or replaces) the price for one unit type. A replaced price is unapplied again. */
export const setStagedPrice = async (
  db: ServiceDb,
  input: {
    submissionId: string;
    unitVariantName: string;
    priceInr: string;
    enteredBy: string;
  },
): Promise<void> => {
  await db
    .insert(stagedUnitPrices)
    .values({
      submissionId: input.submissionId,
      unitVariantName: tidy(input.unitVariantName),
      priceInr: input.priceInr,
      enteredBy: input.enteredBy,
    })
    .onConflictDoUpdate({
      target: [stagedUnitPrices.submissionId, stagedUnitPrices.unitVariantName],
      set: {
        priceInr: input.priceInr,
        enteredBy: input.enteredBy,
        appliedAt: null,
        updatedAt: new Date(),
      },
    });
};

export const clearStagedPrice = async (
  db: ServiceDb,
  input: { submissionId: string; unitVariantName: string },
): Promise<void> => {
  await db
    .delete(stagedUnitPrices)
    .where(
      and(
        eq(stagedUnitPrices.submissionId, input.submissionId),
        eq(stagedUnitPrices.unitVariantName, tidy(input.unitVariantName)),
      ),
    );
};

export interface CurrentUnitPrice {
  unitVariantName: string;
  priceInr: string;
}

/** The current price (no end date) of each live unit type of a property that has one. */
export const listCurrentPrices = async (
  db: ServiceDb,
  propertyId: string,
): Promise<CurrentUnitPrice[]> =>
  db
    .select({
      unitVariantName: unitVariants.variantName,
      priceInr: unitPriceHistory.priceInr,
    })
    .from(unitPriceHistory)
    .innerJoin(
      unitVariants,
      eq(unitVariants.id, unitPriceHistory.unitVariantId),
    )
    .where(
      and(
        eq(unitVariants.propertyId, propertyId),
        isNull(unitVariants.removedAt),
        isNull(unitPriceHistory.effectiveTo),
      ),
    );

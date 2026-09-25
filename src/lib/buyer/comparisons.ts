import { and, asc, eq, inArray } from "drizzle-orm";
import { isListed, variantIsLive } from "@/lib/properties/visibility";
import {
  comparisonItems,
  comparisons,
  properties,
  unitVariants,
} from "@/db/schema/catalog";
import { loadPropertySummariesByIds } from "@/lib/properties/queries";
import type { AppDb, ComparisonItemResult, ComparisonResult } from "./types";

export interface ComparisonItemInput {
  propertyId: string;
  unitVariantId?: string;
}

export type CreateComparisonFailure =
  | { reason: "property_not_found"; propertyId: string }
  | { reason: "unit_variant_not_found"; unitVariantId: string };

const hydrateComparisons = async (
  db: AppDb,
  rows: {
    comparisonId: string;
    createdAt: Date;
    propertyId: string;
    unitVariantId: string | null;
    displayOrder: number;
  }[],
): Promise<ComparisonResult[]> => {
  const summaries = await loadPropertySummariesByIds(db, [
    ...new Set(rows.map((row) => row.propertyId)),
  ]);

  const byComparison = new Map<
    string,
    { createdAt: Date; items: ComparisonItemResult[] }
  >();
  for (const row of rows) {
    const property = summaries.get(row.propertyId);
    if (!property) continue;
    const entry = byComparison.get(row.comparisonId);
    const item: ComparisonItemResult = {
      propertyId: row.propertyId,
      unitVariantId: row.unitVariantId,
      displayOrder: row.displayOrder,
      property,
    };
    if (entry) {
      entry.items.push(item);
    } else {
      byComparison.set(row.comparisonId, {
        createdAt: row.createdAt,
        items: [item],
      });
    }
  }

  return [...byComparison.entries()].map(([id, { createdAt, items }]) => ({
    id,
    createdAt: createdAt.toISOString(),
    items: items.sort((a, b) => a.displayOrder - b.displayOrder),
  }));
};

/** `GET /api/v1/comparisons` — the caller's comparisons, newest first. */
export const listComparisons = async (
  db: AppDb,
  userId: string,
): Promise<ComparisonResult[]> => {
  const rows = await db
    .select({
      comparisonId: comparisons.id,
      createdAt: comparisons.createdAt,
      propertyId: comparisonItems.propertyId,
      unitVariantId: comparisonItems.unitVariantId,
      displayOrder: comparisonItems.displayOrder,
    })
    .from(comparisons)
    .innerJoin(
      comparisonItems,
      eq(comparisonItems.comparisonId, comparisons.id),
    )
    .where(eq(comparisons.userId, userId))
    .orderBy(asc(comparisons.createdAt), asc(comparisonItems.displayOrder));

  const result = await hydrateComparisons(db, rows);
  return result.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
};

/**
 * `DELETE /api/v1/comparisons/{id}` — `false` means the caller has no such
 * comparison (unknown id, or someone else's: the two are indistinguishable on
 * purpose). Its items go with it (`ON DELETE CASCADE`).
 */
export const deleteComparison = async (
  db: AppDb,
  userId: string,
  comparisonId: string,
): Promise<boolean> => {
  const deleted = await db
    .delete(comparisons)
    .where(
      and(eq(comparisons.id, comparisonId), eq(comparisons.userId, userId)),
    )
    .returning({ id: comparisons.id });
  return deleted.length > 0;
};

/**
 * `POST /api/v1/comparisons` — creates one comparison with its full ordered
 * item list in a single transaction. `displayOrder` is assigned from array
 * position; every `propertyId` must be published and every `unitVariantId`,
 * when given, must belong to that property.
 */
export const createComparison = async (
  db: AppDb,
  userId: string,
  items: ComparisonItemInput[],
): Promise<ComparisonResult | CreateComparisonFailure> => {
  const propertyIds = [...new Set(items.map((item) => item.propertyId))];
  const foundProperties = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(inArray(properties.id, propertyIds), isListed));
  const foundPropertyIds = new Set(foundProperties.map((row) => row.id));
  for (const item of items) {
    if (!foundPropertyIds.has(item.propertyId)) {
      return { reason: "property_not_found", propertyId: item.propertyId };
    }
  }

  const unitVariantIds = [
    ...new Set(
      items
        .map((item) => item.unitVariantId)
        .filter((id): id is string => id !== undefined),
    ),
  ];
  const foundVariants =
    unitVariantIds.length === 0
      ? []
      : await db
          .select({ id: unitVariants.id, propertyId: unitVariants.propertyId })
          .from(unitVariants)
          .where(and(inArray(unitVariants.id, unitVariantIds), variantIsLive));
  const variantPropertyById = new Map(
    foundVariants.map((row) => [row.id, row.propertyId]),
  );
  for (const item of items) {
    if (item.unitVariantId === undefined) continue;
    const owningPropertyId = variantPropertyById.get(item.unitVariantId);
    if (
      owningPropertyId === undefined ||
      owningPropertyId !== item.propertyId
    ) {
      return {
        reason: "unit_variant_not_found",
        unitVariantId: item.unitVariantId,
      };
    }
  }

  // Saving the same comparison again (the same properties and unit types, in any
  // order) returns the one already saved instead of adding a duplicate.
  const signature = (
    list: { propertyId: string; unitVariantId?: string | null }[],
  ) =>
    list
      .map((item) => `${item.propertyId}~${item.unitVariantId ?? ""}`)
      .sort()
      .join("|");
  const wanted = signature(items);
  const already = (await listComparisons(db, userId)).find(
    (comparison) => signature(comparison.items) === wanted,
  );
  if (already) return already;

  const result = await db.transaction(async (tx) => {
    const [comparison] = await tx
      .insert(comparisons)
      .values({ userId })
      .returning();
    await tx.insert(comparisonItems).values(
      items.map((item, index) => ({
        comparisonId: comparison.id,
        propertyId: item.propertyId,
        unitVariantId: item.unitVariantId ?? null,
        displayOrder: index,
      })),
    );
    return comparison;
  });

  const summaries = await loadPropertySummariesByIds(db, propertyIds);
  return {
    id: result.id,
    createdAt: result.createdAt.toISOString(),
    items: items.map((item, index) => ({
      propertyId: item.propertyId,
      unitVariantId: item.unitVariantId ?? null,
      displayOrder: index,
      // Existence was already validated above, so this is always found.
      property: summaries.get(item.propertyId)!,
    })),
  };
};

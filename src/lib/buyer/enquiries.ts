import { and, eq } from "drizzle-orm";
import { isListed, variantIsLive } from "@/lib/properties/visibility";
import { enquiries, properties, unitVariants } from "@/db/schema/catalog";
import type { AppDb, EnquiryResult } from "./types";

export interface CreateEnquiryInput {
  propertyId: string;
  unitVariantId?: string;
  message?: string;
}

export type CreateEnquiryFailure =
  { reason: "property_not_found" } | { reason: "unit_variant_not_found" };

/**
 * `POST /api/v1/enquiries` — always created with `status: "new"`; buyers
 * cannot set status, only admin/developer review transitions it later.
 */
export const createEnquiry = async (
  db: AppDb,
  userId: string,
  input: CreateEnquiryInput,
): Promise<EnquiryResult | CreateEnquiryFailure> => {
  const [property] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.id, input.propertyId), isListed));
  if (!property) return { reason: "property_not_found" };

  if (input.unitVariantId !== undefined) {
    const [variant] = await db
      .select({ id: unitVariants.id, propertyId: unitVariants.propertyId })
      .from(unitVariants)
      .where(and(eq(unitVariants.id, input.unitVariantId), variantIsLive));
    if (!variant || variant.propertyId !== input.propertyId) {
      return { reason: "unit_variant_not_found" };
    }
  }

  const [row] = await db
    .insert(enquiries)
    .values({
      userId,
      propertyId: input.propertyId,
      unitVariantId: input.unitVariantId ?? null,
      message: input.message ?? null,
    })
    .returning();

  return {
    id: row.id,
    propertyId: row.propertyId,
    unitVariantId: row.unitVariantId,
    status: row.status,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
  };
};

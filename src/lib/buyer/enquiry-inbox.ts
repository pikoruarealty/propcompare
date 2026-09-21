import { desc, eq } from "drizzle-orm";
import type { AppDb } from "./types";
import { users } from "@/db/schema/auth";
import { enquiries, properties, unitVariants } from "@/db/schema/catalog";

export type EnquiryStatus = "new" | "contacted" | "closed";

export const ENQUIRY_STATUSES: readonly EnquiryStatus[] = [
  "new",
  "contacted",
  "closed",
];

export interface InboxEnquiry {
  id: string;
  status: EnquiryStatus;
  message: string | null;
  createdAt: string;
  propertyName: string;
  propertySlug: string;
  unitTypeName: string | null;
  buyerName: string;
  buyerPhone: string | null;
  buyerEmail: string;
}

/**
 * The admin inbox: every enquiry, newest first, with the property, the unit type
 * asked about and who to contact. The buyer's number is personal data and is read
 * only here, on an admin-only screen; it never reaches a buyer or developer
 * surface.
 */
export const listEnquiryInbox = async (db: AppDb): Promise<InboxEnquiry[]> => {
  const rows = await db
    .select({
      id: enquiries.id,
      status: enquiries.status,
      message: enquiries.message,
      createdAt: enquiries.createdAt,
      propertyName: properties.name,
      propertySlug: properties.slug,
      unitTypeName: unitVariants.variantName,
      buyerName: users.name,
      buyerPhone: users.phoneNumber,
      buyerEmail: users.email,
    })
    .from(enquiries)
    .innerJoin(properties, eq(properties.id, enquiries.propertyId))
    .innerJoin(users, eq(users.id, enquiries.userId))
    .leftJoin(unitVariants, eq(unitVariants.id, enquiries.unitVariantId))
    .orderBy(desc(enquiries.createdAt));

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }));
};

/** Moves an enquiry to another status; `false` when there is no such enquiry. */
export const setEnquiryStatus = async (
  db: AppDb,
  id: string,
  status: EnquiryStatus,
): Promise<boolean> => {
  const updated = await db
    .update(enquiries)
    .set({ status, updatedAt: new Date() })
    .where(eq(enquiries.id, id))
    .returning({ id: enquiries.id });
  return updated.length > 0;
};

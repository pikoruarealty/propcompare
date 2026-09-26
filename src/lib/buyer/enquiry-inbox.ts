import { desc, eq } from "drizzle-orm";
import type { AppDb } from "./types";
import { users } from "@/db/schema/auth";
import {
  developers,
  enquiries,
  properties,
  unitVariants,
} from "@/db/schema/catalog";

/**
 * An enquiry reaches the admin first (`new`). The admin may contact the buyer,
 * then either forward it to the property's developer or close it themselves;
 * `DECISIONS.md` 2026-09-25.
 */
export type EnquiryStatus = "new" | "contacted" | "forwarded" | "closed";

export const ENQUIRY_STATUSES: readonly EnquiryStatus[] = [
  "new",
  "contacted",
  "forwarded",
  "closed",
];

export interface InboxEnquiry {
  id: string;
  status: EnquiryStatus;
  message: string | null;
  createdAt: string;
  propertyName: string;
  propertySlug: string;
  /** The developer an enquiry would be (or was) forwarded to. */
  developerName: string;
  /** When it was forwarded; null until an admin does. */
  forwardedAt: string | null;
  unitTypeName: string | null;
  buyerName: string;
  buyerPhone: string | null;
  buyerEmail: string;
}

/**
 * The admin inbox: every enquiry, newest first, with the property, the unit type
 * asked about and who to contact. The buyer's number is personal data, held here
 * for every enquiry; once the admin forwards one, its developer sees the same
 * number for that enquiry alone (`listForwardedEnquiries`, `DECISIONS.md`
 * 2026-09-26) — an unforwarded or closed enquiry never reaches a developer, and
 * neither ever reaches a buyer.
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
      developerName: developers.name,
      forwardedAt: enquiries.forwardedAt,
      unitTypeName: unitVariants.variantName,
      buyerName: users.name,
      buyerPhone: users.phoneNumber,
      buyerEmail: users.email,
    })
    .from(enquiries)
    .innerJoin(properties, eq(properties.id, enquiries.propertyId))
    .innerJoin(developers, eq(developers.id, properties.developerId))
    .innerJoin(users, eq(users.id, enquiries.userId))
    .leftJoin(unitVariants, eq(unitVariants.id, enquiries.unitVariantId))
    .orderBy(desc(enquiries.createdAt));

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    forwardedAt: row.forwardedAt?.toISOString() ?? null,
  }));
};

/**
 * Moves an enquiry to another status; `false` when there is no such enquiry.
 * Forwarding stamps when it was sent on; moving it anywhere else leaves that
 * stamp as the record of the last time it was.
 */
export const setEnquiryStatus = async (
  db: AppDb,
  id: string,
  status: EnquiryStatus,
): Promise<boolean> => {
  const updated = await db
    .update(enquiries)
    .set({
      status,
      updatedAt: new Date(),
      ...(status === "forwarded" ? { forwardedAt: new Date() } : {}),
    })
    .where(eq(enquiries.id, id))
    .returning({ id: enquiries.id });
  return updated.length > 0;
};

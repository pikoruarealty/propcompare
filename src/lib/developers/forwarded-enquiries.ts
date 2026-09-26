import { and, desc, eq } from "drizzle-orm";
import type { AppDb } from "@/lib/buyer/types";
import { users } from "@/db/schema/auth";
import { enquiries, properties, unitVariants } from "@/db/schema/catalog";

/**
 * A developer's own forwarded enquiries (`DECISIONS.md` 2026-09-26, "A forwarded
 * enquiry is visible to its developer"): the buyer's name, message and phone
 * number, once the admin has forwarded it. An enquiry still with the admin
 * (`new`, `contacted`) or closed without forwarding never appears here — a
 * developer only ever sees what was deliberately released to them, the same
 * boundary as `listEnquiryInbox` on the admin side.
 *
 * `developerId` must come from `requirePortalRole("developer", …).role.developerId`,
 * never from request input, so one developer can never read another's rows.
 */
export interface ForwardedEnquiry {
  id: string;
  message: string | null;
  createdAt: string;
  forwardedAt: string;
  propertyName: string;
  propertySlug: string;
  unitTypeName: string | null;
  buyerName: string;
  buyerPhone: string | null;
}

export const listForwardedEnquiries = async (
  db: AppDb,
  developerId: string,
): Promise<ForwardedEnquiry[]> => {
  const rows = await db
    .select({
      id: enquiries.id,
      message: enquiries.message,
      createdAt: enquiries.createdAt,
      forwardedAt: enquiries.forwardedAt,
      propertyName: properties.name,
      propertySlug: properties.slug,
      unitTypeName: unitVariants.variantName,
      buyerName: users.name,
      buyerPhone: users.phoneNumber,
    })
    .from(enquiries)
    .innerJoin(properties, eq(properties.id, enquiries.propertyId))
    .innerJoin(users, eq(users.id, enquiries.userId))
    .leftJoin(unitVariants, eq(unitVariants.id, enquiries.unitVariantId))
    .where(
      and(
        eq(properties.developerId, developerId),
        eq(enquiries.status, "forwarded"),
      ),
    )
    .orderBy(desc(enquiries.forwardedAt));

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    // Selected only where status = 'forwarded', so this is always set.
    forwardedAt: row.forwardedAt!.toISOString(),
  }));
};

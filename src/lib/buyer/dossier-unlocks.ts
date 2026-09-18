import { and, eq } from "drizzle-orm";
import { dossierUnlocks, properties } from "@/db/schema/catalog";
import type { AppDb, DossierUnlockResult } from "./types";

/**
 * `POST /api/v1/dossier-unlocks` — the phone-verified-gate check happens at
 * the route (session `phoneNumberVerified`), not here; this function assumes
 * the caller already confirmed that. Idempotent on the existing unique
 * `(user_id, property_id)`: a repeat unlock call returns the original
 * `otpVerifiedAt` rather than erroring or refreshing it.
 */
export const unlockDossier = async (
  db: AppDb,
  userId: string,
  propertyId: string,
): Promise<DossierUnlockResult | null> => {
  const [property] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(eq(properties.id, propertyId));
  if (!property) return null;

  const [existing] = await db
    .select()
    .from(dossierUnlocks)
    .where(
      and(
        eq(dossierUnlocks.userId, userId),
        eq(dossierUnlocks.propertyId, propertyId),
      ),
    );

  const row =
    existing ??
    (
      await db
        .insert(dossierUnlocks)
        .values({ userId, propertyId, otpVerifiedAt: new Date() })
        .returning()
    )[0];

  return { propertyId, otpVerifiedAt: row.otpVerifiedAt.toISOString() };
};

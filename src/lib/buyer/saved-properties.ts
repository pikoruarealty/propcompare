import { and, desc, eq, sql } from "drizzle-orm";
import { isListed } from "@/lib/properties/visibility";
import { properties, savedProperties } from "@/db/schema/catalog";
import { loadPropertySummariesByIds } from "@/lib/properties/queries";
import type {
  AppDb,
  SavedPropertyEntry,
  SavedPropertyListResult,
} from "./types";

/** `GET /api/v1/saved-properties` — the caller's saved properties, newest first. */
export const listSavedProperties = async (
  db: AppDb,
  userId: string,
  page: number,
  pageSize: number,
): Promise<SavedPropertyListResult> => {
  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(savedProperties)
    .where(eq(savedProperties.userId, userId));
  const total = countRow?.total ?? 0;

  const rows = await db
    .select({
      propertyId: savedProperties.propertyId,
      savedAt: savedProperties.savedAt,
    })
    .from(savedProperties)
    .where(eq(savedProperties.userId, userId))
    .orderBy(desc(savedProperties.savedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const summaries = await loadPropertySummariesByIds(
    db,
    rows.map((row) => row.propertyId),
  );

  const data: SavedPropertyEntry[] = [];
  for (const row of rows) {
    const property = summaries.get(row.propertyId);
    // A saved row whose property no longer exists would mean the FK's
    // onDelete: "cascade" didn't fire — treat as absent rather than crash.
    if (!property) continue;
    data.push({ savedAt: row.savedAt.toISOString(), property });
  }

  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
};

/**
 * `POST /api/v1/saved-properties` — idempotent: saving an already-saved
 * property returns the existing row's `savedAt` rather than refreshing it or
 * erroring. `null` means the property doesn't exist (404 at the route).
 */
export const saveProperty = async (
  db: AppDb,
  userId: string,
  propertyId: string,
): Promise<SavedPropertyEntry | null> => {
  const [property] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.id, propertyId), isListed));
  if (!property) return null;

  const [existing] = await db
    .select()
    .from(savedProperties)
    .where(
      and(
        eq(savedProperties.userId, userId),
        eq(savedProperties.propertyId, propertyId),
      ),
    );

  const row =
    existing ??
    (
      await db
        .insert(savedProperties)
        .values({ userId, propertyId })
        .returning()
    )[0];

  const summaries = await loadPropertySummariesByIds(db, [propertyId]);
  const summary = summaries.get(propertyId);
  if (!summary || !row) return null;
  return { savedAt: row.savedAt.toISOString(), property: summary };
};

/** `DELETE /api/v1/saved-properties` — `false` means nothing was saved to remove. */
export const unsaveProperty = async (
  db: AppDb,
  userId: string,
  propertyId: string,
): Promise<boolean> => {
  const deleted = await db
    .delete(savedProperties)
    .where(
      and(
        eq(savedProperties.userId, userId),
        eq(savedProperties.propertyId, propertyId),
      ),
    )
    .returning({ id: savedProperties.id });
  return deleted.length > 0;
};

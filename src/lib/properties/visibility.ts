import { eq, isNull, sql } from "drizzle-orm";
import { properties, unitVariants } from "@/db/schema/catalog";

/**
 * What a buyer may see (schema v8). Every buyer-facing read of properties, unit
 * types and pictures applies these, so an unlisted or deleted property, and a
 * removed unit type, disappear everywhere at once: browse, search, matching, the
 * dossier, saved properties, comparisons, enquiries and the media route.
 *
 * Nothing is deleted: the rows stay (price history, saved comparisons and past
 * enquiries point at them) and an admin can list the property again.
 */

/** The property is listed. */
export const isListed = eq(properties.listingStatus, "listed");

/** The unit type has not been removed. */
export const variantIsLive = isNull(unitVariants.removedAt);

/** A picture that belongs to a removed unit type is not shown; one tied to no
 * unit type, or to a live one, is. */
export const mediaIsLive = sql`not exists (
  select 1 from unit_variants uv
  where uv.id = ${sql.identifier("property_media")}.${sql.identifier("unit_variant_id")}
    and uv.removed_at is not null
)`;

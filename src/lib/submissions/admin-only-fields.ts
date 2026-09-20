/**
 * Contract fields that describe a change an admin makes to a live listing. They are
 * never read from a brochure and never asked of the extraction model: taking an
 * amenity or a unit type off a listing, and unlisting or deleting it, are decisions
 * a person makes (schema v8). Only an existing property can be given them.
 */
export const ADMIN_ONLY_FIELD_KEYS = [
  "property.amenities_removed",
  "unit_variants_removed",
  "property.listing_status",
] as const;

export const isAdminOnlyField = (fieldKey: string): boolean =>
  (ADMIN_ONLY_FIELD_KEYS as readonly string[]).includes(fieldKey);

export const LISTING_STATUSES = ["listed", "unlisted", "deleted"] as const;
export type ListingStatusValue = (typeof LISTING_STATUSES)[number];

/**
 * Contract fields that describe a change to a live listing: taking an amenity, a
 * unit type or a picture off it, and unlisting or deleting it (schemas v8 and v9).
 * They are never read from a brochure and never asked of the extraction model, and
 * only an existing property can be given them.
 *
 * This is a description of the field, **not a permission**. Whoever may edit a
 * property may ask for these changes: an admin, or the property's own developer.
 * Whoever asks, nothing changes until an admin approves and publishes the edit.
 */
export const EDIT_ONLY_FIELD_KEYS = [
  "property.amenities_removed",
  "unit_variants_removed",
  "property.listing_status",
  "property.media_removed",
] as const;

export const isEditOnlyField = (fieldKey: string): boolean =>
  (EDIT_ONLY_FIELD_KEYS as readonly string[]).includes(fieldKey);

export const LISTING_STATUSES = ["listed", "unlisted", "deleted"] as const;
export type ListingStatusValue = (typeof LISTING_STATUSES)[number];

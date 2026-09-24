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

/**
 * The project's main photo (schema v14): a choice an admin makes in the Pictures
 * panel, not a value typed in the Fields panel and never something a brochure
 * states. Unlike the edit-only fields it applies to a new property too.
 */
export const MAIN_PHOTO_FIELD_KEY = "property.main_photo";

/** The Google Maps link (schema v15): typed by an admin in the Location tab and
 * never read from a brochure, so the extraction model is never asked for it. */
export const MAP_URL_FIELD_KEY = "property.google_maps_url";

/** Contract fields that are set from another panel or by a rule, never typed as
 * a field and never counted as one the listing is missing. */
export const isManagedElsewhere = (fieldKey: string): boolean =>
  isEditOnlyField(fieldKey) || fieldKey === MAIN_PHOTO_FIELD_KEY;

/**
 * Contract fields only a regulator's own record can state, never a brochure, so
 * they are never asked of the extraction model either. `property.
 * rera_project_land_area_sqft` is RERA's registered project land, independent of
 * the brochure's own plot area (`property.plot_area_sqft`); a brochure cannot
 * state RERA's figure, so asking a model to guess at it would risk a brochure
 * number landing in a field named for a different, authoritative source.
 */
export const RERA_ONLY_FIELD_KEYS = [
  "property.rera_project_land_area_sqft",
] as const;

export const LISTING_STATUSES = ["listed", "unlisted", "deleted"] as const;
export type ListingStatusValue = (typeof LISTING_STATUSES)[number];

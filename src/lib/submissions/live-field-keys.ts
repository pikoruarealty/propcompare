/**
 * The contract fields whose published value is a single simple value and is
 * loaded for display beside a proposed edit (`loadLiveValues`). Fields outside
 * this list (amenities, specifications, unit types) are not summarised: an edit
 * that leaves them out keeps what is published.
 */
export const LIVE_FIELD_KEYS = new Set([
  "property.name",
  "property.type",
  "property.city",
  "property.locality",
  "property.possession_status",
  "property.possession_date",
  "property.total_towers",
  "property.total_floors",
  "property.total_units",
  "property.plot_area_sqft",
  "property.rera_registration_number",
  "property.rera_construction_progress_percent",
  "property.legal_entity_id",
]);

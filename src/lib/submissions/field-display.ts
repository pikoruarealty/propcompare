/**
 * How the reconciliation screen groups and reads submission fields. Pure, so the
 * grouping, ordering and "what is still not stated" logic can be tested without a
 * browser or a database.
 *
 * Groups follow how an admin thinks about a listing, not how the contract is
 * keyed: a project's facts, the developer, amenities, specifications, and the
 * unit types. Every active field belongs to exactly one group, so nothing in the
 * contract is invisible on the screen.
 */

export type FieldGroupKey =
  | "project"
  | "location"
  | "developer"
  | "amenities"
  | "specifications"
  | "unit_types";

export const FIELD_GROUPS: {
  key: FieldGroupKey;
  title: string;
  description: string;
}[] = [
  {
    key: "project",
    title: "Project",
    description: "Name, location, possession and registration.",
  },
  {
    key: "location",
    title: "Location & connectivity",
    description:
      "Landmarks, transit, hospitals and schools near the project, and its plot number, as the brochure prints them.",
  },
  {
    key: "developer",
    title: "Developer",
    description:
      "How the developer is described, and the legal entity that registered the project.",
  },
  {
    key: "amenities",
    title: "Amenities",
    description: "What the project offers, from the approved list.",
  },
  {
    key: "specifications",
    title: "Specifications",
    description: "Construction, finishes and fittings.",
  },
  {
    key: "unit_types",
    title: "Unit types",
    description: "Each configuration, with its areas.",
  },
];

/** The specification fields the catalog files under "Location & legal"
 * (schema v12): what is near the project, not how it is built. */
const LOCATION_SPECIFICATION_KEYS = new Set([
  "property.google_maps_url",
  "property.latitude",
  "property.longitude",
  "property.specifications.nearby_connectivity",
  "property.specifications.nearby_hospitals",
  "property.specifications.nearby_schools",
  "property.specifications.plot_no",
]);

export const groupOfField = (fieldKey: string): FieldGroupKey => {
  if (fieldKey === "unit_variants") return "unit_types";
  if (fieldKey === "property.amenities") return "amenities";
  // The developer's own full amenities list is shown with the amenities, as it is
  // on the dossier, not among the construction specifications.
  if (fieldKey === "property.specifications.amenities_full_list")
    return "amenities";
  if (LOCATION_SPECIFICATION_KEYS.has(fieldKey)) return "location";
  if (fieldKey.startsWith("property.specifications.")) return "specifications";
  if (fieldKey.startsWith("developer.")) return "developer";
  if (fieldKey === "property.legal_entity_id") return "developer";
  return "project";
};

/** Project fields in a reading order (name and place first), then anything new. */
const PROJECT_ORDER = [
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
];

export const compareFieldsWithinGroup = (a: string, b: string): number => {
  const ai = PROJECT_ORDER.indexOf(a);
  const bi = PROJECT_ORDER.indexOf(b);
  if (ai !== -1 || bi !== -1) {
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  }
  return a.localeCompare(b);
};

export interface GroupableField {
  fieldKey: string;
}

/**
 * Splits the active contract into groups, marking each field as proposed (a
 * candidate exists) or not stated (none does). An active field with no candidate
 * is shown as "Not stated" — never blank, never guessed.
 */
export const groupFields = <A extends GroupableField, P extends GroupableField>(
  available: A[],
  proposed: P[],
): {
  group: (typeof FIELD_GROUPS)[number];
  rows: { field: A; candidate: P | null }[];
}[] => {
  const byKey = new Map(proposed.map((p) => [p.fieldKey, p]));
  return FIELD_GROUPS.map((group) => ({
    group,
    rows: available
      .filter((field) => groupOfField(field.fieldKey) === group.key)
      .sort((a, b) => compareFieldsWithinGroup(a.fieldKey, b.fieldKey))
      .map((field) => ({
        field,
        candidate: byKey.get(field.fieldKey) ?? null,
      })),
  })).filter(({ rows }) => rows.length > 0);
};

/** How many proposed candidates still need a human decision. */
export const countNeedingReview = (
  candidates: { reviewStatus: string }[],
): number =>
  candidates.filter(
    (c) => c.reviewStatus === "needs_review" || c.reviewStatus === "edited",
  ).length;

export const POSSESSION_STATUS_LABEL: Record<string, string> = {
  under_construction: "Under construction",
  nearing_possession: "Nearing possession",
  ready_to_move: "Ready to move",
};

export const AREA_BASIS_LABEL: Record<string, string> = {
  carpet: "Carpet",
  built_up: "Built-up",
  super_built_up: "Super built-up",
};

export const REVIEW_STATUS_LABEL: Record<string, string> = {
  needs_review: "Needs review",
  auto_accepted: "Accepted",
  confirmed: "Confirmed",
  edited: "Edited",
  rejected: "Rejected",
};

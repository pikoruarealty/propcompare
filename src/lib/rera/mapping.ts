import type { LegalEntityType } from "@/lib/developers/legal-entity-types";
import { areaToSqft } from "@/lib/units/measurements";
import { compareCarpetAreas, type CarpetUnitRow } from "./carpet-area";
import { buildReraSnapshot, snapshotFingerprint } from "./snapshot";
import type { RegulatorCarpetGroup, RegulatorRecord } from "./types";

/**
 * Where a regulator's record outranks a brochure or a hand entry.
 *
 * Owner decision (2026-09-20): anything RERA states takes priority. These are the
 * contract fields RERA speaks to; for each, the RERA value is what we propose. It
 * stays editable, and a difference from RERA is shown, never hidden and never
 * blocking. Fields RERA does not cover (amenities, specifications, unit types,
 * pictures) are not here and are never touched by a fetch.
 *
 * Deliberately not mapped, because the meaning is not settled: property type
 * (RERA's "Residential/Group Housing" is not our catalogue) and city and locality
 * (RERA gives a district). Carpet area per unit type is mapped separately
 * (`compareCarpetAreas`): RERA reports square metres and it is converted once,
 * there. Add others here once agreed, not by inference.
 *
 * `property.pincode` and `property.rera_project_land_area_sqft` were added here
 * 2026-09-22 (`DECISIONS.md`): both were readable off the regulator's record from
 * the start but had no `property_schema_fields` contract key, so a submission
 * could never write them. The land area figure is RERA's registered project land,
 * independent of the brochure's own plot area (`property.plot_area_sqft`, never
 * derived from this or vice versa) and is deliberately never asked of the OCR
 * extraction model (`RERA_ONLY_FIELD_KEYS`) since a brochure cannot state RERA's
 * own registered figure.
 */
export interface ReraFieldRule {
  fieldKey: string;
  label: string;
  read: (record: RegulatorRecord) => string | number | null;
}

export const RERA_AUTHORITATIVE_FIELDS: ReraFieldRule[] = [
  {
    fieldKey: "property.rera_registration_number",
    label: "RERA registration number",
    read: (record) => record.registrationNumber,
  },
  {
    fieldKey: "property.name",
    label: "Property name",
    read: (record) => record.projectName || null,
  },
  {
    fieldKey: "property.possession_date",
    label: "Possession date",
    read: (record) => record.completionDate,
  },
  {
    fieldKey: "property.total_units",
    label: "Total units",
    read: (record) => record.totalUnits,
  },
  {
    fieldKey: "property.rera_construction_progress_percent",
    label: "Construction progress (%)",
    read: (record) => record.constructionProgressPercent,
  },
  {
    fieldKey: "property.pincode",
    label: "Pincode",
    read: (record) => record.pincode,
  },
  {
    fieldKey: "property.rera_project_land_area_sqft",
    label: "RERA project land area (sq ft)",
    read: (record) =>
      record.landAreaSqm === null
        ? null
        : Math.round(areaToSqft(record.landAreaSqm, "sqm") * 100) / 100,
  },
  {
    // The most floors any block states in the latest filing. A brochure may count
    // podium or terrace levels the regulator does not, so a difference is shown for
    // review with that in words (see `compareWithRecord`), never taken silently.
    fieldKey: "property.total_floors",
    label: "Floors (RERA's latest filing)",
    read: (record) => {
      const floors = (record.details?.filing.blocks ?? [])
        .map((block) => block.floors)
        .filter((value): value is number => value !== null);
      return floors.length === 0 ? null : Math.max(...floors);
    },
  },
];

export const SNAPSHOT_FIELD_KEY = "property.rera_snapshot";
export const LATITUDE_FIELD_KEY = "property.latitude";
export const LONGITUDE_FIELD_KEY = "property.longitude";
export const MAP_URL_KEY = "property.google_maps_url";
export const LEGAL_ENTITY_FIELD_KEY = "property.legal_entity_id";

/**
 * Our kind of legal entity for the regulator's own wording of the promoter's type
 * ("LIMITED LIABILITY PARTNERSHIP FIRM", "COMPANY"). Order matters: an LLP's name
 * contains both "LIMITED" and "PARTNERSHIP". Anything not clearly one kind is
 * "other", for an admin to correct, never guessed into a specific kind.
 */
export const legalEntityTypeFromRera = (
  promoterType: string | null,
): LegalEntityType => {
  const type = (promoterType ?? "").toUpperCase();
  if (type.includes("LIMITED LIABILITY") || /\bLLP\b/.test(type)) return "llp";
  if (type.includes("PARTNERSHIP")) return "partnership";
  if (
    type.includes("COMPANY") ||
    type.includes("PRIVATE LIMITED") ||
    type.includes("PUBLIC LIMITED") ||
    /\b(PVT|LTD)\b/.test(type)
  ) {
    return "company";
  }
  if (type.includes("PROPRIETOR") || type.includes("INDIVIDUAL")) {
    return "proprietorship";
  }
  if (type.includes("TRUST")) return "trust";
  return "other";
};
export const POSSESSION_STATUS_FIELD_KEY = "property.possession_status";
export const AMENITIES_FIELD_KEY = "property.amenities";
export const UNIT_VARIANTS_FIELD_KEY = "unit_variants";

/**
 * Possession status has no field on RERA, but declared progress does, so it is
 * derived by a stated rule and labelled as derived: progress below 100 is under
 * construction; 100 is ready to move. "Nearing possession" is a judgement about
 * dates and is never derived; an admin can set it.
 */
export const derivePossessionStatus = (
  record: RegulatorRecord,
): "under_construction" | "ready_to_move" | null => {
  const progress = record.constructionProgressPercent;
  if (progress === null) return null;
  return progress >= 100 ? "ready_to_move" : "under_construction";
};

export type ComparisonStatus =
  /** We hold the same value RERA states. */
  | "same"
  /** We hold a different value; RERA's is the one to use. */
  | "differs"
  /** We hold nothing for this field; RERA supplies it. */
  | "not_held"
  /** RERA returned nothing for this field; ours is left alone. */
  | "rera_silent";

export interface ReraComparisonItem {
  fieldKey: string;
  label: string;
  /** What RERA states, for display. */
  reraValue: string | number | null;
  /** What we would write. Null when nothing can be proposed for this field. A
   * list (the amenity set) for a set-valued field. */
  proposedValue:
    | string
    | number
    | string[]
    | Record<string, unknown>[]
    | Record<string, unknown>
    | null;
  /** What we hold now, for display. */
  currentValue: string | number | null;
  status: ComparisonStatus;
  /** A plain-words remark, when the difference needs explaining. */
  note?: string;
  /** For carpet area by unit type: one row per unit type held, and the distinct
   * areas RERA lists, for the panel to show. */
  unitRows?: CarpetUnitRow[];
  carpetGroups?: RegulatorCarpetGroup[];
}

export interface LegalEntityChoice {
  id: string;
  legalName: string;
}

/** Fields compare by value, not by type: a stored numeric "67.72" and RERA's 67.72
 * are the same. Text compares exactly after trimming, so a change of case is a
 * difference — RERA's spelling is the one we adopt. */
const sameValue = (
  a: string | number | null,
  b: string | number | null,
): boolean => {
  if (a === null || b === null) return a === b;
  if (typeof a === "number" || typeof b === "number") {
    return Number(a) === Number(b);
  }
  return a.trim() === b.trim();
};

const nameKey = (name: string): string =>
  name.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** The recorded legal entity whose name equals RERA's promoter name, ignoring case
 * and punctuation. Only an unambiguous match counts; a promoter we have not
 * recorded is reported, never created here. */
export const matchLegalEntity = (
  promoterName: string | null,
  entities: LegalEntityChoice[],
): LegalEntityChoice | null => {
  if (!promoterName) return null;
  const key = nameKey(promoterName);
  if (key === "") return null;
  const matches = entities.filter(
    (entity) => nameKey(entity.legalName) === key,
  );
  return matches.length === 1 ? matches[0] : null;
};

const asDisplay = (value: unknown): string | number | null => {
  if (typeof value === "string" || typeof value === "number") return value;
  return null;
};

/**
 * Sets a RERA record beside what we hold. `current` maps a contract field key to
 * the value we would publish for it (a submission's candidate, else the live
 * property's value). Order follows `RERA_AUTHORITATIVE_FIELDS`, with the promoter
 * last.
 */
export const compareWithRecord = (
  record: RegulatorRecord,
  current: Record<string, unknown>,
  entities: LegalEntityChoice[],
  amenityLabels: Record<string, string> = {},
): ReraComparisonItem[] => {
  const items: ReraComparisonItem[] = RERA_AUTHORITATIVE_FIELDS.map((rule) => {
    const reraValue = rule.read(record);
    const currentValue = asDisplay(current[rule.fieldKey]);
    const status: ComparisonStatus =
      reraValue === null
        ? "rera_silent"
        : currentValue === null
          ? "not_held"
          : sameValue(reraValue, currentValue)
            ? "same"
            : "differs";
    return {
      fieldKey: rule.fieldKey,
      label: rule.label,
      reraValue,
      proposedValue: reraValue,
      currentValue,
      status,
    };
  });

  // Which filing the progress figure is from: a quarterly report (the promoter's)
  // or, only when none could be read, the older certified one.
  const progress = items.find(
    (item) => item.fieldKey === "property.rera_construction_progress_percent",
  );
  const filing = record.details?.filing;
  if (progress && progress.reraValue !== null && filing) {
    progress.note =
      filing.source === "quarterly_filing" && filing.quarter
        ? `As reported in the promoter's latest quarterly filing (${filing.quarter}, period ending ${filing.periodEndsOn ?? "not stated"}).`
        : filing.source === "certified_form_one"
          ? "The latest quarterly filing could not be read, so this is the older architect-certified figure."
          : undefined;
  }

  const floors = items.find(
    (item) => item.fieldKey === "property.total_floors",
  );
  if (floors && floors.status === "differs") {
    floors.note =
      "RERA counts the floors of its blocks as filed. A brochure can count podium, stilt or terrace levels as floors, so check which is meant before using RERA's number.";
  }

  // The project's position and its map link, from the boundary RERA draws. These
  // are proposals for an admin to confirm by looking at the map: they fill a gap,
  // and a pin an admin already holds is never overwritten by a later check.
  const centre = record.details?.centre ?? null;
  const positionRule = (
    fieldKey: string,
    label: string,
    reraValue: number | null,
  ): ReraComparisonItem => {
    const currentValue = asDisplay(current[fieldKey]);
    const differs =
      reraValue !== null &&
      currentValue !== null &&
      !sameValue(reraValue, currentValue);
    return {
      fieldKey,
      label,
      reraValue,
      proposedValue: currentValue === null ? reraValue : null,
      currentValue,
      status:
        reraValue === null
          ? "rera_silent"
          : currentValue === null
            ? "not_held"
            : differs
              ? "differs"
              : "same",
      note: differs
        ? "Kept: a position is already held, and an admin's confirmed pin is not overwritten. Check the map if RERA's centre looks right."
        : reraValue !== null && currentValue === null
          ? "The centre of the boundary RERA draws for the project. Check it on the map before publishing."
          : undefined,
    };
  };
  // Only for a record that tried to read the boundary: an older one never asked,
  // which is not the same as RERA drawing none.
  if (record.details) {
    items.push(
      positionRule(LATITUDE_FIELD_KEY, "Latitude", centre?.lat ?? null),
      positionRule(LONGITUDE_FIELD_KEY, "Longitude", centre?.lng ?? null),
    );
  }

  const heldMapUrl = asDisplay(current[MAP_URL_KEY]);
  const nameQuery = [
    asDisplay(current["property.name"]) ?? record.projectName,
    asDisplay(current["property.locality"]),
    asDisplay(current["property.city"]) ?? record.district,
  ]
    .filter((part): part is string | number => part !== null && part !== "")
    .join(" ");
  const boundaryLink = centre
    ? `https://www.google.com/maps?q=${centre.lat},${centre.lng}`
    : null;
  const searchLink =
    nameQuery !== ""
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(nameQuery)}`
      : null;
  const proposedMapUrl = boundaryLink ?? searchLink;
  if (record.details)
    items.push({
      fieldKey: MAP_URL_KEY,
      label: "Map link",
      reraValue: boundaryLink,
      proposedValue: heldMapUrl === null ? proposedMapUrl : null,
      currentValue: heldMapUrl,
      status:
        heldMapUrl !== null
          ? boundaryLink !== null && heldMapUrl !== boundaryLink
            ? "differs"
            : "same"
          : proposedMapUrl === null
            ? "rera_silent"
            : "not_held",
      note:
        heldMapUrl !== null
          ? boundaryLink !== null && heldMapUrl !== boundaryLink
            ? "Kept: a link is already held. RERA's boundary centre is a different place, so check the map."
            : undefined
          : boundaryLink !== null
            ? "A pin at the centre of the boundary RERA draws. Check it on the map before publishing."
            : searchLink !== null
              ? "RERA drew no boundary for this project, so this is a Google Maps search from its name and place. Check the map: a search can land on the wrong place."
              : undefined,
    });

  // Everything else RERA states about the project, kept as one reviewed item: the
  // quarter it is as on, open and covered area, availability, lifts and floors per
  // block, filing record, the team, and availability per carpet area.
  const snapshot = buildReraSnapshot(record);
  if (snapshot) {
    const held = current[SNAPSHOT_FIELD_KEY];
    const heldSnapshot =
      held !== null && typeof held === "object" && !Array.isArray(held)
        ? (held as Record<string, unknown>)
        : null;
    const describe = (value: Record<string, unknown> | null): string | null => {
      if (!value) return null;
      const filing = value.filing as
        | { quarter?: string | null; progressPercent?: number | null }
        | undefined;
      const inventory = value.inventory as
        | { availableUnits?: number | null; asOn?: string | null }
        | null
        | undefined;
      const parts = [
        filing?.quarter ? `filing ${filing.quarter}` : "latest figures",
        typeof inventory?.availableUnits === "number"
          ? `${inventory.availableUnits} units available as on ${inventory.asOn ?? "an unstated date"}`
          : null,
      ].filter((part): part is string => part !== null);
      return parts.join(", ");
    };
    const same =
      heldSnapshot !== null &&
      snapshotFingerprint(heldSnapshot) === snapshotFingerprint(snapshot);
    items.push({
      fieldKey: SNAPSHOT_FIELD_KEY,
      label: "RERA project facts",
      reraValue: describe(snapshot as unknown as Record<string, unknown>),
      proposedValue: snapshot as unknown as Record<string, unknown>,
      currentValue: describe(heldSnapshot),
      status: same ? "same" : heldSnapshot === null ? "not_held" : "differs",
      note: same
        ? undefined
        : "Open and covered area, units booked and available, lifts, filing record, the team and availability by carpet area, as RERA states them. Shown on the property's page with the quarter or date each is as on.",
    });
  }

  // Possession status: derived, so it says so.
  const derived = derivePossessionStatus(record);
  const currentStatus = asDisplay(current[POSSESSION_STATUS_FIELD_KEY]);
  items.push({
    fieldKey: POSSESSION_STATUS_FIELD_KEY,
    label: "Possession status",
    reraValue: derived,
    proposedValue: derived,
    currentValue: currentStatus,
    status:
      derived === null
        ? "rera_silent"
        : currentStatus === null
          ? "not_held"
          : sameValue(derived, currentStatus)
            ? "same"
            : "differs",
    note:
      derived === null
        ? undefined
        : "Derived from RERA's declared progress: under 100% is under construction.",
  });

  // Amenities: RERA has no list, only a swimming-pool declaration on some
  // projects. It can add to the set, never remove from it, and silence is not a
  // statement that anything is missing.
  const held = Array.isArray(current[AMENITIES_FIELD_KEY])
    ? (current[AMENITIES_FIELD_KEY] as unknown[]).filter(
        (key): key is string => typeof key === "string",
      )
    : [];
  const declared = record.declaredAmenityKeys ?? [];
  const label = (key: string) => amenityLabels[key] ?? key;
  const missing = declared.filter((key) => !held.includes(key));
  items.push({
    fieldKey: AMENITIES_FIELD_KEY,
    label: "Amenities",
    reraValue: declared.length > 0 ? declared.map(label).join(", ") : null,
    proposedValue: missing.length > 0 ? [...held, ...missing] : null,
    currentValue: held.length > 0 ? held.map(label).join(", ") : null,
    status:
      declared.length === 0
        ? "rera_silent"
        : missing.length === 0
          ? "same"
          : "not_held",
    note:
      declared.length === 0
        ? "RERA lists no amenities for this project, so ours are left as they are."
        : missing.length > 0
          ? "RERA declares this and it is not yet listed. It is added; nothing is removed."
          : undefined,
  });

  const currentEntityId = asDisplay(current[LEGAL_ENTITY_FIELD_KEY]);
  const currentEntity =
    typeof currentEntityId === "string"
      ? (entities.find((entity) => entity.id === currentEntityId) ?? null)
      : null;
  const matched = matchLegalEntity(record.promoterName, entities);
  const promoterStatus: ComparisonStatus =
    record.promoterName === null
      ? "rera_silent"
      : matched === null
        ? currentEntity === null
          ? "not_held"
          : "differs"
        : currentEntity?.id === matched.id
          ? "same"
          : currentEntity === null
            ? "not_held"
            : "differs";
  items.push({
    fieldKey: LEGAL_ENTITY_FIELD_KEY,
    label: "Promoter (legal entity)",
    reraValue: record.promoterName,
    proposedValue: matched?.id ?? null,
    currentValue: currentEntity?.legalName ?? null,
    status: promoterStatus,
    note:
      record.promoterName !== null && matched === null
        ? "None of this developer's recorded legal entities matches this promoter name. Add it on the developer page, then fetch again."
        : undefined,
  });

  // Carpet area by unit type, from RERA's per-flat list. Written as the carpet
  // basis of each matched unit type; nothing else about a type changes.
  const carpet = compareCarpetAreas(
    record.carpetGroups ?? [],
    current[UNIT_VARIANTS_FIELD_KEY],
  );
  const rowStatuses = carpet.rows.map((row) => row.status);
  const carpetStatus: ComparisonStatus = rowStatuses.includes("differs")
    ? "differs"
    : rowStatuses.includes("not_held")
      ? "not_held"
      : rowStatuses.includes("same")
        ? "same"
        : "rera_silent";
  const withCarpet = carpet.rows.filter(
    (row) => row.currentSqft !== null,
  ).length;
  items.push({
    fieldKey: UNIT_VARIANTS_FIELD_KEY,
    label: "Carpet area by unit type",
    reraValue:
      carpet.groups.length > 0
        ? `${carpet.groups.length} carpet area${carpet.groups.length === 1 ? "" : "s"} listed`
        : null,
    proposedValue: carpet.proposedVariants,
    currentValue:
      carpet.rows.length > 0
        ? `${withCarpet} of ${carpet.rows.length} unit types`
        : null,
    status: carpetStatus,
    note:
      carpet.groups.length === 0
        ? (record.gaps ?? []).includes("flat carpet areas")
          ? "RERA's flat list was not read on this fetch. Fetch again to get carpet areas."
          : "RERA lists no carpet areas for this project."
        : carpet.rows.length === 0
          ? "No unit types are entered yet. Add them, then fetch again to match RERA's carpet areas."
          : undefined,
    unitRows: carpet.rows,
    carpetGroups: carpet.groups,
  });
  return items;
};

/** Items that a "use RERA values" action would write: RERA spoke, we have a value
 * to propose, and it is not already what we hold. */
export const writableItems = (
  items: ReraComparisonItem[],
): ReraComparisonItem[] =>
  items.filter(
    (item) =>
      item.proposedValue !== null &&
      (item.status === "differs" || item.status === "not_held"),
  );

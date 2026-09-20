import type { RegulatorRecord } from "./types";

/**
 * Where a regulator's record outranks a brochure or a hand entry.
 *
 * Owner decision (2026-09-20): anything RERA states takes priority. These are the
 * contract fields RERA speaks to; for each, the RERA value is what we propose. It
 * stays editable, and a difference from RERA is shown, never hidden and never
 * blocking. Fields RERA does not cover (amenities, specifications, unit types,
 * pictures) are not here and are never touched by a fetch.
 *
 * Deliberately not mapped, because the meaning or unit is not settled: property
 * type (RERA's "Residential/Group Housing" is not our catalogue), city and
 * locality (RERA gives a district), and areas (RERA reports square metres; we hold
 * square feet). Add them here once agreed, not by inference.
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
];

export const LEGAL_ENTITY_FIELD_KEY = "property.legal_entity_id";

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
  /** What we would write. Null when nothing can be proposed for this field. */
  proposedValue: string | number | null;
  /** What we hold now, for display. */
  currentValue: string | number | null;
  status: ComparisonStatus;
  /** A plain-words remark, when the difference needs explaining. */
  note?: string;
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

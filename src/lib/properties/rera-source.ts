/**
 * Which published facts can honestly be credited to the regulator.
 *
 * GujRERA's terms allow reuse if the data is accurate, not misleading, and the
 * source is acknowledged (DECISIONS.md, 2026-09-20). A published value can come
 * from a brochure, a hand entry or the regulator, and an admin may keep a value
 * that differs from RERA's, so the source line is not put on a whole section.
 * A fact is credited only when the last successful check of the regulator's record
 * stated exactly the value now published. Derived values (possession status, from
 * declared progress) are never credited: RERA did not say them.
 */

export type ReraSourcedFact =
  | "registration_number"
  | "construction_progress"
  | "possession_date"
  | "total_units";

/** What the regulator's record stated at the last successful check. */
export interface CheckedRecord {
  registrationNumber?: unknown;
  constructionProgressPercent?: unknown;
  completionDate?: unknown;
  totalUnits?: unknown;
}

export interface PublishedRegulatorFacts {
  registrationNumber: string | null;
  /** Numeric text, as stored (two decimals). */
  constructionProgressPercent: string | null;
  /** YYYY-MM-DD. */
  possessionDate: string | null;
  totalUnits: number | null;
}

const normaliseNumber = (value: string): string =>
  value.trim().replace(/\s+/g, " ").toUpperCase();

/** Progress is stored to two decimals, RERA states more: equal to the stored one. */
const sameProgress = (published: string, stated: number): boolean => {
  const value = Number(published);
  return Number.isFinite(value) && Math.abs(value - stated) <= 0.005 + 1e-9;
};

export const reraSourcedFacts = (
  record: CheckedRecord | null,
  published: PublishedRegulatorFacts,
): ReraSourcedFact[] => {
  if (record === null) return [];
  const facts: ReraSourcedFact[] = [];

  if (
    typeof record.registrationNumber === "string" &&
    published.registrationNumber !== null &&
    normaliseNumber(record.registrationNumber) ===
      normaliseNumber(published.registrationNumber)
  ) {
    facts.push("registration_number");
  }
  if (
    typeof record.constructionProgressPercent === "number" &&
    published.constructionProgressPercent !== null &&
    sameProgress(
      published.constructionProgressPercent,
      record.constructionProgressPercent,
    )
  ) {
    facts.push("construction_progress");
  }
  if (
    typeof record.completionDate === "string" &&
    published.possessionDate !== null &&
    record.completionDate === published.possessionDate
  ) {
    facts.push("possession_date");
  }
  if (
    typeof record.totalUnits === "number" &&
    published.totalUnits !== null &&
    record.totalUnits === published.totalUnits
  ) {
    facts.push("total_units");
  }
  return facts;
};

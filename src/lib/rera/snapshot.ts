import type {
  RegulatorCarpetGroup,
  RegulatorDetails,
  RegulatorRecord,
} from "./types";

/**
 * The regulator's latest project facts as they are stored on a property
 * (`properties.rera_snapshot`, schema v17): the record's `details` plus the
 * carpet-area groups with their availability. One versioned object, so a fact can
 * be promoted to a column later without losing anything already stored.
 *
 * It holds what the regulator states and nothing about when we asked: the time of
 * the fetch is not part of it, so a check that finds the same facts proposes no
 * change. Each figure carries the quarter or date it is "as on" instead.
 */
export type ReraSnapshot = RegulatorDetails & {
  source: string;
  carpetGroups: RegulatorCarpetGroup[];
};

export const RERA_SNAPSHOT_VERSION = 1;

/** The snapshot a record would publish, or null when the record predates the
 * second-pass fields and so has no details to store. */
export const buildReraSnapshot = (
  record: RegulatorRecord,
): ReraSnapshot | null =>
  record.details
    ? {
        ...record.details,
        source: record.regulatorCode,
        carpetGroups: record.carpetGroups ?? [],
      }
    : null;

/** Money and personal contact details never enter a public table. The adapter
 * does not read them; this refuses a snapshot that carries a key named for one,
 * so the rule holds for anything that reaches the publish transaction. */
const FORBIDDEN_KEY =
  /cost|price|amount|consider|penalt|mobile|phone|email|aadhaar|aadhar|pan_?no|account|ifsc|passbook|kyc/i;

const MAX_BYTES = 200_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const forbiddenKey = (value: unknown, depth = 0): string | null => {
  if (depth > 8) return "nesting";
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = forbiddenKey(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) return key;
    const found = forbiddenKey(item, depth + 1);
    if (found) return found;
  }
  return null;
};

/** The message for a value that is not a storable snapshot, or null when it is. */
export const reraSnapshotProblem = (value: unknown): string | null => {
  if (!isRecord(value)) return "must be an object";
  if (value.version !== RERA_SNAPSHOT_VERSION) {
    return `must have version ${RERA_SNAPSHOT_VERSION}`;
  }
  if (typeof value.source !== "string" || value.source === "") {
    return "must name its regulator";
  }
  if (!isRecord(value.filing)) return "must state its latest filing";
  for (const list of [
    "boundary",
    "carpetGroups",
    "architects",
    "engineers",
    "contractors",
  ]) {
    if (!Array.isArray(value[list])) return `must list ${list}`;
  }
  // The promoter's stated history, when a snapshot carries it: three whole numbers.
  if (value.promoter !== undefined && value.promoter !== null) {
    const promoter = value.promoter;
    if (!isRecord(promoter)) {
      return "must state the promoter's history as an object";
    }
    for (const figure of [
      "yearsInGujarat",
      "completedProjects",
      "ongoingProjects",
    ]) {
      const number = promoter[figure];
      if (
        number !== null &&
        (typeof number !== "number" ||
          !Number.isInteger(number) ||
          number < 0 ||
          number > 9999)
      ) {
        return `must state the promoter's ${figure} as a whole number or null`;
      }
    }
  }
  const key = forbiddenKey(value);
  if (key)
    return `may not carry "${key}": no money or contact detail is stored`;
  if (JSON.stringify(value).length > MAX_BYTES) return "is too large";
  return null;
};

/** A stable text for two snapshots to be compared by (key order does not count). */
export const snapshotFingerprint = (value: unknown): string => {
  const sort = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sort);
    if (isRecord(input)) {
      return Object.fromEntries(
        Object.keys(input)
          .sort()
          .map((key) => [key, sort(input[key])]),
      );
    }
    return input;
  };
  return JSON.stringify(sort(value));
};

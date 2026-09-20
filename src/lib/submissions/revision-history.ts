/**
 * What each publish changed, read from `property_revisions` (one snapshot per
 * publish, holding the fields that publish contained). Read only.
 *
 * An edit's snapshot holds only the fields it changed, so walking the revisions
 * oldest first and remembering the last value seen for each field gives "was → now"
 * for every edit. Only single values are shown as text; a set (amenities, unit
 * types, specifications) is reported as changed without a before-and-after, because
 * a one-line rendering of it would mislead. No prices appear here: exact prices
 * never enter the fields a revision holds.
 */
export interface RevisionChange {
  fieldKey: string;
  label: string;
  /** The value before, when it was a single value that had been published. */
  from: string | null;
  /** The value after, when it is a single value. */
  to: string | null;
  /** A set or structured value: changed, but not shown as text. */
  complex: boolean;
}

export interface RevisionEntry {
  submissionId: string;
  publishedAt: Date;
  /** The publish that created the property; its changes list stays empty. */
  isNewProperty: boolean;
  changes: RevisionChange[];
}

const singleValueText = (value: unknown): string | null => {
  if (typeof value === "string" && value.length <= 200) return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
};

const sameValue = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

export const buildRevisionHistory = (
  revisions: {
    submissionId: string;
    publishedAt: Date;
    snapshot: unknown;
  }[],
  labels: ReadonlyMap<string, string>,
): RevisionEntry[] => {
  const held = new Map<string, unknown>();
  return [...revisions]
    .sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime())
    .map((revision) => {
      const snapshot = (revision.snapshot ?? {}) as {
        isNewProperty?: unknown;
        fields?: Record<string, unknown>;
      };
      const isNewProperty = snapshot.isNewProperty === true;
      const changes: RevisionChange[] = [];
      for (const [fieldKey, value] of Object.entries(snapshot.fields ?? {})) {
        const had = held.has(fieldKey);
        const before = held.get(fieldKey);
        held.set(fieldKey, value);
        if (isNewProperty || (had && sameValue(before, value))) continue;
        const to = singleValueText(value);
        const from = had ? singleValueText(before) : null;
        changes.push({
          fieldKey,
          label: labels.get(fieldKey) ?? fieldKey,
          from,
          to,
          complex: to === null || (had && from === null),
        });
      }
      changes.sort((a, b) => a.label.localeCompare(b.label));
      return {
        submissionId: revision.submissionId,
        publishedAt: revision.publishedAt,
        isNewProperty,
        changes,
      };
    });
};

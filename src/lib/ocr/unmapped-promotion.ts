import {
  deduplicateSubmissionEvidence,
  type OcrUnmappedEvidenceCandidate,
  type SubmissionFieldCandidate,
} from "./adapter";

/**
 * Facts a paid read found and had no field for at the time.
 *
 * The model is told to put a useful fact that has no active field key into
 * `unmappedRawEvidence` rather than invent a destination (`DECISIONS.md`
 * 2026-09-23, "don't discard what was read"). Fields added afterwards (schema v12's
 * specifications, the nearby places, vastu) then had nothing to receive what an
 * earlier run had already read, and the Godrej Altus brochure's whole
 * specification sheet, connectivity and vastu line sat unused in its saved answer.
 *
 * This turns such an item into a candidate for a specification that is active now,
 * with its evidence, still to be reviewed. It goes no further than that:
 * - only a specification (free text) is a destination, so a fact of another kind
 *   stays unmapped;
 * - the destination is found by the catalog's own key or synonyms, never guessed;
 * - a value is used only when it is plain text, a list of text, or a list of named
 *   places with a travel time or distance, and is copied as printed;
 * - a candidate the model already filled is never replaced;
 * - money is never promoted.
 */
export interface PromotionVocabulary {
  /** `property.specifications.*` keys that are active contract fields. */
  activeSpecificationFieldKeys: ReadonlySet<string>;
  /** A synonym (lower case) to the specification catalog key it names. */
  specificationKeyBySynonym: ReadonlyMap<string, string>;
}

const SPECIFICATION_PREFIX = "property.specifications.";

/** Where a raw key points, or null when it names nothing we hold. */
const destinationOf = (
  rawKey: string,
  vocabulary: PromotionVocabulary,
): string | null => {
  const key = rawKey.trim().toLowerCase();
  if (vocabulary.activeSpecificationFieldKeys.has(key)) return key;
  const lastSegment = key.slice(key.lastIndexOf(".") + 1);
  const tries = [
    key.startsWith(SPECIFICATION_PREFIX)
      ? key.slice(SPECIFICATION_PREFIX.length)
      : key,
    key.replace(/\./g, "_"),
    lastSegment,
  ];
  for (const attempt of tries) {
    const specificationKey = vocabulary.specificationKeyBySynonym.get(attempt);
    if (specificationKey === undefined) continue;
    const fieldKey = `${SPECIFICATION_PREFIX}${specificationKey}`;
    if (vocabulary.activeSpecificationFieldKeys.has(fieldKey)) return fieldKey;
  }
  return null;
};

const MONEY = /₹|\bINR\b|\bRs\.?\s*\d|\brupees?\b|per\s+sq\.?\s*(?:ft|feet)/i;

const asText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

/** The value as the one line of text a specification holds, or null. */
export const specificationTextOf = (value: unknown): string | null => {
  const single = asText(value);
  if (single !== null) return MONEY.test(single) ? null : single;
  if (!Array.isArray(value) || value.length === 0) return null;
  const lines: string[] = [];
  for (const item of value) {
    const line = asText(item);
    if (line !== null) {
      lines.push(line);
      continue;
    }
    if (typeof item !== "object" || item === null) return null;
    const place = item as Record<string, unknown>;
    const name = asText(place.name);
    if (name === null) return null;
    const reach =
      asText(place.travel_time) ?? asText(place.distance) ?? asText(place.time);
    lines.push(reach === null ? name : `${name} ${reach}`);
  }
  const joined = lines.join("; ");
  return MONEY.test(joined) ? null : joined;
};

export const promoteUnmappedEvidence = (
  unmapped: readonly OcrUnmappedEvidenceCandidate[],
  alreadyFieldKeys: ReadonlySet<string>,
  vocabulary: PromotionVocabulary,
): SubmissionFieldCandidate[] => {
  const promoted = new Map<string, SubmissionFieldCandidate>();
  for (const item of unmapped) {
    const fieldKey = destinationOf(item.fieldKey, vocabulary);
    if (fieldKey === null || alreadyFieldKeys.has(fieldKey)) continue;
    const value = specificationTextOf(item.value);
    if (value === null) continue;
    const evidence = deduplicateSubmissionEvidence(
      item.evidence.map((entry) => ({ ...entry, valuePath: "$" })),
    );
    // Persistence refuses a field with no evidence; so does the review screen.
    if (evidence.length === 0) continue;
    const existing = promoted.get(fieldKey);
    // Two raw keys for one specification: the first read stands and the second
    // one's pages are kept as evidence, so a reviewer sees both places.
    promoted.set(
      fieldKey,
      existing === undefined
        ? { fieldKey, value, evidence }
        : {
            ...existing,
            evidence: deduplicateSubmissionEvidence([
              ...existing.evidence,
              ...evidence,
            ]),
          },
    );
  }
  return [...promoted.values()];
};

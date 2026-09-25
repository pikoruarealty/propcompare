/**
 * Single-facility amenity pages, matched straight against the amenity catalog
 * (`DECISIONS.md` 2026-09-23 "Single-facility amenity matching" and 2026-09-24).
 *
 * A brochure's marketing spread that shows one facility ("Swimming Pool" over a
 * photograph) is routed as an amenities page with a caption naming the facility.
 * When that caption is exactly a catalog amenity's name or one of its synonyms, the
 * page does not need a paid extraction read: it becomes a suggestion of that
 * amenity instead, labelled as router-detected, never auto-accepted, and shown
 * beside the page's own image so a person confirms it against the source.
 *
 * Pure and dependency-free. A caption that matches nothing (or more than one
 * amenity) simply stays in the amenities read as before, so no facility is lost by
 * this shortcut.
 */

/** One catalog amenity with the other names it is known by. */
export interface AmenityLookupEntry {
  key: string;
  label: string;
  synonyms: string[];
}

/** A page whose caption named exactly one catalog amenity. */
export interface SingleFacilityPage {
  pageNumber: number;
  /** The router's caption, as it printed it. */
  caption: string;
  amenityKey: string;
  amenityLabel: string;
}

/** The field a suggestion lands in. */
export const AMENITIES_FIELD_KEY = "property.amenities";

/** Starts the evidence snippet of a router-detected amenity, so a reviewer (and the
 * review panel) can tell it from a line an extraction read. */
export const ROUTER_EVIDENCE_PREFIX =
  "Router-detected, not read by extraction: ";

/** Case, punctuation and spacing do not matter; a trailing plural "s" does not. */
export const normaliseFacilityName = (text: string): string =>
  text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .map((word) =>
      word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word,
    )
    .join(" ");

export type FacilityMatcher = (
  caption: string,
) => { key: string; label: string } | null;

/**
 * Exact match on the normalised caption against every catalog label and synonym.
 * A caption that names two different amenities (a synonym shared across entries)
 * is ambiguous and matches nothing.
 */
export const buildFacilityMatcher = (
  entries: readonly AmenityLookupEntry[],
): FacilityMatcher => {
  const byName = new Map<string, Set<string>>();
  const labelOf = new Map<string, string>();
  for (const entry of entries) {
    labelOf.set(entry.key, entry.label);
    for (const name of [entry.label, ...entry.synonyms]) {
      const normalised = normaliseFacilityName(name);
      if (normalised === "") continue;
      byName.set(
        normalised,
        (byName.get(normalised) ?? new Set()).add(entry.key),
      );
    }
  }
  return (caption) => {
    const keys = byName.get(normaliseFacilityName(caption));
    if (!keys || keys.size !== 1) return null;
    const [key] = [...keys];
    return { key, label: labelOf.get(key) ?? key };
  };
};

/** The snippet stored as evidence for a suggested amenity. */
export const routerEvidenceSnippet = (page: SingleFacilityPage): string =>
  `${ROUTER_EVIDENCE_PREFIX}"${page.caption}" on page ${page.pageNumber}, read as ${page.amenityLabel}.`;

export const isRouterEvidence = (snippet: string | null | undefined): boolean =>
  typeof snippet === "string" && snippet.startsWith(ROUTER_EVIDENCE_PREFIX);

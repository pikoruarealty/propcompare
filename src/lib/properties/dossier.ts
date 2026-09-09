/**
 * The dossier screen's presentation logic: area bases, category grouping, the
 * defensive reader for opaque room dimensions, and the page's metadata and
 * structured data.
 *
 * All pure, so the rules that matter most here — that an absent area basis is
 * never inferred from another, and that no price reaches `<head>` any more than
 * it reaches the page body — are testable without a database or a DOM.
 */

import { formatPossessionDate } from "./browse";
import type {
  AreaBasis,
  CatalogItemStatus,
  DossierAmenity,
  DossierSpecification,
  DossierUnitVariant,
  PropertyDossier,
  UnitArea,
  UnitVariantDimensions,
} from "./types";

/**
 * Every basis, in the order a dossier lists them, smallest measure first.
 *
 * The list is fixed rather than derived from whatever a variant happens to
 * carry: a variant that published only carpet area must still *show* that
 * built-up and super built-up are unstated. Rendering only the bases present
 * would let a partial record read as a complete one.
 */
export const AREA_BASIS_ORDER: readonly AreaBasis[] = [
  "carpet",
  "built_up",
  "super_built_up",
];

export const AREA_BASIS_LABEL: Record<AreaBasis, string> = {
  carpet: "Carpet area",
  built_up: "Built-up area",
  super_built_up: "Super built-up area",
};

/**
 * A variant's areas keyed by basis, with every unpublished basis explicitly
 * `null`.
 *
 * The one rule this function exists to keep: **an absent basis is never derived
 * from a present one.** Carpet area is not a fixed ratio of super built-up
 * area, the ratio varies by developer and project, and a computed number
 * presented beside published ones is indistinguishable from a fact.
 */
export const areasByBasis = (
  areas: readonly UnitArea[],
): Record<AreaBasis, string | null> => {
  const byBasis: Record<AreaBasis, string | null> = {
    carpet: null,
    built_up: null,
    super_built_up: null,
  };

  for (const area of areas) {
    byBasis[area.basis] = area.areaSqft;
  }

  return byBasis;
};

const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g;

/**
 * `"1425.00"` becomes `"1,425"`; `"985.50"` becomes `"985.5"`.
 *
 * Grouped by hand rather than through `Intl.NumberFormat`, for the same reason
 * possession dates are: the output must not depend on the reader's locale or on
 * which ICU data the runtime shipped with. Trailing zeros after the decimal
 * point are dropped because `numeric` stores a scale the developer did not
 * necessarily state — "985.00 sq ft" implies a precision to the centi-foot that
 * nobody published.
 *
 * Returns `null` for anything unparseable, so the caller renders it as absent
 * rather than printing a malformed value.
 */
export const formatSqft = (value: string | null): string | null => {
  if (value === null) return null;

  const trimmed = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;

  const [whole, fraction = ""] = trimmed.split(".");
  const grouped = whole!.replace(THOUSANDS, ",");
  const remainder = fraction.replace(/0+$/, "");

  return remainder === "" ? grouped : `${grouped}.${remainder}`;
};

/** `"42.50"` becomes `"42.5%"`. */
export const formatPercent = (value: string | null): string | null => {
  const formatted = formatSqft(value);
  return formatted === null ? null : `${formatted}%`;
};

/**
 * The RERA carpet-area range as one phrase, or `null` when neither bound is
 * published. A single published bound renders as an open range rather than
 * being silently paired with an invented one.
 */
export const formatAreaRange = (
  min: string | null,
  max: string | null,
): string | null => {
  const from = formatSqft(min);
  const to = formatSqft(max);

  if (from === null && to === null) return null;
  if (from !== null && to !== null) return `${from}–${to} sq ft`;
  if (from !== null) return `From ${from} sq ft`;
  return `Up to ${to} sq ft`;
};

export interface CategoryGroup<T> {
  category: string;
  items: T[];
}

/**
 * Groups catalog rows by their category, preserving the order the read layer
 * returned them in — the dossier organises facts into sections rather than
 * presenting one long undifferentiated table, per `design.v1.md`.
 *
 * Rows of every status are kept. A category whose amenities are all
 * `not_stated` still renders, because "nobody has recorded whether this project
 * has a clubhouse" is itself information a buyer is entitled to see.
 */
export const groupByCategory = <T extends { category: string }>(
  items: readonly T[],
): CategoryGroup<T>[] => {
  const groups: CategoryGroup<T>[] = [];
  const byCategory = new Map<string, CategoryGroup<T>>();

  for (const item of items) {
    const existing = byCategory.get(item.category);
    if (existing === undefined) {
      const group: CategoryGroup<T> = {
        category: item.category,
        items: [item],
      };
      byCategory.set(item.category, group);
      groups.push(group);
    } else {
      existing.items.push(item);
    }
  }

  return groups;
};

/** `flooring` becomes `Flooring`; `kitchen_platform` becomes `Kitchen platform`. */
export const humaniseCategory = (category: string): string => {
  const spaced = category.replace(/[_-]+/g, " ").trim();
  if (spaced === "") return category;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

export interface RoomDimension {
  name: string;
  lengthFt: number;
  widthFt: number;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/**
 * Reads room dimensions out of the opaque `jsonb` a unit variant carries.
 *
 * `unit_variants.dimensions` is deliberately unshaped in the schema, so the
 * read layer passes it through without inventing a structure. That leaves this
 * function as the only place that decides what is renderable, and it is
 * strict on purpose: a room is rendered only when it has a non-empty name and
 * two positive finite measurements. Anything else — a different shape, a
 * partial room, a string where a number belongs — yields `null` for that room
 * and the variant simply shows no dimensions.
 *
 * What it must never do is dump the raw JSON at a buyer, or render a room whose
 * measurements it could not actually read. An unrecognised shape is a gap in
 * what can be shown, not licence to show something else.
 */
export const readRoomDimensions = (
  dimensions: UnitVariantDimensions | null,
): RoomDimension[] | null => {
  if (dimensions === null || typeof dimensions !== "object") return null;

  const rooms = (dimensions as { rooms?: unknown }).rooms;
  if (!Array.isArray(rooms)) return null;

  const readable: RoomDimension[] = [];
  for (const room of rooms) {
    if (room === null || typeof room !== "object") continue;

    const { name, lengthFt, widthFt } = room as Record<string, unknown>;
    if (typeof name !== "string" || name.trim() === "") continue;
    if (!isFiniteNumber(lengthFt) || !isFiniteNumber(widthFt)) continue;

    readable.push({ name: name.trim(), lengthFt, widthFt });
  }

  return readable.length === 0 ? null : readable;
};

/** `16.5 × 12 ft` — the multiplication sign, not a letter x. */
export const formatRoomDimension = (room: RoomDimension): string =>
  `${room.lengthFt} × ${room.widthFt} ft`;

/** The distinct BHK types across a dossier's variants, for summaries. */
export const dossierBhkLabels = (
  unitVariants: readonly DossierUnitVariant[],
): string[] => {
  const labels: string[] = [];
  for (const variant of unitVariants) {
    const label = variant.bhkType?.label;
    if (label !== undefined && !labels.includes(label)) labels.push(label);
  }
  return labels;
};

const AVAILABLE: CatalogItemStatus = "available";

/**
 * The page's `<title>` and `<meta name="description">`.
 *
 * Built only from published facts, and — like every other buyer surface — with
 * no price, because there is no price in `PropertyDossier` to reach for. Each
 * clause is dropped rather than filled when its fact is absent, so a sparse
 * property gets a shorter description instead of a padded one.
 */
export const describeDossierFacts = (dossier: PropertyDossier): string => {
  const sentences: string[] = [
    `${dossier.name} by ${dossier.developer.name} in ${dossier.location.locality}, ${dossier.location.city}.`,
  ];

  const bhk = dossierBhkLabels(dossier.unitVariants);
  if (bhk.length > 0) sentences.push(`${bhk.join(", ")} configurations.`);

  const possession = formatPossessionDate(dossier.possession.possessionDate);
  if (possession !== null) sentences.push(`Possession from ${possession}.`);

  return sentences.join(" ");
};

export const dossierMetadata = (
  dossier: PropertyDossier,
): { title: string; description: string } => ({
  title: `${dossier.name}, ${dossier.location.locality} — PropCompare`,
  // The closing clause belongs in a search snippet, where it sets a searcher's
  // expectation before they click. It is deliberately not part of
  // `describeDossierFacts`, because structured data should describe the
  // property rather than restate our editorial policy.
  description: `${describeDossierFacts(dossier)} Published facts, areas, amenities and RERA details — no prices.`,
});

/**
 * schema.org structured data for the property page.
 *
 * The type is `ApartmentComplex` (a `Residence`) rather than
 * `RealEstateListing` or anything carrying an `Offer`, and that is the point:
 * an offer's whole purpose is to state a price, so modelling the page as one
 * would either fabricate a price or publish a conspicuously priceless offer.
 * A residence describes the building, which is exactly what this catalog holds.
 *
 * Amenities map honestly rather than optimistically. An `available` amenity
 * becomes a feature with `value: true`, an `explicitly_not_offered` one becomes
 * `value: false` — a stated fact worth publishing — and a `not_stated` one is
 * omitted entirely, because no claim has been made either way and structured
 * data has no vocabulary for "unknown" that a consumer would read correctly.
 *
 * No `url` is emitted: the absolute origin is not knowable here, and a guessed
 * one is worse than none.
 */
export const dossierJsonLd = (
  dossier: PropertyDossier,
): Record<string, unknown> => {
  const amenityFeature = dossier.amenities
    .filter((amenity) => amenity.status !== "not_stated")
    .map((amenity) => ({
      "@type": "LocationFeatureSpecification",
      name: amenity.label,
      value: amenity.status === AVAILABLE,
    }));

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "ApartmentComplex",
    name: dossier.name,
    description: dossier.description ?? describeDossierFacts(dossier),
    address: {
      "@type": "PostalAddress",
      addressLocality: dossier.location.city,
      addressCountry: "IN",
      ...(dossier.location.pincode === null
        ? {}
        : { postalCode: dossier.location.pincode }),
    },
  };

  if (dossier.totalUnits !== null) {
    jsonLd.numberOfAccommodationUnits = dossier.totalUnits;
  }
  if (amenityFeature.length > 0) jsonLd.amenityFeature = amenityFeature;

  return jsonLd;
};

/** Re-exported for the screen, which groups both catalog lists identically. */
export type DossierCatalogItem = DossierAmenity | DossierSpecification;

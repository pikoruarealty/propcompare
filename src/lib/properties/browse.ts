/**
 * The browse screen's parameter and presentation vocabulary: the human labels
 * for controlled values, a deterministic possession-date format, and the URL
 * arithmetic behind every filter chip, sort control, and pagination link.
 *
 * All of it is pure. The browse screen is a Server Component that renders from
 * `searchParams`, so its navigation is links and a `GET` form rather than
 * client state — which means the interesting logic is "what URL does this
 * control point at", and that is testable with no database and no DOM.
 *
 * Nothing here re-states the filter contract. The parameter list comes from
 * `./http`, which is the same list the API validates against.
 */

import { LIST_PARAMETER_NAMES } from "./http";
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  type ListPropertiesParams,
  type PossessionStatus,
  type PropertySort,
} from "./types";

export const BROWSE_PATH = "/properties";

/**
 * A property's dossier, which step 6 builds at this route. The card links here
 * now so the browse screen and the dossier agree on one path rather than each
 * deriving its own.
 */
export const propertyDossierHref = (slug: string): string =>
  `${BROWSE_PATH}/${encodeURIComponent(slug)}`;

export const POSSESSION_STATUS_LABEL: Record<PossessionStatus, string> = {
  under_construction: "Under construction",
  ready_to_move: "Ready to move",
  nearing_possession: "Nearing possession",
};

export const SORT_LABEL: Record<PropertySort, string> = {
  newest: "Newest first",
  name: "Name (A–Z)",
};

/** The filters a buyer can apply — the parameter set minus paging and sort. */
export const FILTER_NAMES = [
  "city",
  "locality",
  "propertyType",
  "bhk",
  "possessionStatus",
  "amenity",
] as const;

export type FilterName = (typeof FILTER_NAMES)[number];

export const FILTER_LABEL: Record<FilterName, string> = {
  city: "City",
  locality: "Locality",
  propertyType: "Property type",
  bhk: "Configuration",
  possessionStatus: "Possession",
  amenity: "Amenity",
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * `2027-06-30` becomes `30 June 2027`.
 *
 * Formatted by hand rather than through `Intl`/`Date`: a possession date is a
 * plain calendar date with no time zone, and `new Date("2027-06-30")` parses as
 * UTC midnight, which renders as the 29th for any reader west of Greenwich.
 * Silently shifting a published date by a day is exactly the kind of invented
 * fact this product is built to avoid.
 *
 * Returns `null` for anything unparseable, so the caller renders it as absent
 * rather than printing a malformed string.
 */
export const formatPossessionDate = (value: string | null): string | null => {
  if (value === null) return null;

  const match = ISO_DATE.exec(value);
  if (match === null) return null;

  const [, year, month, day] = match;
  const monthIndex = Number(month) - 1;
  const dayNumber = Number(day);
  if (monthIndex < 0 || monthIndex > 11 || dayNumber < 1 || dayNumber > 31) {
    return null;
  }

  return `${dayNumber} ${MONTH_NAMES[monthIndex]} ${year}`;
};

/** The shape Next.js hands a page for its query string. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/**
 * Flattens a page's `searchParams` into a `URLSearchParams`, so the browse
 * screen validates through the same `parseListParams` the API route uses.
 *
 * Repeated values are preserved as repeats rather than collapsed. That matters:
 * `?city=a&city=b` must still reach validation and still be rejected, exactly
 * as it is over HTTP. A page that quietly picked one of them would be more
 * permissive than the contract it claims to implement.
 */
export const toSearchParams = (raw: RawSearchParams): URLSearchParams => {
  const search = new URLSearchParams();

  for (const [name, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const entry of value) search.append(name, entry);
    } else {
      search.append(name, value);
    }
  }

  return search;
};

const isDefaultValue = (name: string, value: string): boolean =>
  (name === "page" && value === "1") ||
  (name === "pageSize" && value === String(DEFAULT_PAGE_SIZE)) ||
  (name === "sort" && value === DEFAULT_SORT);

/**
 * The canonical form of a browse query: known parameters in contract order,
 * with empty values and explicit defaults dropped.
 *
 * Two things force this. A `GET` form submits every control it owns, so an
 * "Any city" option emits `?city=` — which `parseListParams` rejects with 422,
 * correctly, because over the API an empty value is a broken request rather
 * than an absent filter. On a form, "Any" genuinely means "no filter", so the
 * page canonicalises the URL rather than failing it. And a form always submits
 * `sort` even when it is the default, which would otherwise leave every browse
 * URL carrying noise that changes nothing.
 *
 * Only empty and default values are dropped. A malformed value
 * (`possessionStatus=foo`) survives canonicalisation untouched and is still
 * reported, and unknown parameters are preserved so they are still rejected as
 * unknown — canonicalising must not become a way to launder a broken request.
 */
export const canonicalSearch = (search: URLSearchParams): URLSearchParams => {
  const canonical = new URLSearchParams();

  for (const name of LIST_PARAMETER_NAMES) {
    for (const value of search.getAll(name)) {
      if (value.trim() === "" || isDefaultValue(name, value)) continue;
      canonical.append(name, value);
    }
  }

  for (const [name, value] of search) {
    if (!(LIST_PARAMETER_NAMES as readonly string[]).includes(name)) {
      canonical.append(name, value);
    }
  }

  return canonical;
};

/** `/properties`, with a query string only when there is one to add. */
export const browseHref = (search: URLSearchParams): string => {
  const query = search.toString();
  return query === "" ? BROWSE_PATH : `${BROWSE_PATH}?${query}`;
};

const paramsToSearch = (params: ListPropertiesParams): URLSearchParams => {
  const search = new URLSearchParams();

  search.set("page", String(params.page));
  search.set("pageSize", String(params.pageSize));
  if (params.city !== undefined) search.set("city", params.city);
  if (params.locality !== undefined) search.set("locality", params.locality);
  if (params.propertyType !== undefined) {
    search.set("propertyType", params.propertyType);
  }
  if (params.bhk !== undefined) search.set("bhk", params.bhk);
  if (params.possessionStatus !== undefined) {
    search.set("possessionStatus", params.possessionStatus);
  }
  for (const key of params.amenity ?? []) search.append("amenity", key);
  search.set("sort", params.sort);

  return search;
};

/** The canonical browse URL for exactly this parameter set. */
export const hrefForParams = (params: ListPropertiesParams): string =>
  browseHref(canonicalSearch(paramsToSearch(params)));

export const hrefForPage = (
  params: ListPropertiesParams,
  page: number,
): string => hrefForParams({ ...params, page });

/**
 * Changing the sort returns to page 1. Holding the page number across a
 * re-sort lands the buyer in the middle of a different ordering, at a page
 * whose contents they have no reason to expect.
 */
export const hrefForSort = (
  params: ListPropertiesParams,
  sort: PropertySort,
): string => hrefForParams({ ...params, sort, page: 1 });

export interface ActiveFilter {
  name: FilterName;
  value: string;
}

/** Every filter currently narrowing the result set, in contract order. */
export const activeFilters = (params: ListPropertiesParams): ActiveFilter[] => {
  const active: ActiveFilter[] = [];

  if (params.city !== undefined) {
    active.push({ name: "city", value: params.city });
  }
  if (params.locality !== undefined) {
    active.push({ name: "locality", value: params.locality });
  }
  if (params.propertyType !== undefined) {
    active.push({ name: "propertyType", value: params.propertyType });
  }
  if (params.bhk !== undefined) {
    active.push({ name: "bhk", value: params.bhk });
  }
  if (params.possessionStatus !== undefined) {
    active.push({ name: "possessionStatus", value: params.possessionStatus });
  }
  for (const key of params.amenity ?? []) {
    active.push({ name: "amenity", value: key });
  }

  return active;
};

/**
 * The URL with one filter lifted. Removing a filter returns to page 1 — the
 * result set is now larger and the old offset points somewhere else.
 */
export const hrefWithoutFilter = (
  params: ListPropertiesParams,
  filter: ActiveFilter,
): string => {
  const next: ListPropertiesParams = { ...params, page: 1 };

  if (filter.name === "amenity") {
    const remaining = (params.amenity ?? []).filter(
      (key) => key !== filter.value,
    );
    if (remaining.length === 0) delete next.amenity;
    else next.amenity = remaining;
  } else {
    delete next[filter.name];
  }

  return hrefForParams(next);
};

/**
 * The URL with every filter lifted, keeping page size and sort. Clearing
 * filters is a refinement, not a reset of how the buyer wants results ordered.
 */
export const hrefWithoutFilters = (params: ListPropertiesParams): string =>
  hrefForParams({ page: 1, pageSize: params.pageSize, sort: params.sort });

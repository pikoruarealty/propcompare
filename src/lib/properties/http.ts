/**
 * The HTTP edge of the buyer read layer: query-parameter validation, the error
 * envelope, the cache policy, and the response builders the two route handlers
 * in `src/app/api/v1/properties/` are made of.
 *
 * This lives beside the queries rather than inside the route files for one
 * reason: `src/app/api/.../route.ts` imports `@/db`, which throws at import
 * time when `DATABASE_URL` is unset. Keeping validation here means the whole
 * parameter contract — the part with the most branches and the least need for
 * a database — is testable without Postgres, in the same shape as the rest of
 * this directory.
 *
 * Neither route is cached by Next.js. Route Handlers run at request time by
 * default (Next 15+), and `dynamic = "force-static"` is not available to the
 * listing route in any case: a force-static handler cannot read
 * `request.nextUrl.searchParams`, and this route is entirely query parameters.
 * Caching is therefore expressed as HTTP `Cache-Control` for a shared cache to
 * honour. See the 2026-09-02 entry in DECISIONS.md.
 */

import { assertNoExcludedData } from "./no-price";
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  MAX_PAGE_SIZE,
  type ListPropertiesParams,
  type PossessionStatus,
  type PropertySort,
} from "./types";

/**
 * `code` is a stable machine-readable slug naming the failure class; the HTTP
 * status carries the status. A client can branch on the cause without parsing
 * `message`, which is prose meant for a developer and names the offending
 * parameter.
 */
export type ApiErrorCode =
  | "unknown_query_parameter"
  | "invalid_query_parameter"
  | "property_not_found"
  | "internal_error";

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string };
}

/**
 * Shared-cache directives only — no browser `max-age`. A CDN or reverse proxy
 * absorbs repeated load while a buyer changing a filter still sees a fresh
 * response rather than one their own browser is holding.
 *
 * The listing is short-lived because it is filtered and paginated and a newly
 * published property should appear quickly. A dossier is a stable per-slug
 * document, so it tolerates a longer window; `stale-while-revalidate` means a
 * publish is never blocked behind an expiry.
 */
export const LIST_CACHE_CONTROL =
  "public, s-maxage=60, stale-while-revalidate=300";
export const DOSSIER_CACHE_CONTROL =
  "public, s-maxage=300, stale-while-revalidate=3600";

/**
 * Errors are never cached. A 404 in particular must not stick: a property
 * published a moment later would otherwise keep 404-ing from an intermediary.
 */
export const ERROR_CACHE_CONTROL = "no-store";

/** Keeps a hostile or absurd parameter value from being echoed back at length. */
const quote = (value: string): string =>
  `"${value.length > 64 ? `${value.slice(0, 64)}…` : value}"`;

export const errorResponse = (
  status: number,
  code: ApiErrorCode,
  message: string,
): Response =>
  Response.json({ error: { code, message } } satisfies ApiErrorBody, {
    status,
    headers: { "Cache-Control": ERROR_CACHE_CONTROL },
  });

/**
 * The success path for both routes. The exclusion-list guard runs here, on the
 * real body, immediately before it goes on the wire — the last point at which
 * a leak can still be stopped. It throws rather than filtering: a buyer
 * response carrying a price is a defect to fix at the source, and quietly
 * stripping it would hide the defect while the next response reintroduces it.
 */
export const buyerJsonResponse = <T>(body: T, cacheControl: string): Response =>
  Response.json(assertNoExcludedData(body), {
    headers: { "Cache-Control": cacheControl },
  });

/**
 * Turns an unexpected failure — including a caught leak — into the documented
 * envelope. The detail is logged server-side and never returned: the message
 * of a `BuyerResponseLeakError` names the offending field paths, which is
 * itself information a buyer response should not carry.
 */
export const internalErrorResponse = (
  route: string,
  cause: unknown,
): Response => {
  console.error(`[${route}] request failed`, cause);
  return errorResponse(
    500,
    "internal_error",
    "The request could not be completed.",
  );
};

/**
 * Every parameter the listing route accepts, in the order a canonical query
 * string lists them. Exported because the browse screen builds its own links
 * against the same contract (`./browse`): two hand-maintained copies of this
 * list would drift the first time a filter was added.
 */
export const LIST_PARAMETER_NAMES = [
  "page",
  "pageSize",
  "city",
  "locality",
  "propertyType",
  "bhk",
  "possessionStatus",
  "amenity",
  "sort",
] as const;

export type ListParameterName = (typeof LIST_PARAMETER_NAMES)[number];

const KNOWN_PARAMETERS: ReadonlySet<string> = new Set(LIST_PARAMETER_NAMES);

/** Only `amenity` repeats; repeating anything else is a malformed request. */
const REPEATABLE_PARAMETERS = new Set(["amenity"]);

const POSSESSION_STATUSES: readonly PossessionStatus[] = [
  "under_construction",
  "ready_to_move",
  "nearing_possession",
];

/** No price sort exists in v1, because no price exists in the read layer. */
const SORTS: readonly PropertySort[] = ["newest", "name"];

interface ParseFailure {
  ok: false;
  code: ApiErrorCode;
  message: string;
}

export type ParsedListParams =
  { ok: true; params: ListPropertiesParams } | ParseFailure;

const failure = (code: ApiErrorCode, message: string): ParseFailure => ({
  ok: false,
  code,
  message,
});

const isFailure = (value: unknown): value is ParseFailure =>
  typeof value === "object" && value !== null && "ok" in value;

const INTEGER_PATTERN = /^\d+$/;

/**
 * Deliberately strict: `1.5`, ` 1`, `+1`, `1e2`, and `abc` are all rejected
 * rather than coerced. `Number("1.5")` would otherwise silently become a
 * fractional offset, and a caller who sent something meaningless deserves to
 * be told so.
 */
const parseBoundedInteger = (
  raw: string,
  name: string,
  min: number,
  max?: number,
): number | ParseFailure => {
  const bound =
    max === undefined
      ? `an integer of at least ${min}`
      : `an integer between ${min} and ${max}`;

  if (!INTEGER_PATTERN.test(raw)) {
    return failure(
      "invalid_query_parameter",
      `${name} must be ${bound}; received ${quote(raw)}.`,
    );
  }

  const value = Number(raw);
  if (
    !Number.isSafeInteger(value) ||
    value < min ||
    (max !== undefined && value > max)
  ) {
    return failure(
      "invalid_query_parameter",
      `${name} must be ${bound}; received ${quote(raw)}.`,
    );
  }
  return value;
};

/**
 * An empty value (`?city=` or a bare `?city`) is rejected rather than treated
 * as absent. "Match every city" and "match the empty-string city" are
 * different requests and neither is what a caller meant to send.
 */
const readNonEmpty = (
  searchParams: URLSearchParams,
  name: string,
): string | ParseFailure | undefined => {
  const raw = searchParams.get(name);
  if (raw === null) return undefined;
  if (raw.trim() === "") {
    return failure("invalid_query_parameter", `${name} must not be empty.`);
  }
  return raw;
};

/**
 * Validates and coerces `GET /api/v1/properties` query parameters against
 * `docs/api/api-spec.v1.md`.
 *
 * The distinction the contract turns on: an **unknown lookup key**
 * (`propertyType=nonsense`) is a valid query with no matches and is passed
 * through to the query layer, which returns an empty page. A **malformed
 * value** (`possessionStatus=foo`, `pageSize=999`) is a broken request and is
 * rejected here with `422`. `pageSize` above the maximum is rejected rather
 * than clamped — a silent clamp lies to the caller about what it received.
 */
export const parseListParams = (
  searchParams: URLSearchParams,
): ParsedListParams => {
  for (const name of new Set(searchParams.keys())) {
    if (!KNOWN_PARAMETERS.has(name)) {
      return failure(
        "unknown_query_parameter",
        `Unknown query parameter ${quote(name)}.`,
      );
    }
    if (
      !REPEATABLE_PARAMETERS.has(name) &&
      searchParams.getAll(name).length > 1
    ) {
      return failure(
        "invalid_query_parameter",
        `${name} may only be given once.`,
      );
    }
  }

  const rawPage = searchParams.get("page");
  const page = rawPage === null ? 1 : parseBoundedInteger(rawPage, "page", 1);
  if (isFailure(page)) return page;

  const rawPageSize = searchParams.get("pageSize");
  const pageSize =
    rawPageSize === null
      ? DEFAULT_PAGE_SIZE
      : parseBoundedInteger(rawPageSize, "pageSize", 1, MAX_PAGE_SIZE);
  if (isFailure(pageSize)) return pageSize;

  const city = readNonEmpty(searchParams, "city");
  if (isFailure(city)) return city;
  const locality = readNonEmpty(searchParams, "locality");
  if (isFailure(locality)) return locality;
  const propertyType = readNonEmpty(searchParams, "propertyType");
  if (isFailure(propertyType)) return propertyType;
  const bhk = readNonEmpty(searchParams, "bhk");
  if (isFailure(bhk)) return bhk;

  const rawPossessionStatus = searchParams.get("possessionStatus");
  if (rawPossessionStatus !== null) {
    if (
      !POSSESSION_STATUSES.includes(rawPossessionStatus as PossessionStatus)
    ) {
      return failure(
        "invalid_query_parameter",
        `possessionStatus must be one of ${POSSESSION_STATUSES.join(", ")}; received ${quote(rawPossessionStatus)}.`,
      );
    }
  }

  const rawSort = searchParams.get("sort");
  if (rawSort !== null && !SORTS.includes(rawSort as PropertySort)) {
    return failure(
      "invalid_query_parameter",
      `sort must be one of ${SORTS.join(", ")}; received ${quote(rawSort)}.`,
    );
  }

  const rawAmenities = searchParams.getAll("amenity");
  for (const amenity of rawAmenities) {
    if (amenity.trim() === "") {
      return failure("invalid_query_parameter", "amenity must not be empty.");
    }
  }
  // Repeating the same amenity narrows nothing, so it collapses to one EXISTS
  // rather than becoming a redundant clause.
  const amenity =
    rawAmenities.length > 0 ? [...new Set(rawAmenities)] : undefined;

  return {
    ok: true,
    params: {
      page,
      pageSize,
      ...(city === undefined ? {} : { city }),
      ...(locality === undefined ? {} : { locality }),
      ...(propertyType === undefined ? {} : { propertyType }),
      ...(bhk === undefined ? {} : { bhk }),
      ...(rawPossessionStatus === null
        ? {}
        : { possessionStatus: rawPossessionStatus as PossessionStatus }),
      ...(amenity === undefined ? {} : { amenity }),
      sort: rawSort === null ? DEFAULT_SORT : (rawSort as PropertySort),
    },
  };
};

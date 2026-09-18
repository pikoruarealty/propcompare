/**
 * Request-body validation for `POST /api/v1/discovery/matches`, kept beside
 * the route the same way `@/lib/properties/http.ts` keeps validation beside
 * the listing route — importable and testable without `@/db`, whose module
 * load throws when `DATABASE_URL` is unset.
 *
 * The response envelope, cache headers, and error codes are shared with the
 * properties read layer (`@/lib/properties/http.ts`) rather than duplicated:
 * one error shape for the whole buyer-facing API.
 */

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/lib/properties/types";
import type { ApiErrorCode } from "@/lib/properties/http";
import type { DiscoveryMatchParams } from "./discovery";

interface ParseFailure {
  ok: false;
  code: ApiErrorCode;
  message: string;
}

export type ParsedDiscoveryMatchBody =
  { ok: true; params: DiscoveryMatchParams } | ParseFailure;

const failure = (message: string): ParseFailure => ({
  ok: false,
  code: "invalid_request_body",
  message,
});

const isFailure = (value: unknown): value is ParseFailure =>
  typeof value === "object" && value !== null && "ok" in value && !value.ok;

const KNOWN_BODY_KEYS = new Set([
  "minInr",
  "maxInr",
  "city",
  "bhk",
  "page",
  "pageSize",
]);

/** A finite positive number, rejecting `NaN`, `Infinity`, and non-numbers alike. */
const readPositiveNumber = (
  body: Record<string, unknown>,
  name: string,
): number | ParseFailure => {
  const value = body[name];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return failure(`${name} must be a finite positive number.`);
  }
  return value;
};

const readNonEmptyString = (
  body: Record<string, unknown>,
  name: string,
): string | ParseFailure | undefined => {
  if (!(name in body)) return undefined;
  const value = body[name];
  if (typeof value !== "string" || value.trim() === "") {
    return failure(`${name} must be a non-empty string.`);
  }
  return value;
};

const readBoundedInteger = (
  body: Record<string, unknown>,
  name: string,
  min: number,
  max: number,
  fallback: number,
): number | ParseFailure => {
  if (!(name in body)) return fallback;
  const value = body[name];
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    return failure(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
};

/**
 * Validates a parsed JSON body against the discovery/matches contract.
 * `minInr`/`maxInr` range validity (positivity, ordering) is re-checked by
 * `matchPropertiesByBudgetRange` itself; this layer rejects the wrong JSON
 * *type* early with a field-specific message, the same distinction the
 * listing route's query-parameter validation draws.
 */
export const parseDiscoveryMatchBody = (
  body: unknown,
): ParsedDiscoveryMatchBody => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return failure("Request body must be a JSON object.");
  }
  const record = body as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!KNOWN_BODY_KEYS.has(key)) {
      return failure(`Unknown field "${key}".`);
    }
  }

  const minInr = readPositiveNumber(record, "minInr");
  if (isFailure(minInr)) return minInr;
  const maxInr = readPositiveNumber(record, "maxInr");
  if (isFailure(maxInr)) return maxInr;
  if (minInr > maxInr) {
    return failure("minInr must be <= maxInr.");
  }

  const city = readNonEmptyString(record, "city");
  if (isFailure(city)) return city;
  const bhk = readNonEmptyString(record, "bhk");
  if (isFailure(bhk)) return bhk;

  const page = readBoundedInteger(
    record,
    "page",
    1,
    Number.MAX_SAFE_INTEGER,
    1,
  );
  if (isFailure(page)) return page;
  const pageSize = readBoundedInteger(
    record,
    "pageSize",
    1,
    MAX_PAGE_SIZE,
    DEFAULT_PAGE_SIZE,
  );
  if (isFailure(pageSize)) return pageSize;

  return {
    ok: true,
    params: {
      minInr,
      maxInr,
      ...(city === undefined ? {} : { city }),
      ...(bhk === undefined ? {} : { bhk }),
      page,
      pageSize,
    },
  };
};

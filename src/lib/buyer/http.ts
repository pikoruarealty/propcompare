/**
 * Request validation for the buyer-account routes (saved-properties,
 * comparisons, enquiries, dossier-unlocks) — the same "importable and
 * testable without `@/db`" separation as `@/lib/properties/http.ts` and
 * `@/lib/matching/http.ts`, and the same shared `ApiErrorCode`/envelope.
 */

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/lib/properties/types";
import type { ApiErrorCode } from "@/lib/properties/http";
import {
  MAX_PRIORITIES,
  PRIORITY_KEYS,
  RANGE_MAX_LAKH,
  RANGE_MIN_LAKH,
  type IntakeAnswers,
  type PriorityKey,
  type StatedRange,
} from "@/lib/properties/intake";
import type { ComparisonItemInput } from "./comparisons";
import type { CreateEnquiryInput } from "./enquiries";

interface ParseFailure {
  ok: false;
  code: ApiErrorCode;
  message: string;
}

const failure = (message: string): ParseFailure => ({
  ok: false,
  code: "invalid_request_body",
  message,
});

const isFailure = (value: unknown): value is ParseFailure =>
  typeof value === "object" && value !== null && "ok" in value && !value.ok;

const asRecord = (body: unknown): Record<string, unknown> | ParseFailure => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return failure("Request body must be a JSON object.");
  }
  return body as Record<string, unknown>;
};

const readRequiredString = (
  record: Record<string, unknown>,
  name: string,
): string | ParseFailure => {
  const value = record[name];
  if (typeof value !== "string" || value.trim() === "") {
    return failure(`${name} must be a non-empty string.`);
  }
  return value;
};

const readOptionalString = (
  record: Record<string, unknown>,
  name: string,
): string | ParseFailure | undefined => {
  if (!(name in record) || record[name] === undefined) return undefined;
  const value = record[name];
  if (typeof value !== "string" || value.trim() === "") {
    return failure(`${name} must be a non-empty string.`);
  }
  return value;
};

const assertKnownKeys = (
  record: Record<string, unknown>,
  known: ReadonlySet<string>,
): ParseFailure | undefined => {
  for (const key of Object.keys(record)) {
    if (!known.has(key)) return failure(`Unknown field "${key}".`);
  }
  return undefined;
};

// --- saved-properties -------------------------------------------------

export type ParsedPropertyIdBody =
  { ok: true; propertyId: string } | ParseFailure;

const SAVED_PROPERTY_BODY_KEYS = new Set(["propertyId"]);

/** Shared by `POST` and `DELETE /api/v1/saved-properties`. */
export const parsePropertyIdBody = (body: unknown): ParsedPropertyIdBody => {
  const record = asRecord(body);
  if (isFailure(record)) return record;
  const keyFailure = assertKnownKeys(record, SAVED_PROPERTY_BODY_KEYS);
  if (keyFailure) return keyFailure;

  const propertyId = readRequiredString(record, "propertyId");
  if (isFailure(propertyId)) return propertyId;
  return { ok: true, propertyId };
};

export interface SavedPropertiesQuery {
  page: number;
  pageSize: number;
}

export type ParsedSavedPropertiesQuery =
  { ok: true; params: SavedPropertiesQuery } | ParseFailure;

const INTEGER_PATTERN = /^\d+$/;

export const parseSavedPropertiesQuery = (
  searchParams: URLSearchParams,
): ParsedSavedPropertiesQuery => {
  for (const name of new Set(searchParams.keys())) {
    if (name !== "page" && name !== "pageSize") {
      return {
        ok: false,
        code: "unknown_query_parameter",
        message: `Unknown query parameter "${name}".`,
      };
    }
  }

  const rawPage = searchParams.get("page");
  let page = 1;
  if (rawPage !== null) {
    if (!INTEGER_PATTERN.test(rawPage) || Number(rawPage) < 1) {
      return {
        ok: false,
        code: "invalid_query_parameter",
        message: "page must be an integer of at least 1.",
      };
    }
    page = Number(rawPage);
  }

  const rawPageSize = searchParams.get("pageSize");
  let pageSize = DEFAULT_PAGE_SIZE;
  if (rawPageSize !== null) {
    if (
      !INTEGER_PATTERN.test(rawPageSize) ||
      Number(rawPageSize) < 1 ||
      Number(rawPageSize) > MAX_PAGE_SIZE
    ) {
      return {
        ok: false,
        code: "invalid_query_parameter",
        message: `pageSize must be an integer between 1 and ${MAX_PAGE_SIZE}.`,
      };
    }
    pageSize = Number(rawPageSize);
  }

  return { ok: true, params: { page, pageSize } };
};

// --- comparisons --------------------------------------------------------

const COMPARISON_BODY_KEYS = new Set(["items"]);
const COMPARISON_ITEM_KEYS = new Set(["propertyId", "unitVariantId"]);
const MAX_COMPARISON_ITEMS = 10;

export type ParsedComparisonBody =
  { ok: true; items: ComparisonItemInput[] } | ParseFailure;

export const parseComparisonBody = (body: unknown): ParsedComparisonBody => {
  const record = asRecord(body);
  if (isFailure(record)) return record;
  const keyFailure = assertKnownKeys(record, COMPARISON_BODY_KEYS);
  if (keyFailure) return keyFailure;

  const rawItems = record.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return failure("items must be a non-empty array.");
  }
  if (rawItems.length > MAX_COMPARISON_ITEMS) {
    return failure(
      `items must contain at most ${MAX_COMPARISON_ITEMS} entries.`,
    );
  }

  const items: ComparisonItemInput[] = [];
  for (const rawItem of rawItems) {
    const itemRecord = asRecord(rawItem);
    if (isFailure(itemRecord)) return itemRecord;
    const itemKeyFailure = assertKnownKeys(itemRecord, COMPARISON_ITEM_KEYS);
    if (itemKeyFailure) return itemKeyFailure;

    const propertyId = readRequiredString(itemRecord, "propertyId");
    if (isFailure(propertyId)) return propertyId;
    const unitVariantId = readOptionalString(itemRecord, "unitVariantId");
    if (isFailure(unitVariantId)) return unitVariantId;

    items.push({
      propertyId,
      ...(unitVariantId === undefined ? {} : { unitVariantId }),
    });
  }

  return { ok: true, items };
};

// --- enquiries ------------------------------------------------------------

const ENQUIRY_BODY_KEYS = new Set(["propertyId", "unitVariantId", "message"]);

export type ParsedEnquiryBody =
  { ok: true; input: CreateEnquiryInput } | ParseFailure;

export const parseEnquiryBody = (body: unknown): ParsedEnquiryBody => {
  const record = asRecord(body);
  if (isFailure(record)) return record;
  const keyFailure = assertKnownKeys(record, ENQUIRY_BODY_KEYS);
  if (keyFailure) return keyFailure;

  const propertyId = readRequiredString(record, "propertyId");
  if (isFailure(propertyId)) return propertyId;
  const unitVariantId = readOptionalString(record, "unitVariantId");
  if (isFailure(unitVariantId)) return unitVariantId;
  const message = readOptionalString(record, "message");
  if (isFailure(message)) return message;

  return {
    ok: true,
    input: {
      propertyId,
      ...(unitVariantId === undefined ? {} : { unitVariantId }),
      ...(message === undefined ? {} : { message }),
    },
  };
};

// --- intake handoff ---------------------------------------------------

/**
 * Shared by `POST /api/v1/buyer/intake-handoff` (setting the cookie). Every
 * field is required but nullable — `IntakeAnswers` names an unanswered
 * question with `null`/`[]` rather than an absent key, so a caller cannot
 * omit a field and have it silently read as "not stated" when it might
 * simply have been forgotten.
 */
const INTAKE_HANDOFF_BODY_KEYS = new Set([
  "priorities",
  "bhk",
  "city",
  "statedRange",
]);
const STATED_RANGE_KEYS = new Set(["fromLakh", "toLakh"]);

export type ParsedIntakeHandoffBody =
  { ok: true; answers: IntakeAnswers } | ParseFailure;

const readNullableString = (
  record: Record<string, unknown>,
  name: string,
): string | null | ParseFailure => {
  if (!(name in record)) {
    return failure(`${name} is required (use null when not stated).`);
  }
  const value = record[name];
  if (value === null) return null;
  if (typeof value !== "string" || value.trim() === "") {
    return failure(`${name} must be a non-empty string or null.`);
  }
  return value;
};

const readStatedRange = (
  record: Record<string, unknown>,
): StatedRange | null | ParseFailure => {
  if (!("statedRange" in record)) {
    return failure("statedRange is required (use null when not stated).");
  }
  const value = record.statedRange;
  if (value === null) return null;
  const rangeRecord = asRecord(value);
  if (isFailure(rangeRecord)) {
    return failure("statedRange must be an object or null.");
  }
  for (const key of Object.keys(rangeRecord)) {
    if (!STATED_RANGE_KEYS.has(key)) {
      return failure(`Unknown field "statedRange.${key}".`);
    }
  }
  const { fromLakh, toLakh } = rangeRecord;
  if (
    typeof fromLakh !== "number" ||
    !Number.isFinite(fromLakh) ||
    typeof toLakh !== "number" ||
    !Number.isFinite(toLakh) ||
    fromLakh < RANGE_MIN_LAKH ||
    toLakh > RANGE_MAX_LAKH ||
    fromLakh > toLakh
  ) {
    return failure(
      `statedRange must have fromLakh/toLakh between ${RANGE_MIN_LAKH} and ${RANGE_MAX_LAKH}, with fromLakh <= toLakh.`,
    );
  }
  return { fromLakh, toLakh };
};

const readPriorities = (
  record: Record<string, unknown>,
): PriorityKey[] | ParseFailure => {
  if (!("priorities" in record)) {
    return failure("priorities is required (use [] when nothing was chosen).");
  }
  const value = record.priorities;
  if (!Array.isArray(value) || value.length > MAX_PRIORITIES) {
    return failure(
      `priorities must be an array of at most ${MAX_PRIORITIES} known keys.`,
    );
  }
  for (const entry of value) {
    if (
      typeof entry !== "string" ||
      !(PRIORITY_KEYS as readonly string[]).includes(entry)
    ) {
      return failure("priorities must only contain known priority keys.");
    }
  }
  return value as PriorityKey[];
};

export const parseIntakeHandoffBody = (
  body: unknown,
): ParsedIntakeHandoffBody => {
  const record = asRecord(body);
  if (isFailure(record)) return record;
  const keyFailure = assertKnownKeys(record, INTAKE_HANDOFF_BODY_KEYS);
  if (keyFailure) return keyFailure;

  const priorities = readPriorities(record);
  if (isFailure(priorities)) return priorities;
  const bhk = readNullableString(record, "bhk");
  if (isFailure(bhk)) return bhk;
  const city = readNullableString(record, "city");
  if (isFailure(city)) return city;
  const statedRange = readStatedRange(record);
  if (isFailure(statedRange)) return statedRange;

  return { ok: true, answers: { priorities, bhk, city, statedRange } };
};

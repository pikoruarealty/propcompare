import { assertNoExcludedData } from "@/lib/properties/no-price";
import type { ApiErrorCode } from "@/lib/properties/http";
import {
  DEFAULT_REPORT_WINDOW,
  REPORT_WINDOW_KEYS,
  parseReportWindow,
  type ReportWindowKey,
} from "./windows";

/**
 * The HTTP edge of the developer analytics routes: query validation and the
 * response builder. Kept apart from the route files so the parameter contract is
 * testable without a database (a route file imports `@/db`, which needs one).
 */

export interface ReportQuery {
  window: ReportWindowKey;
  /** Only where the route allows it (the CSV export): one property's id. */
  property: string | null;
}

export type ParsedReportQuery =
  | { ok: true; query: ReportQuery }
  | { ok: false; code: ApiErrorCode; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Only `window` (one of the five fixed windows) is accepted, and `property` on
 * routes that pass `allowProperty`. Anything else is refused rather than ignored,
 * so a client asking for a custom date range learns there is none.
 */
export const parseReportQuery = (
  searchParams: URLSearchParams,
  { allowProperty = false }: { allowProperty?: boolean } = {},
): ParsedReportQuery => {
  for (const name of new Set(searchParams.keys())) {
    if (name !== "window" && !(allowProperty && name === "property")) {
      return {
        ok: false,
        code: "unknown_query_parameter",
        message: `Unknown query parameter "${name}".`,
      };
    }
  }

  const rawWindow = searchParams.get("window");
  const window =
    rawWindow === null ? DEFAULT_REPORT_WINDOW : parseReportWindow(rawWindow);
  if (window === null) {
    return {
      ok: false,
      code: "invalid_query_parameter",
      message: `window must be one of ${REPORT_WINDOW_KEYS.join(", ")}.`,
    };
  }

  const property = searchParams.get("property");
  if (property !== null && !UUID.test(property)) {
    return {
      ok: false,
      code: "invalid_query_parameter",
      message: "property must be a property id.",
    };
  }
  return { ok: true, query: { window, property } };
};

/**
 * Figures are about one signed-in developer, so a shared cache must never hold
 * one. The exclusion-list guard runs on the real body (no price, no private
 * bucket) immediately before it goes on the wire.
 */
export const developerJsonResponse = <T>(body: T): Response =>
  Response.json(assertNoExcludedData(body), {
    headers: { "Cache-Control": "private, no-store" },
  });

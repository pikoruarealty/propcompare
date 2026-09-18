import type { NextRequest } from "next/server";
import { db } from "@/db";
import { serviceDb } from "@/db/service";
import {
  buyerJsonResponse,
  errorResponse,
  internalErrorResponse,
} from "@/lib/properties/http";
import { matchPublishedProperties } from "@/lib/matching/discovery";
import { InvalidBudgetRangeError } from "@/lib/matching/budget-range";
import { parseDiscoveryMatchBody } from "@/lib/matching/http";

/**
 * `POST /api/v1/discovery/matches` — published property summaries whose
 * current unit price falls in the buyer's inclusive `[min * 0.80, max * 1.20]`
 * range. Specified in `docs/api/api-spec.v1.md`;
 * `docs/tasklists/2026-09-18-discovery-matches-endpoint.md` is this route's
 * implementation record.
 *
 * Stateless: the request body carries the buyer's stated range directly,
 * nothing is written to `buyer_intake_sessions` or anywhere else (2026-09-18
 * DECISIONS.md entry). No route segment config is exported for the same
 * reason as the listing route — Route Handlers run at request time by
 * default, which is what a per-buyer-input POST needs.
 */
export const POST = async (request: NextRequest): Promise<Response> => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(
      422,
      "invalid_request_body",
      "Request body must be valid JSON.",
    );
  }

  const parsed = parseDiscoveryMatchBody(body);
  if (!parsed.ok) {
    return errorResponse(422, parsed.code, parsed.message);
  }

  try {
    const result = await matchPublishedProperties(db, serviceDb, parsed.params);
    return buyerJsonResponse(result, "no-store");
  } catch (cause) {
    if (cause instanceof InvalidBudgetRangeError) {
      return errorResponse(422, "invalid_request_body", cause.message);
    }
    return internalErrorResponse("POST /api/v1/discovery/matches", cause);
  }
};

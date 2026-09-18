import type { NextRequest } from "next/server";
import { db } from "@/db";
import {
  buyerJsonResponse,
  errorResponse,
  internalErrorResponse,
} from "@/lib/properties/http";
import { requireBuyerSession } from "@/lib/buyer/session";
import { parseComparisonBody } from "@/lib/buyer/http";
import { createComparison, listComparisons } from "@/lib/buyer/comparisons";

/**
 * `GET, POST /api/v1/comparisons` — a buyer's comparisons and their ordered
 * property/unit items. Specified in `docs/api/api-spec.v1.md`;
 * `docs/tasklists/2026-09-18-buyer-account-routes.md` is the implementation
 * record. No `PATCH`/item-mutation endpoint exists — a comparison is created
 * once with its full item list.
 */

export const GET = async (request: NextRequest): Promise<Response> => {
  const session = await requireBuyerSession(request);
  if (!session) {
    return errorResponse(401, "unauthenticated", "A session is required.");
  }

  try {
    const result = await listComparisons(db, session.userId);
    return buyerJsonResponse({ data: result }, "no-store");
  } catch (cause) {
    return internalErrorResponse("GET /api/v1/comparisons", cause);
  }
};

export const POST = async (request: NextRequest): Promise<Response> => {
  const session = await requireBuyerSession(request);
  if (!session) {
    return errorResponse(401, "unauthenticated", "A session is required.");
  }

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
  const parsed = parseComparisonBody(body);
  if (!parsed.ok) {
    return errorResponse(422, parsed.code, parsed.message);
  }

  try {
    const result = await createComparison(db, session.userId, parsed.items);
    if ("reason" in result) {
      if (result.reason === "property_not_found") {
        return errorResponse(
          404,
          "property_not_found",
          `No property with id "${result.propertyId}".`,
        );
      }
      return errorResponse(
        404,
        "unit_variant_not_found",
        `No unit variant with id "${result.unitVariantId}" on the given property.`,
      );
    }
    return buyerJsonResponse(result, "no-store");
  } catch (cause) {
    return internalErrorResponse("POST /api/v1/comparisons", cause);
  }
};

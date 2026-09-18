import type { NextRequest } from "next/server";
import { db } from "@/db";
import {
  buyerJsonResponse,
  errorResponse,
  internalErrorResponse,
} from "@/lib/properties/http";
import { requireBuyerSession } from "@/lib/buyer/session";
import { parseEnquiryBody } from "@/lib/buyer/http";
import { createEnquiry } from "@/lib/buyer/enquiries";

/**
 * `POST /api/v1/enquiries` — creates an enquiry for a property and optional
 * unit variant. Specified in `docs/api/api-spec.v1.md`;
 * `docs/tasklists/2026-09-18-buyer-account-routes.md` is the implementation
 * record. Always created with `status: "new"` — buyers cannot set status.
 */
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
  const parsed = parseEnquiryBody(body);
  if (!parsed.ok) {
    return errorResponse(422, parsed.code, parsed.message);
  }

  try {
    const result = await createEnquiry(db, session.userId, parsed.input);
    if ("reason" in result) {
      return errorResponse(
        404,
        result.reason,
        result.reason === "property_not_found"
          ? `No property with id "${parsed.input.propertyId}".`
          : `No unit variant with id "${parsed.input.unitVariantId}" on the given property.`,
      );
    }
    return buyerJsonResponse(result, "no-store");
  } catch (cause) {
    return internalErrorResponse("POST /api/v1/enquiries", cause);
  }
};

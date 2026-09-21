import type { NextRequest } from "next/server";
import { db } from "@/db";
import { requireAdminRequest } from "@/lib/accounts/api-session";
import {
  ENQUIRY_STATUSES,
  setEnquiryStatus,
  type EnquiryStatus,
} from "@/lib/buyer/enquiry-inbox";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `PATCH /api/v1/admin/enquiries/{id}` with `{ status }`: an admin marks an
 * enquiry `new`, `contacted` or `closed`. Any admin may do it (it publishes
 * nothing). A malformed id is a 404, not a database error.
 */
export const PATCH = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/admin/enquiries/[id]">,
): Promise<Response> => {
  const session = await requireAdminRequest(request);
  if (session === "unauthenticated")
    return errorResponse(401, "unauthenticated", "A session is required.");
  if (session === "forbidden")
    return errorResponse(403, "forbidden", "Admin access is required.");

  const body = (await request.json().catch(() => null)) as {
    status?: unknown;
  } | null;
  if (
    typeof body?.status !== "string" ||
    !ENQUIRY_STATUSES.includes(body.status as EnquiryStatus)
  ) {
    return errorResponse(
      422,
      "invalid_request_body",
      `status must be one of ${ENQUIRY_STATUSES.join(", ")}.`,
    );
  }

  const { id } = await context.params;
  if (!UUID.test(id)) {
    return errorResponse(404, "enquiry_not_found", "No such enquiry.");
  }
  try {
    const found = await setEnquiryStatus(db, id, body.status as EnquiryStatus);
    if (!found) {
      return errorResponse(404, "enquiry_not_found", "No such enquiry.");
    }
    return Response.json(
      { id, status: body.status },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    return internalErrorResponse("PATCH /api/v1/admin/enquiries/{id}", cause);
  }
};

import type { NextRequest } from "next/server";
import { db } from "@/db";
import { requireAdminRequest } from "@/lib/accounts/api-session";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";
import {
  confirmPendingFields,
  ReconciliationError,
} from "@/lib/submissions/reconciliation";

/**
 * `POST /api/v1/admin/submissions/{id}/fields/confirm-pending` — confirms every
 * value still `needs_review` on a submission that is in review. Responds
 * `{ confirmed: n }`. Values already confirmed, edited or rejected are untouched.
 */
export const POST = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/admin/submissions/[id]/fields/confirm-pending">,
): Promise<Response> => {
  const session = await requireAdminRequest(request);
  if (session === "unauthenticated")
    return errorResponse(401, "unauthenticated", "A session is required.");
  if (session === "forbidden")
    return errorResponse(403, "forbidden", "Admin access is required.");
  const { id } = await context.params;
  try {
    const confirmed = await confirmPendingFields(db, id);
    return Response.json(
      { confirmed },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    if (cause instanceof ReconciliationError) {
      return errorResponse(
        cause.code === "submission_not_found" ? 404 : 409,
        cause.code,
        cause.message,
      );
    }
    return internalErrorResponse(
      "POST /api/v1/admin/submissions/[id]/fields/confirm-pending",
      cause,
    );
  }
};

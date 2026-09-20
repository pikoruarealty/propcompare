import type { NextRequest } from "next/server";
import { db } from "@/db";
import { requireAdminRequest } from "@/lib/accounts/api-session";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";
import {
  createEditSubmission,
  EditPropertyError,
} from "@/lib/submissions/edit-property";

/**
 * `POST /api/v1/admin/properties/{id}/edits` — starts a correction to a published
 * property: an empty draft submission bound to it. Responds `201 { submissionId }`.
 * Nothing live changes; the correction goes through review and publish. If an edit
 * of the property is already open, responds `409` with that edit's id so the caller
 * can go to it.
 */
export const POST = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/admin/properties/[id]/edits">,
): Promise<Response> => {
  const session = await requireAdminRequest(request);
  if (session === "unauthenticated")
    return errorResponse(401, "unauthenticated", "A session is required.");
  if (session === "forbidden")
    return errorResponse(403, "forbidden", "Admin access is required.");

  const { id } = await context.params;
  try {
    const created = await createEditSubmission(db, {
      propertyId: id,
      submittedBy: session.userId,
    });
    return Response.json(created, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (cause) {
    if (cause instanceof EditPropertyError) {
      if (cause.code === "property_not_found") {
        return errorResponse(404, "property_not_found", cause.message);
      }
      return Response.json(
        {
          error: { code: cause.code, message: cause.message },
          submissionId: cause.submissionId,
        },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    return internalErrorResponse(
      "POST /api/v1/admin/properties/[id]/edits",
      cause,
    );
  }
};

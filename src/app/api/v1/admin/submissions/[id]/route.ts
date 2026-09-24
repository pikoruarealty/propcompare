import type { NextRequest } from "next/server";
import { db } from "@/db";
import { requireAdminRequest } from "@/lib/accounts/api-session";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";
import { storageAdapter } from "@/lib/storage";
import {
  removeSubmission,
  SubmissionRemovalError,
} from "@/lib/submissions/removal";

/**
 * `DELETE /api/v1/admin/submissions/{id}` — clears a submission out of the queue
 * (owner only, like publishing). One that was never published is deleted for
 * good; one that was published is archived instead, because the record of what
 * went live must stay. Either way the live listing is untouched. Response `200`:
 * `{ "outcome": "deleted" | "archived" }`.
 */
export const DELETE = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/admin/submissions/[id]">,
): Promise<Response> => {
  const session = await requireAdminRequest(request);
  if (session === "unauthenticated") {
    return errorResponse(401, "unauthenticated", "A session is required.");
  }
  if (session === "forbidden" || session.permissionLevel !== "owner") {
    return errorResponse(
      403,
      "forbidden",
      "Only an owner can delete or archive a submission.",
    );
  }

  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return errorResponse(404, "submission_not_found", "Submission not found.");
  }
  try {
    const result = await removeSubmission(
      { database: db, storage: storageAdapter },
      { submissionId: id },
    );
    return Response.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (cause) {
    if (cause instanceof SubmissionRemovalError) {
      return errorResponse(
        cause.code === "submission_not_found" ? 404 : 409,
        cause.code,
        cause.message,
      );
    }
    return internalErrorResponse(
      "DELETE /api/v1/admin/submissions/[id]",
      cause,
    );
  }
};

import type { NextRequest } from "next/server";
import { db } from "@/db";
import { requireAdminRequest } from "@/lib/accounts/api-session";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";
import {
  restoreSubmission,
  SubmissionRemovalError,
} from "@/lib/submissions/removal";

/**
 * `POST /api/v1/admin/submissions/{id}/restore` — puts an archived submission
 * back in the default queue (owner only). `409` `invalid_state` if it is not
 * archived.
 */
export const POST = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/admin/submissions/[id]/restore">,
): Promise<Response> => {
  const session = await requireAdminRequest(request);
  if (session === "unauthenticated") {
    return errorResponse(401, "unauthenticated", "A session is required.");
  }
  if (session === "forbidden" || session.permissionLevel !== "owner") {
    return errorResponse(
      403,
      "forbidden",
      "Only an owner can restore a submission.",
    );
  }

  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return errorResponse(404, "submission_not_found", "Submission not found.");
  }
  try {
    await restoreSubmission(db, { submissionId: id });
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (cause) {
    if (cause instanceof SubmissionRemovalError) {
      return errorResponse(409, cause.code, cause.message);
    }
    return internalErrorResponse(
      "POST /api/v1/admin/submissions/[id]/restore",
      cause,
    );
  }
};

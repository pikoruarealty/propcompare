import type { NextRequest } from "next/server";
import { db } from "@/db";
import { requireAdminRequest } from "@/lib/accounts/api-session";
import {
  ReconciliationError,
  reviewSubmissionField,
} from "@/lib/submissions/reconciliation";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";

export const POST = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/admin/submissions/[id]/fields/[fieldKey]/review">,
): Promise<Response> => {
  const session = await requireAdminRequest(request);
  if (session === "unauthenticated")
    return errorResponse(401, "unauthenticated", "A session is required.");
  if (session === "forbidden")
    return errorResponse(403, "forbidden", "Admin access is required.");
  const body = (await request.json().catch(() => null)) as {
    reviewStatus?: unknown;
  } | null;
  if (body?.reviewStatus !== "confirmed" && body?.reviewStatus !== "rejected") {
    return errorResponse(
      422,
      "invalid_request_body",
      "reviewStatus must be confirmed or rejected.",
    );
  }
  const { id, fieldKey } = await context.params;
  try {
    await reviewSubmissionField(db, {
      submissionId: id,
      fieldKey,
      reviewStatus: body.reviewStatus,
    });
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (cause) {
    if (cause instanceof ReconciliationError) {
      return errorResponse(
        cause.code === "submission_not_found" ||
          cause.code === "field_not_found"
          ? 404
          : 409,
        cause.code,
        cause.message,
      );
    }
    return internalErrorResponse(
      "POST /api/v1/admin/submissions/[id]/fields/[fieldKey]/review",
      cause,
    );
  }
};

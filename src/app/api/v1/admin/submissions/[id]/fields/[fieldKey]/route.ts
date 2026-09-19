import type { NextRequest } from "next/server";
import { db } from "@/db";
import { requireAdminRequest } from "@/lib/accounts/api-session";
import {
  editSubmissionField,
  ReconciliationError,
} from "@/lib/submissions/reconciliation";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";

export const PATCH = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/admin/submissions/[id]/fields/[fieldKey]">,
): Promise<Response> => {
  const session = await requireAdminRequest(request);
  if (session === "unauthenticated") {
    return errorResponse(401, "unauthenticated", "A session is required.");
  }
  if (session === "forbidden") {
    return errorResponse(403, "forbidden", "Admin access is required.");
  }
  const body = (await request.json().catch(() => null)) as {
    value?: unknown;
  } | null;
  if (!body || !("value" in body)) {
    return errorResponse(422, "invalid_request_body", "value is required.");
  }
  const { id, fieldKey } = await context.params;
  try {
    await editSubmissionField(db, {
      submissionId: id,
      fieldKey,
      value: body.value,
    });
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (cause) {
    if (cause instanceof ReconciliationError) {
      const status =
        cause.code === "submission_not_found" ||
        cause.code === "field_not_found"
          ? 404
          : cause.code === "invalid_state"
            ? 409
            : 422;
      return errorResponse(status, cause.code, cause.message);
    }
    return internalErrorResponse(
      "PATCH /api/v1/admin/submissions/[id]/fields/[fieldKey]",
      cause,
    );
  }
};

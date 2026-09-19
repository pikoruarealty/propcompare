import type { NextRequest } from "next/server";
import { db } from "@/db";
import { requireAdminRequest } from "@/lib/accounts/api-session";
import {
  createManualSubmission,
  ReconciliationError,
} from "@/lib/submissions/reconciliation";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";

/** Creates a manual-form submission draft. It contains no fabricated field
 * values; the reconciliation view renders absent active fields as Not stated. */
export const POST = async (request: NextRequest): Promise<Response> => {
  const session = await requireAdminRequest(request);
  if (session === "unauthenticated") {
    return errorResponse(401, "unauthenticated", "A session is required.");
  }
  if (session === "forbidden") {
    return errorResponse(403, "forbidden", "Admin access is required.");
  }
  const body = (await request.json().catch(() => null)) as {
    developerId?: unknown;
  } | null;
  if (typeof body?.developerId !== "string") {
    return errorResponse(
      422,
      "invalid_request_body",
      "developerId is required.",
    );
  }
  try {
    const created = await createManualSubmission(db, {
      developerId: body.developerId,
      submittedBy: session.userId,
    });
    return Response.json(created, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (cause) {
    if (cause instanceof ReconciliationError) {
      return errorResponse(
        cause.code === "developer_not_found" ? 404 : 422,
        cause.code,
        cause.message,
      );
    }
    return internalErrorResponse("POST /api/v1/admin/submissions", cause);
  }
};

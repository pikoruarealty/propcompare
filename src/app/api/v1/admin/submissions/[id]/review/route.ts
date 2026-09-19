import type { NextRequest } from "next/server";
import { db } from "@/db";
import { requireAdminRequest } from "@/lib/accounts/api-session";
import {
  ReconciliationError,
  transitionSubmission,
} from "@/lib/submissions/reconciliation";
import type { SubmissionAction } from "@/lib/submissions/transitions";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";

const ACTIONS = new Set<Exclude<SubmissionAction, "publish">>([
  "submit",
  "start_review",
  "request_changes",
  "reject",
  "approve",
]);

export const POST = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/admin/submissions/[id]/review">,
): Promise<Response> => {
  const session = await requireAdminRequest(request);
  if (session === "unauthenticated")
    return errorResponse(401, "unauthenticated", "A session is required.");
  if (session === "forbidden")
    return errorResponse(403, "forbidden", "Admin access is required.");
  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
  } | null;
  if (
    typeof body?.action !== "string" ||
    !ACTIONS.has(body.action as Exclude<SubmissionAction, "publish">)
  ) {
    return errorResponse(
      422,
      "invalid_request_body",
      "Unsupported review action.",
    );
  }
  const { id } = await context.params;
  try {
    await transitionSubmission(db, {
      submissionId: id,
      action: body.action as Exclude<SubmissionAction, "publish">,
      actorUserId: session.userId,
      actorRole: session.permissionLevel,
    });
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (cause) {
    if (cause instanceof ReconciliationError) {
      return errorResponse(
        cause.code === "submission_not_found" ? 404 : 409,
        cause.code,
        cause.message,
      );
    }
    return internalErrorResponse(
      "POST /api/v1/admin/submissions/[id]/review",
      cause,
    );
  }
};

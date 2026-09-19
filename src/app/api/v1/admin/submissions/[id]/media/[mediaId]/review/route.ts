import type { NextRequest } from "next/server";
import { db } from "@/db";
import { requireAdminRequest } from "@/lib/accounts/api-session";
import {
  reviewSubmissionMedia,
  SubmissionMediaError,
} from "@/lib/submissions/media";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";

export const POST = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/admin/submissions/[id]/media/[mediaId]/review">,
): Promise<Response> => {
  const session = await requireAdminRequest(request);
  if (session === "unauthenticated")
    return errorResponse(401, "unauthenticated", "A session is required.");
  if (session === "forbidden")
    return errorResponse(403, "forbidden", "Admin access is required.");
  const body = (await request.json().catch(() => null)) as {
    reviewStatus?: unknown;
    isPublic?: unknown;
  } | null;
  if (
    (body?.reviewStatus !== "confirmed" && body?.reviewStatus !== "rejected") ||
    typeof body.isPublic !== "boolean"
  ) {
    return errorResponse(
      422,
      "invalid_request_body",
      "A review decision and public visibility are required.",
    );
  }
  const { id, mediaId } = await context.params;
  try {
    await reviewSubmissionMedia(db, {
      submissionId: id,
      mediaId,
      reviewedBy: session.userId,
      reviewStatus: body.reviewStatus,
      isPublic: body.isPublic,
    });
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (cause) {
    if (cause instanceof SubmissionMediaError) {
      return errorResponse(
        cause.code === "invalid_state" ? 409 : 404,
        cause.code,
        cause.message,
      );
    }
    return internalErrorResponse(
      "POST /api/v1/admin/submissions/[id]/media/[mediaId]/review",
      cause,
    );
  }
};

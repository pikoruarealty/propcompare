import type { NextRequest } from "next/server";
import { db } from "@/db";
import { requireAdminRequest } from "@/lib/accounts/api-session";
import {
  deleteSubmissionMedia,
  SubmissionMediaError,
} from "@/lib/submissions/media";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";
import { storageAdapter } from "@/lib/storage";

/**
 * `DELETE /api/v1/admin/submissions/{id}/media/{mediaId}` — permanently removes
 * a media candidate (storage object and row). Pre-publication only; nothing
 * this touches has ever reached `property_media`.
 */
export const DELETE = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/admin/submissions/[id]/media/[mediaId]">,
): Promise<Response> => {
  const session = await requireAdminRequest(request);
  if (session === "unauthenticated")
    return errorResponse(401, "unauthenticated", "A session is required.");
  if (session === "forbidden")
    return errorResponse(403, "forbidden", "Admin access is required.");

  const { id, mediaId } = await context.params;
  try {
    await deleteSubmissionMedia(
      { database: db, storage: storageAdapter },
      { submissionId: id, mediaId },
    );
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
      "DELETE /api/v1/admin/submissions/[id]/media/[mediaId]",
      cause,
    );
  }
};

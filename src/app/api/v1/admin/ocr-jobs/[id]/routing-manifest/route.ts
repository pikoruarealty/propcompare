import type { NextRequest } from "next/server";
import { db } from "@/db";
import { requireAdminRequest } from "@/lib/accounts/api-session";
import {
  RoutingConfirmationError,
  saveConfirmedRouting,
} from "@/lib/ingestion/routing-confirmation";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";

/**
 * `PUT /api/v1/admin/ocr-jobs/{id}/routing-manifest` — saves the admin's
 * complete page-level confirmation as the one parser-validated v2 manifest.
 * It remains editable only while the attempt is a draft; queueing freezes it.
 */
export const PUT = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/admin/ocr-jobs/[id]/routing-manifest">,
): Promise<Response> => {
  const session = await requireAdminRequest(request);
  if (session === "unauthenticated") {
    return errorResponse(401, "unauthenticated", "A session is required.");
  }
  if (session === "forbidden") {
    return errorResponse(403, "forbidden", "Admin access is required.");
  }

  const body = (await request.json().catch(() => null)) as {
    pages?: unknown;
  } | null;
  const { id } = await context.params;
  try {
    const manifest = await saveConfirmedRouting(db, {
      ocrJobId: id,
      pages: body?.pages,
    });
    return Response.json(manifest, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (cause) {
    if (cause instanceof RoutingConfirmationError) {
      if (cause.code === "job_not_found") {
        return errorResponse(404, "ocr_job_not_found", cause.message);
      }
      if (cause.code === "invalid_routing") {
        return errorResponse(422, "invalid_routing", cause.message);
      }
      return errorResponse(
        409,
        cause.code === "routing_unconfirmed"
          ? "routing_unconfirmed"
          : "invalid_state",
        cause.message,
      );
    }
    return internalErrorResponse(
      "PUT /api/v1/admin/ocr-jobs/{id}/routing-manifest",
      cause,
    );
  }
};

import type { NextRequest } from "next/server";
import { db } from "@/db";
import { requireAdminRequest } from "@/lib/accounts/api-session";
import {
  queueConfirmedOcr,
  RoutingConfirmationError,
} from "@/lib/ingestion/routing-confirmation";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";

/**
 * `POST /api/v1/admin/ocr-jobs/{id}/queue` — freezes a complete confirmed
 * manifest and makes the attempt available to the extraction worker. The route
 * itself never calls a provider, so this confirmation cannot spend money.
 */
export const POST = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/admin/ocr-jobs/[id]/queue">,
): Promise<Response> => {
  const session = await requireAdminRequest(request);
  if (session === "unauthenticated") {
    return errorResponse(401, "unauthenticated", "A session is required.");
  }
  if (session === "forbidden") {
    return errorResponse(403, "forbidden", "Admin access is required.");
  }

  const { id } = await context.params;
  try {
    await queueConfirmedOcr(db, id);
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (cause) {
    if (cause instanceof RoutingConfirmationError) {
      if (cause.code === "job_not_found") {
        return errorResponse(404, "ocr_job_not_found", cause.message);
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
      "POST /api/v1/admin/ocr-jobs/{id}/queue",
      cause,
    );
  }
};

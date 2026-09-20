import type { NextRequest } from "next/server";
import { db } from "@/db";
import { requireAdminRequest } from "@/lib/accounts/api-session";
import { reopenFailedOcr } from "@/lib/ingestion/extraction-retry";
import { RoutingConfirmationError } from "@/lib/ingestion/routing-confirmation";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";

/**
 * `POST /api/v1/admin/ocr-jobs/{id}/retry` — body `{ "mode": "requeue" | "edit_pages" }`.
 * Moves a failed attempt back to `queued` (the worker will run it again) or to
 * `draft` (so the page choices can be changed first). The route itself never calls
 * a provider.
 */
export const POST = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/admin/ocr-jobs/[id]/retry">,
): Promise<Response> => {
  const session = await requireAdminRequest(request);
  if (session === "unauthenticated") {
    return errorResponse(401, "unauthenticated", "A session is required.");
  }
  if (session === "forbidden") {
    return errorResponse(403, "forbidden", "Admin access is required.");
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    mode?: unknown;
  } | null;
  if (body?.mode !== "requeue" && body?.mode !== "edit_pages") {
    return errorResponse(
      400,
      "invalid_request_body",
      'mode must be "requeue" or "edit_pages".',
    );
  }

  try {
    await reopenFailedOcr(db, id, body.mode);
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (cause) {
    if (cause instanceof RoutingConfirmationError) {
      return cause.code === "job_not_found"
        ? errorResponse(404, "ocr_job_not_found", cause.message)
        : errorResponse(409, "invalid_state", cause.message);
    }
    return internalErrorResponse(
      "POST /api/v1/admin/ocr-jobs/{id}/retry",
      cause,
    );
  }
};

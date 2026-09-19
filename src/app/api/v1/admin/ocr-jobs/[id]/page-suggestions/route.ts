import type { NextRequest } from "next/server";
import { db } from "@/db";
import { requireAdminRequest } from "@/lib/accounts/api-session";
import {
  PageSuggestionError,
  runPageRouting,
} from "@/lib/ingestion/page-suggestions";
import {
  createOpenRouterPageRouter,
  PageRouterError,
} from "@/lib/ocr/page-router";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";
import { storageAdapter } from "@/lib/storage";
import { StorageAdapterError } from "@/lib/storage/adapter";

/**
 * `POST /api/v1/admin/ocr-jobs/{id}/page-suggestions` — runs the page router over
 * the brochure behind a draft OCR attempt and stores its per-page suggestions.
 * The admin starts this deliberately; it is a paid request and is never run on
 * upload. The response carries the suggestions only — never a cost.
 *
 * A body of `{ "replace": true }` re-runs it over existing suggestions.
 * Long-running for a large brochure, so the handler is allowed several minutes.
 */
export const maxDuration = 300;

export const POST = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/admin/ocr-jobs/[id]/page-suggestions">,
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
    replace?: unknown;
  } | null;

  try {
    const suggestions = await runPageRouting(
      {
        database: db,
        storage: storageAdapter,
        router: createOpenRouterPageRouter(),
      },
      {
        ocrJobId: id,
        replaceExisting: body?.replace === true,
        requestedBy: session.userId,
      },
    );
    return Response.json(suggestions, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (cause) {
    if (cause instanceof PageSuggestionError) {
      return errorResponse(
        cause.code === "job_not_found" ? 404 : 409,
        cause.code === "job_not_found" ? "ocr_job_not_found" : "invalid_state",
        cause.message,
      );
    }
    if (
      cause instanceof PageRouterError ||
      cause instanceof StorageAdapterError
    ) {
      console.error("POST page-suggestions failed:", cause);
      return errorResponse(
        502,
        "provider_error",
        "Pages could not be categorized just now. Please try again.",
      );
    }
    return internalErrorResponse(
      "POST /api/v1/admin/ocr-jobs/{id}/page-suggestions",
      cause,
    );
  }
};

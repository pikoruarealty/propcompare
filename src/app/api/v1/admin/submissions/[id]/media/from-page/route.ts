import type { NextRequest } from "next/server";
import { db } from "@/db";
import { requireAdminRequest } from "@/lib/accounts/api-session";
import { PageImageError } from "@/lib/ingestion/page-images";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";
import { storageAdapter } from "@/lib/storage";
import { addBrochurePageImage } from "@/lib/submissions/brochure-page-media";
import { SubmissionMediaError } from "@/lib/submissions/media";

/**
 * `POST /api/v1/admin/submissions/{id}/media/from-page` — uses one whole page of
 * the submission's own brochure as an image (`{ pageNumber, mediaType,
 * unitVariantName?, caption? }`). The page is rendered on the server and becomes a
 * private, unreviewed candidate credited to the developer; it is public only if a
 * reviewer approves it. The same page cannot be added twice (`409`).
 */
export const maxDuration = 120;

export const POST = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/admin/submissions/[id]/media/from-page">,
): Promise<Response> => {
  const session = await requireAdminRequest(request);
  if (session === "unauthenticated") {
    return errorResponse(401, "unauthenticated", "A session is required.");
  }
  if (session === "forbidden") {
    return errorResponse(403, "forbidden", "Admin access is required.");
  }

  const body = (await request.json().catch(() => null)) as {
    pageNumber?: unknown;
    mediaType?: unknown;
    unitVariantName?: unknown;
    caption?: unknown;
  } | null;
  if (
    typeof body?.pageNumber !== "number" ||
    (body.mediaType !== "photo" && body.mediaType !== "floor_plan")
  ) {
    return errorResponse(
      422,
      "invalid_request_body",
      "pageNumber and mediaType (photo or floor_plan) are required.",
    );
  }
  const { id } = await context.params;

  try {
    const media = await addBrochurePageImage(
      { database: db, storage: storageAdapter },
      {
        submissionId: id,
        uploadedBy: session.userId,
        pageNumber: body.pageNumber,
        mediaType: body.mediaType,
        unitVariantName:
          typeof body.unitVariantName === "string"
            ? body.unitVariantName
            : undefined,
        caption: typeof body.caption === "string" ? body.caption : undefined,
      },
    );
    return Response.json(media, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (cause) {
    if (cause instanceof SubmissionMediaError) {
      const status =
        cause.code === "submission_not_found" ||
        cause.code === "media_not_found"
          ? 404
          : cause.code === "invalid_state" || cause.code === "already_added"
            ? 409
            : 422;
      return errorResponse(status, cause.code, cause.message);
    }
    if (cause instanceof PageImageError) {
      console.error("POST media/from-page: render failed:", cause);
      return errorResponse(
        422,
        "invalid_media",
        cause.code === "page_out_of_range"
          ? cause.message
          : "That page could not be turned into an image.",
      );
    }
    return internalErrorResponse(
      "POST /api/v1/admin/submissions/[id]/media/from-page",
      cause,
    );
  }
};

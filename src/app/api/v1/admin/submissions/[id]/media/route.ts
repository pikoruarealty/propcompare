import type { NextRequest } from "next/server";
import { db } from "@/db";
import { requireAdminRequest } from "@/lib/accounts/api-session";
import {
  addSubmissionImage,
  MAX_SUBMISSION_MEDIA_BYTES,
  SubmissionMediaError,
} from "@/lib/submissions/media";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";
import { storageAdapter } from "@/lib/storage";

/** Multipart own/developer-supplied image upload. Files remain candidates on
 * the submission until reviewed and atomically published. */
export const POST = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/admin/submissions/[id]/media">,
): Promise<Response> => {
  const session = await requireAdminRequest(request);
  if (session === "unauthenticated")
    return errorResponse(401, "unauthenticated", "A session is required.");
  if (session === "forbidden")
    return errorResponse(403, "forbidden", "Admin access is required.");
  const declared = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declared) &&
    declared > MAX_SUBMISSION_MEDIA_BYTES + 1024 * 1024
  ) {
    return errorResponse(422, "invalid_media", "The image is too large.");
  }
  const form = await request.formData().catch(() => null);
  if (!form)
    return errorResponse(
      422,
      "invalid_request_body",
      "Expected a multipart form.",
    );
  const file = form.get("file");
  const mediaType = form.get("mediaType");
  const sourceKind = form.get("sourceKind");
  const attribution = form.get("attribution");
  const caption = form.get("caption");
  const unitVariantName = form.get("unitVariantName");
  if (!(file instanceof File) || typeof attribution !== "string") {
    return errorResponse(
      422,
      "invalid_request_body",
      "An image and attribution are required.",
    );
  }
  if (mediaType !== "photo" && mediaType !== "floor_plan") {
    return errorResponse(
      422,
      "invalid_request_body",
      "mediaType must be photo or floor_plan.",
    );
  }
  if (sourceKind !== "own" && sourceKind !== "developer_supplied") {
    return errorResponse(
      422,
      "invalid_request_body",
      "sourceKind must be own or developer_supplied.",
    );
  }
  const { id } = await context.params;
  try {
    const media = await addSubmissionImage(
      { database: db, storage: storageAdapter },
      {
        submissionId: id,
        uploadedBy: session.userId,
        bytes: new Uint8Array(await file.arrayBuffer()),
        mediaType,
        sourceKind,
        attribution,
        caption: typeof caption === "string" ? caption : undefined,
        unitVariantName:
          typeof unitVariantName === "string" ? unitVariantName : undefined,
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
          : cause.code === "invalid_state"
            ? 409
            : 422;
      return errorResponse(status, cause.code, cause.message);
    }
    return internalErrorResponse(
      "POST /api/v1/admin/submissions/[id]/media",
      cause,
    );
  }
};

import type { NextRequest } from "next/server";
import { db } from "@/db";
import { requireAdminRequest } from "@/lib/accounts/api-session";
import {
  BrochureUploadError,
  createBrochureSubmission,
  MAX_BROCHURE_BYTES,
} from "@/lib/ingestion/brochure-upload";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";
import { storageAdapter } from "@/lib/storage";

/**
 * `POST /api/v1/admin/source-documents` — multipart upload of a brochure PDF for
 * one developer (`developerId` + `file`). Creates the immutable source
 * document, a draft submission and a draft OCR attempt; it does not start paid
 * extraction. Specified in `docs/api/api-spec.v1.md`.
 *
 * A Route Handler rather than a Server Action on purpose: brochures are large,
 * and Server Actions cap request bodies far below a real brochure's size.
 */
export const POST = async (request: NextRequest): Promise<Response> => {
  const session = await requireAdminRequest(request);
  if (session === "unauthenticated") {
    return errorResponse(401, "unauthenticated", "A session is required.");
  }
  if (session === "forbidden") {
    return errorResponse(403, "forbidden", "Admin access is required.");
  }

  const declared = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declared) &&
    declared > MAX_BROCHURE_BYTES + 1024 * 1024
  ) {
    return errorResponse(422, "invalid_document", "The file is too large.");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse(
      422,
      "invalid_request_body",
      "Expected a multipart form.",
    );
  }

  const developerId = form.get("developerId");
  const file = form.get("file");
  if (typeof developerId !== "string" || !developerId) {
    return errorResponse(
      422,
      "invalid_request_body",
      "developerId is required.",
    );
  }
  if (!(file instanceof File) || file.size === 0) {
    return errorResponse(
      422,
      "invalid_request_body",
      "A PDF file is required.",
    );
  }

  try {
    const created = await createBrochureSubmission(
      { database: db, storage: storageAdapter },
      {
        developerId,
        uploadedBy: session.userId,
        bytes: new Uint8Array(await file.arrayBuffer()),
      },
    );
    return Response.json(created, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (cause) {
    if (cause instanceof BrochureUploadError) {
      return cause.code === "developer_not_found"
        ? errorResponse(404, "developer_not_found", cause.message)
        : errorResponse(422, "invalid_document", cause.message);
    }
    return internalErrorResponse("POST /api/v1/admin/source-documents", cause);
  }
};

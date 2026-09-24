import type { NextRequest } from "next/server";
import { db } from "@/db";
import { requireAdminRequest } from "@/lib/accounts/api-session";
import { getSubmissionBrochure } from "@/lib/ingestion/queries";
import {
  PageImageError,
  renderBrochurePage,
} from "@/lib/ingestion/page-images";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";
import { storageAdapter } from "@/lib/storage";

/**
 * `GET /api/v1/admin/submissions/{id}/brochure-page/{page}` — the image of one
 * page of the submission's own brochure, rendered on demand, for the review panel
 * to show beside a suggestion the router made from that page (an amenity named by a
 * single-facility page, `DECISIONS.md` 2026-09-24). Admin only, never stored, never
 * public: it is the source page a person checks a suggestion against.
 */
export const maxDuration = 120;

const UUID = /^[0-9a-f-]{36}$/i;

export const GET = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/admin/submissions/[id]/brochure-page/[page]">,
): Promise<Response> => {
  const session = await requireAdminRequest(request);
  if (session === "unauthenticated") {
    return errorResponse(401, "unauthenticated", "A session is required.");
  }
  if (session === "forbidden") {
    return errorResponse(403, "forbidden", "Admin access is required.");
  }

  const { id, page } = await context.params;
  const pageNumber = /^[1-9]\d{0,4}$/.test(page) ? Number(page) : NaN;
  if (!UUID.test(id) || !Number.isInteger(pageNumber)) {
    return errorResponse(404, "submission_not_found", "No such page.");
  }

  try {
    const brochure = await getSubmissionBrochure(db, id);
    if (!brochure || pageNumber > brochure.pageCount) {
      return errorResponse(404, "submission_not_found", "No such page.");
    }
    const pdf = await storageAdapter.download(brochure.storagePath);
    const rendered = await renderBrochurePage(pdf, pageNumber);
    return new Response(new Uint8Array(rendered.bytes), {
      headers: {
        "Content-Type": rendered.contentType,
        // The source is a private document: no shared cache, a short browser one.
        "Cache-Control": "private, max-age=600",
      },
    });
  } catch (cause) {
    if (cause instanceof PageImageError && cause.code === "page_out_of_range") {
      return errorResponse(404, "submission_not_found", "No such page.");
    }
    return internalErrorResponse(
      "GET /api/v1/admin/submissions/[id]/brochure-page/[page]",
      cause,
    );
  }
};

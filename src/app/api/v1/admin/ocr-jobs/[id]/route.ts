import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ocrExtractionJobs } from "@/db/schema/catalog";
import { requireAdminRequest } from "@/lib/accounts/api-session";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `GET /api/v1/admin/ocr-jobs/{id}`: where one extraction attempt stands, and
 * nothing else: `{ id, status }`. The page-review screen polls this small answer
 * instead of refreshing itself, and refreshes only when the status changes. No
 * provider detail, error text, cost or routing is returned here. A malformed id is
 * a 404, not a database error. It never calls a provider.
 */
export const GET = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/admin/ocr-jobs/[id]">,
): Promise<Response> => {
  const session = await requireAdminRequest(request);
  if (session === "unauthenticated") {
    return errorResponse(401, "unauthenticated", "A session is required.");
  }
  if (session === "forbidden") {
    return errorResponse(403, "forbidden", "Admin access is required.");
  }

  const { id } = await context.params;
  if (!UUID.test(id)) {
    return errorResponse(404, "ocr_job_not_found", "No such extraction.");
  }
  try {
    const [job] = await db
      .select({ id: ocrExtractionJobs.id, status: ocrExtractionJobs.status })
      .from(ocrExtractionJobs)
      .where(eq(ocrExtractionJobs.id, id));
    if (!job) {
      return errorResponse(404, "ocr_job_not_found", "No such extraction.");
    }
    return Response.json(job, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    return internalErrorResponse("GET /api/v1/admin/ocr-jobs/{id}", cause);
  }
};

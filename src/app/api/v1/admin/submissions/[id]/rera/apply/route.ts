import type { NextRequest } from "next/server";
import { db } from "@/db";
import { requireAdminRequest } from "@/lib/accounts/api-session";
import { reraErrorResponse } from "@/lib/rera/http";
import { applyReraValues } from "@/lib/rera/submission-fetch";
import { errorResponse } from "@/lib/properties/http";

/**
 * `POST /api/v1/admin/submissions/{id}/rera/apply` with `{ jobId }` — writes the
 * RERA values from that fetch into the submission's fields (validated like any
 * hand entry, saved as confirmed). Responds `{ applied: [fieldKey…] }`. The
 * submission stays a draft; nothing reaches the live catalogue except through
 * review and publish.
 */
export const POST = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/admin/submissions/[id]/rera/apply">,
): Promise<Response> => {
  const session = await requireAdminRequest(request);
  if (session === "unauthenticated")
    return errorResponse(401, "unauthenticated", "A session is required.");
  if (session === "forbidden")
    return errorResponse(403, "forbidden", "Admin access is required.");

  const body = (await request.json().catch(() => null)) as {
    jobId?: unknown;
  } | null;
  if (typeof body?.jobId !== "string") {
    return errorResponse(422, "invalid_request_body", "jobId is required.");
  }

  const { id } = await context.params;
  try {
    const result = await applyReraValues(db, {
      submissionId: id,
      jobId: body.jobId,
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    return reraErrorResponse(
      cause,
      "POST /api/v1/admin/submissions/[id]/rera/apply",
    );
  }
};

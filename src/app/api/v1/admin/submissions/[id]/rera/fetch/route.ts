import type { NextRequest } from "next/server";
import { db } from "@/db";
import { requireAdminRequest } from "@/lib/accounts/api-session";
import { reraErrorResponse } from "@/lib/rera/http";
import { fetchReraForSubmission } from "@/lib/rera/submission-fetch";
import { errorResponse } from "@/lib/properties/http";

/**
 * `POST /api/v1/admin/submissions/{id}/rera/fetch` with `{ registrationNumber }` —
 * looks the number up at its regulator and answers with the record and a
 * field-by-field comparison against what the submission holds. Changes nothing on
 * the submission; the admin then chooses `rera/apply`. Never cached.
 */
export const POST = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/admin/submissions/[id]/rera/fetch">,
): Promise<Response> => {
  const session = await requireAdminRequest(request);
  if (session === "unauthenticated")
    return errorResponse(401, "unauthenticated", "A session is required.");
  if (session === "forbidden")
    return errorResponse(403, "forbidden", "Admin access is required.");

  const body = (await request.json().catch(() => null)) as {
    registrationNumber?: unknown;
  } | null;
  const registrationNumber =
    typeof body?.registrationNumber === "string"
      ? body.registrationNumber.trim()
      : "";
  if (registrationNumber === "" || registrationNumber.length > 200) {
    return errorResponse(
      422,
      "invalid_request_body",
      "registrationNumber is required.",
    );
  }

  const { id } = await context.params;
  try {
    const result = await fetchReraForSubmission(db, {
      submissionId: id,
      registrationNumber,
      requestedBy: session.userId,
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    return reraErrorResponse(
      cause,
      "POST /api/v1/admin/submissions/[id]/rera/fetch",
    );
  }
};

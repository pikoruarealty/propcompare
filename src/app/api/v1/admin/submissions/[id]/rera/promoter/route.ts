import type { NextRequest } from "next/server";
import { db } from "@/db";
import { requireAdminRequest } from "@/lib/accounts/api-session";
import { reraErrorResponse } from "@/lib/rera/http";
import { addPromoterAsLegalEntity } from "@/lib/rera/submission-fetch";
import { errorResponse } from "@/lib/properties/http";

/**
 * `POST /api/v1/admin/submissions/{id}/rera/promoter` — records the promoter the
 * latest RERA fetch names as a legal entity of the submission's developer, when
 * none of the developer's entities matches it. Responds `{ id, legalName }`. The
 * comparison then proposes the entity, and "use RERA values" links it. Never cached.
 */
export const POST = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/admin/submissions/[id]/rera/promoter">,
): Promise<Response> => {
  const session = await requireAdminRequest(request);
  if (session === "unauthenticated")
    return errorResponse(401, "unauthenticated", "A session is required.");
  if (session === "forbidden")
    return errorResponse(403, "forbidden", "Admin access is required.");

  const { id } = await context.params;
  try {
    const result = await addPromoterAsLegalEntity(db, { submissionId: id });
    return Response.json(result, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (cause) {
    return reraErrorResponse(
      cause,
      "POST /api/v1/admin/submissions/[id]/rera/promoter",
    );
  }
};

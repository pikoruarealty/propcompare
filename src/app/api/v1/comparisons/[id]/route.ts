import type { NextRequest } from "next/server";
import { db } from "@/db";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";
import { requireBuyerSession } from "@/lib/buyer/session";
import { deleteComparison } from "@/lib/buyer/comparisons";

/**
 * `DELETE /api/v1/comparisons/{id}` — unsaves one of the caller's comparisons.
 * Specified in `docs/api/api-spec.v1.md`. Scoped by the session's own `userId`,
 * so another buyer's comparison is a `404`, never a `403` that would confirm it
 * exists.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DELETE = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/comparisons/[id]">,
): Promise<Response> => {
  const session = await requireBuyerSession(request);
  if (!session) {
    return errorResponse(401, "unauthenticated", "A session is required.");
  }

  const { id } = await context.params;
  // A malformed id cannot be anyone's comparison; skip the query it would fail.
  if (!UUID.test(id)) {
    return errorResponse(
      404,
      "comparison_not_found",
      `No comparison with id "${id}".`,
    );
  }

  try {
    const removed = await deleteComparison(db, session.userId, id);
    if (!removed) {
      return errorResponse(
        404,
        "comparison_not_found",
        `No comparison with id "${id}".`,
      );
    }
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (cause) {
    return internalErrorResponse("DELETE /api/v1/comparisons/[id]", cause);
  }
};

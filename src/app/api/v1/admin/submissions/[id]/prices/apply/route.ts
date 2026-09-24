import type { NextRequest } from "next/server";
import { db } from "@/db";
import { requireAdminRequest } from "@/lib/accounts/api-session";
import { getPricingDb } from "@/lib/pricing/db";
import { PricesError, retryApplyPrices } from "@/lib/pricing/panel";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";

/**
 * `POST /api/v1/admin/submissions/{id}/prices/apply` — applies the prices staged for
 * a published submission that did not reach the live unit types the first time
 * (owner only). Answers with what was applied, what already matched, and any staged
 * name that no live unit type carries. `409` when the submission is not published.
 */
export const POST = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/admin/submissions/[id]/prices/apply">,
): Promise<Response> => {
  const session = await requireAdminRequest(request);
  if (session === "unauthenticated") {
    return errorResponse(401, "unauthenticated", "A session is required.");
  }
  if (session === "forbidden" || session.permissionLevel !== "owner") {
    return errorResponse(403, "forbidden", "Only an owner can apply prices.");
  }
  const pricing = await getPricingDb();
  if (!pricing) {
    return errorResponse(
      503,
      "invalid_state",
      "The private price store is not configured on this server.",
    );
  }
  const { id } = await context.params;
  try {
    return Response.json(await retryApplyPrices(db, pricing, id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (cause) {
    if (cause instanceof PricesError) {
      return errorResponse(
        cause.code === "submission_not_found" ? 404 : 409,
        cause.code === "submission_not_found"
          ? "submission_not_found"
          : "invalid_state",
        cause.message,
      );
    }
    return internalErrorResponse(
      "POST /api/v1/admin/submissions/[id]/prices/apply",
      cause,
    );
  }
};

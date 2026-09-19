import type { NextRequest } from "next/server";
import { db } from "@/db";
import { requireAdminRequest } from "@/lib/accounts/api-session";
import { InviteError, revokeDeveloperUser } from "@/lib/developers/invites";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";
import { inviteErrorResponse } from "../invite-response";

/**
 * `DELETE /api/v1/admin/developer-users/{id}` — withdraws a pending invitation or
 * removes a member's access at once (their open sessions are ended too). The
 * account itself is kept; only the link to the developer profile is revoked.
 * Owner only.
 */
export const DELETE = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/admin/developer-users/[id]">,
): Promise<Response> => {
  const session = await requireAdminRequest(request);
  if (session === "unauthenticated") {
    return errorResponse(401, "unauthenticated", "A session is required.");
  }
  if (session === "forbidden") {
    return errorResponse(403, "forbidden", "Admin access is required.");
  }
  if (session.permissionLevel !== "owner") {
    return errorResponse(
      403,
      "owner_required",
      "Only an owner can remove access.",
    );
  }
  const { id } = await context.params;
  try {
    await revokeDeveloperUser(db, { developerUserId: id });
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (cause) {
    if (cause instanceof InviteError) return inviteErrorResponse(cause);
    return internalErrorResponse(
      "DELETE /api/v1/admin/developer-users/[id]",
      cause,
    );
  }
};

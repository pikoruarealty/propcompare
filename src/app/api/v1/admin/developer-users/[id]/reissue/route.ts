import type { NextRequest } from "next/server";
import { db } from "@/db";
import { requireAdminRequest } from "@/lib/accounts/api-session";
import {
  buildInviteUrl,
  InviteError,
  reissueDeveloperInvite,
} from "@/lib/developers/invites";
import { sendDeveloperInviteEmail } from "@/lib/email/invite-email";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";
import { inviteErrorResponse } from "../../invite-response";

/**
 * `POST /api/v1/admin/developer-users/{id}/reissue` — a new one-time link for
 * someone whose invitation is still pending. The previous link stops working.
 * Owner only.
 */
export const POST = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/admin/developer-users/[id]/reissue">,
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
      "Only an owner can invite people.",
    );
  }
  const { id } = await context.params;
  try {
    const issued = await reissueDeveloperInvite(db, { developerUserId: id });
    const origin = process.env.BETTER_AUTH_URL ?? request.nextUrl.origin;
    const inviteUrl = buildInviteUrl(origin, issued.userId, issued.token);
    // The link is also shown on screen, so a missing or failing email service
    // never blocks an invitation.
    const emailed = await sendDeveloperInviteEmail(db, {
      developerUserId: issued.developerUserId,
      email: issued.email,
      inviteUrl,
      expiresAt: issued.expiresAt,
    });
    return Response.json(
      {
        developerUserId: issued.developerUserId,
        email: issued.email,
        expiresAt: issued.expiresAt.toISOString(),
        inviteUrl,
        emailed,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    if (cause instanceof InviteError) return inviteErrorResponse(cause);
    return internalErrorResponse(
      "POST /api/v1/admin/developer-users/[id]/reissue",
      cause,
    );
  }
};

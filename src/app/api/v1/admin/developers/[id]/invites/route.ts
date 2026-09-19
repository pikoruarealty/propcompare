import type { NextRequest } from "next/server";
import { db } from "@/db";
import { requireAdminRequest } from "@/lib/accounts/api-session";
import {
  buildInviteUrl,
  createDeveloperInvite,
  InviteError,
} from "@/lib/developers/invites";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";
import { inviteErrorResponse } from "../../../developer-users/invite-response";

/**
 * `POST /api/v1/admin/developers/{id}/invites` — invites an email address to an
 * existing developer profile (`{ email, title? }`). Owner only: granting access to
 * a developer's records is a higher-risk operation than editing a draft.
 *
 * The response carries the one-time invite link. Until an email provider exists
 * the admin shares it by hand; it is never stored in readable form and cannot be
 * retrieved again (only replaced by re-issuing).
 */
export const POST = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/admin/developers/[id]/invites">,
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

  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
    title?: unknown;
  } | null;
  if (typeof body?.email !== "string") {
    return errorResponse(422, "invalid_request_body", "email is required.");
  }
  const { id } = await context.params;

  try {
    const issued = await createDeveloperInvite(db, {
      developerId: id,
      email: body.email,
      title: typeof body.title === "string" ? body.title : undefined,
    });
    const origin = process.env.BETTER_AUTH_URL ?? request.nextUrl.origin;
    return Response.json(
      {
        developerUserId: issued.developerUserId,
        email: issued.email,
        expiresAt: issued.expiresAt.toISOString(),
        inviteUrl: buildInviteUrl(origin, issued.userId, issued.token),
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    if (cause instanceof InviteError) return inviteErrorResponse(cause);
    return internalErrorResponse(
      "POST /api/v1/admin/developers/[id]/invites",
      cause,
    );
  }
};

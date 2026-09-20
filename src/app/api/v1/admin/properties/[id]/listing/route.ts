import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { properties } from "@/db/schema/catalog";
import { requireAdminRequest } from "@/lib/accounts/api-session";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";
import {
  changeListingStatus,
  ListingChangeError,
} from "@/lib/submissions/listing";
import { SubmissionPublishError } from "@/lib/submissions/publisher";
import { SubmissionTransitionError } from "@/lib/submissions/transitions";

/**
 * `POST /api/v1/admin/properties/{id}/listing` with `{ status }` — lists, unlists or
 * soft-deletes a property (`listed`, `unlisted`, `deleted`). Owner only, because it
 * publishes. It is an ordinary edit taken through review and publish, so it is
 * recorded as a version of the property; nothing is deleted, and listing it again
 * brings it back. Responds `{ propertyId, status }`.
 */
export const POST = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/admin/properties/[id]/listing">,
): Promise<Response> => {
  const session = await requireAdminRequest(request);
  if (session === "unauthenticated")
    return errorResponse(401, "unauthenticated", "A session is required.");
  if (session === "forbidden")
    return errorResponse(403, "forbidden", "Admin access is required.");
  if (session.permissionLevel !== "owner") {
    return errorResponse(
      403,
      "owner_required",
      "Only an owner can list, unlist or delete a property.",
    );
  }
  const body = (await request.json().catch(() => null)) as {
    status?: unknown;
  } | null;
  if (typeof body?.status !== "string") {
    return errorResponse(422, "invalid_request_body", "status is required.");
  }

  const { id } = await context.params;
  try {
    const result = await changeListingStatus(db, {
      propertyId: id,
      status: body.status,
      actorUserId: session.userId,
    });
    // Buyer pages are cached; make the change visible straight away.
    try {
      const [property] = await db
        .select({ slug: properties.slug })
        .from(properties)
        .where(eq(properties.id, id));
      revalidatePath("/");
      revalidatePath("/properties");
      if (property) revalidatePath(`/properties/${property.slug}`);
    } catch (cause) {
      console.error(
        "Could not refresh cached pages after a listing change:",
        cause,
      );
    }
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    if (cause instanceof ListingChangeError) {
      const status =
        cause.code === "property_not_found"
          ? 404
          : cause.code === "invalid_status"
            ? 422
            : 409;
      return Response.json(
        {
          error: { code: cause.code, message: cause.message },
          ...(cause.submissionId ? { submissionId: cause.submissionId } : {}),
        },
        { status, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (
      cause instanceof SubmissionPublishError ||
      cause instanceof SubmissionTransitionError
    ) {
      return errorResponse(409, "cannot_publish", cause.message);
    }
    return internalErrorResponse(
      "POST /api/v1/admin/properties/[id]/listing",
      cause,
    );
  }
};

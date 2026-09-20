import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { properties } from "@/db/schema/catalog";
import { requireAdminRequest } from "@/lib/accounts/api-session";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";
import {
  publishSubmission,
  SubmissionPublishError,
} from "@/lib/submissions/publisher";
import { SubmissionTransitionError } from "@/lib/submissions/transitions";

export const POST = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/admin/submissions/[id]/publish">,
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
      "Only an owner can publish a submission.",
    );
  }
  const { id } = await context.params;
  try {
    const published = await publishSubmission({
      submissionId: id,
      actorUserId: session.userId,
      actorRole: "owner",
    });
    // Buyer pages are cached; make the published change visible straight away.
    // Best effort: the property is already live either way.
    try {
      const [property] = await db
        .select({ slug: properties.slug })
        .from(properties)
        .where(eq(properties.id, published.propertyId));
      revalidatePath("/");
      revalidatePath("/properties");
      if (property) revalidatePath(`/properties/${property.slug}`);
    } catch (cause) {
      console.error("Could not refresh cached pages after publish:", cause);
    }
    return Response.json(published, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (cause) {
    if (
      cause instanceof SubmissionPublishError ||
      cause instanceof SubmissionTransitionError
    ) {
      return errorResponse(409, "cannot_publish", cause.message);
    }
    return internalErrorResponse(
      "POST /api/v1/admin/submissions/[id]/publish",
      cause,
    );
  }
};

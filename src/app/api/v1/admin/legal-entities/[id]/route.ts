import type { NextRequest } from "next/server";
import { db } from "@/db";
import { requireAdminRequest } from "@/lib/accounts/api-session";
import {
  parseLegalEntityInput,
  updateLegalEntity,
} from "@/lib/developers/legal-entities";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";

/** `PATCH /api/v1/admin/legal-entities/{id}` — corrects a recorded legal entity. */
export const PATCH = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/admin/legal-entities/[id]">,
): Promise<Response> => {
  const session = await requireAdminRequest(request);
  if (session === "unauthenticated") {
    return errorResponse(401, "unauthenticated", "A session is required.");
  }
  if (session === "forbidden") {
    return errorResponse(403, "forbidden", "Admin access is required.");
  }

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const parsed = parseLegalEntityInput(body ?? {});
  if (!parsed.ok) {
    return errorResponse(
      422,
      "invalid_request_body",
      Object.values(parsed.errors)[0] ?? "Check the details and try again.",
    );
  }

  const { id } = await context.params;
  try {
    const updated = await updateLegalEntity(db, id, parsed.value);
    if (updated.ok) {
      return new Response(null, {
        status: 204,
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (updated.code === "invalid") {
      return errorResponse(
        409,
        "invalid_value",
        Object.values(updated.errors)[0] ?? "That entity conflicts.",
      );
    }
    return errorResponse(404, "legal_entity_not_found", "Entity not found.");
  } catch (cause) {
    return internalErrorResponse(
      "PATCH /api/v1/admin/legal-entities/[id]",
      cause,
    );
  }
};

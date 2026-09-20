import type { NextRequest } from "next/server";
import { db } from "@/db";
import { requireAdminRequest } from "@/lib/accounts/api-session";
import {
  createLegalEntity,
  parseLegalEntityInput,
} from "@/lib/developers/legal-entities";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";

/**
 * `POST /api/v1/admin/developers/{id}/legal-entities` — records a legal promoter
 * entity (`{ legalName, entityType, reraPromoterRegistrationNumber? }`) against a
 * developer profile. Any admin may add one: it is a factual record used to
 * match RERA registrations, not access to anything.
 */
export const POST = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/admin/developers/[id]/legal-entities">,
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
    const created = await createLegalEntity(db, id, parsed.value);
    if (created.ok) {
      return Response.json(
        { id: created.id },
        { status: 201, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (created.code === "developer_not_found") {
      return errorResponse(404, "developer_not_found", "Developer not found.");
    }
    if (created.code === "invalid") {
      return errorResponse(
        409,
        "invalid_value",
        Object.values(created.errors)[0] ?? "That entity conflicts.",
      );
    }
    return errorResponse(404, "legal_entity_not_found", "Entity not found.");
  } catch (cause) {
    return internalErrorResponse(
      "POST /api/v1/admin/developers/[id]/legal-entities",
      cause,
    );
  }
};

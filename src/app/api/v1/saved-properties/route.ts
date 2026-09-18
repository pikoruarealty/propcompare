import type { NextRequest } from "next/server";
import { db } from "@/db";
import {
  buyerJsonResponse,
  errorResponse,
  internalErrorResponse,
} from "@/lib/properties/http";
import { requireBuyerSession } from "@/lib/buyer/session";
import {
  parsePropertyIdBody,
  parseSavedPropertiesQuery,
} from "@/lib/buyer/http";
import {
  listSavedProperties,
  saveProperty,
  unsaveProperty,
} from "@/lib/buyer/saved-properties";

/**
 * `GET, POST, DELETE /api/v1/saved-properties` — a buyer's saved properties.
 * Specified in `docs/api/api-spec.v1.md`;
 * `docs/tasklists/2026-09-18-buyer-account-routes.md` is the implementation
 * record. Every operation requires a session; nothing here is ever cached,
 * since it is scoped to the caller's own identity.
 */

export const GET = async (request: NextRequest): Promise<Response> => {
  const session = await requireBuyerSession(request);
  if (!session) {
    return errorResponse(401, "unauthenticated", "A session is required.");
  }

  const parsed = parseSavedPropertiesQuery(request.nextUrl.searchParams);
  if (!parsed.ok) {
    return errorResponse(422, parsed.code, parsed.message);
  }

  try {
    const result = await listSavedProperties(
      db,
      session.userId,
      parsed.params.page,
      parsed.params.pageSize,
    );
    return buyerJsonResponse(result, "no-store");
  } catch (cause) {
    return internalErrorResponse("GET /api/v1/saved-properties", cause);
  }
};

export const POST = async (request: NextRequest): Promise<Response> => {
  const session = await requireBuyerSession(request);
  if (!session) {
    return errorResponse(401, "unauthenticated", "A session is required.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(
      422,
      "invalid_request_body",
      "Request body must be valid JSON.",
    );
  }
  const parsed = parsePropertyIdBody(body);
  if (!parsed.ok) {
    return errorResponse(422, parsed.code, parsed.message);
  }

  try {
    const result = await saveProperty(db, session.userId, parsed.propertyId);
    if (!result) {
      return errorResponse(
        404,
        "property_not_found",
        `No property with id "${parsed.propertyId}".`,
      );
    }
    return buyerJsonResponse(result, "no-store");
  } catch (cause) {
    return internalErrorResponse("POST /api/v1/saved-properties", cause);
  }
};

export const DELETE = async (request: NextRequest): Promise<Response> => {
  const session = await requireBuyerSession(request);
  if (!session) {
    return errorResponse(401, "unauthenticated", "A session is required.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(
      422,
      "invalid_request_body",
      "Request body must be valid JSON.",
    );
  }
  const parsed = parsePropertyIdBody(body);
  if (!parsed.ok) {
    return errorResponse(422, parsed.code, parsed.message);
  }

  try {
    const removed = await unsaveProperty(db, session.userId, parsed.propertyId);
    if (!removed) {
      return errorResponse(
        404,
        "saved_property_not_found",
        `Property "${parsed.propertyId}" is not saved.`,
      );
    }
    return new Response(null, { status: 204 });
  } catch (cause) {
    return internalErrorResponse("DELETE /api/v1/saved-properties", cause);
  }
};

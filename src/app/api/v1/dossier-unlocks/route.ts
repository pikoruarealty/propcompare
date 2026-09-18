import type { NextRequest } from "next/server";
import { db } from "@/db";
import {
  buyerJsonResponse,
  errorResponse,
  internalErrorResponse,
} from "@/lib/properties/http";
import { requireBuyerSession } from "@/lib/buyer/session";
import { parsePropertyIdBody } from "@/lib/buyer/http";
import { unlockDossier } from "@/lib/buyer/dossier-unlocks";

/**
 * `POST /api/v1/dossier-unlocks` — records a phone-OTP-verified dossier
 * unlock. Specified in `docs/api/api-spec.v1.md`;
 * `docs/tasklists/2026-09-18-buyer-account-routes.md` is the implementation
 * record. Does not verify OTP itself — Better Auth's `phoneNumber` plugin
 * (`/api/auth/[...all]`) owns that and sets `users.phone_number_verified`;
 * this route only gates on that flag and records the unlock event.
 * Idempotent: repeat calls return the original `otpVerifiedAt`.
 */
export const POST = async (request: NextRequest): Promise<Response> => {
  const session = await requireBuyerSession(request);
  if (!session) {
    return errorResponse(401, "unauthenticated", "A session is required.");
  }
  if (!session.phoneNumberVerified) {
    return errorResponse(
      403,
      "phone_not_verified",
      "Verify your phone number via OTP before unlocking a dossier.",
    );
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
    const result = await unlockDossier(db, session.userId, parsed.propertyId);
    if (!result) {
      return errorResponse(
        404,
        "property_not_found",
        `No property with id "${parsed.propertyId}".`,
      );
    }
    return buyerJsonResponse(result, "no-store");
  } catch (cause) {
    return internalErrorResponse("POST /api/v1/dossier-unlocks", cause);
  }
};

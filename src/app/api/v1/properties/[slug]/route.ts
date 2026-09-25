import type { NextRequest } from "next/server";
import { db } from "@/db";
import { requireBuyerSession } from "@/lib/buyer/session";
import {
  DOSSIER_LOCKED_CACHE_CONTROL,
  buyerJsonResponse,
  errorResponse,
  internalErrorResponse,
} from "@/lib/properties/http";
import { lockDossier } from "@/lib/properties/lock";
import { getPublishedPropertyBySlug } from "@/lib/properties/queries";

/**
 * `GET /api/v1/properties/{slug}` — the published dossier for one property: in
 * full for a signed-in buyer, locked (`lockDossier`) for anyone else. Specified
 * in `docs/api/api-spec.v1.md`.
 *
 * The route takes no query parameters, so any it receives are ignored rather
 * than rejected; the listing route is where the `422` contract lives.
 *
 * `getPublishedPropertyBySlug` returns `null` rather than throwing when no row
 * matches — turning that into a `404` is this route's job.
 */
export const GET = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/properties/[slug]">,
): Promise<Response> => {
  const { slug } = await context.params;

  try {
    const dossier = await getPublishedPropertyBySlug(db, slug);
    if (dossier === null) {
      return errorResponse(
        404,
        "property_not_found",
        "No published property matches that slug.",
      );
    }
    const signedIn = (await requireBuyerSession(request)) !== null;
    return buyerJsonResponse(
      signedIn ? dossier : lockDossier(dossier),
      DOSSIER_LOCKED_CACHE_CONTROL,
    );
  } catch (cause) {
    return internalErrorResponse("GET /api/v1/properties/[slug]", cause);
  }
};

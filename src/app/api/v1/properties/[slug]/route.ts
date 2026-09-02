import type { NextRequest } from "next/server";
import { db } from "@/db";
import {
  DOSSIER_CACHE_CONTROL,
  buyerJsonResponse,
  errorResponse,
  internalErrorResponse,
} from "@/lib/properties/http";
import { getPublishedPropertyBySlug } from "@/lib/properties/queries";

/**
 * `GET /api/v1/properties/{slug}` — the full published dossier for one
 * property. Specified in `docs/api/api-spec.v1.md`.
 *
 * The route takes no query parameters, so any it receives are ignored rather
 * than rejected; the listing route is where the `422` contract lives.
 *
 * `getPublishedPropertyBySlug` returns `null` rather than throwing when no row
 * matches — turning that into a `404` is this route's job.
 */
export const GET = async (
  _request: NextRequest,
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
    return buyerJsonResponse(dossier, DOSSIER_CACHE_CONTROL);
  } catch (cause) {
    return internalErrorResponse("GET /api/v1/properties/[slug]", cause);
  }
};

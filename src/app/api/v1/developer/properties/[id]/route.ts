import type { NextRequest } from "next/server";
import { db } from "@/db";
import { developerReaderDb } from "@/db/developer-reader";
import { requireDeveloperRequest } from "@/lib/accounts/api-session";
import { getPropertyReport } from "@/lib/developers/analytics/report";
import {
  developerJsonResponse,
  parseReportQuery,
} from "@/lib/developers/analytics/http";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";

/**
 * `GET /api/v1/developer/properties/{id}?window=` — one of the signed-in
 * developer's own listed properties: its released figures, the splits that were
 * counted and how much of its record is stated. Another developer's property, an
 * unlisted one, an unknown one and a malformed id are all the same `404`, so the
 * route never confirms that someone else's property exists.
 */
export const GET = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/developer/properties/[id]">,
): Promise<Response> => {
  const session = await requireDeveloperRequest(request);
  if (session === "unauthenticated")
    return errorResponse(401, "unauthenticated", "A session is required.");
  if (session === "forbidden")
    return errorResponse(403, "forbidden", "Developer access is required.");

  const parsed = parseReportQuery(request.nextUrl.searchParams);
  if (!parsed.ok) return errorResponse(422, parsed.code, parsed.message);

  const { id } = await context.params;
  try {
    const report = await getPropertyReport(
      { reader: developerReaderDb, catalog: db },
      session.developerId,
      id,
      parsed.query.window,
    );
    if (!report) {
      return errorResponse(
        404,
        "property_not_found",
        "No such property in your portfolio.",
      );
    }
    return developerJsonResponse(report);
  } catch (cause) {
    return internalErrorResponse(
      "GET /api/v1/developer/properties/[id]",
      cause,
    );
  }
};

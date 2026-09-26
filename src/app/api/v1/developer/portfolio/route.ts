import type { NextRequest } from "next/server";
import { db } from "@/db";
import { developerReaderDb } from "@/db/developer-reader";
import { requireDeveloperRequest } from "@/lib/accounts/api-session";
import { getPortfolioReport } from "@/lib/developers/analytics/report";
import {
  developerJsonResponse,
  parseReportQuery,
} from "@/lib/developers/analytics/http";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";

/**
 * `GET /api/v1/developer/portfolio?window=` — the signed-in developer's released
 * analytics for their own listed properties (schema v21). Specified in
 * `docs/api/api-spec.v1.md`. The developer is the session's own, never a
 * parameter; a figure that did not meet the 5-visitor gate comes back withheld,
 * with no number. Never cached.
 */
export const GET = async (request: NextRequest): Promise<Response> => {
  const session = await requireDeveloperRequest(request);
  if (session === "unauthenticated")
    return errorResponse(401, "unauthenticated", "A session is required.");
  if (session === "forbidden")
    return errorResponse(403, "forbidden", "Developer access is required.");

  const parsed = parseReportQuery(request.nextUrl.searchParams);
  if (!parsed.ok) return errorResponse(422, parsed.code, parsed.message);

  try {
    const report = await getPortfolioReport(
      { reader: developerReaderDb, catalog: db },
      session.developerId,
      parsed.query.window,
    );
    return developerJsonResponse(report);
  } catch (cause) {
    return internalErrorResponse("GET /api/v1/developer/portfolio", cause);
  }
};

import type { NextRequest } from "next/server";
import { db } from "@/db";
import { developerReaderDb } from "@/db/developer-reader";
import { requireDeveloperRequest } from "@/lib/accounts/api-session";
import { toCsv } from "@/lib/developers/analytics/csv";
import { parseReportQuery } from "@/lib/developers/analytics/http";
import {
  getExportRows,
  listOwnProperties,
} from "@/lib/developers/analytics/report";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";

/**
 * `GET /api/v1/developer/export?window=&property=` — the same released figures as
 * the portfolio and property routes, as a CSV file. Nothing is added: a withheld
 * figure is a row with the status "not enough data" and an empty value, and a
 * cell that could run as a spreadsheet formula is neutralised. `property` (one of
 * the developer's own ids) narrows it to one property; an export over the row cap
 * must be narrowed that way.
 */
export const GET = async (request: NextRequest): Promise<Response> => {
  const session = await requireDeveloperRequest(request);
  if (session === "unauthenticated")
    return errorResponse(401, "unauthenticated", "A session is required.");
  if (session === "forbidden")
    return errorResponse(403, "forbidden", "Developer access is required.");

  const parsed = parseReportQuery(request.nextUrl.searchParams, {
    allowProperty: true,
  });
  if (!parsed.ok) return errorResponse(422, parsed.code, parsed.message);
  const { window, property } = parsed.query;

  try {
    const connections = { reader: developerReaderDb, catalog: db };
    if (property !== null) {
      const own = await listOwnProperties(db, session.developerId);
      if (!own.some((p) => p.id === property)) {
        return errorResponse(
          404,
          "property_not_found",
          "No such property in your portfolio.",
        );
      }
    }
    const result = await getExportRows(
      connections,
      session.developerId,
      window,
      property ?? undefined,
    );
    if (!result.ok) {
      return errorResponse(
        422,
        "invalid_query_parameter",
        "This export is too large. Pass property to export one property at a time.",
      );
    }
    const dataThrough = result.meta?.window.end ?? "";
    const csv = toCsv(
      [
        "window",
        "data_through",
        "property",
        "figure",
        "unit",
        "split",
        "split_value",
        "status",
        "value",
      ],
      result.rows.map((row) => [
        window,
        dataThrough,
        row.property,
        row.figure,
        row.unit,
        row.split,
        row.splitValue,
        row.status,
        row.value,
      ]),
    );
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="propcompare-analytics-${window}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (cause) {
    return internalErrorResponse("GET /api/v1/developer/export", cause);
  }
};

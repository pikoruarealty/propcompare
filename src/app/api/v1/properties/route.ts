import type { NextRequest } from "next/server";
import { db } from "@/db";
import {
  LIST_CACHE_CONTROL,
  buyerJsonResponse,
  errorResponse,
  internalErrorResponse,
  parseListParams,
} from "@/lib/properties/http";
import { listPublishedProperties } from "@/lib/properties/queries";

/**
 * `GET /api/v1/properties` — paginated published-property summaries.
 * Specified in `docs/api/api-spec.v1.md`.
 *
 * No route segment config is exported. Route Handlers run at request time by
 * default, which is what this route needs (it is defined entirely by its query
 * parameters), and `dynamic = "force-dynamic"` would only restate the default
 * while failing the build if `cacheComponents` is enabled later. Caching is
 * expressed as `Cache-Control` instead — see `@/lib/properties/http`.
 *
 * A property is published by virtue of having a `properties` row, so nothing
 * here filters on a status column. There isn't one.
 */
export const GET = async (request: NextRequest): Promise<Response> => {
  const parsed = parseListParams(request.nextUrl.searchParams);
  if (!parsed.ok) {
    return errorResponse(422, parsed.code, parsed.message);
  }

  try {
    const result = await listPublishedProperties(db, parsed.params);
    return buyerJsonResponse(result, LIST_CACHE_CONTROL);
  } catch (cause) {
    return internalErrorResponse("GET /api/v1/properties", cause);
  }
};

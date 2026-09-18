import type { NextRequest } from "next/server";
import { db } from "@/db";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";
import { getPublishedMediaObjectPath } from "@/lib/properties/queries";
import { storageAdapter } from "@/lib/storage";
import { StorageAdapterError } from "@/lib/storage/adapter";

/**
 * `GET /api/v1/media/{id}` — redirects to a freshly-generated signed read
 * URL for one `property_media` row. Specified in `docs/api/api-spec.v1.md`;
 * `2026-09-18 DECISIONS.md` explains why this is a redirect generated per
 * request rather than a URL baked into the dossier page's ISR-cached HTML.
 *
 * Always `no-store`: the redirect target is only valid for the signed URL's
 * short TTL, and generating a fresh one costs no network round trip (V4
 * signing is computed locally from the service account key), so there is no
 * reason to let an intermediary cache this response.
 */
export const GET = async (
  _request: NextRequest,
  context: RouteContext<"/api/v1/media/[id]">,
): Promise<Response> => {
  const { id } = await context.params;

  try {
    const objectPath = await getPublishedMediaObjectPath(db, id);
    if (objectPath === null) {
      return errorResponse(404, "media_not_found", `No media with id "${id}".`);
    }

    const signedUrl = await storageAdapter.getSignedReadUrl(objectPath);
    return new Response(null, {
      status: 302,
      headers: { Location: signedUrl, "Cache-Control": "no-store" },
    });
  } catch (cause) {
    if (
      cause instanceof StorageAdapterError &&
      cause.code === "object_not_found"
    ) {
      return errorResponse(
        404,
        "media_not_found",
        `The stored object for media "${id}" no longer exists.`,
      );
    }
    return internalErrorResponse("GET /api/v1/media/[id]", cause);
  }
};

import type { NextRequest } from "next/server";
import { db } from "@/db";
import { ensureThumbnail } from "@/lib/media/thumbnails";
import { errorResponse, internalErrorResponse } from "@/lib/properties/http";
import { getPublishedMediaForServing } from "@/lib/properties/queries";
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
 *
 * `?size=thumb` answers with a small WebP of a photo or floor plan instead (the
 * bytes themselves, made on first use and kept beside the original). A thumbnail
 * is a fixed picture for a fixed id, so it is cached for a year; if one cannot be
 * made the route falls back to the full picture rather than showing nothing.
 */
export const GET = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/media/[id]">,
): Promise<Response> => {
  const { id } = await context.params;

  const size = request.nextUrl.searchParams.get("size");
  if (size !== null && size !== "thumb") {
    return errorResponse(
      422,
      "invalid_query_parameter",
      'size must be "thumb" when given.',
    );
  }

  try {
    const media = await getPublishedMediaForServing(db, id);
    if (media === null) {
      return errorResponse(404, "media_not_found", `No media with id "${id}".`);
    }

    if (
      size === "thumb" &&
      (media.mediaType === "photo" || media.mediaType === "floor_plan")
    ) {
      try {
        const thumbnail = await ensureThumbnail(storageAdapter, media.gcsPath);
        return new Response(Buffer.from(thumbnail), {
          status: 200,
          headers: {
            "Content-Type": "image/webp",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      } catch (cause) {
        if (
          cause instanceof StorageAdapterError &&
          cause.code === "object_not_found"
        ) {
          throw cause;
        }
        // Not a thumbnail we can make: serve the full picture instead.
        console.warn(
          `[media] no thumbnail for ${id}: ${cause instanceof Error ? cause.message : "unknown"}`,
        );
      }
    }

    const signedUrl = await storageAdapter.getSignedReadUrl(media.gcsPath);
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

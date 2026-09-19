import type { NextRequest } from "next/server";
import { storageAdapter } from "@/lib/storage";
import { StorageAdapterError } from "@/lib/storage/adapter";
import {
  resolveLocalKey,
  verifyLocalReadSignature,
} from "@/lib/storage/local-adapter";

/**
 * `GET /api/v1/local-files/{key}?e=<expiry>&s=<signature>` — serves an object
 * from the local storage driver, the counterpart of a cloud signed URL. It only
 * exists when `STORAGE_DRIVER=local`; with any other driver it is a 404, so it
 * is not a second way into a production bucket. Access requires a valid,
 * unexpired signature issued by `getSignedReadUrl`.
 */
// Plain responses, not the public API error envelope: this is a development /
// self-hosting file route, not part of the documented buyer API contract.
const notFound = () => new Response("Not found", { status: 404 });

const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export const GET = async (
  request: NextRequest,
  context: RouteContext<"/api/v1/local-files/[...key]">,
): Promise<Response> => {
  if (process.env.STORAGE_DRIVER !== "local") {
    return notFound();
  }

  const { key: segments } = await context.params;
  const secret = process.env.BETTER_AUTH_SECRET;
  let key: string;
  try {
    key = resolveLocalKey(segments.map(decodeURIComponent).join("/"));
  } catch {
    return notFound();
  }

  const { searchParams } = request.nextUrl;
  const valid =
    secret !== undefined &&
    verifyLocalReadSignature({
      key,
      expires: Number(searchParams.get("e")),
      signature: searchParams.get("s") ?? "",
      secret,
    });
  if (!valid) return new Response("Link expired or invalid.", { status: 403 });

  try {
    const body = await storageAdapter.download(key);
    const extension = key.slice(key.lastIndexOf(".")).toLowerCase();
    return new Response(Buffer.from(body), {
      headers: {
        "Content-Type": CONTENT_TYPES[extension] ?? "application/octet-stream",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (cause) {
    if (
      cause instanceof StorageAdapterError &&
      cause.code === "object_not_found"
    ) {
      return notFound();
    }
    throw cause;
  }
};

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The route's redirect, thumbnail and error-mapping logic, tested with mocked
 * dependencies rather than a live database or storage credentials.
 */

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/properties/queries", () => ({
  getPublishedMediaForServing: vi.fn(),
}));
vi.mock("@/lib/storage", () => ({
  storageAdapter: { getSignedReadUrl: vi.fn() },
}));
vi.mock("@/lib/media/thumbnails", () => ({ ensureThumbnail: vi.fn() }));

const { getPublishedMediaForServing } =
  await import("@/lib/properties/queries");
const { storageAdapter } = await import("@/lib/storage");
const { ensureThumbnail } = await import("@/lib/media/thumbnails");
const { StorageAdapterError } = await import("@/lib/storage/adapter");
const { GET } = await import("./route");

const context = (id: string): RouteContext<"/api/v1/media/[id]"> => ({
  params: Promise.resolve({ id }),
});

const request = (query = "") =>
  new NextRequest(`http://localhost/api/v1/media/abc${query}`);

const photo = {
  gcsPath: "gs://bucket/photo.webp",
  mediaType: "photo",
} as const;

beforeEach(() => {
  vi.mocked(getPublishedMediaForServing).mockReset();
  vi.mocked(storageAdapter.getSignedReadUrl).mockReset();
  vi.mocked(ensureThumbnail).mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("GET /api/v1/media/[id]", () => {
  it("404s when no media matches the id", async () => {
    vi.mocked(getPublishedMediaForServing).mockResolvedValue(null);

    const response = await GET(request(), context("missing"));

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("media_not_found");
  });

  it("302s to the signed URL with Cache-Control: no-store", async () => {
    vi.mocked(getPublishedMediaForServing).mockResolvedValue(photo);
    vi.mocked(storageAdapter.getSignedReadUrl).mockResolvedValue(
      "https://signed.example/photo?sig=1",
    );

    const response = await GET(request(), context("abc"));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "https://signed.example/photo?sig=1",
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(storageAdapter.getSignedReadUrl).toHaveBeenCalledWith(photo.gcsPath);
  });

  it("404s when the row exists but its stored object is gone", async () => {
    vi.mocked(getPublishedMediaForServing).mockResolvedValue(photo);
    vi.mocked(storageAdapter.getSignedReadUrl).mockRejectedValue(
      new StorageAdapterError("object_not_found", "gone"),
    );

    const response = await GET(request(), context("abc"));

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("media_not_found");
  });

  it("500s without leaking details on an unexpected failure", async () => {
    vi.mocked(getPublishedMediaForServing).mockResolvedValue(photo);
    vi.mocked(storageAdapter.getSignedReadUrl).mockRejectedValue(
      new Error("secret 10.0.0.1"),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET(request(), context("abc"));

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("10.0.0.1");
  });
});

describe("GET /api/v1/media/[id]?size=thumb", () => {
  it("serves the thumbnail itself, as a small WebP cached for a year", async () => {
    vi.mocked(getPublishedMediaForServing).mockResolvedValue(photo);
    vi.mocked(ensureThumbnail).mockResolvedValue(new Uint8Array([1, 2, 3]));

    const response = await GET(request("?size=thumb"), context("abc"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([
      1, 2, 3,
    ]);
    expect(ensureThumbnail).toHaveBeenCalledWith(storageAdapter, photo.gcsPath);
    // Nothing was redirected to a signed URL.
    expect(storageAdapter.getSignedReadUrl).not.toHaveBeenCalled();
  });

  it("makes thumbnails of floor plans too", async () => {
    vi.mocked(getPublishedMediaForServing).mockResolvedValue({
      gcsPath: "gs://bucket/plan.webp",
      mediaType: "floor_plan",
    });
    vi.mocked(ensureThumbnail).mockResolvedValue(new Uint8Array([9]));

    expect((await GET(request("?size=thumb"), context("abc"))).status).toBe(
      200,
    );
  });

  it.each(["video", "brochure_pdf"] as const)(
    "does not try to resize a %s: it redirects to the file",
    async (mediaType) => {
      vi.mocked(getPublishedMediaForServing).mockResolvedValue({
        gcsPath: "gs://bucket/file",
        mediaType,
      });
      vi.mocked(storageAdapter.getSignedReadUrl).mockResolvedValue(
        "https://signed.example/f",
      );

      const response = await GET(request("?size=thumb"), context("abc"));

      expect(response.status).toBe(302);
      expect(ensureThumbnail).not.toHaveBeenCalled();
    },
  );

  it("falls back to the full picture when a thumbnail cannot be made", async () => {
    vi.mocked(getPublishedMediaForServing).mockResolvedValue(photo);
    vi.mocked(ensureThumbnail).mockRejectedValue(new Error("not a picture"));
    vi.mocked(storageAdapter.getSignedReadUrl).mockResolvedValue(
      "https://signed.example/full",
    );

    const response = await GET(request("?size=thumb"), context("abc"));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "https://signed.example/full",
    );
  });

  it("404s when the original is gone", async () => {
    vi.mocked(getPublishedMediaForServing).mockResolvedValue(photo);
    vi.mocked(ensureThumbnail).mockRejectedValue(
      new StorageAdapterError("object_not_found", "gone"),
    );

    expect((await GET(request("?size=thumb"), context("abc"))).status).toBe(
      404,
    );
  });

  it("404s an unknown id without making anything", async () => {
    vi.mocked(getPublishedMediaForServing).mockResolvedValue(null);

    expect((await GET(request("?size=thumb"), context("nope"))).status).toBe(
      404,
    );
    expect(ensureThumbnail).not.toHaveBeenCalled();
  });

  it.each(["large", "full", "", "THUMB", "1"])(
    "rejects size=%j rather than guessing",
    async (value) => {
      const response = await GET(request(`?size=${value}`), context("abc"));

      expect(response.status).toBe(422);
      expect((await response.json()).error.code).toBe(
        "invalid_query_parameter",
      );
      expect(getPublishedMediaForServing).not.toHaveBeenCalled();
    },
  );
});

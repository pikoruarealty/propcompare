import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The route's redirect/error-mapping logic, tested with mocked dependencies
 * rather than a live database or GCS credentials. There is no real
 * `property_media` fixture to exercise the "found" path against yet — the
 * OCR/submission field contract has no media field, so no sanctioned write
 * path can create one (see `queries.integration.test.ts`'s corresponding
 * test and the 2026-09-18 DECISIONS.md entry).
 */

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/properties/queries", () => ({
  getPublishedMediaObjectPath: vi.fn(),
}));
vi.mock("@/lib/storage", () => ({
  storageAdapter: { getSignedReadUrl: vi.fn() },
}));

const { getPublishedMediaObjectPath } =
  await import("@/lib/properties/queries");
const { storageAdapter } = await import("@/lib/storage");
const { StorageAdapterError } = await import("@/lib/storage/adapter");
const { GET } = await import("./route");

const context = (id: string): RouteContext<"/api/v1/media/[id]"> => ({
  params: Promise.resolve({ id }),
});

const request = new NextRequest("http://localhost/api/v1/media/abc");

beforeEach(() => {
  vi.mocked(getPublishedMediaObjectPath).mockReset();
  vi.mocked(storageAdapter.getSignedReadUrl).mockReset();
});

describe("GET /api/v1/media/[id]", () => {
  it("404s when no media matches the id", async () => {
    vi.mocked(getPublishedMediaObjectPath).mockResolvedValue(null);

    const response = await GET(request, context("missing"));

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("media_not_found");
  });

  it("302s to the signed URL with Cache-Control: no-store", async () => {
    vi.mocked(getPublishedMediaObjectPath).mockResolvedValue(
      "gs://my-bucket/photo.jpg",
    );
    vi.mocked(storageAdapter.getSignedReadUrl).mockResolvedValue(
      "https://storage.googleapis.com/signed?sig=abc",
    );

    const response = await GET(request, context("abc"));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "https://storage.googleapis.com/signed?sig=abc",
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(storageAdapter.getSignedReadUrl).toHaveBeenCalledWith(
      "gs://my-bucket/photo.jpg",
    );
  });

  it("404s when the storage adapter reports the object no longer exists", async () => {
    vi.mocked(getPublishedMediaObjectPath).mockResolvedValue(
      "gs://my-bucket/deleted.jpg",
    );
    vi.mocked(storageAdapter.getSignedReadUrl).mockRejectedValue(
      new StorageAdapterError("object_not_found", "gone"),
    );

    const response = await GET(request, context("abc"));

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("media_not_found");
  });

  it("500s on an unexpected failure", async () => {
    vi.mocked(getPublishedMediaObjectPath).mockRejectedValue(
      new Error("connection lost"),
    );

    const response = await GET(request, context("abc"));

    expect(response.status).toBe(500);
  });
});

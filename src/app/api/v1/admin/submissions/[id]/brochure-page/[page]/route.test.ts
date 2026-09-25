import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/accounts/api-session", () => ({
  requireAdminRequest: vi.fn(),
}));
vi.mock("@/lib/ingestion/queries", () => ({ getSubmissionBrochure: vi.fn() }));
vi.mock("@/lib/storage", () => ({ storageAdapter: { download: vi.fn() } }));
vi.mock("@/lib/ingestion/page-images", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/ingestion/page-images")
  >("@/lib/ingestion/page-images");
  return { ...actual, renderBrochurePage: vi.fn() };
});

const { requireAdminRequest } = await import("@/lib/accounts/api-session");
const { getSubmissionBrochure } = await import("@/lib/ingestion/queries");
const { storageAdapter } = await import("@/lib/storage");
const { PageImageError, renderBrochurePage } =
  await import("@/lib/ingestion/page-images");
const { GET } = await import("./route");

const ID = "11111111-1111-4111-8111-111111111111";
const call = (page: string, id = ID) =>
  GET(
    new NextRequest(
      `http://localhost/api/v1/admin/submissions/${id}/brochure-page/${page}`,
    ),
    { params: Promise.resolve({ id, page }) } as never,
  );

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireAdminRequest).mockResolvedValue({
    userId: "u1",
    permissionLevel: "verifier",
  });
  vi.mocked(getSubmissionBrochure).mockResolvedValue({
    pageCount: 20,
    storagePath: "brochures/x.pdf",
  } as never);
  vi.mocked(storageAdapter.download).mockResolvedValue(
    new Uint8Array([1, 2, 3]) as never,
  );
  vi.mocked(renderBrochurePage).mockResolvedValue({
    bytes: Buffer.from("webp-bytes"),
    width: 10,
    height: 10,
    contentType: "image/webp",
  });
});

describe("GET …/brochure-page/{page}", () => {
  it("answers 401 with no session and 403 for a non-admin, and renders nothing", async () => {
    vi.mocked(requireAdminRequest).mockResolvedValueOnce("unauthenticated");
    expect((await call("14")).status).toBe(401);
    vi.mocked(requireAdminRequest).mockResolvedValueOnce("forbidden");
    expect((await call("14")).status).toBe(403);
    expect(renderBrochurePage).not.toHaveBeenCalled();
  });

  it("serves the rendered page, never publicly cached", async () => {
    const response = await call("14");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=600");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe(
      "webp-bytes",
    );
    expect(renderBrochurePage).toHaveBeenCalledWith(expect.anything(), 14);
  });

  it.each(["0", "abc", "-1", "1.5", "999999"])(
    "answers 404 for the page %s, rendering nothing",
    async (page) => {
      expect((await call(page)).status).toBe(404);
      expect(renderBrochurePage).not.toHaveBeenCalled();
    },
  );

  it("answers 404 for a page past the end, a malformed id, and a submission with no brochure", async () => {
    expect((await call("21")).status).toBe(404);
    expect((await call("3", "not-a-uuid")).status).toBe(404);
    vi.mocked(getSubmissionBrochure).mockResolvedValueOnce(null);
    expect((await call("3")).status).toBe(404);
    expect(renderBrochurePage).not.toHaveBeenCalled();
  });

  it("answers 404 when the renderer says the page is out of range", async () => {
    vi.mocked(renderBrochurePage).mockRejectedValue(
      new PageImageError("page_out_of_range", "No such page."),
    );

    expect((await call("5")).status).toBe(404);
  });
});

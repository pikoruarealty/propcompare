import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/accounts/api-session", () => ({
  requireAdminRequest: vi.fn(),
}));
vi.mock("@/lib/ingestion/routing-confirmation", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/ingestion/routing-confirmation")
  >("@/lib/ingestion/routing-confirmation");
  return { ...actual, saveConfirmedRouting: vi.fn() };
});

const { requireAdminRequest } = await import("@/lib/accounts/api-session");
const { RoutingConfirmationError, saveConfirmedRouting } =
  await import("@/lib/ingestion/routing-confirmation");
const { PUT } = await import("./route");

const context = (
  id: string,
): RouteContext<"/api/v1/admin/ocr-jobs/[id]/routing-manifest"> => ({
  params: Promise.resolve({ id }),
});
const request = (body: unknown) =>
  new NextRequest(
    "http://localhost/api/v1/admin/ocr-jobs/job/routing-manifest",
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );

beforeEach(() => {
  vi.mocked(requireAdminRequest).mockReset();
  vi.mocked(saveConfirmedRouting).mockReset();
});

describe("PUT /api/v1/admin/ocr-jobs/{id}/routing-manifest", () => {
  it("requires an admin session", async () => {
    vi.mocked(requireAdminRequest).mockResolvedValue("unauthenticated");
    expect((await PUT(request({}), context("job"))).status).toBe(401);
    vi.mocked(requireAdminRequest).mockResolvedValue("forbidden");
    expect((await PUT(request({}), context("job"))).status).toBe(403);
  });

  it("saves server-built routing from the page choices", async () => {
    vi.mocked(requireAdminRequest).mockResolvedValue({
      userId: "admin",
      permissionLevel: "owner",
    });
    vi.mocked(saveConfirmedRouting).mockResolvedValue({
      version: "v2",
      pageCount: 1,
      scopes: [
        {
          scopeKey: "project-details",
          kind: "property_details",
          label: "Project details",
          pages: [{ pageNumber: 1 }],
        },
      ],
    });

    const response = await PUT(
      request({ pages: [{ pageNumber: 1, category: "project_details" }] }),
      context("job"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(saveConfirmedRouting).toHaveBeenCalledWith(expect.anything(), {
      ocrJobId: "job",
      pages: [{ pageNumber: 1, category: "project_details" }],
    });
  });

  it("maps validation, missing-attempt, and frozen-attempt errors", async () => {
    vi.mocked(requireAdminRequest).mockResolvedValue({
      userId: "admin",
      permissionLevel: "verifier",
    });
    vi.mocked(saveConfirmedRouting).mockRejectedValueOnce(
      new RoutingConfirmationError(
        "invalid_routing",
        "Every page is required.",
      ),
    );
    expect((await PUT(request({}), context("job"))).status).toBe(422);

    vi.mocked(saveConfirmedRouting).mockRejectedValueOnce(
      new RoutingConfirmationError(
        "job_not_found",
        "No such brochure attempt.",
      ),
    );
    expect((await PUT(request({}), context("job"))).status).toBe(404);

    vi.mocked(saveConfirmedRouting).mockRejectedValueOnce(
      new RoutingConfirmationError("job_not_draft", "Already queued."),
    );
    expect((await PUT(request({}), context("job"))).status).toBe(409);
  });
});

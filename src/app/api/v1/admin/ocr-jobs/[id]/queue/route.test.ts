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
  return { ...actual, queueConfirmedOcr: vi.fn() };
});

const { requireAdminRequest } = await import("@/lib/accounts/api-session");
const { queueConfirmedOcr, RoutingConfirmationError } =
  await import("@/lib/ingestion/routing-confirmation");
const { POST } = await import("./route");

const context = (
  id: string,
): RouteContext<"/api/v1/admin/ocr-jobs/[id]/queue"> => ({
  params: Promise.resolve({ id }),
});
const request = new NextRequest(
  "http://localhost/api/v1/admin/ocr-jobs/job/queue",
  {
    method: "POST",
  },
);

beforeEach(() => {
  vi.mocked(requireAdminRequest).mockReset();
  vi.mocked(queueConfirmedOcr).mockReset();
});

describe("POST /api/v1/admin/ocr-jobs/{id}/queue", () => {
  it("requires an admin session", async () => {
    vi.mocked(requireAdminRequest).mockResolvedValue("unauthenticated");
    expect((await POST(request, context("job"))).status).toBe(401);
    vi.mocked(requireAdminRequest).mockResolvedValue("forbidden");
    expect((await POST(request, context("job"))).status).toBe(403);
  });

  it("queues a confirmed draft without returning provider data", async () => {
    vi.mocked(requireAdminRequest).mockResolvedValue({
      userId: "admin",
      permissionLevel: "owner",
    });
    vi.mocked(queueConfirmedOcr).mockResolvedValue();

    const response = await POST(request, context("job"));

    expect(response.status).toBe(204);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(queueConfirmedOcr).toHaveBeenCalledWith(expect.anything(), "job");
  });

  it("refuses a missing, unconfirmed, or frozen attempt", async () => {
    vi.mocked(requireAdminRequest).mockResolvedValue({
      userId: "admin",
      permissionLevel: "verifier",
    });
    vi.mocked(queueConfirmedOcr).mockRejectedValueOnce(
      new RoutingConfirmationError(
        "job_not_found",
        "No such brochure attempt.",
      ),
    );
    expect((await POST(request, context("job"))).status).toBe(404);

    vi.mocked(queueConfirmedOcr).mockRejectedValueOnce(
      new RoutingConfirmationError(
        "routing_unconfirmed",
        "Routing is incomplete.",
      ),
    );
    expect((await POST(request, context("job"))).status).toBe(409);

    vi.mocked(queueConfirmedOcr).mockRejectedValueOnce(
      new RoutingConfirmationError("job_not_draft", "Already queued."),
    );
    expect((await POST(request, context("job"))).status).toBe(409);
  });
});

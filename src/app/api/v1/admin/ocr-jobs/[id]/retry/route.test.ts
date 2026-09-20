import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/accounts/api-session", () => ({
  requireAdminRequest: vi.fn(),
}));
vi.mock("@/lib/ingestion/extraction-retry", () => ({
  reopenFailedOcr: vi.fn(),
}));

const { requireAdminRequest } = await import("@/lib/accounts/api-session");
const { reopenFailedOcr } = await import("@/lib/ingestion/extraction-retry");
const { RoutingConfirmationError } =
  await import("@/lib/ingestion/routing-confirmation");
const { POST } = await import("./route");

const context = (
  id: string,
): RouteContext<"/api/v1/admin/ocr-jobs/[id]/retry"> => ({
  params: Promise.resolve({ id }),
});
const post = (body: unknown) =>
  new NextRequest("http://localhost/api/v1/admin/ocr-jobs/job/retry", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

beforeEach(() => {
  vi.mocked(requireAdminRequest).mockReset();
  vi.mocked(reopenFailedOcr).mockReset();
});

describe("POST /api/v1/admin/ocr-jobs/{id}/retry", () => {
  it("requires an admin session", async () => {
    vi.mocked(requireAdminRequest).mockResolvedValue("unauthenticated");
    expect((await POST(post({ mode: "requeue" }), context("job"))).status).toBe(
      401,
    );
    vi.mocked(requireAdminRequest).mockResolvedValue("forbidden");
    expect((await POST(post({ mode: "requeue" }), context("job"))).status).toBe(
      403,
    );
    expect(reopenFailedOcr).not.toHaveBeenCalled();
  });

  it("rejects a missing or unknown mode", async () => {
    vi.mocked(requireAdminRequest).mockResolvedValue({
      userId: "admin",
      permissionLevel: "verifier",
    });
    expect((await POST(post("not json"), context("job"))).status).toBe(400);
    expect((await POST(post({ mode: "delete" }), context("job"))).status).toBe(
      400,
    );
    expect(reopenFailedOcr).not.toHaveBeenCalled();
  });

  it("reopens a failed attempt in the requested way", async () => {
    vi.mocked(requireAdminRequest).mockResolvedValue({
      userId: "admin",
      permissionLevel: "verifier",
    });
    vi.mocked(reopenFailedOcr).mockResolvedValue();

    for (const mode of ["requeue", "edit_pages"] as const) {
      const response = await POST(post({ mode }), context("job"));
      expect(response.status).toBe(204);
      expect(reopenFailedOcr).toHaveBeenLastCalledWith(
        expect.anything(),
        "job",
        mode,
      );
    }
  });

  it("refuses a missing or non-failed attempt", async () => {
    vi.mocked(requireAdminRequest).mockResolvedValue({
      userId: "admin",
      permissionLevel: "verifier",
    });
    vi.mocked(reopenFailedOcr).mockRejectedValueOnce(
      new RoutingConfirmationError("job_not_found", "No such attempt."),
    );
    expect((await POST(post({ mode: "requeue" }), context("job"))).status).toBe(
      404,
    );
    vi.mocked(reopenFailedOcr).mockRejectedValueOnce(
      new RoutingConfirmationError("job_not_draft", "Not failed."),
    );
    expect((await POST(post({ mode: "requeue" }), context("job"))).status).toBe(
      409,
    );
  });
});

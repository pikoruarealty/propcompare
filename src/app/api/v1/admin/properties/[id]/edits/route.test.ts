import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/accounts/api-session", () => ({
  requireAdminRequest: vi.fn(),
}));
vi.mock("@/lib/submissions/edit-property", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/submissions/edit-property")
  >("@/lib/submissions/edit-property");
  return { ...actual, createEditSubmission: vi.fn() };
});

const { requireAdminRequest } = await import("@/lib/accounts/api-session");
const { createEditSubmission, EditPropertyError } =
  await import("@/lib/submissions/edit-property");
const route = await import("./route");

const ID = "22222222-2222-4222-8222-222222222222";
const context = { params: Promise.resolve({ id: ID }) };
const request = () =>
  new NextRequest(`http://localhost/api/v1/admin/properties/${ID}/edits`, {
    method: "POST",
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireAdminRequest).mockResolvedValue({
    userId: "u1",
  } as unknown as Awaited<ReturnType<typeof requireAdminRequest>>);
});

describe("POST /api/v1/admin/properties/{id}/edits", () => {
  it("answers 401 with no session and 403 for a non-admin, starting nothing", async () => {
    vi.mocked(requireAdminRequest).mockResolvedValueOnce("unauthenticated");
    expect((await route.POST(request(), context as never)).status).toBe(401);
    vi.mocked(requireAdminRequest).mockResolvedValueOnce("forbidden");
    expect((await route.POST(request(), context as never)).status).toBe(403);
    expect(createEditSubmission).not.toHaveBeenCalled();
  });

  it("creates an edit and returns its id, uncached", async () => {
    vi.mocked(createEditSubmission).mockResolvedValue({ submissionId: "s1" });

    const response = await route.POST(request(), context as never);

    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ submissionId: "s1" });
    expect(createEditSubmission).toHaveBeenCalledWith(
      {},
      { propertyId: ID, submittedBy: "u1" },
    );
  });

  it("says a missing property is missing", async () => {
    vi.mocked(createEditSubmission).mockRejectedValue(
      new EditPropertyError("property_not_found", "Property not found."),
    );

    const response = await route.POST(request(), context as never);

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("property_not_found");
  });

  it("points at the edit already open rather than starting a second", async () => {
    vi.mocked(createEditSubmission).mockRejectedValue(
      new EditPropertyError("edit_already_open", "In progress.", "s-open"),
    );

    const response = await route.POST(request(), context as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      submissionId: "s-open",
      error: { code: "edit_already_open" },
    });
  });

  it("does not leak an unexpected failure", async () => {
    vi.mocked(createEditSubmission).mockRejectedValue(
      new Error("secret 10.0.0.9"),
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await route.POST(request(), context as never);

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("10.0.0.9");
    spy.mockRestore();
  });
});

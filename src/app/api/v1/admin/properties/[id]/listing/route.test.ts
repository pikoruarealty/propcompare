import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({ where: async () => [{ slug: "a-tower" }] }),
    }),
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/accounts/api-session", () => ({
  requireAdminRequest: vi.fn(),
}));
vi.mock("@/lib/submissions/listing", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/submissions/listing")
  >("@/lib/submissions/listing");
  return { ...actual, changeListingStatus: vi.fn() };
});

const { revalidatePath } = await import("next/cache");
const { requireAdminRequest } = await import("@/lib/accounts/api-session");
const { changeListingStatus, ListingChangeError } =
  await import("@/lib/submissions/listing");
const { SubmissionPublishError } = await import("@/lib/submissions/publisher");
const route = await import("./route");

const ID = "33333333-3333-4333-8333-333333333333";
const context = { params: Promise.resolve({ id: ID }) };
const post = (body: unknown) =>
  new NextRequest(`http://localhost/api/v1/admin/properties/${ID}/listing`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const asOwner = { userId: "u1", permissionLevel: "owner" };
const asVerifier = { userId: "u2", permissionLevel: "verifier" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireAdminRequest).mockResolvedValue(
    asOwner as unknown as Awaited<ReturnType<typeof requireAdminRequest>>,
  );
});

describe("POST /api/v1/admin/properties/{id}/listing", () => {
  it("needs a session, and an owner: it publishes", async () => {
    vi.mocked(requireAdminRequest).mockResolvedValueOnce("unauthenticated");
    expect(
      (await route.POST(post({ status: "unlisted" }), context as never)).status,
    ).toBe(401);
    vi.mocked(requireAdminRequest).mockResolvedValueOnce("forbidden");
    expect(
      (await route.POST(post({ status: "unlisted" }), context as never)).status,
    ).toBe(403);
    vi.mocked(requireAdminRequest).mockResolvedValueOnce(
      asVerifier as unknown as Awaited<ReturnType<typeof requireAdminRequest>>,
    );

    const response = await route.POST(
      post({ status: "unlisted" }),
      context as never,
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("owner_required");
    expect(changeListingStatus).not.toHaveBeenCalled();
  });

  it("requires a status", async () => {
    expect((await route.POST(post({}), context as never)).status).toBe(422);
    expect(
      (await route.POST(post({ status: 3 }), context as never)).status,
    ).toBe(422);
  });

  it("changes the status, refreshes the cached buyer pages, and answers uncached", async () => {
    vi.mocked(changeListingStatus).mockResolvedValue({
      propertyId: ID,
      status: "unlisted",
    });

    const response = await route.POST(
      post({ status: "unlisted" }),
      context as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      propertyId: ID,
      status: "unlisted",
    });
    expect(changeListingStatus).toHaveBeenCalledWith(expect.anything(), {
      propertyId: ID,
      status: "unlisted",
      actorUserId: "u1",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/properties/a-tower");
    expect(revalidatePath).toHaveBeenCalledWith("/properties");
  });

  it.each([
    ["property_not_found", 404],
    ["invalid_status", 422],
    ["no_change", 409],
    ["edit_already_open", 409],
  ] as const)("maps %s to %i", async (code, status) => {
    vi.mocked(changeListingStatus).mockRejectedValue(
      new ListingChangeError(
        code,
        "words",
        code === "edit_already_open" ? "s1" : undefined,
      ),
    );

    const response = await route.POST(
      post({ status: "unlisted" }),
      context as never,
    );

    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body.error.code).toBe(code);
    if (code === "edit_already_open") expect(body.submissionId).toBe("s1");
  });

  it("maps a refused publish to 409 in plain words", async () => {
    vi.mocked(changeListingStatus).mockRejectedValue(
      new SubmissionPublishError("cannot publish"),
    );

    const response = await route.POST(
      post({ status: "unlisted" }),
      context as never,
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("cannot_publish");
  });

  it("does not leak an unexpected failure", async () => {
    vi.mocked(changeListingStatus).mockRejectedValue(
      new Error("secret 10.0.0.5"),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await route.POST(
      post({ status: "unlisted" }),
      context as never,
    );

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("10.0.0.5");
  });
});

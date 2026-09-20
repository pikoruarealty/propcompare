import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/accounts/api-session", () => ({
  requireAdminRequest: vi.fn(),
}));
vi.mock("@/lib/rera/submission-fetch", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/rera/submission-fetch")
  >("@/lib/rera/submission-fetch");
  return {
    ...actual,
    fetchReraForSubmission: vi.fn(),
    applyReraValues: vi.fn(),
  };
});

const { requireAdminRequest } = await import("@/lib/accounts/api-session");
const { fetchReraForSubmission, applyReraValues, ReraFetchError } =
  await import("@/lib/rera/submission-fetch");
const fetchRoute = await import("./fetch/route");
const applyRoute = await import("./apply/route");

const ID = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ id: ID }) };
const post = (path: string, body: unknown) =>
  new NextRequest(
    `http://localhost/api/v1/admin/submissions/${ID}/rera/${path}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

const admin = { userId: "u1" } as unknown as Awaited<
  ReturnType<typeof requireAdminRequest>
>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireAdminRequest).mockResolvedValue(admin);
});

describe("POST …/rera/fetch", () => {
  it("answers 401 with no session and 403 for a non-admin, and looks nothing up", async () => {
    vi.mocked(requireAdminRequest).mockResolvedValueOnce("unauthenticated");
    expect(
      (
        await fetchRoute.POST(
          post("fetch", { registrationNumber: "PR/GJ/1" }),
          context as never,
        )
      ).status,
    ).toBe(401);
    vi.mocked(requireAdminRequest).mockResolvedValueOnce("forbidden");
    expect(
      (
        await fetchRoute.POST(
          post("fetch", { registrationNumber: "PR/GJ/1" }),
          context as never,
        )
      ).status,
    ).toBe(403);
    expect(fetchReraForSubmission).not.toHaveBeenCalled();
  });

  it.each([
    [{}],
    [{ registrationNumber: "  " }],
    [{ registrationNumber: 5 }],
    [{ registrationNumber: "x".repeat(201) }],
  ])("rejects a body without a usable number (%j)", async (body) => {
    const response = await fetchRoute.POST(
      post("fetch", body),
      context as never,
    );
    expect(response.status).toBe(422);
    expect(fetchReraForSubmission).not.toHaveBeenCalled();
  });

  it("returns the record and comparison, uncached, recording who asked", async () => {
    vi.mocked(fetchReraForSubmission).mockResolvedValue({
      jobId: "j1",
      record: { projectName: "X" },
      comparison: [],
    } as never);

    const response = await fetchRoute.POST(
      post("fetch", { registrationNumber: " PR/GJ/ABC " }),
      context as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await response.json()).jobId).toBe("j1");
    expect(fetchReraForSubmission).toHaveBeenCalledWith(
      {},
      { submissionId: ID, registrationNumber: "PR/GJ/ABC", requestedBy: "u1" },
    );
  });

  it.each([
    ["submission_not_found", 404],
    ["invalid_state", 409],
    ["duplicate_number", 409],
    ["no_regulator", 422],
    ["not_found", 422],
    ["unavailable", 502],
  ] as const)("maps %s to %i", async (code, status) => {
    vi.mocked(fetchReraForSubmission).mockRejectedValue(
      new ReraFetchError(code, "plain words"),
    );

    const response = await fetchRoute.POST(
      post("fetch", { registrationNumber: "PR/GJ/ABC" }),
      context as never,
    );

    expect(response.status).toBe(status);
    expect((await response.json()).error).toMatchObject({
      code,
      message: "plain words",
    });
  });

  it("does not leak an unexpected failure's details", async () => {
    vi.mocked(fetchReraForSubmission).mockRejectedValue(
      new Error("connect ECONNREFUSED 10.0.0.1"),
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await fetchRoute.POST(
      post("fetch", { registrationNumber: "PR/GJ/ABC" }),
      context as never,
    );

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("10.0.0.1");
    spy.mockRestore();
  });
});

describe("POST …/rera/apply", () => {
  it("requires an admin session", async () => {
    vi.mocked(requireAdminRequest).mockResolvedValueOnce("forbidden");
    expect(
      (await applyRoute.POST(post("apply", { jobId: "j" }), context as never))
        .status,
    ).toBe(403);
    expect(applyReraValues).not.toHaveBeenCalled();
  });

  it("requires a job id", async () => {
    expect(
      (await applyRoute.POST(post("apply", {}), context as never)).status,
    ).toBe(422);
  });

  it("returns what was applied", async () => {
    vi.mocked(applyReraValues).mockResolvedValue({
      applied: ["property.name"],
    });

    const response = await applyRoute.POST(
      post("apply", { jobId: "j1" }),
      context as never,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ applied: ["property.name"] });
    expect(applyReraValues).toHaveBeenCalledWith(
      {},
      { submissionId: ID, jobId: "j1" },
    );
  });

  it.each([
    ["job_not_found", 404],
    ["nothing_to_apply", 409],
    ["invalid_state", 409],
    ["invalid_value", 422],
  ] as const)("maps %s to %i", async (code, status) => {
    vi.mocked(applyReraValues).mockRejectedValue(
      new ReraFetchError(code, "words"),
    );
    expect(
      (await applyRoute.POST(post("apply", { jobId: "j1" }), context as never))
        .status,
    ).toBe(status);
  });
});

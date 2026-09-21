import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rows: { id: string; status: string }[] = [];
vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => rows }) }),
  },
}));
vi.mock("@/lib/accounts/api-session", () => ({
  requireAdminRequest: vi.fn(),
}));

const { requireAdminRequest } = await import("@/lib/accounts/api-session");
const { GET } = await import("./route");

const ID = "1a9635fd-ec7a-4d10-8f75-1cd1930f49ea";
const context = (id: string): RouteContext<"/api/v1/admin/ocr-jobs/[id]"> => ({
  params: Promise.resolve({ id }),
});
const get = () =>
  new NextRequest(`http://localhost/api/v1/admin/ocr-jobs/${ID}`);

beforeEach(() => {
  vi.mocked(requireAdminRequest).mockReset();
  rows.length = 0;
});

describe("GET /api/v1/admin/ocr-jobs/{id}", () => {
  it("requires an admin session", async () => {
    vi.mocked(requireAdminRequest).mockResolvedValue("unauthenticated");
    expect((await GET(get(), context(ID))).status).toBe(401);
    vi.mocked(requireAdminRequest).mockResolvedValue("forbidden");
    expect((await GET(get(), context(ID))).status).toBe(403);
  });

  it("answers with the status and nothing else, uncached", async () => {
    vi.mocked(requireAdminRequest).mockResolvedValue({
      userId: "admin",
      permissionLevel: "verifier",
    });
    rows.push({ id: ID, status: "processing" });
    const response = await GET(get(), context(ID));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: ID, status: "processing" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("is a 404 for an unknown job and for a malformed id", async () => {
    vi.mocked(requireAdminRequest).mockResolvedValue({
      userId: "admin",
      permissionLevel: "verifier",
    });
    expect((await GET(get(), context(ID))).status).toBe(404);
    expect((await GET(get(), context("not-an-id"))).status).toBe(404);
  });
});

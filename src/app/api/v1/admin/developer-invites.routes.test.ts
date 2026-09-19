import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/accounts/api-session", () => ({
  requireAdminRequest: vi.fn(),
}));
vi.mock("@/lib/developers/invites", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/developers/invites")
  >("@/lib/developers/invites");
  return {
    ...actual,
    createDeveloperInvite: vi.fn(),
    reissueDeveloperInvite: vi.fn(),
    revokeDeveloperUser: vi.fn(),
  };
});

const { requireAdminRequest } = await import("@/lib/accounts/api-session");
const {
  createDeveloperInvite,
  reissueDeveloperInvite,
  revokeDeveloperUser,
  InviteError,
} = await import("@/lib/developers/invites");
const invites = await import("./developers/[id]/invites/route");
const reissue = await import("./developer-users/[id]/reissue/route");
const remove = await import("./developer-users/[id]/route");

const ID = "11111111-1111-1111-1111-111111111111";
const ctx = (params: Record<string, string>) =>
  ({ params: Promise.resolve(params) }) as never;
const post = (body: unknown = {}) =>
  new NextRequest("http://localhost/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const del = () => new NextRequest("http://localhost/x", { method: "DELETE" });

const owner = { userId: "u1", permissionLevel: "owner" as const };
const verifier = { userId: "u2", permissionLevel: "verifier" as const };
const issued = {
  developerUserId: "m1",
  userId: "user1",
  email: "a@b.co",
  token: "secret-token",
  expiresAt: new Date("2026-10-01T00:00:00Z"),
};

const calls: [string, () => Promise<Response>][] = [
  [
    "POST invite",
    () => invites.POST(post({ email: "a@b.co" }), ctx({ id: ID })),
  ],
  ["POST reissue", () => reissue.POST(post(), ctx({ id: ID }))],
  ["DELETE member", () => remove.DELETE(del(), ctx({ id: ID }))],
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("developer invite routes: access", () => {
  it.each(calls)("%s needs a session", async (_n, call) => {
    vi.mocked(requireAdminRequest).mockResolvedValue("unauthenticated");
    expect((await call()).status).toBe(401);
  });

  it.each(calls)("%s refuses a signed-in non-admin", async (_n, call) => {
    vi.mocked(requireAdminRequest).mockResolvedValue("forbidden");
    expect((await call()).status).toBe(403);
  });

  it.each(calls)("%s is owner-only, even for a verifier", async (_n, call) => {
    vi.mocked(requireAdminRequest).mockResolvedValue(verifier);
    const response = await call();
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("owner_required");
    expect(createDeveloperInvite).not.toHaveBeenCalled();
    expect(reissueDeveloperInvite).not.toHaveBeenCalled();
    expect(revokeDeveloperUser).not.toHaveBeenCalled();
  });
});

describe("developer invite routes: behaviour", () => {
  beforeEach(() => vi.mocked(requireAdminRequest).mockResolvedValue(owner));

  it("returns the one-time link uncached, and never the raw token outside the URL", async () => {
    vi.mocked(createDeveloperInvite).mockResolvedValue(issued);
    const response = await invites.POST(
      post({ email: "a@b.co", title: "Sales" }),
      ctx({ id: ID }),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(body.inviteUrl).toMatch(
      /\/developers\/accept-invite\?u=user1&t=secret-token$/,
    );
    expect(body).not.toHaveProperty("token");
    expect(body).not.toHaveProperty("userId");
    expect(createDeveloperInvite).toHaveBeenCalledWith(expect.anything(), {
      developerId: ID,
      email: "a@b.co",
      title: "Sales",
    });
  });

  it("needs an email in the body", async () => {
    expect((await invites.POST(post({}), ctx({ id: ID }))).status).toBe(422);
    expect(createDeveloperInvite).not.toHaveBeenCalled();
  });

  it("maps invite failures to the right status", async () => {
    for (const [code, status] of [
      ["developer_not_found", 404],
      ["invalid_email", 422],
      ["account_exists", 409],
      ["already_member", 409],
    ] as const) {
      vi.mocked(createDeveloperInvite).mockRejectedValueOnce(
        new InviteError(code, code),
      );
      expect(
        (await invites.POST(post({ email: "a@b.co" }), ctx({ id: ID }))).status,
      ).toBe(status);
    }
  });

  it("re-issues a link and removes access", async () => {
    vi.mocked(reissueDeveloperInvite).mockResolvedValue(issued);
    const again = await reissue.POST(post(), ctx({ id: ID }));
    expect(again.status).toBe(200);
    expect((await again.json()).inviteUrl).toContain("t=secret-token");

    vi.mocked(revokeDeveloperUser).mockResolvedValue();
    expect((await remove.DELETE(del(), ctx({ id: ID }))).status).toBe(204);

    vi.mocked(revokeDeveloperUser).mockRejectedValueOnce(
      new InviteError("member_not_found", "gone"),
    );
    expect((await remove.DELETE(del(), ctx({ id: ID }))).status).toBe(404);
  });
});

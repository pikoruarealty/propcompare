import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The portal sign-in redirects: a signed-in person of the right role skips the
 * login form, and anyone signed out (or of the wrong role) is sent to the login.
 * Dependencies are mocked: `redirect` throws as it does in Next, so a test can tell
 * "redirected" from "carried on".
 */

class Redirected extends Error {
  constructor(public readonly to: string) {
    super(`redirect:${to}`);
  }
}

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
}));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/lib/accounts/roles", () => ({ resolveAccountRole: vi.fn() }));

const { auth } = await import("@/lib/auth");
const { resolveAccountRole } = await import("@/lib/accounts/roles");
const { redirectIfSignedIn, requirePortalRole } = await import("./session");

const signedInAs = (role: Awaited<ReturnType<typeof resolveAccountRole>>) => {
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: "u1", email: "a@example.test" },
  } as never);
  vi.mocked(resolveAccountRole).mockResolvedValue(role);
};

const redirectedTo = async (run: () => Promise<unknown>) => {
  try {
    await run();
    return null;
  } catch (cause) {
    if (cause instanceof Redirected) return cause.to;
    throw cause;
  }
};

beforeEach(() => {
  vi.mocked(auth.api.getSession).mockReset();
  vi.mocked(resolveAccountRole).mockReset();
});

describe("the login screens skip the form for someone already signed in", () => {
  it("sends a signed-in admin from /admin/login on to where they were headed", async () => {
    signedInAs({ kind: "admin", permissionLevel: "owner" });
    expect(
      await redirectedTo(() => redirectIfSignedIn("admin", "/admin")),
    ).toBe("/admin");
    expect(
      await redirectedTo(() =>
        redirectIfSignedIn("admin", "/admin/submissions/abc"),
      ),
    ).toBe("/admin/submissions/abc");
  });

  it("sends a signed-in developer from /developers/login to the developer home", async () => {
    signedInAs({ kind: "developer", developerId: "d1" });
    expect(
      await redirectedTo(() => redirectIfSignedIn("developer", "/developers")),
    ).toBe("/developers");
  });

  it("shows the form to someone signed out", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    expect(
      await redirectedTo(() => redirectIfSignedIn("admin", "/admin")),
    ).toBeNull();
    expect(resolveAccountRole).not.toHaveBeenCalled();
  });

  it("shows the form to a signed-in account of the other role, and to a buyer", async () => {
    signedInAs({ kind: "developer", developerId: "d1" });
    expect(
      await redirectedTo(() => redirectIfSignedIn("admin", "/admin")),
    ).toBeNull();
    signedInAs({ kind: "buyer" });
    expect(
      await redirectedTo(() => redirectIfSignedIn("admin", "/admin")),
    ).toBeNull();
    expect(
      await redirectedTo(() => redirectIfSignedIn("developer", "/developers")),
    ).toBeNull();
  });
});

describe("a portal page sends the signed-out to that portal's login, carrying where they were going", () => {
  it("signed out, from any admin address", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    expect(
      await redirectedTo(() =>
        requirePortalRole("admin", "/admin/submissions/abc?x=1"),
      ),
    ).toBe("/admin/login?next=%2Fadmin%2Fsubmissions%2Fabc%3Fx%3D1");
  });

  it("signed in as the wrong role, and signed in as a buyer", async () => {
    signedInAs({ kind: "developer", developerId: "d1" });
    expect(await redirectedTo(() => requirePortalRole("admin", "/admin"))).toBe(
      "/admin/login?next=%2Fadmin",
    );
    signedInAs({ kind: "buyer" });
    expect(
      await redirectedTo(() => requirePortalRole("developer", "/developers")),
    ).toBe("/developers/login?next=%2Fdevelopers");
  });

  it("lets the right role through", async () => {
    signedInAs({ kind: "admin", permissionLevel: "verifier" });
    await expect(requirePortalRole("admin", "/admin")).resolves.toMatchObject({
      userId: "u1",
      role: { kind: "admin", permissionLevel: "verifier" },
    });
  });
});

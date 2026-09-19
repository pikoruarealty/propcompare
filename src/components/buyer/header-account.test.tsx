import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useSession, signOut, refresh } = vi.hoisted(() => ({
  useSession: vi.fn(),
  signOut: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession, signOut },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/properties/west-park",
  useRouter: () => ({ refresh }),
}));

import { HeaderAccount } from "./header-account";

beforeEach(() => {
  vi.clearAllMocks();
  signOut.mockResolvedValue({});
});

describe("HeaderAccount", () => {
  it("renders nothing while the session is loading", () => {
    useSession.mockReturnValue({ data: null, isPending: true });
    const { container } = render(<HeaderAccount />);
    expect(container).toBeEmptyDOMElement();
  });

  it("offers sign in, returning to the current page", () => {
    useSession.mockReturnValue({ data: null, isPending: false });
    render(<HeaderAccount />);
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute(
      "href",
      "/login?next=%2Fproperties%2Fwest-park",
    );
  });

  it("greets a signed-in buyer by first name, never by phone number, and can sign out", async () => {
    useSession.mockReturnValue({
      data: {
        user: {
          name: "Riya Shah",
          email: "x@y.z",
          phoneNumber: "+919825012345",
        },
      },
      isPending: false,
    });
    const user = userEvent.setup();
    const { container } = render(<HeaderAccount />);

    expect(screen.getByText("Hi, Riya")).toBeVisible();
    expect(container).not.toHaveTextContent(/9825012345|12345/);

    await user.click(screen.getByRole("button", { name: /sign out/i }));
    expect(signOut).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });

  it("still shows a signed-in state before a name has been given", () => {
    useSession.mockReturnValue({
      data: {
        user: {
          name: "Buyer",
          email: "919825012345@buyers.propcompare.invalid",
        },
      },
      isPending: false,
    });
    const { container } = render(<HeaderAccount />);
    expect(screen.getByText("Signed in")).toBeVisible();
    expect(container).not.toHaveTextContent(/Buyer|9825/);
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendOtp, verify, replace, refresh } = vi.hoisted(() => ({
  sendOtp: vi.fn(),
  verify: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { phoneNumber: { sendOtp, verify } },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

import { BuyerLoginForm } from "./buyer-login-form";

const enterPhone = async (
  user: ReturnType<typeof userEvent.setup>,
  value = "98250 12345",
) => {
  await user.type(screen.getByLabelText(/mobile number/i), value);
  await user.click(
    screen.getByRole("button", { name: /send verification code/i }),
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  sendOtp.mockResolvedValue({ data: {}, error: null });
  verify.mockResolvedValue({ data: {}, error: null });
});

describe("BuyerLoginForm", () => {
  it("sends the code to the normalised number and moves to the code step", async () => {
    const user = userEvent.setup();
    render(<BuyerLoginForm returnTo="/" />);
    await enterPhone(user);

    expect(sendOtp).toHaveBeenCalledWith({ phoneNumber: "+919825012345" });
    expect(await screen.findByLabelText(/verification code/i)).toBeVisible();
    expect(screen.getByText(/sent to \+919825012345/i)).toBeVisible();
  });

  it("rejects a number that is not an Indian mobile without calling the server", async () => {
    const user = userEvent.setup();
    render(<BuyerLoginForm returnTo="/" />);
    await enterPhone(user, "12345");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /valid 10-digit/i,
    );
    expect(sendOtp).not.toHaveBeenCalled();
  });

  it("stays on the phone step and says so when the code cannot be sent", async () => {
    sendOtp.mockResolvedValue({ data: null, error: { message: "nope" } });
    const user = userEvent.setup();
    render(<BuyerLoginForm returnTo="/" />);
    await enterPhone(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /couldn't send a code/i,
    );
    expect(
      screen.queryByLabelText(/verification code/i),
    ).not.toBeInTheDocument();
  });

  it("verifies the code and returns the buyer to where they were going", async () => {
    const user = userEvent.setup();
    render(<BuyerLoginForm returnTo="/properties/west-park" />);
    await enterPhone(user);
    await user.type(
      await screen.findByLabelText(/verification code/i),
      "123456",
    );
    await user.click(
      screen.getByRole("button", { name: /verify and continue/i }),
    );

    expect(verify).toHaveBeenCalledWith({
      phoneNumber: "+919825012345",
      code: "123456",
    });
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/properties/west-park"),
    );
  });

  it("allows a retry after a wrong code, keeping the destination", async () => {
    verify.mockResolvedValueOnce({ data: null, error: { message: "bad" } });
    const user = userEvent.setup();
    render(<BuyerLoginForm returnTo="/properties/west-park" />);
    await enterPhone(user);
    const code = await screen.findByLabelText(/verification code/i);
    await user.type(code, "111111");
    await user.click(
      screen.getByRole("button", { name: /verify and continue/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /isn't right, or it has expired/i,
    );
    expect(replace).not.toHaveBeenCalled();

    await user.clear(code);
    await user.type(code, "222222");
    await user.click(
      screen.getByRole("button", { name: /verify and continue/i }),
    );
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/properties/west-park"),
    );
  });

  it("does not call verify for an incomplete code", async () => {
    const user = userEvent.setup();
    render(<BuyerLoginForm returnTo="/" />);
    await enterPhone(user);
    await user.type(await screen.findByLabelText(/verification code/i), "12");
    await user.click(
      screen.getByRole("button", { name: /verify and continue/i }),
    );

    expect(await screen.findByRole("alert")).toBeVisible();
    expect(verify).not.toHaveBeenCalled();
  });

  it("can ask for a new code, and can go back to change the number", async () => {
    const user = userEvent.setup();
    render(<BuyerLoginForm returnTo="/" />);
    await enterPhone(user);
    await screen.findByLabelText(/verification code/i);

    await user.click(screen.getByRole("button", { name: /send a new code/i }));
    expect(sendOtp).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("status")).toHaveTextContent(/new code/i);

    await user.click(
      screen.getByRole("button", { name: /use a different number/i }),
    );
    expect(await screen.findByLabelText(/mobile number/i)).toBeVisible();
  });
});

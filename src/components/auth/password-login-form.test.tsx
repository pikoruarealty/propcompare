import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PasswordLoginForm } from "./password-login-form";

describe("PasswordLoginForm", () => {
  it("submits the email, password and destination to the action", async () => {
    const action = vi.fn().mockResolvedValue({ error: null, email: "" });
    const user = userEvent.setup();
    render(<PasswordLoginForm action={action} returnTo="/admin/queue" />);

    await user.type(screen.getByLabelText(/email/i), "a@b.co");
    await user.type(screen.getByLabelText(/password/i), "secret-pass-123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(action).toHaveBeenCalledTimes(1);
    const formData = action.mock.calls[0][1] as FormData;
    expect(formData.get("email")).toBe("a@b.co");
    expect(formData.get("password")).toBe("secret-pass-123");
    expect(formData.get("next")).toBe("/admin/queue");
  });

  it("announces a failed attempt and keeps the email that was typed", async () => {
    const action = vi.fn().mockResolvedValue({
      error: "That email and password don't match an account here.",
      email: "a@b.co",
    });
    const user = userEvent.setup();
    render(<PasswordLoginForm action={action} returnTo="/admin" />);

    await user.type(screen.getByLabelText(/email/i), "a@b.co");
    await user.type(screen.getByLabelText(/password/i), "wrong");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /don't match an account/i,
    );
    expect(screen.getByLabelText(/password/i)).toBeInvalid();
    expect(screen.getByLabelText(/email/i)).toHaveValue("a@b.co");
  });
});

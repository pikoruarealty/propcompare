import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReportProblemLink } from "./report-problem-link";

/**
 * A placeholder only (`DECISIONS.md` 2026-09-22): the dialog states plainly
 * that nothing is sent yet, and nothing here ever calls `fetch` or writes
 * anything — there is no table and no route behind it.
 */
describe("ReportProblemLink", () => {
  it("opens a dialog that says plainly nothing is sent yet", async () => {
    const user = userEvent.setup();
    render(<ReportProblemLink />);

    expect(
      screen.queryByRole("dialog", { name: "Report a problem" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Report a problem with this listing",
      }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Report a problem",
    });
    expect(dialog).toHaveTextContent(/does not send, save, or record/i);
  });

  it("closes on request", async () => {
    const user = userEvent.setup();
    render(<ReportProblemLink />);
    await user.click(
      screen.getByRole("button", {
        name: "Report a problem with this listing",
      }),
    );
    await screen.findByRole("dialog", { name: "Report a problem" });

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(
      screen.queryByRole("dialog", { name: "Report a problem" }),
    ).not.toBeInTheDocument();
  });

  it("never calls fetch", async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("must not call fetch");
    });
    vi.stubGlobal("fetch", fetchSpy);

    const user = userEvent.setup();
    render(<ReportProblemLink />);
    await user.click(
      screen.getByRole("button", {
        name: "Report a problem with this listing",
      }),
    );
    await screen.findByRole("dialog", { name: "Report a problem" });

    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { REPORT_PROBLEM_EMAIL } from "@/lib/buyer/report-contact";
import { ReportProblemLink } from "./report-problem-link";

/**
 * The dialog asks the reader to send a mail to a placeholder address
 * (`DECISIONS.md` 2026-09-24). It never calls `fetch` and writes nothing: there
 * is no table and no route behind it.
 */
async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", { name: "Report a problem with this listing" }),
  );
  return screen.findByRole("dialog", { name: "Report a problem" });
}

describe("ReportProblemLink", () => {
  it("opens a dialog that shows the placeholder address on a reserved domain", async () => {
    const user = userEvent.setup();
    render(<ReportProblemLink />);
    expect(
      screen.queryByRole("dialog", { name: "Report a problem" }),
    ).not.toBeInTheDocument();

    const dialog = await openDialog(user);

    expect(dialog).toHaveTextContent(REPORT_PROBLEM_EMAIL);
    expect(REPORT_PROBLEM_EMAIL).toMatch(/@[a-z.]*\.example$/);
    expect(dialog).toHaveTextContent(/placeholder/i);
  });

  it("offers a mailto that names the property and its page", async () => {
    const user = userEvent.setup();
    render(<ReportProblemLink propertyName="Anamika" />);

    await openDialog(user);

    const href = screen.getByRole("link", { name: "Write to us" });
    const mailto = new URL(href.getAttribute("href") ?? "");
    expect(mailto.protocol).toBe("mailto:");
    expect(mailto.pathname).toBe(REPORT_PROBLEM_EMAIL);
    expect(mailto.searchParams.get("subject")).toContain("Anamika");
    expect(mailto.searchParams.get("body")).toContain(window.location.href);
  });

  it("closes on request", async () => {
    const user = userEvent.setup();
    render(<ReportProblemLink />);
    await openDialog(user);

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
    render(<ReportProblemLink propertyName="Anamika" />);
    await openDialog(user);

    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

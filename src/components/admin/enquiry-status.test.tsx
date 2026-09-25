import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnquiryStatus } from "./enquiry-status";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockClear();
});

const renderStatus = (status: "new" | "contacted" | "forwarded" | "closed") =>
  render(
    <EnquiryStatus
      id="enq-1"
      status={status}
      developerName="Godrej Properties"
    />,
  );

const names = () =>
  screen.getAllByRole("button").map((button) => button.textContent);

describe("EnquiryStatus", () => {
  it("offers a new enquiry to the developer, as contacted, or closed, all the admin's choice", () => {
    renderStatus("new");
    expect(names()).toEqual([
      "Forward to Godrej Properties",
      "Mark contacted",
      "Close",
    ]);
  });

  it("lets a contacted enquiry still be forwarded or closed", () => {
    renderStatus("contacted");
    expect(names()).toEqual([
      "Forward to Godrej Properties",
      "Close",
      "Reopen as new",
    ]);
  });

  it("lets a forwarded enquiry be closed by the admin or taken back", () => {
    renderStatus("forwarded");
    expect(screen.getByText("Forwarded")).toBeInTheDocument();
    expect(names()).toEqual(["Close", "Take back as new"]);
  });

  it("reopens a closed enquiry and offers nothing else", () => {
    renderStatus("closed");
    expect(names()).toEqual(["Reopen"]);
  });

  it("sends the chosen status to the admin route, then refreshes", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    renderStatus("new");

    await userEvent.click(
      screen.getByRole("button", { name: "Forward to Godrej Properties" }),
    );

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/admin/enquiries/enq-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "forwarded" }),
    });
  });

  it("says so, and does not refresh, when the change fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 500 })),
    );
    renderStatus("new");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not change the status.",
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});

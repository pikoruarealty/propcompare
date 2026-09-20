import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { ExtractionStatus } from "./extraction-status";

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ExtractionStatus", () => {
  it("shows nothing while the attempt is still a draft", () => {
    const { container } = render(
      <ExtractionStatus ocrJobId="job" status="draft" failureMessage={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("refreshes itself while waiting or running, and stops when finished", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <ExtractionStatus
        ocrJobId="job"
        status="processing"
        failureMessage={null}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Claude is reading the confirmed pages",
    );
    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    expect(refresh).toHaveBeenCalledTimes(1);

    rerender(
      <ExtractionStatus
        ocrJobId="job"
        status="completed"
        failureMessage={null}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("links a finished run to its values, without any price", () => {
    render(
      <ExtractionStatus
        ocrJobId="job"
        status="completed"
        failureMessage={null}
        fieldsHref="/admin/submissions/s1"
      />,
    );
    expect(
      screen.getByRole("link", { name: "Review extracted values" }),
    ).toHaveAttribute("href", "/admin/submissions/s1");
    expect(document.body.textContent).not.toMatch(/\$|USD|cost|price/i);
  });

  it("asks before running a failed extraction again", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <ExtractionStatus
        ocrJobId="job"
        status="failed"
        failureMessage="The AI provider took too long to answer. You can try again."
      />,
    );
    expect(screen.getByText(/took too long/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Run again" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/ocr-jobs/job/retry",
      expect.objectContaining({ body: JSON.stringify({ mode: "requeue" }) }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("sends a failed run back to its page choices without a second confirmation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <ExtractionStatus ocrJobId="job" status="failed" failureMessage="x" />,
    );
    await user.click(screen.getByRole("button", { name: "Edit pages" }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/ocr-jobs/job/retry",
      expect.objectContaining({
        body: JSON.stringify({ mode: "edit_pages" }),
      }),
    );
  });
});

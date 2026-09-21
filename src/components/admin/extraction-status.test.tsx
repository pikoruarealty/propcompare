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

  it("shows a busy state in plain words while it reads", () => {
    render(
      <ExtractionStatus
        ocrJobId="job"
        status="processing"
        failureMessage={null}
      />,
    );
    const busy = screen.getByRole("status");
    expect(busy).toHaveTextContent("Reading the confirmed pages");
    expect(busy).not.toHaveTextContent(/claude|queue/i);
    // A spinner and a moving bar, not just a line of text.
    expect(busy.querySelector(".animate-spin")).not.toBeNull();
  });

  it("asks a small status endpoint, and refreshes the page only when the status changes", async () => {
    vi.useFakeTimers();
    let reported = "processing";
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "job", status: reported }), {
          status: 200,
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <ExtractionStatus
        ocrJobId="job"
        status="processing"
        failureMessage={null}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/ocr-jobs/job",
      expect.objectContaining({ cache: "no-store" }),
    );
    // Still running: nothing about the page is refreshed.
    expect(refresh).not.toHaveBeenCalled();

    reported = "completed";
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not check at all once the run is finished", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <ExtractionStatus
        ocrJobId="job"
        status="completed"
        failureMessage={null}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
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

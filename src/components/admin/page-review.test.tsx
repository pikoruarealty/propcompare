import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));
vi.mock("./pdf/brochure-viewer", () => ({
  BrochureViewer: ({
    renderMeta,
    renderLightboxFooter,
  }: {
    renderMeta?: (page: number) => React.ReactNode;
    renderLightboxFooter?: (page: number) => React.ReactNode;
  }) => (
    <div>
      {renderMeta?.(1)}
      {renderLightboxFooter?.(1)}
    </div>
  ),
}));

import { PageReview } from "./page-review";

const suggestion = [
  {
    page: 1,
    category: "project_details" as const,
    confidence: 0.9,
    imagery: [],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PageReview", () => {
  it("requires routing confirmation before offering the separate queue confirmation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    const { container } = render(
      <PageReview
        pdfUrl="/brochure.pdf"
        pageCount={1}
        ocrJobId="job-1"
        ocrJobStatus="draft"
        suggestions={suggestion}
        confirmedChoices={null}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /^queue extraction$/i }),
    ).toBeNull();
    expect(container).not.toHaveTextContent(/\$|₹|cost|price/i);

    await user.click(
      screen.getByRole("button", { name: /confirm page routing/i }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/ocr-jobs/job-1/routing-manifest",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          pages: [{ pageNumber: 1, category: "project_details" }],
        }),
      }),
    );

    await user.click(
      screen.getByRole("button", { name: /^queue extraction$/i }),
    );
    expect(screen.getByRole("dialog")).toHaveTextContent(
      /queue claude extraction/i,
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /^queue extraction$/i,
      }),
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/v1/admin/ocr-jobs/job-1/queue",
      { method: "POST" },
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("renders a queued route as inspectable but not mutable", () => {
    render(
      <PageReview
        pdfUrl="/brochure.pdf"
        pageCount={1}
        ocrJobId="job-1"
        ocrJobStatus="queued"
        suggestions={null}
        confirmedChoices={[{ pageNumber: 1, category: "project_details" }]}
      />,
    );

    expect(screen.getByText(/routing is locked/i)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /confirm page routing/i }),
    ).toBeNull();
    expect(screen.getByLabelText(/read as/i)).toBeDisabled();
  });
});

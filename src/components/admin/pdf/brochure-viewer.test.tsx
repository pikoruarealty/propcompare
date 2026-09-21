import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { openPdf } = vi.hoisted(() => ({
  openPdf: vi.fn(),
}));
vi.mock("./pdf-client", () => ({
  openPdf,
  fitPixelRatio: () => 1,
}));
vi.mock("./pdf-page-grid", () => ({ PdfPageGrid: () => <div>grid</div> }));
vi.mock("./pdf-lightbox", () => ({ PdfLightbox: () => null }));

import { BrochureViewer } from "./brochure-viewer";

const props = {
  pageCount: 3,
  selected: new Set<number>(),
  onToggle: () => {},
};

describe("BrochureViewer", () => {
  it("opens the brochure once, even when the page re-signs its link", async () => {
    openPdf.mockResolvedValue({ document: {}, destroy: vi.fn() });
    const { rerender } = render(
      <BrochureViewer {...props} pdfUrl="/files/b.pdf?e=1&s=aaa" />,
    );
    await waitFor(() => expect(openPdf).toHaveBeenCalledTimes(1));

    // A refresh of the page around it hands over a freshly signed link.
    rerender(<BrochureViewer {...props} pdfUrl="/files/b.pdf?e=2&s=bbb" />);
    rerender(<BrochureViewer {...props} pdfUrl="/files/b.pdf?e=3&s=ccc" />);

    expect(openPdf).toHaveBeenCalledTimes(1);
    expect(openPdf).toHaveBeenCalledWith("/files/b.pdf?e=1&s=aaa");
  });
});

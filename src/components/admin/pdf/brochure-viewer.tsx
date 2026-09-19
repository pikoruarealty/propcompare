"use client";

import * as React from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { openPdf, type OpenedPdf } from "./pdf-client";
import { PdfLightbox } from "./pdf-lightbox";
import { PdfPageGrid } from "./pdf-page-grid";

export interface BrochureViewerProps {
  /** A (signed) URL the browser can fetch the PDF from. */
  pdfUrl: string;
  pageCount: number;
  selected: ReadonlySet<number>;
  onToggle: (page: number) => void;
  /** Keeps the PDF inspectable after routing is frozen, without mutable controls. */
  selectionDisabled?: boolean;
  renderMeta?: (page: number) => React.ReactNode;
  /** Per-page controls inside the large viewer. */
  renderLightboxFooter?: (page: number) => React.ReactNode;
}

/**
 * Loads a brochure with pdf.js and shows the thumbnail grid plus the large
 * viewer. If the PDF cannot be opened — a network error, or a browser that
 * cannot run the renderer — it says so plainly and offers the file for download
 * instead of leaving an empty screen.
 */
export function BrochureViewer({
  pdfUrl,
  pageCount,
  selected,
  onToggle,
  selectionDisabled = false,
  renderMeta,
  renderLightboxFooter,
}: BrochureViewerProps) {
  const [pdf, setPdf] = React.useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [openPage, setOpenPage] = React.useState<number | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    let loaded: OpenedPdf | null = null;
    openPdf(pdfUrl)
      .then((opened) => {
        if (cancelled) {
          void opened.destroy();
          return;
        }
        loaded = opened;
        setPdf(opened.document);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      void loaded?.destroy();
    };
  }, [pdfUrl]);

  if (failed) {
    return (
      <div
        role="alert"
        className="border-border bg-card rounded-lg border p-8 text-center"
      >
        <p className="font-display text-2xl">
          The brochure could not be displayed
        </p>
        <p className="text-muted-foreground mx-auto mt-2 max-w-prose text-sm">
          Your browser could not open this PDF here. You can download it and
          check the pages yourself, then come back to confirm them.
        </p>
        <a
          href={pdfUrl}
          download
          className="text-primary mt-4 inline-block text-sm underline underline-offset-4"
        >
          Download the brochure
        </a>
      </div>
    );
  }

  if (!pdf) {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        Opening the brochure…
      </p>
    );
  }

  return (
    <>
      <PdfPageGrid
        document={pdf}
        pageCount={pageCount}
        selected={selected}
        onToggle={onToggle}
        selectionDisabled={selectionDisabled}
        onOpen={setOpenPage}
        renderMeta={renderMeta}
      />
      <PdfLightbox
        document={pdf}
        pageCount={pageCount}
        page={openPage}
        onPageChange={setOpenPage}
        onClose={() => setOpenPage(null)}
        footer={renderLightboxFooter}
      />
    </>
  );
}

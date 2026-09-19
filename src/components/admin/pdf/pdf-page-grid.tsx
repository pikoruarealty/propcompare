"use client";

import * as React from "react";
import { Expand } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { cn } from "@/lib/utils";
import { PdfPageCanvas } from "./pdf-page-canvas";

const THUMB_WIDTH = 176;

/** Mounts children only once the element has scrolled near the viewport. */
function LazyMount({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  // Without IntersectionObserver (very old browsers) render everything at once.
  const [visible, setVisible] = React.useState(
    () => typeof IntersectionObserver === "undefined",
  );

  React.useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ minHeight: Math.round(THUMB_WIDTH * 1.4) }}>
      {visible ? children : null}
    </div>
  );
}

/**
 * Every page of a brochure as a thumbnail, rendered lazily as it scrolls into
 * view so a 100-page brochure does not paint 100 canvases at once. Each card
 * has an independent selection checkbox and a button that opens the page large;
 * `renderMeta` lets the caller add per-page information beneath the thumbnail.
 * Selection is controlled by the parent.
 */
export function PdfPageGrid({
  document: pdf,
  pageCount,
  selected,
  onToggle,
  selectionDisabled = false,
  onOpen,
  renderMeta,
}: {
  document: PDFDocumentProxy;
  pageCount: number;
  selected: ReadonlySet<number>;
  onToggle: (page: number) => void;
  selectionDisabled?: boolean;
  onOpen: (page: number) => void;
  renderMeta?: (page: number) => React.ReactNode;
}) {
  return (
    <ul
      className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-4"
      aria-label="Brochure pages"
    >
      {Array.from({ length: pageCount }, (_, index) => index + 1).map(
        (page) => {
          const isSelected = selected.has(page);
          return (
            <li
              key={page}
              className={cn(
                "border-border bg-card flex flex-col gap-3 rounded-lg border p-3 transition-colors",
                isSelected && "border-primary ring-primary/30 ring-2",
              )}
            >
              <div className="relative mx-auto">
                <button
                  type="button"
                  onClick={() => onOpen(page)}
                  aria-label={`View page ${page} larger`}
                  className="group border-border focus-visible:ring-ring block cursor-zoom-in overflow-hidden rounded-md border focus-visible:ring-2 focus-visible:outline-none"
                >
                  <LazyMount>
                    <PdfPageCanvas
                      document={pdf}
                      pageNumber={page}
                      width={THUMB_WIDTH}
                    />
                  </LazyMount>
                  <span className="bg-card/90 text-foreground absolute right-2 bottom-2 rounded-md p-1 opacity-0 transition-opacity group-focus-visible:opacity-100 group-hover:opacity-100">
                    <Expand className="size-4" aria-hidden="true" />
                  </span>
                </button>
              </div>

              <label className="flex items-center gap-2 text-sm has-disabled:cursor-default">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggle(page)}
                  disabled={selectionDisabled}
                  className="size-4 accent-[var(--color-terracotta)]"
                />
                <span className="data-tabular">Page {page}</span>
              </label>
              {renderMeta ? renderMeta(page) : null}
            </li>
          );
        },
      )}
    </ul>
  );
}

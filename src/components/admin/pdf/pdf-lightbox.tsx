"use client";

import * as React from "react";
import { Dialog } from "radix-ui";
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minus,
  Plus,
  X,
} from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { PdfPageCanvas } from "./pdf-page-canvas";

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const;
const DEFAULT_ZOOM_INDEX = 2;

/**
 * A large, zoomable view of one brochure page, opened from the thumbnail grid.
 * Zoom in/out/fit, previous/next page, and keyboard shortcuts (+ - 0, arrows,
 * Esc) so a page can be read closely enough to decide what it is.
 *
 * Zoom scales the canvas's CSS width and re-renders the page at that size, so
 * text stays sharp instead of being a stretched bitmap. The scroll container
 * pans a page larger than the window; that is plain scrolling, so it behaves
 * the same in every browser.
 */
export function PdfLightbox({
  document: pdf,
  pageCount,
  page,
  onPageChange,
  onClose,
  footer,
}: {
  document: PDFDocumentProxy;
  pageCount: number;
  /** The open page, or null when closed. */
  page: number | null;
  onPageChange: (page: number) => void;
  onClose: () => void;
  /** Optional per-page controls, such as "Include this page". */
  footer?: (page: number) => React.ReactNode;
}) {
  const [zoomIndex, setZoomIndex] = React.useState(DEFAULT_ZOOM_INDEX);
  const [available, setAvailable] = React.useState(800);
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const isOpen = page !== null;

  // The viewport only exists while the dialog is open, so measure it through a
  // callback ref and keep observing until it goes away.
  const observerRef = React.useRef<ResizeObserver | null>(null);
  const setViewport = React.useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    viewportRef.current = node;
    if (!node) return;
    const measure = () => setAvailable(Math.max(240, node.clientWidth - 48));
    measure();
    observerRef.current = new ResizeObserver(measure);
    observerRef.current.observe(node);
  }, []);

  const zoom = ZOOM_STEPS[zoomIndex];
  const zoomIn = () =>
    setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1));
  const zoomOut = () => setZoomIndex((i) => Math.max(0, i - 1));
  const go = (delta: number) => {
    if (page === null) return;
    const next = page + delta;
    if (next >= 1 && next <= pageCount) onPageChange(next);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "+" || event.key === "=") zoomIn();
    else if (event.key === "-") zoomOut();
    else if (event.key === "0") setZoomIndex(DEFAULT_ZOOM_INDEX);
    else if (event.key === "ArrowRight") go(1);
    else if (event.key === "ArrowLeft") go(-1);
    else return;
    event.preventDefault();
  };

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          // Every close path (Esc, X, overlay) comes through here, so the next
          // page opens at fit-to-width rather than the last zoom.
          setZoomIndex(DEFAULT_ZOOM_INDEX);
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[color-mix(in_oklab,var(--color-ink)_55%,transparent)]" />
        <Dialog.Content
          onKeyDown={onKeyDown}
          aria-describedby={undefined}
          className="bg-background fixed inset-3 z-50 flex flex-col overflow-hidden rounded-lg border shadow-[0_4px_20px_color-mix(in_oklab,var(--color-ink)_12%,transparent)] md:inset-8"
        >
          <header className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <Dialog.Title className="font-display text-xl">
              Page {page}{" "}
              <span className="text-muted-foreground">of {pageCount}</span>
            </Dialog.Title>

            <div
              className="flex items-center gap-1"
              role="toolbar"
              aria-label="Viewer controls"
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Previous page"
                disabled={page === 1}
                onClick={() => go(-1)}
              >
                <ChevronLeft />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Next page"
                disabled={page === pageCount}
                onClick={() => go(1)}
              >
                <ChevronRight />
              </Button>
              <span className="bg-border mx-2 h-5 w-px" aria-hidden="true" />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Zoom out"
                disabled={zoomIndex === 0}
                onClick={zoomOut}
              >
                <Minus />
              </Button>
              <span
                className="data-tabular w-14 text-center text-sm"
                aria-live="polite"
              >
                {Math.round(zoom * 100)}%
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Zoom in"
                disabled={zoomIndex === ZOOM_STEPS.length - 1}
                onClick={zoomIn}
              >
                <Plus />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Fit to width"
                onClick={() => setZoomIndex(DEFAULT_ZOOM_INDEX)}
              >
                <Maximize2 />
              </Button>
              <span className="bg-border mx-2 h-5 w-px" aria-hidden="true" />
              <Dialog.Close asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Close viewer"
                >
                  <X />
                </Button>
              </Dialog.Close>
            </div>
          </header>

          <div
            ref={setViewport}
            className="bg-muted/60 flex-1 overflow-auto p-6"
          >
            {page !== null ? (
              <div className="mx-auto w-fit shadow-[0_2px_12px_color-mix(in_oklab,var(--color-ink)_10%,transparent)]">
                <PdfPageCanvas
                  document={pdf}
                  pageNumber={page}
                  width={Math.round(available * zoom)}
                />
              </div>
            ) : null}
          </div>

          {page !== null && footer ? (
            <footer className="border-border flex items-center justify-between gap-4 border-t px-4 py-3">
              {footer(page)}
            </footer>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

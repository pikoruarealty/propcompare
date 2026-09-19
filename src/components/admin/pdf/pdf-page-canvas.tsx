"use client";

import * as React from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { fitPixelRatio } from "./pdf-client";

/**
 * Draws one PDF page to a visible canvas at a given CSS width.
 *
 * The page is only ever *displayed*: nothing here reads pixels back
 * (`toDataURL`, `toBlob`, `getImageData`). That is a browser-compatibility
 * requirement, not a style choice — Brave Shields deliberately perturbs canvas
 * readback to stop fingerprinting, and displaying a canvas is unaffected while
 * reading it is not.
 *
 * A render in flight is cancelled when the width or page changes, so quick zoom
 * changes never paint a stale size over a fresh one.
 */
export function PdfPageCanvas({
  document: pdf,
  pageNumber,
  width,
  className,
  onSize,
}: {
  document: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  className?: string;
  /** Reports the rendered CSS size so a parent can reserve space. */
  onSize?: (size: { width: number; height: number }) => void;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  // Keyed by what was rendered, so a size or page change reads as "loading"
  // again without resetting state inside the effect.
  const key = `${pageNumber}:${Math.round(width)}`;
  const [result, setResult] = React.useState<{
    key: string;
    state: "ready" | "error";
  } | null>(null);
  const status = result?.key === key ? result.state : "loading";
  const [height, setHeight] = React.useState<number | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    let task: RenderTask | null = null;
    (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const cssWidth = Math.max(1, Math.round(width));
        const cssHeight = Math.round((base.height / base.width) * cssWidth);
        const ratio = fitPixelRatio(
          cssWidth,
          cssHeight,
          window.devicePixelRatio || 1,
        );
        const viewport = page.getViewport({
          scale: (cssWidth / base.width) * ratio,
        });

        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;
        setHeight(cssHeight);
        onSize?.({ width: cssWidth, height: cssHeight });

        task = page.render({ canvas, viewport });
        await task.promise;
        if (!cancelled) setResult({ key, state: "ready" });
      } catch (error) {
        // A cancelled render rejects by design; only a real failure is shown.
        if (
          !cancelled &&
          (error as { name?: string }).name !== "RenderingCancelledException"
        ) {
          setResult({ key, state: "error" });
        }
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, pageNumber, width, onSize, key]);

  return (
    <div
      className="bg-muted relative"
      style={{ width, minHeight: height ?? Math.round(width * 1.4) }}
    >
      <canvas
        ref={canvasRef}
        className={className}
        aria-label={`Brochure page ${pageNumber}`}
        role="img"
      />
      {status === "error" ? (
        <p className="text-muted-foreground absolute inset-0 flex items-center justify-center p-4 text-center text-sm">
          This page could not be shown.
        </p>
      ) : null}
    </div>
  );
}

"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";

export interface OpenedPdf {
  document: PDFDocumentProxy;
  /** Releases the worker-side document. Call when the viewer goes away. */
  destroy: () => Promise<void>;
}

/**
 * pdf.js, loaded in the browser only and only when a brochure is opened.
 *
 * Two choices are deliberate and documented in DECISIONS.md (2026-09-19):
 *  - the `legacy` build, which runs on older Safari/Firefox engines the modern
 *    build does not, and
 *  - the worker is resolved by the bundler from the installed package
 *    (`new URL(..., import.meta.url)`), never fetched from a CDN, so the viewer
 *    works offline, behind a strict CSP, and is version-locked to the library.
 */
let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

const loadPdfjs = () => {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    return pdfjs;
  });
  return pdfjsPromise;
};

export const openPdf = async (url: string): Promise<OpenedPdf> => {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ url });
  const document = await task.promise;
  return { document, destroy: () => task.destroy() };
};

/**
 * Canvas budget. Browsers cap canvas size (Safari notably at ~16.7M pixels), and
 * a zoomed-in page can ask for far more. The pixel ratio is lowered until the
 * canvas fits, trading sharpness for a page that still renders.
 */
const MAX_CANVAS_PIXELS = 16_000_000;
const MAX_CANVAS_SIDE = 8_192;

export const fitPixelRatio = (
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
): number => {
  let ratio = Math.max(1, devicePixelRatio);
  while (
    ratio > 1 &&
    (cssWidth * ratio * cssHeight * ratio > MAX_CANVAS_PIXELS ||
      Math.max(cssWidth, cssHeight) * ratio > MAX_CANVAS_SIDE)
  ) {
    ratio -= 0.25;
  }
  return Math.max(1, ratio);
};

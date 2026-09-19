import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

/**
 * Renders one brochure page to an image, on the server.
 *
 * Why the server and not the browser: a browser canvas cannot be read back
 * reliably (Brave deliberately perturbs canvas readback), and the image has to be
 * stored, not just shown. Here pdf.js draws the page onto a Node canvas
 * (`@napi-rs/canvas`) and `sharp` encodes it as WebP. The whole page is the
 * image — right for floor plans and for the many brochures whose photos fill a
 * page; pulling individual pictures out of a busy page is a separate, later step
 * (DECISIONS.md 2026-09-20).
 */

export const DEFAULT_IMAGE_WIDTH = 1600;
const WEBP_QUALITY = 82;

export class PageImageError extends Error {
  constructor(
    public readonly code: "page_out_of_range" | "render_failed",
    message: string,
  ) {
    super(message);
    this.name = "PageImageError";
  }
}

export interface RenderedPage {
  bytes: Buffer;
  width: number;
  height: number;
  contentType: "image/webp";
}

interface NodeCanvasFactory {
  create(
    width: number,
    height: number,
  ): { canvas: { toBuffer(mime: "image/png"): Buffer }; context: unknown };
}

const pdfjsRoot = () => {
  const require = createRequire(import.meta.url);
  // .../pdfjs-dist/legacy/build/pdf.mjs -> .../pdfjs-dist
  return path.resolve(
    path.dirname(require.resolve("pdfjs-dist/legacy/build/pdf.mjs")),
    "..",
    "..",
  );
};

export const renderBrochurePage = async (
  pdfBytes: Uint8Array,
  pageNumber: number,
  options: { width?: number } = {},
): Promise<RenderedPage> => {
  const targetWidth = options.width ?? DEFAULT_IMAGE_WIDTH;
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const root = pdfjsRoot();

  const task = pdfjs.getDocument({
    // pdf.js takes ownership of (and detaches) the buffer it is given.
    data: new Uint8Array(pdfBytes),
    // Fonts and character maps for pages that do not embed their own.
    standardFontDataUrl: pathToFileURL(
      path.join(root, "standard_fonts") + path.sep,
    ).href,
    cMapUrl: pathToFileURL(path.join(root, "cmaps") + path.sep).href,
    cMapPacked: true,
  });

  try {
    const document = await task.promise;
    if (
      !Number.isInteger(pageNumber) ||
      pageNumber < 1 ||
      pageNumber > document.numPages
    ) {
      throw new PageImageError(
        "page_out_of_range",
        `Page ${pageNumber} is not in this brochure (${document.numPages} pages).`,
      );
    }
    const page = await document.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: targetWidth / base.width });
    // Rounded, not ceiled: a page whose scale is not exact would otherwise come
    // out a pixel wider than asked for.
    const width = Math.round(viewport.width);
    const height = Math.round(viewport.height);
    // pdf.js builds its own Node canvas (from @napi-rs/canvas) but types the
    // factory loosely; this is the shape it actually has.
    const factory = document.canvasFactory as unknown as NodeCanvasFactory;
    const { canvas, context } = factory.create(width, height);
    await page.render({
      canvasContext: context as never,
      canvas: canvas as never,
      viewport,
    }).promise;
    const png = canvas.toBuffer("image/png");
    const bytes = await sharp(png).webp({ quality: WEBP_QUALITY }).toBuffer();
    return {
      bytes,
      width: width,
      height: height,
      contentType: "image/webp",
    };
  } catch (error) {
    if (error instanceof PageImageError) throw error;
    throw new PageImageError(
      "render_failed",
      `The page could not be rendered: ${(error as Error).message}`,
    );
  } finally {
    await task.destroy();
  }
};

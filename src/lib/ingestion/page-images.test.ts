import { randomBytes } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  PageImageError,
  lightenBrochure,
  renderBrochurePage,
} from "./page-images";

const makePdf = async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const wide = pdf.addPage([842, 595]); // landscape, like a floor-plan spread
  wide.drawText("Wide page", {
    x: 40,
    y: 500,
    size: 40,
    font,
    color: rgb(0.55, 0.29, 0.2),
  });
  wide.drawRectangle({
    x: 40,
    y: 60,
    width: 760,
    height: 400,
    color: rgb(0.2, 0.4, 0.8),
  });
  const tall = pdf.addPage([595, 842]);
  tall.drawText("Tall page", { x: 40, y: 760, size: 40, font });
  return pdf.save();
};

describe("renderBrochurePage", () => {
  it("renders a page as a WebP scaled to the requested width, keeping its proportions", async () => {
    const result = await renderBrochurePage(await makePdf(), 1, { width: 800 });
    expect(result.contentType).toBe("image/webp");
    expect(result.width).toBe(800);
    expect(result.height).toBe(Math.round((595 / 842) * 800));

    const meta = await sharp(result.bytes).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(result.width);
    expect(meta.height).toBe(result.height);
  });

  it("actually draws the page, not a blank canvas", async () => {
    const { bytes } = await renderBrochurePage(await makePdf(), 1, {
      width: 400,
    });
    // Read pixels back on the server (fine here; only browsers scramble canvas
    // readback). The blue block must be present in the middle of the page.
    const { data, info } = await sharp(bytes)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const centre =
      (Math.floor(info.height * 0.6) * info.width +
        Math.floor(info.width / 2)) *
      info.channels;
    const [r, b] = [data[centre], data[centre + 2]];
    expect(b).toBeGreaterThan(r + 60);
    expect(b).toBeGreaterThan(150);
  });

  it("does not mind being given the same bytes twice", async () => {
    const bytes = await makePdf();
    await renderBrochurePage(bytes, 1, { width: 200 });
    // The input must not have been detached by the first render.
    expect(bytes.byteLength).toBeGreaterThan(0);
    await expect(
      renderBrochurePage(bytes, 2, { width: 200 }),
    ).resolves.toMatchObject({ width: 200 });
  });

  it.each([0, 3, -1, 1.5])(
    "refuses page %s of a two-page brochure",
    async (page) => {
      await expect(
        renderBrochurePage(await makePdf(), page),
      ).rejects.toMatchObject({
        code: "page_out_of_range",
      });
    },
  );

  it("reports a file that is not a PDF as a render failure, not a crash", async () => {
    await expect(
      renderBrochurePage(new TextEncoder().encode("not a pdf"), 1),
    ).rejects.toBeInstanceOf(PageImageError);
  });
});

describe("lightenBrochure", () => {
  /** A page carrying a big, incompressible picture, like a designed brochure's. */
  const makeHeavyPdf = async () => {
    const width = 2400;
    const height = 1600;
    // Random bytes: a repeating pattern would compress to almost nothing.
    const noise = randomBytes(width * height * 3);
    const png = await sharp(noise, {
      raw: { width, height, channels: 3 },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();
    const pdf = await PDFDocument.create();
    const image = await pdf.embedPng(png);
    for (const size of [
      [842, 595],
      [595, 842],
    ] as const) {
      const page = pdf.addPage([size[0], size[1]]);
      page.drawImage(image, { x: 0, y: 0, width: size[0], height: size[1] });
    }
    return pdf.save();
  };

  it("keeps the same pages in the same order at a fraction of the size", async () => {
    const heavy = await makeHeavyPdf();
    const light = await lightenBrochure(heavy);

    const source = await PDFDocument.load(heavy);
    const lightened = await PDFDocument.load(light);
    expect(lightened.getPageCount()).toBe(source.getPageCount());
    // Landscape stays landscape and tall stays tall: page N is still page N.
    const [first, second] = lightened.getPages().map((p) => p.getSize());
    expect(first.width).toBeGreaterThan(first.height);
    expect(second.height).toBeGreaterThan(second.width);
    expect(light.byteLength).toBeLessThan(heavy.byteLength / 2);
  }, 60_000);

  it("draws each page no larger than the requested longest side", async () => {
    const light = await lightenBrochure(await makePdf(), { longestSide: 800 });
    const sizes = (await PDFDocument.load(light))
      .getPages()
      .map((p) => p.getSize());
    for (const size of sizes) {
      expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(800);
    }
  });
});

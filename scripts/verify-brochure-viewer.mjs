/**
 * Manual cross-browser check for the admin brochure flow: sign in, upload a
 * generated PDF, and exercise the thumbnail grid and the zoomable viewer in each
 * installed Chromium-based browser (Chrome, Brave, Edge). It drives the real app
 * on http://localhost:3000, so start `bun run dev` first, with
 * STORAGE_DRIVER=local and a local admin (`bun run db:first-admin`).
 *
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/verify-brochure-viewer.mjs [outDir]
 *
 * Run it with Node, not Bun: Playwright drives the browser over stdio pipes that
 * Bun cannot open on Windows (the launch just hangs).
 *
 * Firefox and Safari are not covered here — they need a manual check
 * (docs/production-readiness.md). This deliberately never reads canvas pixels
 * itself: Brave perturbs canvas readback, and what matters is that the page is
 * *displayed*, which the screenshots show.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.ADMIN_EMAIL ?? "admin@propcompare.test";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "Local-admin-pass-1";
const outDir = path.resolve(process.argv[2] ?? ".local/verify");
mkdirSync(outDir, { recursive: true });

const BROWSERS = {
  chrome: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  brave: "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
  edge: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
};

const makePdf = async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const titles = [
    "Project overview",
    "Amenities",
    "Specifications",
    "2 BHK - Type A",
    "2 BHK - Type B",
    "Location map",
  ];
  titles.forEach((title, i) => {
    const page = pdf.addPage([595, 842]);
    page.drawText(title, {
      x: 50,
      y: 760,
      size: 32,
      font,
      color: rgb(0.55, 0.29, 0.2),
    });
    page.drawText(`Synthetic page ${i + 1} of ${titles.length}`, {
      x: 50,
      y: 720,
      size: 14,
      font,
    });
    page.drawRectangle({
      x: 50,
      y: 200,
      width: 495,
      height: 480,
      borderColor: rgb(0.3, 0.3, 0.3),
      borderWidth: 2,
    });
  });
  return Buffer.from(await pdf.save());
};

const results = [];
const check = (browser, name, ok, detail = "") => {
  results.push({ browser, name, ok });
  console.log(
    `${ok ? "PASS" : "FAIL"} [${browser}] ${name}${detail ? ` — ${detail}` : ""}`,
  );
};

const pdfBytes = await makePdf();

for (const [name, executablePath] of Object.entries(BROWSERS)) {
  let browser;
  try {
    browser = await chromium.launch({ executablePath, headless: true });
  } catch (error) {
    console.log(
      `SKIP [${name}] could not launch: ${error.message.split("\n")[0]}`,
    );
    continue;
  }
  const context = await browser.newContext({
    viewport: { width: 1360, height: 900 },
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  try {
    await page.goto(`${BASE}/admin/login`);
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/admin/submissions");
    check(name, "admin sign-in", true);

    const developerName = `Verify Developer ${name} ${Date.now()}`;
    await page.goto(`${BASE}/admin/developers/new`);
    await page.getByLabel("Developer name").fill(developerName);
    await page.getByRole("button", { name: "Create profile" }).click();
    await page.waitForURL(/\/admin\/developers\/[0-9a-f-]{36}$/);
    check(name, "create developer profile", true);

    await page.goto(`${BASE}/admin/submissions/new`);
    await page.getByLabel("Developer").selectOption({ label: developerName });
    await page.getByLabel("Brochure (PDF)").setInputFiles({
      name: "verify-brochure.pdf",
      mimeType: "application/pdf",
      buffer: pdfBytes,
    });
    await page.getByRole("button", { name: "Upload brochure" }).click();
    await page.waitForURL(/\/admin\/submissions\/[0-9a-f-]{36}\/pages$/, {
      timeout: 30000,
    });
    check(name, "brochure upload lands on page review", true);

    await page
      .getByRole("list", { name: "Brochure pages" })
      .waitFor({ timeout: 30000 });
    await page.waitForFunction(
      () =>
        document.querySelectorAll("canvas").length >= 6 &&
        [...document.querySelectorAll("canvas")].every((c) => c.width > 0),
      null,
      { timeout: 30000 },
    );
    const failedThumbs = await page
      .getByText("This page could not be shown.")
      .count();
    check(
      name,
      "all 6 thumbnails render",
      failedThumbs === 0,
      `${failedThumbs} failed`,
    );
    await page.screenshot({ path: path.join(outDir, `${name}-1-grid.png`) });

    await page.getByRole("checkbox", { name: "Page 2" }).check();
    await page.getByRole("checkbox", { name: "Page 4" }).check();
    check(
      name,
      "select pages",
      (await page.getByText(/of\s*6\s*pages selected/).innerText()).includes(
        "2",
      ),
    );
    await page.getByRole("checkbox", { name: "Page 2" }).uncheck();
    check(
      name,
      "deselect a page",
      (await page.getByText(/of\s*6\s*pages selected/).innerText()).startsWith(
        "1",
      ),
    );

    await page.getByRole("button", { name: "View page 3 larger" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.getByText("Page 3").first().waitFor();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(outDir, `${name}-2-viewer.png`) });
    check(name, "large viewer opens", true);

    const zoomLabel = dialog.getByText(/^\d+%$/);
    check(name, "starts at 100%", (await zoomLabel.innerText()) === "100%");
    await dialog.getByRole("button", { name: "Zoom in" }).click();
    await dialog.getByRole("button", { name: "Zoom in" }).click();
    check(name, "zoom in button", (await zoomLabel.innerText()) === "150%");
    await page.keyboard.press("-");
    check(
      name,
      "zoom out by keyboard",
      (await zoomLabel.innerText()) === "125%",
    );
    await page.keyboard.press("+");
    await page.keyboard.press("+");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(outDir, `${name}-3-zoomed.png`) });
    check(
      name,
      "zoomed page still renders",
      (await dialog.getByText("This page could not be shown.").count()) === 0,
    );
    await dialog.getByRole("button", { name: "Fit to width" }).click();
    check(
      name,
      "fit to width resets zoom",
      (await zoomLabel.innerText()) === "100%",
    );

    await dialog.getByRole("button", { name: "Next page" }).click();
    check(name, "next page", (await dialog.getByText("Page 4").count()) > 0);
    await page.keyboard.press("ArrowLeft");
    check(
      name,
      "previous page by keyboard",
      (await dialog.getByText("Page 3").count()) > 0,
    );

    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    check(name, "Esc closes the viewer", true);
    check(
      name,
      "no uncaught page errors",
      consoleErrors.length === 0,
      consoleErrors.join(" | "),
    );
  } catch (error) {
    check(name, "flow completed", false, error.message.split("\n")[0]);
    await page
      .screenshot({ path: path.join(outDir, `${name}-failure.png`) })
      .catch(() => {});
  } finally {
    await browser.close();
  }
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${outDir}`,
);
process.exit(failed.length ? 1 : 0);

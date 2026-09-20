/**
 * Checks the buyer property page's picture gallery in a real browser: photos and
 * floor plans in separate expandable sections, small cards, and a pop-up carousel
 * that opens on the chosen picture, moves with the keyboard and closes.
 *
 *   [PROPERTY_PATH=/properties/<slug>] node scripts/verify-dossier-gallery.mjs [outDir]
 *
 * Without PROPERTY_PATH it opens the first property in the browse list. Needs
 * `bun run dev` running (start it with OCR_WORKER_ENABLED=false) and a published
 * property with pictures. Read only. Run with Node, not Bun.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const outDir = path.resolve(process.argv[2] ?? ".local/verify");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const page = await (
  await browser.newContext({ viewport: { width: 1360, height: 1000 } })
).newPage();
page.setDefaultTimeout(60_000);

let passed = 0;
let failed = 0;
const check = (ok, label, detail = "") => {
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`,
  );
  if (ok) passed += 1;
  else failed += 1;
};

try {
  let target = process.env.PROPERTY_PATH;
  if (!target) {
    await page.goto(`${BASE}/properties`);
    target = await page
      .locator('a[href^="/properties/"]')
      .first()
      .getAttribute("href");
  }
  await page.goto(`${BASE}${target}`);
  const gallery = page.locator('[data-slot="media-gallery"]');
  await gallery.waitFor();
  await gallery.scrollIntoViewIfNeeded();

  const photos = page.locator('[data-section="photos"]');
  const plans = page.locator('[data-section="floor-plans"]');
  check((await photos.count()) === 1, "a Photos section exists");
  check((await plans.count()) === 1, "a Floor plans section exists");
  check((await photos.evaluate((el) => el.open)) === true, "photos start open");
  check(
    (await plans.evaluate((el) => el.open)) === false,
    "floor plans start collapsed",
  );
  const photoCount = await photos.locator("li").count();
  console.log(`      photos: ${photoCount}`);

  // Small cards: no card image is wider than a fraction of the page.
  await photos.locator("li img").first().waitFor();
  const widths = await photos
    .locator("li button")
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
  check(
    widths.every((w) => w > 60 && w < 300),
    "photo cards are small",
    widths.map(Math.round).join(", "),
  );
  await gallery.screenshot({
    path: path.join(outDir, "gallery-1-collapsed.png"),
  });

  // Expand the floor plans, grouped by unit type.
  await plans.locator("summary").click();
  await plans.locator("li img").first().waitFor();
  const headings = await plans.locator("h3").allTextContents();
  const planCount = await plans.locator("li").count();
  console.log(
    `      floor plans: ${planCount} under [${headings.join(" | ")}]`,
  );
  check(planCount > 0, "floor plans are listed once expanded");
  // Thumbnails load lazily as they scroll into view; every one must arrive.
  const cards = plans.locator("li img");
  for (let index = 0; index < planCount; index += 1) {
    await cards.nth(index).scrollIntoViewIfNeeded();
  }
  await page.waitForFunction(
    () =>
      [
        ...document.querySelectorAll('[data-section="floor-plans"] li img'),
      ].every((img) => img.complete && img.naturalWidth > 0),
    undefined,
    { timeout: 60_000 },
  );
  check(true, "every floor-plan thumbnail loads");
  await gallery.screenshot({ path: path.join(outDir, "gallery-2-plans.png") });

  // Pop-up carousel over the floor plans.
  await plans.locator("li button").first().click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  check(true, "choosing a card opens the pop-up");
  const position = () =>
    dialog.locator('[data-slot="lightbox-position"]').innerText();
  check(
    (await position()).startsWith("1 of"),
    "it opens on the chosen picture",
    await position(),
  );
  await page.waitForFunction(() => {
    const img = document.querySelector('[data-slot="media-lightbox"] img');
    return img && img.complete && img.naturalWidth > 0;
  });
  check(true, "the full picture loads");
  await page.screenshot({ path: path.join(outDir, "gallery-3-lightbox.png") });

  await page.keyboard.press("ArrowRight");
  check(
    (await position()).startsWith("2 of"),
    "ArrowRight moves on",
    await position(),
  );
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  check(
    (await position()).startsWith(`${planCount} of`),
    "ArrowLeft wraps to the last plan",
    await position(),
  );
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  check(true, "Escape closes the pop-up");

  // A photo opens a carousel of photos, not plans.
  await photos.locator("li button").first().click();
  await dialog.waitFor();
  check(
    (await position()).endsWith(`of ${photoCount}`),
    "a photo's carousel holds the photos only",
    await position(),
  );
  await page.keyboard.press("Escape");
} catch (error) {
  failed += 1;
  console.log(`FAIL  ${error instanceof Error ? error.message : error}`);
  await page
    .screenshot({ path: path.join(outDir, "gallery-failure.png") })
    .catch(() => {});
} finally {
  await browser.close();
}

console.log(`\n${passed} passed, ${failed} failed. Screenshots in ${outDir}`);
process.exit(failed === 0 ? 0 : 1);

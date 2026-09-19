/**
 * Manual check of "use this brochure page as an image", in real browsers: upload a
 * real brochure, open the page grid, add page 8 (a floor plan) as an image, see it
 * appear on the submission with a working preview, its credit, and a second add of
 * the same page treated as already done. No paid provider call is made.
 *
 *   node scripts/verify-page-image.mjs [outDir]
 *
 * Needs `bun run dev` running (STORAGE_DRIVER=local), a local admin, and
 * brochures/The Kimana Towers Brochure.pdf. Run with Node, not Bun.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.ADMIN_EMAIL ?? "admin@propcompare.test";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "Local-admin-pass-1";
const BROCHURE = process.env.BROCHURE ?? "The Kimana Towers Brochure.pdf";
const outDir = path.resolve(process.argv[2] ?? ".local/verify");
mkdirSync(outDir, { recursive: true });

const BROWSERS = {
  chrome: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  brave: "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
};

const results = [];
const check = (browser, name, ok, detail = "") => {
  results.push(ok);
  console.log(
    `${ok ? "PASS" : "FAIL"} [${browser}] ${name}${detail ? ` — ${detail}` : ""}`,
  );
};

for (const [name, executablePath] of Object.entries(BROWSERS)) {
  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await (
    await browser.newContext({ viewport: { width: 1360, height: 1000 } })
  ).newPage();
  page.setDefaultTimeout(60_000);
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  try {
    await page.goto(`${BASE}/admin/login`);
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/admin/submissions");

    const developer = `Page Image Check ${name} ${Date.now()}`;
    await page.goto(`${BASE}/admin/developers/new`);
    await page.getByLabel("Developer name").fill(developer);
    await page.getByRole("button", { name: "Create profile" }).click();
    await page.waitForURL(/\/admin\/developers\/[0-9a-f-]{36}$/);

    await page.goto(`${BASE}/admin/submissions/new`);
    await page.getByLabel("Developer").selectOption({ label: developer });
    await page
      .getByLabel("Brochure (PDF)")
      .setInputFiles(path.join("brochures", BROCHURE));
    await page.getByRole("button", { name: "Upload brochure" }).click();
    await page.waitForURL(/\/admin\/submissions\/[0-9a-f-]{36}\/pages$/);
    const submissionUrl = page.url().replace(/\/pages$/, "");

    await page.getByRole("list", { name: "Brochure pages" }).waitFor();
    const card = page
      .getByRole("listitem")
      .filter({ has: page.getByText("Page 8", { exact: true }) })
      .first();
    await card.scrollIntoViewIfNeeded();
    await card.getByRole("button", { name: /use as image/i }).click();
    await card
      .getByRole("combobox", { name: "It is" })
      .selectOption("floor_plan");
    await card.getByPlaceholder("e.g. 3 BHK - A").fill("Block B - 3rd floor");
    await card.getByRole("button", { name: "Add image" }).click();
    await card.getByText(/added to the images/i).waitFor();
    check(name, "page 8 is added as an image", true);

    // Adding the same page again is "already done", not an error.
    await page.reload();
    await page.getByRole("list", { name: "Brochure pages" }).waitFor();
    const again = page
      .getByRole("listitem")
      .filter({ has: page.getByText("Page 8", { exact: true }) })
      .first();
    await again.getByRole("button", { name: /use as image/i }).click();
    await again.getByRole("button", { name: "Add image" }).click();
    await again.getByText(/added to the images/i).waitFor();
    check(name, "adding the same page again is treated as already done", true);

    await page.goto(submissionUrl);
    const images = page.getByRole("region", { name: "Images" });
    await images.getByText("Credit: Image from the").waitFor();
    check(name, "the image shows its credit", true);
    check(
      name,
      "it is a floor plan for the named unit type",
      (await images.getByText("Floor plan · Block B - 3rd floor").count()) ===
        1,
    );
    check(
      name,
      "it is one image, not two, after adding twice",
      (await images.getByRole("img").count()) === 1,
    );
    check(
      name,
      "it starts unreviewed",
      (await images.getByText(/needs review/i).count()) === 1,
    );

    const img = images.getByRole("img").first();
    await img.waitFor();
    await page.waitForFunction(
      (el) => el.complete && el.naturalWidth > 0,
      await img.elementHandle(),
    );
    const size = await img.evaluate((el) => [
      el.naturalWidth,
      el.naturalHeight,
    ]);
    check(
      name,
      "the preview loads at full size",
      size[0] === 1600,
      `${size[0]}x${size[1]}`,
    );
    await page.screenshot({
      path: path.join(outDir, `page-image-${name}.png`),
      fullPage: true,
    });
    check(
      name,
      "no uncaught page errors",
      pageErrors.length === 0,
      pageErrors.join(" | "),
    );
  } catch (error) {
    check(name, "flow completed", false, error.message.split("\n")[0]);
    await page
      .screenshot({
        path: path.join(outDir, `page-image-${name}-failure.png`),
        fullPage: true,
      })
      .catch(() => {});
  } finally {
    await browser.close();
  }
}

const failed = results.filter((ok) => !ok).length;
console.log(
  `\n${results.length - failed}/${results.length} checks passed. Screenshots: ${outDir}`,
);
process.exit(failed ? 1 : 0);

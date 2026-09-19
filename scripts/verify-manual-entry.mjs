/**
 * Manual check of the whole manual-entry path in real browsers: start a draft,
 * fill fields with the typed inputs (text, choices, a number, amenities, unit
 * types with areas), add an image with attribution, submit, start review, confirm
 * every value, approve the image, and approve the submission. It stops before
 * publishing on purpose — publishing writes a real property into the catalog, and
 * that step is covered by the publisher's integration tests.
 *
 *   node scripts/verify-manual-entry.mjs [outDir]
 *
 * Needs `bun run dev` running (STORAGE_DRIVER=local) and a local admin. Run with
 * Node, not Bun (Playwright pipes hang under Bun on Windows).
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.ADMIN_EMAIL ?? "admin@propcompare.test";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "Local-admin-pass-1";
const outDir = path.resolve(process.argv[2] ?? ".local/verify");
mkdirSync(outDir, { recursive: true });

const BROWSERS = {
  chrome: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  brave: "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
};

// A valid 1x1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

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
  page.setDefaultTimeout(20_000);
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  const row = (label) =>
    page
      .getByRole("listitem")
      .filter({ has: page.getByText(label, { exact: true }) })
      .first();
  const editField = async (label, act) => {
    const r = row(label);
    await r.getByRole("button", { name: /^(Add|Edit)$/ }).click();
    await act(r);
    await r.getByRole("button", { name: "Save" }).click();
    await r.getByText("Edited").waitFor();
  };

  try {
    await page.goto(`${BASE}/admin/login`);
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/admin/submissions");

    const developer = `Manual Entry Check ${name} ${Date.now()}`;
    await page.goto(`${BASE}/admin/developers/new`);
    await page.getByLabel("Developer name").fill(developer);
    await page.getByRole("button", { name: "Create profile" }).click();
    await page.waitForURL(/\/admin\/developers\/[0-9a-f-]{36}$/);

    await page.goto(`${BASE}/admin/submissions/manual`);
    await page
      .getByLabel("Developer profile")
      .selectOption({ label: developer });
    await page.getByRole("button", { name: "Start manual entry" }).click();
    await page.waitForURL(/\/admin\/submissions\/[0-9a-f-]{36}$/);
    check(name, "manual draft opens", true);
    check(
      name,
      "every active field starts as Not stated",
      (await page.getByText("Not stated").count()) >= 20,
    );
    await page.screenshot({
      path: path.join(outDir, `manual-${name}-1-empty.png`),
      fullPage: true,
    });

    await editField("Property name", (r) =>
      r.getByRole("textbox").fill("Verify Residency"),
    );
    await editField("Property type", (r) =>
      r.getByRole("combobox").selectOption({ index: 1 }),
    );
    await editField("City", (r) => r.getByRole("textbox").fill("Ahmedabad"));
    await editField("Locality", (r) => r.getByRole("textbox").fill("Bopal"));
    await editField("Possession status", (r) =>
      r.getByRole("combobox").selectOption("under_construction"),
    );
    await editField("Total units", (r) => r.getByRole("textbox").fill("120"));
    check(name, "text, choice and number fields save", true);

    // A bad value is refused with a plain message and nothing is saved.
    const units = row("Total units");
    await units.getByRole("button", { name: "Edit" }).click();
    await units.getByRole("textbox").fill("many");
    await units.getByRole("button", { name: "Save" }).click();
    check(
      name,
      "a non-number is refused",
      (await units.getByRole("alert").count()) > 0,
    );
    await units.getByRole("button", { name: "Cancel" }).click();

    await editField("Amenities", async (r) => {
      await r.getByRole("checkbox").nth(0).check();
      await r.getByRole("checkbox").nth(2).check();
    });
    check(
      name,
      "amenities save as approved choices",
      (await row("Amenities")
        .getByRole("list", { name: "Amenities" })
        .getByRole("listitem")
        .count()) === 2,
    );

    await editField("Unit configurations", async (r) => {
      await r.getByPlaceholder("e.g. 3 BHK — Type A").fill("3 BHK - A");
      await r.getByLabel("Area 1 for unit type 1").fill("1450");
    });
    check(
      name,
      "unit type with an area saves",
      (await page.getByText("Carpet 1450 sq ft").count()) > 0,
    );

    // Add an image of our own; it starts private and unreviewed, and needs a credit.
    await page
      .getByLabel("Image (JPEG, PNG or WebP)")
      .setInputFiles({ name: "site.png", mimeType: "image/png", buffer: PNG });
    await page.getByRole("button", { name: "Upload image" }).click();
    await page.getByText("Please say who").count();
    check(
      name,
      "an upload without a credit is refused",
      (await page
        .getByText("Say who the image should be credited to.")
        .count()) > 0,
    );
    await page.getByLabel("Credit").fill("Photo by PropCompare");
    await page.getByRole("button", { name: "Upload image" }).click();
    await page.getByText("Credit: Photo by PropCompare").waitFor();
    check(name, "own image is added with its credit", true);

    await page.screenshot({
      path: path.join(outDir, `manual-${name}-2-filled.png`),
      fullPage: true,
    });

    await page.getByRole("button", { name: "Submit for review" }).click();
    await page.getByRole("button", { name: "Start review" }).click();
    await page.getByRole("button", { name: "Approve" }).first().waitFor();
    check(name, "submitted and in review", true);

    const enabledConfirm = page.locator("button:not([disabled])", {
      hasText: /^Confirm$/,
    });
    while ((await enabledConfirm.count()) > 0) {
      await enabledConfirm.first().click();
      await page.waitForTimeout(500);
    }
    await page
      .getByText(/still waiting for a decision/)
      .waitFor({ state: "detached" });
    check(name, "all values confirmed", true);

    await page
      .getByRole("region", { name: "Images" })
      .getByRole("button", { name: "Approve" })
      .click();
    await page.getByText("will be public").waitFor();
    check(name, "image approved as public", true);
    await page.screenshot({
      path: path.join(outDir, `manual-${name}-3-review.png`),
      fullPage: true,
    });

    await page
      .getByRole("region", { name: "Review" })
      .getByRole("button", { name: "Approve" })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Approve" })
      .click();
    await page.getByText("Approved. An owner can now publish").waitFor();
    check(
      name,
      "submission approved, publish offered",
      (await page
        .getByRole("button", { name: "Publish to catalog" })
        .count()) === 1,
    );
    await page.getByRole("button", { name: "Publish to catalog" }).click();
    check(
      name,
      "publish asks for confirmation first",
      (await page
        .getByRole("alertdialog")
        .getByText("Publish to the live catalog?")
        .count()) === 1,
    );
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Not yet" })
      .click();
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
        path: path.join(outDir, `manual-${name}-failure.png`),
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

/**
 * Takes an extracted draft through review in the admin UI: fill the values the
 * brochure did not give, add images from brochure pages, submit for review,
 * confirm the values and images, approve, and (only when PUBLISH=1) publish.
 *
 * Without PUBLISH=1 it stops after approval, so a rehearsal never touches the live
 * catalog; check publishability then with
 *   bun run src/db/publish-dry-run.ts <submission-id>
 *
 *   SUBMISSION_ID=... \
 *   SET='{"Property type":"Apartment","Promoter legal entity":"Sun VN Developers LLP"}' \
 *   IMAGES='[{"page":1,"as":"photo","caption":"Cover"},{"page":8,"as":"floor_plan","unit":"Type A"}]' \
 *   [PUBLISH=1] node scripts/review-and-publish-via-ui.mjs [outDir]
 *
 * Needs `bun run dev` running and a local owner admin. Run with Node, not Bun.
 * These are the human decisions of review, so run it only on a draft whose values
 * you have checked against the brochure.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.ADMIN_EMAIL ?? "admin@propcompare.test";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "Local-admin-pass-1";
const SUBMISSION_ID = process.env.SUBMISSION_ID;
const SET = JSON.parse(process.env.SET ?? "{}");
const IMAGES = JSON.parse(process.env.IMAGES ?? "[]");
const PUBLISH = process.env.PUBLISH === "1";
if (!SUBMISSION_ID) throw new Error("Set SUBMISSION_ID.");
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
const say = (message) => console.log(message);
const submissionUrl = `${BASE}/admin/submissions/${SUBMISSION_ID}`;

try {
  await page.goto(`${BASE}/admin/login`);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/admin/submissions");

  await page.goto(submissionUrl);
  // Resumable: editing only applies while the draft is still a draft.
  const isDraft =
    (await page.getByRole("button", { name: "Submit for review" }).count()) > 0;

  // 1. Values the brochure did not give (a choice from a list).
  for (const [label, option] of Object.entries(isDraft ? SET : {})) {
    const row = page
      .locator("li")
      .filter({ has: page.getByText(label, { exact: true }) })
      .first();
    await row.getByRole("button", { name: /^(Add|Edit)$/ }).click();
    await row.getByRole("combobox").selectOption({ label: option });
    await row.getByRole("button", { name: "Save" }).click();
    await row.getByRole("button", { name: /^Edit$/ }).waitFor();
    say(`set ${label}`);
  }

  // 2. Images from brochure pages.
  for (const image of isDraft ? IMAGES : []) {
    await page.goto(`${submissionUrl}/pages`);
    await page.getByRole("list", { name: "Brochure pages" }).waitFor();
    const card = page
      .getByRole("listitem")
      .filter({ has: page.getByText(`Page ${image.page}`, { exact: true }) })
      .first();
    await card.scrollIntoViewIfNeeded();
    await card.getByRole("button", { name: /use as image/i }).click();
    await card.getByRole("combobox", { name: "It is" }).selectOption(image.as);
    if (image.unit) {
      await card.getByPlaceholder("e.g. 3 BHK - A").fill(image.unit);
    }
    await card.getByRole("button", { name: "Add image" }).click();
    await card.getByText(/added to the images/i).waitFor();
    say(`added page ${image.page} as ${image.as}`);
  }

  // 3. Review.
  await page.goto(submissionUrl);
  if (isDraft) {
    await page.getByRole("button", { name: "Submit for review" }).click();
  }
  const start = page.getByRole("button", { name: "Start review" });
  if (isDraft || (await start.count()) > 0) await start.click();
  await page
    .getByRole("button", { name: /^Approve$/ })
    .first()
    .waitFor();
  say("in review");

  const confirmAll = page.getByRole("button", {
    name: /Confirm all \d+ remaining/,
  });
  if (await confirmAll.count()) {
    await confirmAll.click();
    await page
      .getByRole("button", { name: "Confirm all", exact: true })
      .click();
    await page
      .getByRole("button", { name: /Confirm all \d+ remaining/ })
      .waitFor({
        state: "detached",
      });
    say("confirmed every value");
  }
  // The buttons stay after approving, so approve each image once, by count.
  const images = page.getByRole("region", { name: "Images" });
  const imageCount = await images
    .getByRole("button", { name: "Approve" })
    .count();
  for (let i = 0; i < imageCount; i += 1) {
    await images.getByRole("button", { name: "Approve" }).nth(i).click();
    await page.waitForTimeout(900);
  }
  if (IMAGES.length) say("approved the images");

  await page
    .getByRole("button", { name: "Approve", exact: true })
    .first()
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Approve", exact: true })
    .click();
  await page.getByText("Approved", { exact: true }).first().waitFor();
  say("approved");
  await page.screenshot({
    path: path.join(outDir, "review-approved.png"),
    fullPage: true,
  });

  if (PUBLISH) {
    await page.getByRole("button", { name: "Publish to catalog" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Publish", exact: true })
      .click();
    await page.getByText("Published", { exact: true }).first().waitFor();
    say("PUBLISHED");
  } else {
    say("stopped before publishing (PUBLISH is not set)");
  }
} catch (error) {
  console.error("FAILED:", String(error).slice(0, 600));
  await page
    .screenshot({ path: path.join(outDir, "review-error.png"), fullPage: true })
    .catch(() => undefined);
  process.exitCode = 1;
} finally {
  await browser.close();
}

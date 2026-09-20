/**
 * Loads one real brochure through the admin UI as far as extraction: create (or
 * reuse) the developer profile and its legal entity, upload the brochure,
 * categorize its pages, confirm the suggested routing, queue extraction, and wait
 * for the worker to finish. It stops there, with the draft ready to review.
 *
 * PAID: categorizing and extraction call the AI provider. Run it only on a
 * brochure the owner has named, and never in a loop.
 *
 *   DEVELOPER="Sun VN Developers LLP" ENTITY_TYPE=LLP BROCHURE="The Kimana Towers Brochure.pdf" \
 *     node scripts/load-brochure-via-ui.mjs [outDir]
 *
 * Needs `bun run dev` running (no stand-in provider configured), STORAGE_DRIVER=local
 * and a local admin. Run with Node, not Bun. Prints the submission id.
 */
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.ADMIN_EMAIL ?? "admin@propcompare.test";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "Local-admin-pass-1";
const DEVELOPER = process.env.DEVELOPER;
const BROCHURE = process.env.BROCHURE;
const ENTITY_TYPE = process.env.ENTITY_TYPE ?? "Company";
// Free rehearsal: choose the pages from a saved routing manifest instead of
// asking the AI to categorize them (see scripts/dump-job-routing.mjs).
const ROUTING_FILE = process.env.ROUTING_FILE;
if (!DEVELOPER || !BROCHURE) {
  throw new Error(
    "Set DEVELOPER and BROCHURE (a file name inside brochures/).",
  );
}
const outDir = path.resolve(process.argv[2] ?? ".local/verify");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const page = await (
  await browser.newContext({ viewport: { width: 1360, height: 1000 } })
).newPage();
page.setDefaultTimeout(120_000);
const say = (message) => console.log(message);

try {
  await page.goto(`${BASE}/admin/login`);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/admin/submissions");

  // Developer profile: reuse one with this exact name, otherwise create it.
  await page.goto(`${BASE}/admin/developers`);
  const existing = page.locator("a", { hasText: DEVELOPER });
  if ((await existing.count()) > 0) {
    await existing.first().click();
    say("reusing the existing developer profile");
  } else {
    await page.goto(`${BASE}/admin/developers/new`);
    await page.getByLabel("Developer name").fill(DEVELOPER);
    await page.getByRole("button", { name: "Create profile" }).click();
    say("created the developer profile");
  }
  await page.waitForURL(/\/admin\/developers\/[0-9a-f-]{36}$/);

  if ((await page.getByText(DEVELOPER, { exact: true }).count()) < 2) {
    // (heading plus the entity row once it exists)
    await page.getByLabel("Legal name").fill(DEVELOPER);
    await page.getByLabel("Type").selectOption({ label: ENTITY_TYPE });
    await page.getByRole("button", { name: "Add legal entity" }).click();
    await page.getByText("No legal entities recorded yet.").waitFor({
      state: "detached",
    });
    say("recorded the legal entity");
  }

  await page.goto(`${BASE}/admin/submissions/new`);
  await page.getByLabel("Developer").selectOption({ label: DEVELOPER });
  await page
    .getByLabel("Brochure (PDF)")
    .setInputFiles(path.join("brochures", BROCHURE));
  await page.getByRole("button", { name: "Upload brochure" }).click();
  await page.waitForURL(/\/admin\/submissions\/[0-9a-f-]{36}\/pages$/);
  const pagesUrl = page.url();
  const submissionId = pagesUrl.match(/submissions\/([0-9a-f-]{36})/)[1];
  say(`uploaded; submission ${submissionId}`);

  await page.getByRole("list", { name: "Brochure pages" }).waitFor();
  if (ROUTING_FILE) {
    const LABEL = {
      property_details: "Project details",
      amenities: "Amenities",
      specifications: "Specifications",
      floor_plans: "Floor plan",
    };
    const routing = JSON.parse(readFileSync(ROUTING_FILE, "utf8"));
    for (const scope of routing.scopes) {
      if (!LABEL[scope.kind]) continue;
      for (const { pageNumber } of scope.pages) {
        const card = page
          .getByRole("listitem")
          .filter({
            has: page.getByText(`Page ${pageNumber}`, { exact: true }),
          })
          .first();
        await card.scrollIntoViewIfNeeded();
        await card.getByRole("checkbox").check();
        await card
          .getByLabel("Read as")
          .selectOption({ label: LABEL[scope.kind] });
      }
    }
    say("chose the pages from the saved routing (no AI categorization)");
  } else {
    await page
      .getByRole("button", { name: /categorize brochure pages/i })
      .click();
    await page.getByText("Brochure page categories").waitFor();
    say("pages categorized");
  }
  await page.screenshot({
    path: path.join(outDir, "real-categorized.png"),
    fullPage: false,
  });

  await page.getByRole("button", { name: /confirm page routing/i }).click();
  await page.getByText(/routing is confirmed/i).waitFor();
  await page.getByRole("button", { name: /^queue extraction$/i }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^queue extraction$/i })
    .click();
  say("extraction queued; waiting for the worker (a few minutes)");

  await page
    .getByText(/Extraction finished|Extraction did not finish/)
    .first()
    .waitFor({ timeout: 15 * 60_000 });
  if (await page.getByText("Extraction did not finish").count()) {
    const failure = await page
      .locator("section", { hasText: "Extraction did not finish" })
      .innerText();
    throw new Error(`extraction failed: ${failure.replace(/\s+/g, " ")}`);
  }
  say("extraction finished");
  say(`SUBMISSION_ID=${submissionId}`);
} catch (error) {
  console.error("FAILED:", String(error).slice(0, 500));
  await page
    .screenshot({ path: path.join(outDir, "real-error.png") })
    .catch(() => undefined);
  process.exitCode = 1;
} finally {
  await browser.close();
}

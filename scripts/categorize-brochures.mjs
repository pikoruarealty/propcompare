/**
 * Live validation of the "Categorize brochure pages" pass against real brochures
 * from ./brochures, driven through the real admin UI (sign in, upload, click the
 * button, read back what the screen shows). THIS MAKES PAID PROVIDER CALLS — each
 * one is recorded in the admin usage ledger — so it only runs on the files named
 * on the command line.
 *
 *   node scripts/categorize-brochures.mjs "Adani Amaris Brochure.pdf" ...
 *
 * Needs `bun run dev` running with STORAGE_DRIVER=local, OPENROUTER_API_KEY set,
 * and a local admin. Run with Node, not Bun (Playwright pipes hang under Bun on
 * Windows). Prints, per brochure, the pages assigned to each category so they can
 * be compared with hand-routed ground truth.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.ADMIN_EMAIL ?? "admin@propcompare.test";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "Local-admin-pass-1";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Name at least one PDF in ./brochures");
  process.exit(2);
}

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
});
const page = await (
  await browser.newContext({ viewport: { width: 1360, height: 900 } })
).newPage();
page.setDefaultTimeout(600_000);

await page.goto(`${BASE}/admin/login`);
await page.getByLabel("Email").fill(EMAIL);
await page.getByLabel("Password").fill(PASSWORD);
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL("**/admin/submissions");

for (const file of files) {
  const started = Date.now();
  const label = path.basename(file, ".pdf");
  console.log(`\n=== ${label}`);
  const developerName = `Routing check — ${label} — ${Date.now()}`;

  await page.goto(`${BASE}/admin/developers/new`);
  await page.getByLabel("Developer name").fill(developerName);
  await page.getByRole("button", { name: "Create profile" }).click();
  await page.waitForURL(/\/admin\/developers\/[0-9a-f-]{36}$/);

  await page.goto(`${BASE}/admin/submissions/new`);
  await page.getByLabel("Developer").selectOption({ label: developerName });
  await page.getByLabel("Brochure (PDF)").setInputFiles({
    name: path.basename(file),
    mimeType: "application/pdf",
    buffer: readFileSync(path.join("brochures", file)),
  });
  await page.getByRole("button", { name: "Upload brochure" }).click();
  await page.waitForURL(/\/admin\/submissions\/[0-9a-f-]{36}\/pages$/);
  console.log(
    `uploaded in ${Math.round((Date.now() - started) / 1000)}s: ${page.url()}`,
  );

  const total = Number(
    (
      await page
        .getByText(/\d+ pages$/)
        .first()
        .innerText()
    ).match(/(\d+) pages/)[1],
  );

  const ran = Date.now();
  await page.getByRole("button", { name: "Categorize brochure pages" }).click();
  try {
    await page
      .getByText("Brochure page categories")
      .waitFor({ timeout: 900_000 });
  } catch {
    const alert = await page.getByRole("alert").allInnerTexts();
    console.log(
      `FAILED after ${Math.round((Date.now() - ran) / 1000)}s. Screen says: ${alert.join(" | ") || "(nothing)"}`,
    );
    await page
      .screenshot({ path: `.local/verify/categorize-${label}-failed.png` })
      .catch(() => {});
    continue;
  }
  console.log(
    `categorized ${total} pages in ${Math.round((Date.now() - ran) / 1000)}s`,
  );

  await page.getByRole("list", { name: "Brochure pages" }).waitFor();
  const result = await page.evaluate((n) => {
    const byType = {};
    const lowConfidence = [];
    const notClassified = [];
    const imagery = {};
    for (let i = 1; i <= n; i += 1) {
      const select = document.getElementById(`type-${i}`);
      const card = select?.closest("li");
      const type =
        select && !select.disabled ? select.value || "untyped" : "not read";
      (byType[type] ??= []).push(i);
      const text = card?.innerText ?? "";
      if (/Low confidence/.test(text)) lowConfidence.push(i);
      if (/Not classified/.test(text)) notClassified.push(i);
      for (const chip of card?.querySelectorAll(
        'ul[aria-label="What the page shows"] li',
      ) ?? []) {
        imagery[chip.textContent] = (imagery[chip.textContent] ?? 0) + 1;
      }
    }
    return { byType, lowConfidence, notClassified, imagery };
  }, total);

  const compact = (pages) => pages.join(",");
  for (const [type, pages] of Object.entries(result.byType)) {
    console.log(`  ${type.padEnd(16)} (${pages.length}): ${compact(pages)}`);
  }
  console.log(`  low confidence: ${compact(result.lowConfidence) || "none"}`);
  console.log(`  not classified: ${compact(result.notClassified) || "none"}`);
  console.log(`  imagery tags: ${JSON.stringify(result.imagery)}`);
  const summary = await page.getByText(/No floor plans were found/).count();
  console.log(
    `  floor-plan step skipped notice: ${summary > 0 ? "shown" : "not shown"}`,
  );
  await page.screenshot({
    path: `.local/verify/categorize-${label}.png`,
    fullPage: false,
  });
}

await browser.close();

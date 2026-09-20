/**
 * Presses "Try again" on a failed extraction in the admin UI and waits for the
 * result. PAID when it reaches the AI provider: only scopes without a saved answer
 * are asked again.
 *
 *   SUBMISSION_ID=... node scripts/retry-extraction-via-ui.mjs
 *
 * Needs `bun run dev` running. Run with Node, not Bun.
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.ADMIN_EMAIL ?? "admin@propcompare.test";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "Local-admin-pass-1";
const SUBMISSION_ID = process.env.SUBMISSION_ID;
if (!SUBMISSION_ID) throw new Error("Set SUBMISSION_ID.");

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const page = await (
  await browser.newContext({ viewport: { width: 1360, height: 1000 } })
).newPage();
page.setDefaultTimeout(120_000);

try {
  await page.goto(`${BASE}/admin/login`);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/admin/submissions");
  await page.goto(`${BASE}/admin/submissions/${SUBMISSION_ID}/pages`);
  await page.getByRole("button", { name: "Try again" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Run again" })
    .click();
  console.log("queued again; waiting for the worker");
  await page
    .getByText(/Extraction finished|Extraction did not finish/)
    .first()
    .waitFor({ timeout: 15 * 60_000 });
  if (await page.getByText("Extraction did not finish").count()) {
    const text = await page
      .locator("section", { hasText: "Extraction did not finish" })
      .innerText();
    throw new Error(text.replace(/\s+/g, " "));
  }
  console.log("extraction finished");
} catch (error) {
  console.error("FAILED:", String(error).slice(0, 500));
  process.exitCode = 1;
} finally {
  await browser.close();
}

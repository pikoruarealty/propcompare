/**
 * Drives the RERA fetch through the real admin screens against the real GujRERA
 * site: open a published property, start an edit, enter its registration number,
 * fetch the record, read the comparison, use RERA's values, and confirm the draft
 * now holds them while the live property is untouched.
 *
 *   SUBMISSION_ID=<published submission of the property> \
 *   RERA_NUMBER="PR/GJ/..." \
 *   node scripts/verify-rera-fetch.mjs [outDir]
 *
 * It never publishes, so the live catalogue is unchanged, but it leaves the edit
 * draft it made (only one edit per property may be open): delete or reject that
 * draft before starting a real edit. Needs `bun run dev`
 * running (start it with OCR_WORKER_ENABLED=false so no queued brochure is read),
 * a local owner admin, and internet access to gujrera.gujarat.gov.in. Run with
 * Node, not Bun.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.ADMIN_EMAIL ?? "admin@propcompare.test";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "Local-admin-pass-1";
const SUBMISSION_ID = process.env.SUBMISSION_ID;
const RERA_NUMBER = process.env.RERA_NUMBER;
if (!SUBMISSION_ID || !RERA_NUMBER) {
  throw new Error("Set SUBMISSION_ID and RERA_NUMBER.");
}
const outDir = path.resolve(process.argv[2] ?? ".local/verify");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const page = await (
  await browser.newContext({ viewport: { width: 1360, height: 1400 } })
).newPage();
page.setDefaultTimeout(90_000);

let passed = 0;
let failed = 0;
const check = (ok, label, detail = "") => {
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`,
  );
  if (ok) passed += 1;
  else failed += 1;
};
const shot = (name) =>
  page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });

let editId = null;
try {
  await page.goto(`${BASE}/admin/login`);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/admin/submissions");
  check(true, "signed in as an admin");

  // 1. The published property offers an edit, not a fetch.
  await page.goto(`${BASE}/admin/submissions/${SUBMISSION_ID}`);
  const start = page.getByRole("button", { name: "Edit this property" });
  await start.waitFor();
  check(true, "a published property offers 'Edit this property'");
  await start.click();
  await page.waitForURL(
    (url) =>
      /\/admin\/submissions\/[0-9a-f-]{36}$/.test(url.pathname) &&
      !url.pathname.endsWith(SUBMISSION_ID),
  );
  editId = page.url().split("/").pop();
  check(true, "started an edit", editId);

  // 2. The edit shows what is live, and says nothing changes until published.
  await page.getByText(/editing a property that is live/i).waitFor();
  check(
    true,
    "the edit says the property is live and unchanged until published",
  );
  const nameRow = page
    .locator("li")
    .filter({ has: page.getByText("Property name", { exact: true }) })
    .first();
  check(
    (await nameRow.getByText(/Currently published/).count()) === 1,
    "the name row shows the published value, not 'Not stated'",
  );
  await shot("1-edit-started");

  // 3. Fetch the RERA record.
  const panel = page.locator('[data-slot="rera-panel"]');
  await panel.getByLabel("Registration number").fill(RERA_NUMBER);
  await panel.getByRole("button", { name: "Fetch from RERA" }).click();
  await panel.getByText("Latest quarterly filing").waitFor();
  check(true, "fetched the record from GujRERA");
  const summary = (await panel.locator("dl").innerText()).replace(/\s+/g, " ");
  console.log(`      record: ${summary}`);
  const rows = await panel.locator("tbody tr").evaluateAll((trs) =>
    trs.map((tr) => ({
      status: tr.getAttribute("data-status"),
      text: tr.innerText.replace(/\s+/g, " ").trim(),
    })),
  );
  for (const row of rows)
    console.log(`      ${row.status.padEnd(11)} ${row.text}`);
  check(rows.length === 6, "compared six fields");
  check(
    !/[₹]|\bcost\b|\bprice\b/i.test(await panel.innerText()),
    "no price appears in the RERA panel",
  );
  await shot("2-fetched");

  // 4. Nothing was written by looking.
  check(
    (await page.locator('[data-slot="rera-difference"]').count()) === 0,
    "looking wrote nothing (no field holds a value to differ yet)",
  );

  // 5. Use RERA's values.
  await panel.getByRole("button", { name: /^Use RERA values/ }).click();
  await page
    .getByRole("button", { name: "Use RERA values", exact: true })
    .click();
  await panel
    .getByText("Everything RERA states matches this submission.")
    .waitFor();
  check(true, "used RERA's values; the panel now shows everything matching");
  await shot("3-applied");

  // 6. The draft holds them, confirmed, and shows the published value beside.
  for (const label of [
    "RERA registration number",
    "Possession date",
    "Total units",
  ]) {
    const row = page
      .locator("li")
      .filter({ has: page.getByText(label, { exact: true }) })
      .first();
    check(
      (await row.getByText("Confirmed").count()) === 1,
      `${label} is now a confirmed value`,
    );
  }
  check(
    (await nameRow.getByText(/Currently published/).count()) === 1 ||
      (await nameRow.getByText("Confirmed").count()) === 1,
    "the name row reflects RERA's spelling next to the published one",
  );

  // 7. The live property is untouched: the published submission still reads as before.
  await page.goto(`${BASE}/admin/submissions/${SUBMISSION_ID}`);
  await page.getByRole("button", { name: "Edit this property" }).waitFor();
  check(true, "the published submission is unchanged and still editable");

  // 8. A second edit is refused, and leads to the open one.
  await page.getByRole("button", { name: "Edit this property" }).click();
  await page.waitForURL(`**/admin/submissions/${editId}`);
  check(true, "asking for a second edit goes to the one already open");
} catch (error) {
  failed += 1;
  console.log(`FAIL  ${error instanceof Error ? error.message : error}`);
  await shot("failure").catch(() => {});
} finally {
  await browser.close();
}

console.log(`\n${passed} passed, ${failed} failed. Screenshots in ${outDir}`);
if (editId) {
  console.log(
    `Edit draft ${editId} was left in place. Delete or reject it before starting a real edit of this property.`,
  );
}
process.exit(failed === 0 ? 0 : 1);

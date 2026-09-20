/**
 * Checks the whole extraction path through the real UI, in real browsers, with no
 * paid call: upload a brochure, confirm two pages, queue extraction, watch the
 * worker (running inside the dev server) fail against a stand-in provider, use
 * "Try again", and see the extracted values arrive as a reviewable draft.
 *
 *   node scripts/stub-ocr-provider.mjs                                   (port 4010)
 *   OPENROUTER_OCR_ENDPOINT=http://localhost:4010/chat OCR_WORKER_POLL_MS=1000 bun run dev
 *   node scripts/verify-extraction-worker.mjs [outDir]
 *
 * Needs STORAGE_DRIVER=local, a local admin, and brochures/The Kimana Towers Brochure.pdf.
 * Run with Node, not Bun.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const STUB = process.env.STUB_URL ?? "http://localhost:4010";
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
const stub = (p) =>
  fetch(`${STUB}${p}`, { method: "POST" }).then((r) => r.text());

for (const [name, executablePath] of Object.entries(BROWSERS)) {
  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await (
    await browser.newContext({ viewport: { width: 1360, height: 1000 } })
  ).newPage();
  page.setDefaultTimeout(90_000);
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  try {
    await stub("/__stub/fail");
    await page.goto(`${BASE}/admin/login`);
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/admin/submissions");

    const developer = `Extraction Check ${name} ${Date.now()}`;
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
    const pagesUrl = page.url();
    const submissionUrl = pagesUrl.replace(/\/pages$/, "");

    await page.getByRole("list", { name: "Brochure pages" }).waitFor();
    const choose = async (n, label) => {
      const card = page
        .getByRole("listitem")
        .filter({ has: page.getByText(`Page ${n}`, { exact: true }) })
        .first();
      await card.scrollIntoViewIfNeeded();
      await card.getByRole("checkbox").check();
      await card.getByLabel("Read as").selectOption({ label });
    };
    await choose(1, "Project details");
    await choose(8, "Floor plan");
    await page.getByRole("button", { name: /confirm page routing/i }).click();
    await page.getByText(/routing is confirmed/i).waitFor();
    await page.getByRole("button", { name: /^queue extraction$/i }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^queue extraction$/i })
      .click();
    check(name, "extraction is queued from the UI", true);

    // The worker inside the server picks it up and, with the provider failing, fails it.
    await page.getByText("Extraction did not finish").waitFor();
    const failureText = await page
      .locator("section", { hasText: "Extraction did not finish" })
      .innerText();
    check(
      name,
      "a failed run says so in plain language, without provider detail",
      /try again/i.test(failureText) &&
        !/HTTP 500|stub failure/i.test(failureText),
      failureText.replace(/\s+/g, " "),
    );
    await page.screenshot({
      path: path.join(outDir, `extraction-failed-${name}.png`),
    });

    // Try again, with the provider healthy.
    await stub("/__stub/ok");
    await page.getByRole("button", { name: "Try again" }).click();
    await page.getByRole("button", { name: "Run again" }).click();
    await page.getByText("Extraction finished").waitFor();
    check(name, "Try again runs it and it finishes, with no manual step", true);

    await page.goto(submissionUrl);
    await page.getByText("Extraction finished").waitFor();
    check(name, "the submission shows the finished extraction", true);
    const body = await page.locator("body").innerText();
    check(
      name,
      "the extracted name is in the draft",
      body.includes("Stub Towers"),
    );
    check(
      name,
      "the discovered unit type is in the draft",
      body.includes("Type A"),
    );
    check(name, "no cost or price appears", !/\bUSD\b|\$\s?\d/.test(body));
    await page.screenshot({
      path: path.join(outDir, `extraction-done-${name}.png`),
      fullPage: true,
    });

    await page.goto(pagesUrl);
    await page.getByText("Extraction finished").waitFor();
    check(
      name,
      "the pages screen links to the extracted values",
      (await page
        .getByRole("link", { name: "Review extracted values" })
        .count()) === 1,
    );
    check(
      name,
      "no uncaught page errors",
      pageErrors.length === 0,
      pageErrors.join(" | "),
    );
  } catch (error) {
    check(name, "flow completed", false, String(error).slice(0, 300));
    await page
      .screenshot({ path: path.join(outDir, `extraction-error-${name}.png`) })
      .catch(() => undefined);
  } finally {
    await browser.close();
  }
}

console.log(
  `\n${results.filter(Boolean).length}/${results.length} checks passed`,
);
process.exit(results.every(Boolean) ? 0 : 1);

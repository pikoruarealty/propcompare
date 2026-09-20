/**
 * Checks crash recovery for real: queue an extraction, kill the whole app server
 * while the worker is mid-run, start the server again, and see the attempt become
 * "did not finish" (interrupted) instead of spinning forever, then run it again
 * to completion from the UI. No paid call: a stand-in provider answers slowly.
 *
 *   node scripts/stub-ocr-provider.mjs          (port 4010, in another terminal)
 *   node scripts/verify-worker-recovery.mjs [outDir]
 *
 * Starts and stops `bun run dev` itself, so stop any dev server on port 3000
 * first. Needs STORAGE_DRIVER=local, a local admin and brochures/The Kimana Towers
 * Brochure.pdf. Run with Node, not Bun.
 */
import { execSync, spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = "http://localhost:3000";
const STUB = process.env.STUB_URL ?? "http://localhost:4010";
const EMAIL = process.env.ADMIN_EMAIL ?? "admin@propcompare.test";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "Local-admin-pass-1";
const BROCHURE = "The Kimana Towers Brochure.pdf";
const outDir = path.resolve(process.argv[2] ?? ".local/verify");
mkdirSync(outDir, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const stub = (p) =>
  fetch(`${STUB}${p}`, { method: "POST" }).then((r) => r.text());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const env = {
  ...process.env,
  OPENROUTER_OCR_ENDPOINT: `${STUB}/chat`,
  OCR_WORKER_POLL_MS: "1000",
  OCR_WORKER_HEARTBEAT_MS: "2000",
  OCR_WORKER_LEASE_MS: "8000",
};

let server;
const startServer = async () => {
  server = spawn("bun", ["run", "dev"], { env, shell: true, stdio: "ignore" });
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(`${BASE}/admin/login`);
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(1000);
  }
  throw new Error("dev server did not start");
};
const killServer = () => {
  try {
    execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: "ignore" });
  } catch {
    /* already gone */
  }
};

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const page = await (
  await browser.newContext({ viewport: { width: 1360, height: 1000 } })
).newPage();
page.setDefaultTimeout(90_000);

try {
  await stub("/__stub/ok");
  await stub("/__stub/delay/120000");
  await startServer();

  await page.goto(`${BASE}/admin/login`);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/admin/submissions");

  const developer = `Recovery Check ${Date.now()}`;
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
  await page.getByRole("list", { name: "Brochure pages" }).waitFor();
  const card = page
    .getByRole("listitem")
    .filter({ has: page.getByText("Page 1", { exact: true }) })
    .first();
  await card.getByRole("checkbox").check();
  await card.getByLabel("Read as").selectOption({ label: "Project details" });
  await page.getByRole("button", { name: /confirm page routing/i }).click();
  await page.getByText(/routing is confirmed/i).waitFor();
  await page.getByRole("button", { name: /^queue extraction$/i }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^queue extraction$/i })
    .click();

  await page.getByText("Claude is reading the confirmed pages").waitFor();
  check("the worker picked the job up and is mid-run", true);

  killServer();
  check("the whole server was killed mid-run", true);
  await sleep(1500);
  await startServer();
  check("the server started again", true);

  // The heartbeat stopped when the process died; after the lease the new server's
  // worker must fail the attempt as interrupted.
  // The page was polling the server that died; reload until the new one answers.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await page.goto(pagesUrl);
      break;
    } catch {
      await sleep(2000);
    }
  }
  await page
    .getByText("Extraction did not finish")
    .waitFor({ timeout: 60_000 });
  const text = await page
    .locator("section", { hasText: "Extraction did not finish" })
    .innerText();
  check(
    "the interrupted attempt shows as failed, not spinning",
    /server stopped/i.test(text),
    text.replace(/\s+/g, " "),
  );
  await page.screenshot({ path: path.join(outDir, "recovery-failed.png") });

  await stub("/__stub/delay/0");
  await page.getByRole("button", { name: "Try again" }).click();
  await page.getByRole("button", { name: "Run again" }).click();
  await page.getByText("Extraction finished").waitFor();
  check("Try again after the crash runs to completion", true);
} catch (error) {
  check("flow completed", false, String(error).slice(0, 300));
  await page
    .screenshot({ path: path.join(outDir, "recovery-error.png") })
    .catch(() => undefined);
} finally {
  await browser.close();
  killServer();
}

console.log(
  `\n${results.filter(Boolean).length}/${results.length} checks passed`,
);
process.exit(results.every(Boolean) ? 0 : 1);

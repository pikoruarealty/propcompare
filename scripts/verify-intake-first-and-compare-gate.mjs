/**
 * Checks the 2026-09-22 flow pivot on the real buyer site, signed out:
 * intake is the landing page's primary call to action and is not in the nav,
 * and `/compare` shows the column identity + summary but locks every row
 * group behind a skeleton with exactly one sign-in prompt.
 *
 *   node scripts/verify-intake-first-and-compare-gate.mjs [outDir]
 *
 * Needs `bun run dev` running and at least two published properties.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SLUGS = (process.env.COMPARE_SLUGS ?? "the-kimana-towers,amaris").split(
  ",",
);
const outDir = path.resolve(process.argv[2] ?? ".local/verify");
mkdirSync(outDir, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const page = await (
  await browser.newContext({ viewport: { width: 1360, height: 1000 } })
).newPage();
page.setDefaultTimeout(60_000);
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});

// --- Landing page ---------------------------------------------------------
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.screenshot({
  path: path.join(outDir, "landing.png"),
  fullPage: true,
});

const nav = page.getByRole("navigation", { name: "Primary" });
check(
  "nav has no intake/guided-start link",
  (await nav.getByRole("link", { name: /guided start|intake/i }).count()) === 0,
);
check(
  "nav still has Browse properties, Compare, Saved",
  (await nav.getByRole("link", { name: "Browse properties" }).count()) === 1 &&
    (await nav.getByRole("link", { name: "Compare" }).count()) === 1 &&
    (await nav.getByRole("link", { name: "Saved" }).count()) === 1,
);

const heroCta = page.getByRole("link", {
  name: /tell us what you.re looking for/i,
});
check("hero's primary CTA exists", (await heroCta.count()) > 0);
check(
  "hero's primary CTA points to /intake",
  (await heroCta.first().getAttribute("href")) === "/intake",
);

// --- /compare, signed out --------------------------------------------------
await page.goto(`${BASE}/compare?p=${SLUGS.join(",")}`, {
  waitUntil: "networkidle",
});
await page.screenshot({
  path: path.join(outDir, "compare-signed-out.png"),
  fullPage: true,
});

check(
  "the summary heading is visible",
  await page
    .getByRole("heading", { name: "What changes between these choices" })
    .isVisible(),
);
check(
  "at least one column header (property name) is visible",
  (await page.locator('[data-slot="compare-column-header"]').count()) >= 2,
);

const lockedGroups = page.locator(
  '[data-slot="compare-group"][data-locked="true"]',
);
check("every group is locked", (await lockedGroups.count()) > 0);
check(
  "no real row content is rendered",
  (await page.locator('[data-slot="compare-row"]').count()) === 0,
);
check(
  "locked skeleton rows are rendered instead",
  (await page.locator('[data-slot="compare-row-locked"]').count()) > 0,
);
check(
  "exactly one sign-in prompt, not one per group",
  (await page.locator('[data-slot="compare-sign-in"]').count()) === 1,
);
check(
  "the sign-in prompt offers the phone field",
  await page.getByLabel(/mobile number/i).isVisible(),
);
check(
  "no console errors",
  consoleErrors.length === 0,
  consoleErrors.join("; "),
);

await browser.close();

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed.`);
process.exit(results.every(Boolean) ? 0 : 1);

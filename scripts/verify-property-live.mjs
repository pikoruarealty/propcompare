/**
 * Checks a published property is really live on the buyer website: it appears in
 * the browse list with its picture, its dossier opens, every picture on both loads
 * (not a broken image), credits show, and no price appears.
 *
 *   PROPERTY_NAME="The Kimana Towers" node scripts/verify-property-live.mjs [outDir]
 *
 * Needs `bun run dev` running. Run with Node, not Bun. Signed-out, like a buyer.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const NAME = process.env.PROPERTY_NAME;
if (!NAME) throw new Error("Set PROPERTY_NAME.");
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
const failedRequests = [];
page.on("response", (response) => {
  if (response.url().includes("/api/v1/") && response.status() >= 400) {
    failedRequests.push(`${response.status()} ${response.url()}`);
  }
});

const imagesLoaded = async (scope) => {
  await scope
    .locator("img")
    .first()
    .waitFor()
    .catch(() => undefined);
  await page.waitForTimeout(2500);
  return scope.locator("img").evaluateAll((imgs) =>
    imgs.map((img) => ({
      ok: img.complete && img.naturalWidth > 0,
      src: img.getAttribute("src"),
    })),
  );
};

try {
  await page.goto(`${BASE}/properties`);
  const card = page
    .locator('[data-slot="property-card"]', { hasText: NAME })
    .first();
  await card.waitFor();
  check("the property is in the browse list", true);

  const cardImages = await imagesLoaded(card);
  check(
    "its card shows a picture that loads",
    cardImages.length === 1 && cardImages[0].ok,
    JSON.stringify(cardImages),
  );
  await page.screenshot({ path: path.join(outDir, "live-browse.png") });

  await card.getByRole("link", { name: NAME }).click();
  await page.waitForURL(/\/properties\/[^/]+$/);
  await page.getByRole("heading", { level: 1 }).waitFor();
  check("its dossier opens", true, page.url());

  const media = page.locator('[data-slot="dossier-media"]');
  await media.scrollIntoViewIfNeeded();
  const dossierImages = await imagesLoaded(media);
  check(
    "every picture in the dossier loads",
    dossierImages.length > 0 && dossierImages.every((image) => image.ok),
    `${dossierImages.filter((i) => i.ok).length}/${dossierImages.length}`,
  );
  check(
    "each picture carries its credit",
    (await media.getByText(/^Credit:/).count()) === dossierImages.length,
  );
  const body = await page.locator("body").innerText();
  check("no price appears", !/₹|\bINR\b|\bcrore\b|\blakh\b/i.test(body));
  check(
    "no failed media requests",
    failedRequests.length === 0,
    failedRequests.join(" | "),
  );
  await page.screenshot({
    path: path.join(outDir, "live-dossier.png"),
    fullPage: true,
  });
} catch (error) {
  check("flow completed", false, String(error).slice(0, 400));
  await page
    .screenshot({ path: path.join(outDir, "live-error.png"), fullPage: true })
    .catch(() => undefined);
} finally {
  await browser.close();
}
console.log(
  `\n${results.filter(Boolean).length}/${results.length} checks passed`,
);
process.exit(results.every(Boolean) ? 0 : 1);

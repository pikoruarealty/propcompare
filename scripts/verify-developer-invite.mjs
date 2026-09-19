/**
 * Manual check of the developer invitation lifecycle in real browsers: an admin
 * invites someone to a profile, the invitee opens the one-time link in a separate
 * browser session and sets a password, lands in the developer portal, the link is
 * then dead, and finally the admin removes their access and their session stops
 * working.
 *
 *   node scripts/verify-developer-invite.mjs [outDir]
 *
 * Needs `bun run dev` running and a local owner admin. Run with Node, not Bun.
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

const results = [];
const check = (browser, name, ok, detail = "") => {
  results.push(ok);
  console.log(
    `${ok ? "PASS" : "FAIL"} [${browser}] ${name}${detail ? ` — ${detail}` : ""}`,
  );
};

for (const [name, executablePath] of Object.entries(BROWSERS)) {
  const browser = await chromium.launch({ executablePath, headless: true });
  const admin = await (
    await browser.newContext({ viewport: { width: 1280, height: 1000 } })
  ).newPage();
  const invitee = await (
    await browser.newContext({ viewport: { width: 1280, height: 900 } })
  ).newPage();
  admin.setDefaultTimeout(20_000);
  invitee.setDefaultTimeout(20_000);
  const stamp = Date.now();
  const inviteeEmail = `invitee-${name}-${stamp}@example.test`;
  const inviteePassword = "a-long-enough-password-1";

  try {
    await admin.goto(`${BASE}/admin/login`);
    await admin.getByLabel("Email").fill(EMAIL);
    await admin.getByLabel("Password").fill(PASSWORD);
    await admin.getByRole("button", { name: "Sign in" }).click();
    await admin.waitForURL("**/admin/submissions");

    const developer = `Invite Check ${name} ${stamp}`;
    await admin.goto(`${BASE}/admin/developers/new`);
    await admin.getByLabel("Developer name").fill(developer);
    await admin.getByRole("button", { name: "Create profile" }).click();
    await admin.waitForURL(/\/admin\/developers\/[0-9a-f-]{36}$/);
    const profileUrl = admin.url();

    await admin.getByLabel("Email", { exact: true }).fill(inviteeEmail);
    await admin.getByLabel("Their role (optional)").fill("Sales head");
    await admin.getByRole("button", { name: "Create invitation" }).click();
    const link = await admin.getByLabel("Invitation link").inputValue();
    check(
      name,
      "invitation link is shown",
      /\/developers\/accept-invite\?u=.+&t=.+/.test(link),
    );
    check(
      name,
      "the person is listed as invited",
      (await admin.getByText(inviteeEmail).count()) > 0 &&
        (await admin.getByText("Invited").count()) > 0,
    );
    await admin.screenshot({
      path: path.join(outDir, `invite-${name}-1-admin.png`),
      fullPage: true,
    });

    // A wrong link says the same thing as a used one.
    await invitee.goto(link.replace(/t=[^&]+/, "t=wrong"));
    check(
      name,
      "a wrong link gets the plain message",
      (await invitee.getByText("This link no longer works").count()) === 1,
    );

    await invitee.goto(link);
    check(
      name,
      "the real link shows the sign-up form for that profile",
      (await invitee.getByText(`Join ${developer}`).count()) === 1,
    );
    await invitee.screenshot({
      path: path.join(outDir, `invite-${name}-2-accept.png`),
    });

    await invitee.getByLabel("Choose a password").fill(inviteePassword);
    await invitee
      .getByLabel("Repeat the password")
      .fill("something-else-entirely");
    await invitee.getByRole("button", { name: "Create my account" }).click();
    await invitee.getByText("The two passwords do not match.").waitFor();
    check(name, "mismatched passwords are refused", true);

    await invitee.getByLabel("Your name (optional)").fill("Asha Patel");
    await invitee.getByLabel("Choose a password").fill(inviteePassword);
    await invitee.getByLabel("Repeat the password").fill(inviteePassword);
    await invitee.getByRole("button", { name: "Create my account" }).click();
    await invitee.waitForURL("**/developers");
    await invitee.getByRole("heading", { name: "You're signed in" }).waitFor();
    check(
      name,
      "the invitee is signed in to the developer portal",
      (await invitee
        .getByRole("heading", { name: "You're signed in" })
        .count()) === 1,
    );

    await invitee.goto(link);
    check(
      name,
      "the link cannot be used again",
      (await invitee.getByText("This link no longer works").count()) === 1,
    );

    await admin.goto(profileUrl);
    check(
      name,
      "the admin now sees them as active",
      (await admin.getByText("Active").count()) > 0,
    );

    // The admin removes access; the invitee's open session stops working at once.
    await admin.getByRole("button", { name: "Remove access" }).click();
    await admin
      .getByRole("alertdialog")
      .getByRole("button", { name: "Remove" })
      .click();
    await admin.getByText("Removed").waitFor();
    await invitee.goto(`${BASE}/developers`);
    check(
      name,
      "removed access ends their session",
      /\/developers\/login/.test(invitee.url()),
    );
    await admin.screenshot({
      path: path.join(outDir, `invite-${name}-3-removed.png`),
      fullPage: true,
    });
  } catch (error) {
    check(name, "flow completed", false, error.message.split("\n")[0]);
    await admin
      .screenshot({
        path: path.join(outDir, `invite-${name}-failure.png`),
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

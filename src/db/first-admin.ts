import { db, dbClient } from "@/db";
import { adminUsers } from "@/db/schema/catalog";
import { provisionPasswordAccount } from "@/lib/accounts/provision";

/**
 * One-off: creates the first `owner` admin. Public sign-up is disabled, so with
 * no admin there is otherwise no way in (docs/tasklists/2026-09-19-login-ui.md).
 *
 *   FIRST_ADMIN_EMAIL=... FIRST_ADMIN_PASSWORD=... bun run db:first-admin
 *
 * It writes identity and role only — never a live catalog table — and refuses to
 * run once any admin exists, so it cannot be used later to mint another owner.
 * Every admin after the first is created from inside the admin portal.
 */
const MIN_PASSWORD_LENGTH = 12;

const main = async () => {
  const email = process.env.FIRST_ADMIN_EMAIL?.trim();
  const password = process.env.FIRST_ADMIN_PASSWORD;
  const name = process.env.FIRST_ADMIN_NAME?.trim() || "Administrator";

  if (!email || !password) {
    throw new Error("Set FIRST_ADMIN_EMAIL and FIRST_ADMIN_PASSWORD.");
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `FIRST_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }

  const [existing] = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .limit(1);
  if (existing) {
    throw new Error("An admin already exists; refusing to create another.");
  }

  const { userId } = await provisionPasswordAccount({ email, password, name });
  await db.insert(adminUsers).values({ userId, permissionLevel: "owner" });
  console.log(`Created owner admin for ${email}.`);
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => dbClient.end());

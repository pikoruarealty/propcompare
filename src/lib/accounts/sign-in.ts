import { headers } from "next/headers";
import { db } from "@/db";
import { auth } from "@/lib/auth";
import { resolveAccountRole } from "@/lib/accounts/roles";

/**
 * Password sign-in for the developer and admin portals.
 *
 * The role is checked *before* a session is created, not after: a developer who
 * types their (correct) credentials into `/admin/login` never gets a session at
 * all, so there is nothing to revoke. Every failure — unknown email, wrong
 * password, or right password on the wrong door — returns the same result, so
 * the screen cannot be used to learn which role an email address holds.
 *
 * This is a convenience and an affordance, not the security boundary: the
 * boundary is `requirePortalRole`, which every portal page and action calls.
 */
export const signInToPortal = async (
  expected: "developer" | "admin",
  email: string,
  password: string,
): Promise<boolean> => {
  const normalisedEmail = email.trim().toLowerCase();
  if (!normalisedEmail || !password) return false;

  const context = await auth.$context;
  const user = await context.internalAdapter.findUserByEmail(normalisedEmail, {
    includeAccounts: false,
  });
  if (!user) return false;

  const role = await resolveAccountRole(db, user.user.id);
  if (role.kind !== expected) return false;

  try {
    await auth.api.signInEmail({
      body: { email: normalisedEmail, password },
      headers: await headers(),
    });
    return true;
  } catch {
    return false;
  }
};

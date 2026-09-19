import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema/auth";
import { auth } from "@/lib/auth";
import { provisionPasswordAccount } from "@/lib/accounts/provision";

/**
 * Shared by the buyer-account route integration tests
 * (`docs/tasklists/2026-09-18-buyer-account-routes.md`). Provisions a real test
 * user (public sign-up is disabled) and signs it in through Better Auth's own
 * `signInEmail` — rather than hand-rolling a session row — so the resulting
 * cookie is genuinely signed and
 * `auth.api.getSession` accepts it exactly as it would a real browser's.
 */
export const signUpTestBuyer = async (
  email: string,
): Promise<{ userId: string; cookie: string }> => {
  const password = "Test-password-1234";
  const { userId } = await provisionPasswordAccount({
    email,
    password,
    name: "Test Buyer",
  });
  const response = await auth.api.signInEmail({
    body: { email, password },
    asResponse: true,
  });
  if (!response.ok) {
    throw new Error(
      `signInEmail failed: ${response.status} ${await response.text()}`,
    );
  }
  const cookie = response.headers
    .getSetCookie()
    .map((entry) => entry.split(";")[0])
    .join("; ");
  return { userId, cookie };
};

export const verifyTestBuyerPhone = async (userId: string): Promise<void> => {
  await db
    .update(users)
    .set({ phoneNumberVerified: true })
    .where(eq(users.id, userId));
};

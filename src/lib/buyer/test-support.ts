import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema/auth";
import { auth } from "@/lib/auth";

/**
 * Shared by the buyer-account route integration tests
 * (`docs/tasklists/2026-09-18-buyer-account-routes.md`). Signs a real test
 * user up through Better Auth's own `signUpEmail` — rather than hand-rolling
 * a session row — so the resulting cookie is genuinely signed and
 * `auth.api.getSession` accepts it exactly as it would a real browser's.
 */
export const signUpTestBuyer = async (
  email: string,
): Promise<{ userId: string; cookie: string }> => {
  const response = await auth.api.signUpEmail({
    body: { email, password: "Test-password-1234", name: "Test Buyer" },
    asResponse: true,
  });
  if (!response.ok) {
    throw new Error(
      `signUpEmail failed: ${response.status} ${await response.text()}`,
    );
  }
  const body = (await response.json()) as { user: { id: string } };
  const cookie = response.headers
    .getSetCookie()
    .map((entry) => entry.split(";")[0])
    .join("; ");
  return { userId: body.user.id, cookie };
};

export const verifyTestBuyerPhone = async (userId: string): Promise<void> => {
  await db
    .update(users)
    .set({ phoneNumberVerified: true })
    .where(eq(users.id, userId));
};

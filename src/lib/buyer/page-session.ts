import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/**
 * The check for a buyer page that shows a person's own data (`/saved`): no
 * session sends the visitor to sign in, carrying the page they wanted. It reads
 * the session with `disableCookieCache` for the same reason the buyer routes do
 * (`src/lib/buyer/session.ts`).
 */
export const requireBuyerPageSession = async (
  returnTo: string,
): Promise<{ userId: string }> => {
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true },
  });
  if (!session) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return { userId: session.user.id };
};

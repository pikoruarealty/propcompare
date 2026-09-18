import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

/**
 * The one place a Route Handler reads a Better Auth session from — first
 * real use of session reading in this codebase (`docs/tasklists/2026-09-18-buyer-account-routes.md`).
 *
 * `disableCookieCache: true` bypasses Better Auth's cookie-cache optimization
 * and forces an authoritative database read. Better Auth's own guidance
 * (`node_modules/better-auth/dist/api/routes/session.d.mts`, the `isStateful`
 * doc comment) is that sensitive operations must do this so a revoked session
 * cached in a signed cookie cannot still authorize a write. Every route that
 * calls this writes or reads account-owned data, so all of them count.
 */
export interface BuyerSession {
  userId: string;
  phoneNumberVerified: boolean;
}

export const requireBuyerSession = async (
  request: NextRequest,
): Promise<BuyerSession | null> => {
  const result = await auth.api.getSession({
    headers: request.headers,
    query: { disableCookieCache: true },
  });
  if (!result) return null;
  return {
    userId: result.user.id,
    phoneNumberVerified: result.user.phoneNumberVerified ?? false,
  };
};

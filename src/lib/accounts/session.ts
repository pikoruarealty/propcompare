import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { auth } from "@/lib/auth";
import { resolveAccountRole, type AccountRole } from "@/lib/accounts/roles";

export interface PortalSession<
  K extends "developer" | "admin" = "developer" | "admin",
> {
  userId: string;
  email: string;
  /** Narrowed to the role the caller asked for, so an admin page can read `permissionLevel`. */
  role: Extract<AccountRole, { kind: K }>;
}

/**
 * The authorization check for `/developers/*` and `/admin/*`.
 *
 * Call it from every portal page and every portal server action, not just the
 * layout: Next.js does not re-run a layout when navigating between its child
 * pages, so a layout-only guard would leave the pages unchecked after the first
 * load. It reads the session with `disableCookieCache` for the same reason the
 * buyer routes do (`src/lib/buyer/session.ts`) — a revoked session cached in a
 * cookie must not keep opening the portal.
 *
 * Anyone without the right role is sent to that portal's own login, carrying
 * the page they wanted as `next`.
 */
export const requirePortalRole = async <K extends "developer" | "admin">(
  expected: K,
  returnTo: string,
): Promise<PortalSession<K>> => {
  const loginPath = expected === "admin" ? "/admin/login" : "/developers/login";
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true },
  });
  if (!session) {
    redirect(`${loginPath}?next=${encodeURIComponent(returnTo)}`);
  }

  const role = await resolveAccountRole(db, session.user.id);
  if (role.kind === "buyer" || role.kind !== expected) {
    redirect(`${loginPath}?next=${encodeURIComponent(returnTo)}`);
  }

  return {
    userId: session.user.id,
    email: session.user.email,
    role: role as Extract<AccountRole, { kind: K }>,
  };
};

/**
 * For a portal's login screen: someone already signed in with the right role has
 * no reason to see the form, so they are sent on to where they were headed
 * (`returnTo`, already reduced to a same-site path by the caller). Anyone else,
 * including a signed-in account of the other role, still sees the form.
 */
export const redirectIfSignedIn = async (
  expected: "developer" | "admin",
  returnTo: string,
): Promise<void> => {
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true },
  });
  if (!session) return;
  const role = await resolveAccountRole(db, session.user.id);
  if (role.kind === expected) redirect(returnTo);
};

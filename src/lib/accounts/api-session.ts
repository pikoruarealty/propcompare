import type { NextRequest } from "next/server";
import { db } from "@/db";
import { auth } from "@/lib/auth";
import { resolveAccountRole } from "@/lib/accounts/roles";

export interface AdminApiSession {
  userId: string;
  permissionLevel: "verifier" | "owner";
}

/**
 * The admin counterpart of `requireBuyerSession` for Route Handlers. Reads the
 * session authoritatively (`disableCookieCache`) and resolves the role from
 * `admin_users`; a signed-in non-admin is `forbidden`, not `unauthenticated`,
 * so an API client can tell "log in" from "you may not".
 */
export const requireAdminRequest = async (
  request: NextRequest,
): Promise<AdminApiSession | "unauthenticated" | "forbidden"> => {
  const session = await auth.api.getSession({
    headers: request.headers,
    query: { disableCookieCache: true },
  });
  if (!session) return "unauthenticated";
  const role = await resolveAccountRole(db, session.user.id);
  if (role.kind !== "admin") return "forbidden";
  return { userId: session.user.id, permissionLevel: role.permissionLevel };
};

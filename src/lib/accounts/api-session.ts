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

export interface DeveloperApiSession {
  userId: string;
  /** From the active `developer_users` link, never from the request. */
  developerId: string;
}

/**
 * The developer counterpart for Route Handlers (`GET /api/v1/developer/*`). The
 * session is read authoritatively (`disableCookieCache`), so a revoked one stops
 * working at once, and `developerId` comes from an `active` `developer_users` row:
 * an invited or removed member, a buyer and an admin are all `forbidden`. A
 * signed-in non-developer is `forbidden`, not `unauthenticated`, so a client can
 * tell "log in" from "you may not".
 */
export const requireDeveloperRequest = async (
  request: NextRequest,
): Promise<DeveloperApiSession | "unauthenticated" | "forbidden"> => {
  const session = await auth.api.getSession({
    headers: request.headers,
    query: { disableCookieCache: true },
  });
  if (!session) return "unauthenticated";
  const role = await resolveAccountRole(db, session.user.id);
  if (role.kind !== "developer") return "forbidden";
  return { userId: session.user.id, developerId: role.developerId };
};

import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { adminUsers, developerUsers } from "@/db/schema/catalog";

/**
 * A signed-in user's role is not a column on `users` (Better Auth owns that
 * table): it is the presence of a row in `admin_users` or `developer_users`.
 * Anyone with neither is a buyer. This is the authorization boundary for the
 * developer and admin portals — the login screens only decide where a person
 * lands, they do not grant access.
 *
 * A developer link only counts while `developer_users.status` is `active`, so
 * an invited-but-unaccepted or revoked developer resolves to a buyer here and
 * cannot enter the portal.
 *
 * The database handle is a parameter because `@/db` throws at import time
 * without `DATABASE_URL`, which would make this untestable without one.
 */
export type AccountRole =
  | { kind: "admin"; permissionLevel: "verifier" | "owner" }
  | { kind: "developer"; developerId: string }
  | { kind: "buyer" };

export const resolveAccountRole = async (
  database: PostgresJsDatabase,
  userId: string,
): Promise<AccountRole> => {
  const [admin] = await database
    .select({ permissionLevel: adminUsers.permissionLevel })
    .from(adminUsers)
    .where(eq(adminUsers.userId, userId))
    .limit(1);
  if (admin) return { kind: "admin", permissionLevel: admin.permissionLevel };

  const [developer] = await database
    .select({ developerId: developerUsers.developerId })
    .from(developerUsers)
    .where(
      and(
        eq(developerUsers.userId, userId),
        eq(developerUsers.status, "active"),
      ),
    )
    .limit(1);
  if (developer) {
    return { kind: "developer", developerId: developer.developerId };
  }

  return { kind: "buyer" };
};

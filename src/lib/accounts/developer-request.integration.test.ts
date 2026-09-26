import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { sessions, users } from "@/db/schema/auth";
import { adminUsers, developerUsers, developers } from "@/db/schema/catalog";
import { signUpTestBuyer } from "@/lib/buyer/test-support";
import { requireDeveloperRequest } from "./api-session";

/**
 * Who a developer API request is (`requireDeveloperRequest`), against real
 * Better Auth sessions: the developer id comes from an `active` link and nothing
 * else, and a buyer, an admin, an invited or removed member and a signed-out
 * caller each get the answer the routes turn into a 403 or a 401.
 */

const suffix = randomUUID();
let developerId: string;
const userIds: string[] = [];

const request = (cookie?: string) =>
  new NextRequest("http://localhost/api/v1/developer/portfolio", {
    headers: cookie ? { cookie } : {},
  });

const signUp = async (label: string) => {
  const signedUp = await signUpTestBuyer(`${label}-${suffix}@example.test`);
  userIds.push(signedUp.userId);
  return signedUp;
};

beforeAll(async () => {
  [{ id: developerId }] = await db
    .insert(developers)
    .values({ name: `Request Test Developer ${suffix}` })
    .returning({ id: developers.id });
});

afterAll(async () => {
  await db
    .delete(developerUsers)
    .where(eq(developerUsers.developerId, developerId));
  await db.delete(developers).where(eq(developers.id, developerId));
  await db.delete(adminUsers).where(inArray(adminUsers.userId, userIds));
  await db.delete(users).where(inArray(users.id, userIds));
});

describe("requireDeveloperRequest", () => {
  it("is unauthenticated with no session", async () => {
    expect(await requireDeveloperRequest(request())).toBe("unauthenticated");
  });

  it("is forbidden for a buyer", async () => {
    const { cookie } = await signUp("buyer");
    expect(await requireDeveloperRequest(request(cookie))).toBe("forbidden");
  });

  it("is forbidden for an admin", async () => {
    const { userId, cookie } = await signUp("admin");
    await db.insert(adminUsers).values({ userId, permissionLevel: "owner" });
    expect(await requireDeveloperRequest(request(cookie))).toBe("forbidden");
  });

  it("is forbidden for an invited member, and allowed once active", async () => {
    const { userId, cookie } = await signUp("member");
    await db
      .insert(developerUsers)
      .values({ developerId, userId, status: "invited" });
    expect(await requireDeveloperRequest(request(cookie))).toBe("forbidden");

    await db
      .update(developerUsers)
      .set({ status: "active" })
      .where(eq(developerUsers.userId, userId));
    expect(await requireDeveloperRequest(request(cookie))).toEqual({
      userId,
      developerId,
    });
  });

  it("stops at once when access is removed, though the session is still valid", async () => {
    const { userId, cookie } = await signUp("removed");
    await db
      .insert(developerUsers)
      .values({ developerId, userId, status: "active" });
    expect(await requireDeveloperRequest(request(cookie))).toMatchObject({
      developerId,
    });
    await db.delete(developerUsers).where(eq(developerUsers.userId, userId));
    expect(await requireDeveloperRequest(request(cookie))).toBe("forbidden");
  });

  it("stops at once when the session is revoked", async () => {
    const { userId, cookie } = await signUp("revoked");
    await db
      .insert(developerUsers)
      .values({ developerId, userId, status: "active" });
    expect(await requireDeveloperRequest(request(cookie))).toMatchObject({
      developerId,
    });
    await db.delete(sessions).where(eq(sessions.userId, userId));
    expect(await requireDeveloperRequest(request(cookie))).toBe(
      "unauthenticated",
    );
  });
});

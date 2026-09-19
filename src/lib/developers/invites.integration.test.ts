import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { accounts, sessions, users, verifications } from "@/db/schema/auth";
import { adminUsers, developers, developerUsers } from "@/db/schema/catalog";
import { resolveAccountRole } from "@/lib/accounts/roles";
import {
  acceptDeveloperInvite,
  createDeveloperInvite,
  hashInviteToken,
  INVITE_TTL_MS,
  inspectInvite,
  InviteError,
  listDeveloperTeam,
  reissueDeveloperInvite,
  revokeDeveloperUser,
} from "./invites";

const hashPassword = async (password: string) => `hashed:${password}`;
const marker = randomUUID().slice(0, 8);
const emailFor = (label: string) =>
  `${label}-${marker}-${randomUUID().slice(0, 6)}@example.test`;
const PASSWORD = "a-long-enough-password";

let developerId: string;
let otherDeveloperId: string;
const emails: string[] = [];

const invite = async (label = "dev", developer = developerId) => {
  const email = emailFor(label);
  emails.push(email);
  return createDeveloperInvite(db, {
    developerId: developer,
    email,
    title: "Sales head",
  });
};

beforeAll(async () => {
  const [a, b] = await db
    .insert(developers)
    .values([
      { name: `Invite Test Developer ${marker}` },
      { name: `Invite Other Developer ${marker}` },
    ])
    .returning({ id: developers.id });
  developerId = a.id;
  otherDeveloperId = b.id;
});

afterAll(async () => {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.email, emails));
  const ids = rows.map((r) => r.id);
  for (const id of ids) {
    await db
      .delete(verifications)
      .where(eq(verifications.identifier, `developer-invite:${id}`));
  }
  if (ids.length) await db.delete(users).where(inArray(users.id, ids));
  await db
    .delete(developers)
    .where(inArray(developers.id, [developerId, otherDeveloperId]));
});

describe("createDeveloperInvite", () => {
  it("creates a passwordless user, a pending membership, and stores only the token's hash", async () => {
    const issued = await invite();
    expect(issued.token.length).toBeGreaterThanOrEqual(40);
    expect(issued.expiresAt.getTime() - Date.now()).toBeGreaterThan(
      INVITE_TTL_MS - 60_000,
    );

    expect(
      await db
        .select()
        .from(accounts)
        .where(eq(accounts.userId, issued.userId)),
    ).toEqual([]);
    const [link] = await db
      .select()
      .from(developerUsers)
      .where(eq(developerUsers.userId, issued.userId));
    expect(link).toMatchObject({
      developerId,
      status: "invited",
      title: "Sales head",
    });

    const [stored] = await db
      .select()
      .from(verifications)
      .where(eq(verifications.identifier, `developer-invite:${issued.userId}`));
    expect(stored.value).toBe(hashInviteToken(issued.token));
    expect(stored.value).not.toContain(issued.token);

    // Invited is not access: the role resolves as a buyer until accepted.
    expect(await resolveAccountRole(db, issued.userId)).toEqual({
      kind: "buyer",
    });
  });

  it("refuses a malformed email, an unknown profile, and any email that already has an account", async () => {
    await expect(
      createDeveloperInvite(db, { developerId, email: "not-an-email" }),
    ).rejects.toMatchObject({ code: "invalid_email" });
    await expect(
      createDeveloperInvite(db, {
        developerId: randomUUID(),
        email: emailFor("x"),
      }),
    ).rejects.toMatchObject({ code: "developer_not_found" });

    const first = await invite("taken");
    // Same profile, still pending: gets a fresh link and the old one dies.
    const again = await createDeveloperInvite(db, {
      developerId,
      email: first.email,
    });
    expect(again.developerUserId).toBe(first.developerUserId);
    expect(again.token).not.toBe(first.token);
    await expect(
      inspectInvite(db, { userId: first.userId, token: first.token }),
    ).rejects.toMatchObject({ code: "invalid_link" });

    // A different profile cannot claim someone already invited elsewhere.
    await expect(
      createDeveloperInvite(db, {
        developerId: otherDeveloperId,
        email: first.email,
      }),
    ).rejects.toMatchObject({ code: "account_exists" });
  });

  it("will not repurpose an admin's account", async () => {
    const admin = await invite("admin-target");
    await db
      .insert(adminUsers)
      .values({ userId: admin.userId, permissionLevel: "verifier" });
    await expect(
      createDeveloperInvite(db, {
        developerId: otherDeveloperId,
        email: admin.email,
      }),
    ).rejects.toMatchObject({ code: "account_exists" });
  });
});

describe("accepting an invitation", () => {
  it("activates the member, creates their credential once, and consumes the link", async () => {
    const issued = await invite("accept");
    const preview = await inspectInvite(db, {
      userId: issued.userId,
      token: issued.token,
    });
    expect(preview.email).toBe(issued.email);
    expect(preview.developerName).toMatch(/Invite Test Developer/);

    await acceptDeveloperInvite(db, {
      userId: issued.userId,
      token: issued.token,
      password: PASSWORD,
      name: "  Asha Patel ",
      hashPassword,
    });

    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, issued.userId));
    expect(account).toMatchObject({
      providerId: "credential",
      issuer: "local:credential",
      password: `hashed:${PASSWORD}`,
    });
    expect(
      (await db.select().from(users).where(eq(users.id, issued.userId)))[0]
        .name,
    ).toBe("Asha Patel");
    expect(await resolveAccountRole(db, issued.userId)).toEqual({
      kind: "developer",
      developerId,
    });
    expect(
      await db
        .select()
        .from(verifications)
        .where(
          eq(verifications.identifier, `developer-invite:${issued.userId}`),
        ),
    ).toEqual([]);

    // Replaying the same link fails, whoever tries.
    await expect(
      acceptDeveloperInvite(db, {
        userId: issued.userId,
        token: issued.token,
        password: PASSWORD,
        hashPassword,
      }),
    ).rejects.toMatchObject({ code: "invalid_link" });
    expect(
      await db
        .select()
        .from(accounts)
        .where(eq(accounts.userId, issued.userId)),
    ).toHaveLength(1);
  });

  it("gives every failure the same answer: wrong token, wrong user, expired, weak password aside", async () => {
    const issued = await invite("wrong");
    for (const attempt of [
      { userId: issued.userId, token: "not-the-token" },
      { userId: randomUUID().replaceAll("-", ""), token: issued.token },
      { userId: "", token: issued.token },
      { userId: issued.userId, token: "" },
    ]) {
      await expect(
        acceptDeveloperInvite(db, {
          ...attempt,
          password: PASSWORD,
          hashPassword,
        }),
      ).rejects.toMatchObject({ code: "invalid_link" });
    }
    const later = new Date(Date.now() + INVITE_TTL_MS + 1000);
    await expect(
      acceptDeveloperInvite(db, {
        userId: issued.userId,
        token: issued.token,
        password: PASSWORD,
        hashPassword,
        now: later,
      }),
    ).rejects.toMatchObject({ code: "invalid_link" });
    // Nothing was created by any failed attempt.
    expect(
      await db
        .select()
        .from(accounts)
        .where(eq(accounts.userId, issued.userId)),
    ).toEqual([]);
  });

  it("requires a strong enough password before touching anything", async () => {
    const issued = await invite("weak");
    await expect(
      acceptDeveloperInvite(db, {
        userId: issued.userId,
        token: issued.token,
        password: "short",
        hashPassword,
      }),
    ).rejects.toMatchObject({ code: "weak_password" });
    // The link is still usable afterwards.
    await expect(
      inspectInvite(db, { userId: issued.userId, token: issued.token }),
    ).resolves.toBeDefined();
  });

  it("lets only one of two simultaneous accepts succeed", async () => {
    const issued = await invite("race");
    const results = await Promise.allSettled([
      acceptDeveloperInvite(db, {
        userId: issued.userId,
        token: issued.token,
        password: PASSWORD,
        hashPassword,
      }),
      acceptDeveloperInvite(db, {
        userId: issued.userId,
        token: issued.token,
        password: PASSWORD,
        hashPassword,
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      await db
        .select()
        .from(accounts)
        .where(eq(accounts.userId, issued.userId)),
    ).toHaveLength(1);
  });
});

describe("reissue and revoke", () => {
  it("replaces a pending link, and refuses once the person has joined", async () => {
    const issued = await invite("reissue");
    const fresh = await reissueDeveloperInvite(db, {
      developerUserId: issued.developerUserId,
    });
    expect(fresh.token).not.toBe(issued.token);
    await expect(
      inspectInvite(db, { userId: issued.userId, token: issued.token }),
    ).rejects.toBeInstanceOf(InviteError);
    await acceptDeveloperInvite(db, {
      userId: issued.userId,
      token: fresh.token,
      password: PASSWORD,
      hashPassword,
    });
    await expect(
      reissueDeveloperInvite(db, { developerUserId: issued.developerUserId }),
    ).rejects.toMatchObject({ code: "member_not_found" });
  });

  it("withdraws a pending invitation so its link stops working", async () => {
    const issued = await invite("withdraw");
    await revokeDeveloperUser(db, { developerUserId: issued.developerUserId });
    await expect(
      inspectInvite(db, { userId: issued.userId, token: issued.token }),
    ).rejects.toBeInstanceOf(InviteError);
    await expect(
      acceptDeveloperInvite(db, {
        userId: issued.userId,
        token: issued.token,
        password: PASSWORD,
        hashPassword,
      }),
    ).rejects.toMatchObject({ code: "invalid_link" });
  });

  it("removes an active member's access immediately, including their open sessions", async () => {
    const issued = await invite("remove");
    await acceptDeveloperInvite(db, {
      userId: issued.userId,
      token: issued.token,
      password: PASSWORD,
      hashPassword,
    });
    await db.insert(sessions).values({
      id: randomUUID(),
      token: randomUUID(),
      userId: issued.userId,
      expiresAt: new Date(Date.now() + 3600_000),
    });
    expect(await resolveAccountRole(db, issued.userId)).toMatchObject({
      kind: "developer",
    });

    await revokeDeveloperUser(db, { developerUserId: issued.developerUserId });
    expect(await resolveAccountRole(db, issued.userId)).toEqual({
      kind: "buyer",
    });
    expect(
      await db
        .select()
        .from(sessions)
        .where(eq(sessions.userId, issued.userId)),
    ).toEqual([]);
    await expect(
      revokeDeveloperUser(db, { developerUserId: randomUUID() }),
    ).rejects.toMatchObject({
      code: "member_not_found",
    });
  });
});

describe("listDeveloperTeam", () => {
  it("shows each member's state, and the expiry only while an invitation is pending", async () => {
    const [{ id }] = await db
      .insert(developers)
      .values({ name: `Invite Team ${marker}` })
      .returning({ id: developers.id });
    try {
      const pending = await createDeveloperInvite(db, {
        developerId: id,
        email: emailFor("team-a"),
      });
      const joined = await createDeveloperInvite(db, {
        developerId: id,
        email: emailFor("team-b"),
      });
      emails.push(pending.email, joined.email);
      await acceptDeveloperInvite(db, {
        userId: joined.userId,
        token: joined.token,
        password: PASSWORD,
        hashPassword,
      });

      const team = await listDeveloperTeam(db, id);
      expect(team.map((m) => m.status).sort()).toEqual(["active", "invited"]);
      expect(
        team.find((m) => m.status === "invited")?.inviteExpiresAt,
      ).toBeInstanceOf(Date);
      expect(
        team.find((m) => m.status === "active")?.inviteExpiresAt,
      ).toBeNull();
      expect(await listDeveloperTeam(db, "not-a-uuid")).toEqual([]);
    } finally {
      const rows = await db
        .select({ userId: developerUsers.userId })
        .from(developerUsers)
        .where(eq(developerUsers.developerId, id));
      for (const r of rows)
        await db.delete(users).where(eq(users.id, r.userId));
      await db.delete(developers).where(eq(developers.id, id));
    }
  });
});

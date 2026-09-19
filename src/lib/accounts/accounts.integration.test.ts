import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { users } from "@/db/schema/auth";
import { adminUsers, developers, developerUsers } from "@/db/schema/catalog";
import { auth } from "@/lib/auth";
import { provisionPasswordAccount } from "./provision";
import { resolveAccountRole } from "./roles";
import { signInToPortal } from "./sign-in";

// `signInToPortal` reads request headers; outside a request there are none.
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const PASSWORD = "Test-password-1234";
const createdUserIds: string[] = [];
const createdDeveloperIds: string[] = [];

const newUser = async (label: string) => {
  const email = `${label}-${randomUUID()}@example.test`;
  const { userId } = await provisionPasswordAccount({
    email,
    password: PASSWORD,
    name: label,
  });
  createdUserIds.push(userId);
  return { userId, email };
};

const newDeveloperLink = async (
  userId: string,
  status: "active" | "invited" | "revoked",
) => {
  const [developer] = await db
    .insert(developers)
    .values({ name: `Test developer ${randomUUID()}` })
    .returning({ id: developers.id });
  createdDeveloperIds.push(developer.id);
  await db
    .insert(developerUsers)
    .values({ developerId: developer.id, userId, status });
  return developer.id;
};

beforeEach(() => vi.clearAllMocks());

afterAll(async () => {
  // developer_users / admin_users cascade from users; developers do not.
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
  for (const id of createdDeveloperIds) {
    await db.delete(developers).where(eq(developers.id, id));
  }
});

describe("resolveAccountRole", () => {
  it("resolves an admin, with their permission level", async () => {
    const { userId } = await newUser("admin");
    await db.insert(adminUsers).values({ userId, permissionLevel: "verifier" });

    expect(await resolveAccountRole(db, userId)).toEqual({
      kind: "admin",
      permissionLevel: "verifier",
    });
  });

  it("resolves an active developer to their linked profile", async () => {
    const { userId } = await newUser("dev");
    const developerId = await newDeveloperLink(userId, "active");

    expect(await resolveAccountRole(db, userId)).toEqual({
      kind: "developer",
      developerId,
    });
  });

  it.each(["invited", "revoked"] as const)(
    "does not treat a %s developer link as portal access",
    async (status) => {
      const { userId } = await newUser("dev");
      await newDeveloperLink(userId, status);

      expect(await resolveAccountRole(db, userId)).toEqual({ kind: "buyer" });
    },
  );

  it("resolves everyone else to a buyer", async () => {
    const { userId } = await newUser("buyer");
    expect(await resolveAccountRole(db, userId)).toEqual({ kind: "buyer" });
  });
});

describe("signInToPortal", () => {
  it("lets an admin in at the admin door only", async () => {
    const { userId, email } = await newUser("admin");
    await db.insert(adminUsers).values({ userId, permissionLevel: "owner" });

    expect(await signInToPortal("admin", email, PASSWORD)).toBe(true);
    expect(await signInToPortal("developer", email, PASSWORD)).toBe(false);
  });

  it("lets an active developer in at the developer door only", async () => {
    const { userId, email } = await newUser("dev");
    await newDeveloperLink(userId, "active");

    expect(await signInToPortal("developer", email, PASSWORD)).toBe(true);
    expect(await signInToPortal("admin", email, PASSWORD)).toBe(false);
  });

  it("refuses a wrong password, an unknown email, and an empty form alike", async () => {
    const { userId, email } = await newUser("admin");
    await db.insert(adminUsers).values({ userId, permissionLevel: "owner" });

    expect(await signInToPortal("admin", email, "wrong-password-999")).toBe(
      false,
    );
    expect(
      await signInToPortal(
        "admin",
        `nobody-${randomUUID()}@example.test`,
        PASSWORD,
      ),
    ).toBe(false);
    expect(await signInToPortal("admin", "", "")).toBe(false);
  });

  it("refuses an invited developer who has not been activated", async () => {
    const { userId, email } = await newUser("dev");
    await newDeveloperLink(userId, "invited");

    expect(await signInToPortal("developer", email, PASSWORD)).toBe(false);
  });

  it("refuses a buyer with no portal role", async () => {
    const { email } = await newUser("buyer");
    expect(await signInToPortal("developer", email, PASSWORD)).toBe(false);
    expect(await signInToPortal("admin", email, PASSWORD)).toBe(false);
  });
});

describe("public sign-up", () => {
  it("is refused, so an account can only come from provisioning", async () => {
    await expect(
      auth.api.signUpEmail({
        body: {
          email: `open-${randomUUID()}@example.test`,
          password: PASSWORD,
          name: "Nobody",
        },
      }),
    ).rejects.toThrow();
  });
});

describe("provisionPasswordAccount", () => {
  it("refuses an email that already has an account", async () => {
    const { email } = await newUser("dup");
    await expect(
      provisionPasswordAccount({ email, password: PASSWORD, name: "Again" }),
    ).rejects.toThrow(/already exists/);
  });
});

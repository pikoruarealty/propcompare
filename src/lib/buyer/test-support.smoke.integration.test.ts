import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { users } from "@/db/schema/auth";
import { requireBuyerSession } from "./session";
import { signUpTestBuyer, verifyTestBuyerPhone } from "./test-support";

const createdUserIds: string[] = [];

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

describe("signUpTestBuyer smoke test", () => {
  it("produces a cookie requireBuyerSession accepts", async () => {
    const email = `smoke-${randomUUID()}@example.test`;
    const { userId, cookie } = await signUpTestBuyer(email);
    createdUserIds.push(userId);

    const request = new NextRequest(
      "http://localhost/api/v1/saved-properties",
      {
        headers: { cookie },
      },
    );
    const session = await requireBuyerSession(request);
    expect(session).not.toBeNull();
    expect(session?.userId).toBe(userId);
    expect(session?.phoneNumberVerified).toBe(false);

    await verifyTestBuyerPhone(userId);
    const session2 = await requireBuyerSession(request);
    expect(session2?.phoneNumberVerified).toBe(true);
  });

  it("requireBuyerSession returns null with no cookie", async () => {
    const request = new NextRequest("http://localhost/api/v1/saved-properties");
    const session = await requireBuyerSession(request);
    expect(session).toBeNull();
  });
});

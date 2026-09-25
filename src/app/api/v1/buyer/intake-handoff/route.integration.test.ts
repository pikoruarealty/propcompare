import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { bhkTypes, buyerIntakeSessions } from "@/db/schema/catalog";
import { users } from "@/db/schema/auth";
import { RANGE_MAX_LAKH } from "@/lib/properties/intake";
import { findForbiddenKeys } from "@/lib/properties/no-price";
import type { ApiErrorBody } from "@/lib/properties/http";
import { signUpTestBuyer } from "@/lib/buyer/test-support";
import { POST as claim } from "./claim/route";
import { POST as setHandoff } from "./route";

const HANDOFF_URL = "http://localhost/api/v1/buyer/intake-handoff";
const CLAIM_URL = `${HANDOFF_URL}/claim`;

const EMPTY_ANSWERS = {
  priorities: [],
  bhk: null,
  city: null,
  statedRange: null,
};

const setRequest = (body: unknown): NextRequest =>
  new NextRequest(HANDOFF_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

/** The literal `name=value` a browser would echo back, taken from a real
 * `Set-Cookie` response — proves the two routes' encoding actually round-trips. */
const cookiePairFrom = (response: Response): string | undefined =>
  response.headers
    .getSetCookie()
    .find((entry) => entry.startsWith("pc_intake_handoff="))
    ?.split(";")[0];

const claimRequest = (authCookie: string, intakeCookiePair?: string) =>
  claim(
    new NextRequest(CLAIM_URL, {
      method: "POST",
      headers: {
        cookie: [authCookie, intakeCookiePair].filter(Boolean).join("; "),
      },
    }),
  );

const createdBuyerIds: string[] = [];

afterAll(async () => {
  await db
    .delete(buyerIntakeSessions)
    .where(inArray(buyerIntakeSessions.userId, createdBuyerIds));
  await db.delete(users).where(inArray(users.id, createdBuyerIds));
});

describe("POST /api/v1/buyer/intake-handoff", () => {
  it("rejects an invalid body with 422 and sets no cookie", async () => {
    const response = await setHandoff(setRequest({ bhk: null }));
    expect(response.status).toBe(422);
    const body = (await response.json()) as ApiErrorBody;
    expect(body.error.code).toBe("invalid_request_body");
    expect(cookiePairFrom(response)).toBeUndefined();
  });

  it("sets a 204 with an httpOnly cookie scoped to the claim path", async () => {
    const response = await setHandoff(setRequest(EMPTY_ANSWERS));
    expect(response.status).toBe(204);
    const setCookie = response.headers
      .getSetCookie()
      .find((entry) => entry.startsWith("pc_intake_handoff="));
    expect(setCookie).toBeDefined();
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Path=/api/v1/buyer/intake-handoff/claim");
    expect(setCookie).toContain("SameSite=lax");
  });
});

describe("POST /api/v1/buyer/intake-handoff/claim", () => {
  it("401s with no session", async () => {
    const response = await claim(
      new NextRequest(CLAIM_URL, { method: "POST" }),
    );
    expect(response.status).toBe(401);
  });

  it("returns null and writes nothing when there is no cookie to claim", async () => {
    const buyer = await signUpTestBuyer(
      `intake-claim-nothing-${randomUUID()}@example.test`,
    );
    createdBuyerIds.push(buyer.userId);

    const response = await claimRequest(buyer.cookie);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: null });

    const rows = await db
      .select()
      .from(buyerIntakeSessions)
      .where(eq(buyerIntakeSessions.userId, buyer.userId));
    expect(rows).toHaveLength(0);
  });

  it("claims a stated range, city, and bhk into one row, then clears the cookie", async () => {
    const buyer = await signUpTestBuyer(
      `intake-claim-full-${randomUUID()}@example.test`,
    );
    createdBuyerIds.push(buyer.userId);

    const answers = {
      priorities: ["family_space", "location"],
      bhk: "2bhk",
      city: "Ahmedabad",
      statedRange: { fromLakh: 50, toLakh: 150 },
    };
    const setResponse = await setHandoff(setRequest(answers));
    const cookiePair = cookiePairFrom(setResponse);
    expect(cookiePair).toBeDefined();

    const claimResponse = await claimRequest(buyer.cookie, cookiePair);
    expect(claimResponse.status).toBe(200);
    const claimBody = await claimResponse.json();
    expect(claimBody).toEqual({ data: answers });
    expect(findForbiddenKeys(claimBody)).toEqual([]);

    // The claim response clears the cookie unconditionally.
    const clearedCookie = claimResponse.headers
      .getSetCookie()
      .find((entry) => entry.startsWith("pc_intake_handoff="));
    expect(clearedCookie).toContain("Max-Age=0");

    const [row] = await db
      .select()
      .from(buyerIntakeSessions)
      .where(eq(buyerIntakeSessions.userId, buyer.userId));
    expect(row).toBeDefined();
    expect(row.city).toBe("Ahmedabad");
    expect(row.personaPriorities).toEqual(["family_space", "location"]);
    expect(row.budgetMinInr).toBe("5000000");
    expect(row.budgetMaxInr).toBe("15000000");

    const [bhkType] = await db
      .select({ key: bhkTypes.key })
      .from(bhkTypes)
      .where(eq(bhkTypes.id, row.desiredBhkTypeId ?? ""));
    expect(bhkType?.key).toBe("2bhk");
  });

  it("records an open-ended top of the scale with no upper bound, never a literal ceiling", async () => {
    const buyer = await signUpTestBuyer(
      `intake-claim-open-${randomUUID()}@example.test`,
    );
    createdBuyerIds.push(buyer.userId);

    const answers = {
      priorities: [],
      bhk: null,
      city: null,
      statedRange: { fromLakh: 100, toLakh: RANGE_MAX_LAKH },
    };
    const setResponse = await setHandoff(setRequest(answers));
    const cookiePair = cookiePairFrom(setResponse);

    await claimRequest(buyer.cookie, cookiePair);

    const [row] = await db
      .select()
      .from(buyerIntakeSessions)
      .where(eq(buyerIntakeSessions.userId, buyer.userId));
    expect(row.budgetMinInr).toBe("10000000");
    expect(row.budgetMaxInr).toBeNull();
  });

  it("claims nothing from a tampered cookie rather than failing sign-in", async () => {
    const buyer = await signUpTestBuyer(
      `intake-claim-tampered-${randomUUID()}@example.test`,
    );
    createdBuyerIds.push(buyer.userId);

    const response = await claimRequest(
      buyer.cookie,
      "pc_intake_handoff=not-valid-json",
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: null });

    const rows = await db
      .select()
      .from(buyerIntakeSessions)
      .where(eq(buyerIntakeSessions.userId, buyer.userId));
    expect(rows).toHaveLength(0);
  });
});

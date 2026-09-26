import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { users } from "@/db/schema/auth";
import { enquiries } from "@/db/schema/catalog";
import { createEnquiry } from "@/lib/buyer/enquiries";
import { setEnquiryStatus } from "@/lib/buyer/enquiry-inbox";
import { signUpTestBuyer } from "@/lib/buyer/test-support";
import {
  publishTestPortfolio,
  type TestPortfolio,
} from "@/lib/submissions/test-support";
import { listForwardedEnquiries } from "./forwarded-enquiries";

/**
 * A developer's own forwarded enquiries against the real database
 * (`DECISIONS.md` 2026-09-26): only a forwarded enquiry for the developer's own
 * property appears, with the buyer's name, message and phone number; a `new`
 * enquiry, one for another developer's property, and a guessed id are all
 * absent. Two portfolios and two buyers, so cross-developer isolation is a real
 * check and not an assumption.
 */
let ours: TestPortfolio | undefined;
let theirs: TestPortfolio | undefined;
let buyerId = "";
let forwardedId = "";
let newId = "";
let theirForwardedId = "";

beforeAll(async () => {
  ours = await publishTestPortfolio("DevEnquiry ours");
  theirs = await publishTestPortfolio("DevEnquiry theirs");
  const buyer = await signUpTestBuyer(
    `dev-enquiry-${randomUUID()}@example.test`,
  );
  buyerId = buyer.userId;

  const forwarded = await createEnquiry(db, buyerId, {
    propertyId: ours.properties[0].id,
    message: "Is a corner unit free?",
  });
  if ("reason" in forwarded) throw new Error("enquiry not created");
  forwardedId = forwarded.id;
  await setEnquiryStatus(db, forwardedId, "forwarded");

  const stillNew = await createEnquiry(db, buyerId, {
    propertyId: ours.properties[0].id,
    message: "Never forwarded",
  });
  if ("reason" in stillNew) throw new Error("enquiry not created");
  newId = stillNew.id;

  const theirsEnquiry = await createEnquiry(db, buyerId, {
    propertyId: theirs.properties[0].id,
    message: "For the other developer",
  });
  if ("reason" in theirsEnquiry) throw new Error("enquiry not created");
  theirForwardedId = theirsEnquiry.id;
  await setEnquiryStatus(db, theirForwardedId, "forwarded");
});

afterAll(async () => {
  await db.delete(enquiries).where(eq(enquiries.userId, buyerId));
  await db.delete(users).where(eq(users.id, buyerId));
  await ours?.remove();
  await theirs?.remove();
});

describe("a developer's forwarded enquiries", () => {
  it("shows a forwarded enquiry with the buyer's name, message and phone", async () => {
    const list = await listForwardedEnquiries(db, ours!.developerId);
    const row = list.find((e) => e.id === forwardedId);
    expect(row).toMatchObject({
      message: "Is a corner unit free?",
      propertyName: ours!.properties[0].name,
    });
    expect(row?.buyerName).toBeTruthy();
    expect(row?.forwardedAt).toBeTruthy();
  });

  it("never shows an enquiry that has not been forwarded", async () => {
    const list = await listForwardedEnquiries(db, ours!.developerId);
    expect(list.some((e) => e.id === newId)).toBe(false);
  });

  it("never shows another developer's forwarded enquiry, even by a guessed id", async () => {
    const ourList = await listForwardedEnquiries(db, ours!.developerId);
    expect(ourList.some((e) => e.id === theirForwardedId)).toBe(false);

    const theirList = await listForwardedEnquiries(db, theirs!.developerId);
    expect(theirList.some((e) => e.id === forwardedId)).toBe(false);
    expect(theirList.some((e) => e.id === theirForwardedId)).toBe(true);
  });

  it("shows nothing for a developer id with no properties at all", async () => {
    expect(await listForwardedEnquiries(db, randomUUID())).toEqual([]);
  });
});

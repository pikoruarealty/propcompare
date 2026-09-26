import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { users } from "@/db/schema/auth";
import { enquiries } from "@/db/schema/catalog";
import {
  publishTestPortfolio,
  type TestPortfolio,
} from "@/lib/submissions/test-support";
import { createEnquiry } from "./enquiries";
import { listEnquiryInbox, setEnquiryStatus } from "./enquiry-inbox";
import { signUpTestBuyer } from "./test-support";

/**
 * The admin inbox against the real database: an enquiry shows with its property
 * and the buyer to contact, newest first, and its status can move. Uses one
 * throwaway buyer and removes what it made.
 */
let userId = "";
let propertyId = "";
let enquiryId = "";
let portfolio: TestPortfolio | undefined;

beforeAll(async () => {
  const buyer = await signUpTestBuyer(`inbox-${randomUUID()}@example.test`);
  userId = buyer.userId;
  // Its own listed property, so the test does not depend on what else the
  // database holds (2026-09-26 — Deep: it failed on a freshly seeded one).
  portfolio = await publishTestPortfolio("Inbox");
  propertyId = portfolio.properties[0].id;
  const created = await createEnquiry(db, userId, {
    propertyId,
    message: "Is a corner unit free?",
  });
  if ("reason" in created) throw new Error("enquiry not created");
  enquiryId = created.id;
});

afterAll(async () => {
  await db.delete(enquiries).where(eq(enquiries.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
  await portfolio?.remove();
});

describe("the enquiry inbox", () => {
  it("lists an enquiry with its property, message and the buyer to contact", async () => {
    const inbox = await listEnquiryInbox(db);
    const row = inbox.find((e) => e.id === enquiryId);

    expect(row).toBeDefined();
    expect(row?.status).toBe("new");
    expect(row?.message).toBe("Is a corner unit free?");
    expect(row?.propertyName).not.toBe("");
    expect(row?.buyerEmail).toContain("@example.test");
    // The developer it could be forwarded to, and nothing forwarded yet.
    expect(row?.developerName).not.toBe("");
    expect(row?.forwardedAt).toBeNull();
  });

  it("moves an enquiry between statuses, and reports an unknown id", async () => {
    expect(await setEnquiryStatus(db, enquiryId, "contacted")).toBe(true);
    expect(
      (await listEnquiryInbox(db)).find((e) => e.id === enquiryId)?.status,
    ).toBe("contacted");
    expect(await setEnquiryStatus(db, randomUUID(), "closed")).toBe(false);
  });

  it("stamps when an enquiry is forwarded to the developer, and keeps the stamp when it moves on", async () => {
    const before = Date.now();
    expect(await setEnquiryStatus(db, enquiryId, "forwarded")).toBe(true);
    const forwarded = (await listEnquiryInbox(db)).find(
      (e) => e.id === enquiryId,
    );
    expect(forwarded?.status).toBe("forwarded");
    expect(new Date(forwarded!.forwardedAt!).getTime()).toBeGreaterThanOrEqual(
      before - 1000,
    );

    // The admin can close it themselves; the record of the forwarding stays.
    expect(await setEnquiryStatus(db, enquiryId, "closed")).toBe(true);
    const closed = (await listEnquiryInbox(db)).find((e) => e.id === enquiryId);
    expect(closed?.status).toBe("closed");
    expect(closed?.forwardedAt).toBe(forwarded?.forwardedAt);
  });
});

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { users } from "@/db/schema/auth";
import { enquiries, properties } from "@/db/schema/catalog";
import { isListed } from "@/lib/properties/visibility";
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

beforeAll(async () => {
  const buyer = await signUpTestBuyer(`inbox-${randomUUID()}@example.test`);
  userId = buyer.userId;
  const [property] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(isListed)
    .limit(1);
  if (!property) throw new Error("The seeded database has no listed property.");
  propertyId = property.id;
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
  });

  it("moves an enquiry between statuses, and reports an unknown id", async () => {
    expect(await setEnquiryStatus(db, enquiryId, "contacted")).toBe(true);
    expect(
      (await listEnquiryInbox(db)).find((e) => e.id === enquiryId)?.status,
    ).toBe("contacted");
    expect(await setEnquiryStatus(db, randomUUID(), "closed")).toBe(false);
  });
});

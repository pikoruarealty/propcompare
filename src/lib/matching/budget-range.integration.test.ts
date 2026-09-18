import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { serviceDb, serviceDbClient } from "@/db/service";
import {
  developers,
  properties,
  propertyRevisions,
  propertySubmissionFields,
  propertySubmissions,
  unitVariants,
} from "@/db/schema/catalog";
import { users } from "@/db/schema/auth";
import { unitPriceHistory } from "@/db/schema/private";
import { publishSubmission } from "@/lib/submissions/publisher";
import { findForbiddenKeys } from "@/lib/properties/no-price";
import { matchPropertiesByBudgetRange } from "./budget-range";

/**
 * Database-backed tests for the Phase 3 private budget-range matcher.
 *
 * Every property here is published through the real `publishSubmission`
 * transaction, exactly as `src/lib/submissions/publisher.integration.test.ts`
 * does — the one-write-path rule binds tests too. Prices are written
 * separately with the service connection, matching how
 * `publisher.integration.test.ts` proves the bucket-mapping view. Requires
 * `DATABASE_URL` and `DATABASE_SERVICE_URL`.
 */

const testUserId = `budget-matcher-user-${randomUUID()}`;

let developerId: string;
const createdSubmissionIds: string[] = [];
const createdPropertyIds: string[] = [];

const publishVariantWithPrice = async (
  variantName: string,
  priceInr: string,
): Promise<{ propertyId: string; unitVariantId: string }> => {
  const propertyName = `Budget Matcher Test ${randomUUID()}`;
  const [submission] = await db
    .insert(propertySubmissions)
    .values({
      developerId,
      submittedBy: testUserId,
      reviewedBy: testUserId,
      source: "manual_form",
      status: "approved",
      payload: {},
    })
    .returning({ id: propertySubmissions.id });
  createdSubmissionIds.push(submission.id);

  const fields: Record<string, unknown> = {
    "property.name": propertyName,
    "property.type": "apartment",
    "property.city": "Ahmedabad",
    "property.locality": "Test Locality",
    unit_variants: [
      {
        variantName,
        bhkTypeKey: "3bhk",
        areas: [{ basis: "carpet", areaSqft: 1400 }],
      },
    ],
  };

  await db.insert(propertySubmissionFields).values(
    Object.entries(fields).map(([fieldKey, value]) => ({
      submissionId: submission.id,
      fieldKey,
      value,
      reviewStatus: "confirmed" as const,
    })),
  );

  const result = await publishSubmission({
    submissionId: submission.id,
    actorUserId: testUserId,
    actorRole: "owner",
  });
  createdPropertyIds.push(result.propertyId);

  const [variant] = await db
    .select()
    .from(unitVariants)
    .where(eq(unitVariants.propertyId, result.propertyId));

  await serviceDb.insert(unitPriceHistory).values({
    unitVariantId: variant.id,
    priceInr,
    effectiveFrom: "2026-09-01",
    source: "admin_manual",
    createdBy: testUserId,
  });

  return { propertyId: result.propertyId, unitVariantId: variant.id };
};

beforeAll(async () => {
  await db.insert(users).values({
    id: testUserId,
    name: "Budget Matcher Test User",
    email: `${testUserId}@example.test`,
  });
  const [developer] = await db
    .insert(developers)
    .values({ name: `Budget Matcher Test Developer ${randomUUID()}` })
    .returning({ id: developers.id });
  developerId = developer.id;
});

afterAll(async () => {
  await serviceDb
    .delete(unitPriceHistory)
    .where(eq(unitPriceHistory.createdBy, testUserId));
  await db
    .delete(propertyRevisions)
    .where(inArray(propertyRevisions.submissionId, createdSubmissionIds));
  await db
    .delete(propertySubmissions)
    .where(inArray(propertySubmissions.id, createdSubmissionIds));
  await db.delete(properties).where(inArray(properties.id, createdPropertyIds));
  await db.delete(developers).where(eq(developers.id, developerId));
  await db.delete(users).where(eq(users.id, testUserId));
  await serviceDbClient.end({ timeout: 5 });
});

describe("matchPropertiesByBudgetRange", () => {
  // Buyer range ₹3–4 crore -> inclusive private match range is
  // ₹2.4 crore (24000000) through ₹4.8 crore (48000000), per the
  // 2026-09-01 DECISIONS.md entry and the tasklist's own worked example.
  const buyerRange = { minInr: 30_000_000, maxInr: 40_000_000 };

  it("includes a unit priced exactly at the lower inclusive boundary", async () => {
    const { propertyId, unitVariantId } = await publishVariantWithPrice(
      "Lower boundary unit",
      "24000000",
    );
    const matches = await matchPropertiesByBudgetRange(serviceDb, buyerRange);
    expect(matches).toContainEqual({ propertyId, unitVariantId });
  });

  it("excludes a unit priced one rupee below the lower boundary", async () => {
    const { propertyId, unitVariantId } = await publishVariantWithPrice(
      "Just below lower boundary unit",
      "23999999",
    );
    const matches = await matchPropertiesByBudgetRange(serviceDb, buyerRange);
    expect(matches).not.toContainEqual({ propertyId, unitVariantId });
  });

  it("includes a unit priced exactly at the upper inclusive boundary", async () => {
    const { propertyId, unitVariantId } = await publishVariantWithPrice(
      "Upper boundary unit",
      "48000000",
    );
    const matches = await matchPropertiesByBudgetRange(serviceDb, buyerRange);
    expect(matches).toContainEqual({ propertyId, unitVariantId });
  });

  it("excludes a unit priced one rupee above the upper boundary", async () => {
    const { propertyId, unitVariantId } = await publishVariantWithPrice(
      "Just above upper boundary unit",
      "48000001",
    );
    const matches = await matchPropertiesByBudgetRange(serviceDb, buyerRange);
    expect(matches).not.toContainEqual({ propertyId, unitVariantId });
  });

  it("returns only property/unit identifiers, never price data", async () => {
    await publishVariantWithPrice("Shape check unit", "35000000");
    const matches = await matchPropertiesByBudgetRange(serviceDb, buyerRange);
    expect(matches.length).toBeGreaterThan(0);
    expect(findForbiddenKeys(matches)).toEqual([]);
    for (const match of matches) {
      expect(Object.keys(match).sort()).toEqual([
        "propertyId",
        "unitVariantId",
      ]);
    }
  });

  it("denies the normal application connection access to the private schema", async () => {
    await expect(
      db.execute("select count(*) from private.unit_price_history"),
    ).rejects.toThrow();
  });
});

describe("matchPropertiesByBudgetRange — maxUnbounded", () => {
  it("includes a unit priced far above any stated max, as long as it's within the catalog's current max", async () => {
    // The anchor raises the catalog's current max to at least ₹5 crore; the
    // target sits below the anchor but far above what any bounded [min*0.80,
    // max*1.20] search in this suite would reach, proving the resolved
    // ceiling tracks live data rather than a hardcoded stand-in.
    const anchor = await publishVariantWithPrice(
      "Unbounded anchor unit",
      "500000000",
    );
    const target = await publishVariantWithPrice(
      "Unbounded target unit",
      "450000000",
    );
    const matches = await matchPropertiesByBudgetRange(serviceDb, {
      minInr: 30_000_000,
      maxUnbounded: true,
    });
    expect(matches).toContainEqual(target);
    expect(matches).toContainEqual(anchor);
  });

  it("still enforces the inclusive lower bound", async () => {
    const { propertyId, unitVariantId } = await publishVariantWithPrice(
      "Unbounded below-lower-bound unit",
      "1000000",
    );
    const matches = await matchPropertiesByBudgetRange(serviceDb, {
      minInr: 30_000_000,
      maxUnbounded: true,
    });
    expect(matches).not.toContainEqual({ propertyId, unitVariantId });
  });

  it("returns only identifiers, never the resolved ceiling or any price data", async () => {
    await publishVariantWithPrice("Unbounded shape-check unit", "60000000");
    const matches = await matchPropertiesByBudgetRange(serviceDb, {
      minInr: 30_000_000,
      maxUnbounded: true,
    });
    expect(matches.length).toBeGreaterThan(0);
    expect(findForbiddenKeys(matches)).toEqual([]);
    for (const match of matches) {
      expect(Object.keys(match).sort()).toEqual([
        "propertyId",
        "unitVariantId",
      ]);
    }
  });
});

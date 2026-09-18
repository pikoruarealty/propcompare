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
import { matchPublishedProperties } from "./discovery";

/**
 * Database-backed tests for `POST /api/v1/discovery/matches`'s query layer.
 * Every fixture is published through the real `publishSubmission` transaction
 * and priced through the service connection, matching
 * `budget-range.integration.test.ts`'s pattern. Requires `DATABASE_URL` and
 * `DATABASE_SERVICE_URL`.
 */

const testUserId = `discovery-matcher-user-${randomUUID()}`;

let developerId: string;
const createdSubmissionIds: string[] = [];
const createdPropertyIds: string[] = [];

const publishPricedProperty = async (options: {
  city: string;
  bhkTypeKey: string;
  priceInr: string;
}): Promise<{ propertyId: string }> => {
  const propertyName = `Discovery Matcher Test ${randomUUID()}`;
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
    "property.city": options.city,
    "property.locality": "Test Locality",
    unit_variants: [
      {
        variantName: "Test Variant",
        bhkTypeKey: options.bhkTypeKey,
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
    priceInr: options.priceInr,
    effectiveFrom: "2026-09-01",
    source: "admin_manual",
    createdBy: testUserId,
  });

  return { propertyId: result.propertyId };
};

beforeAll(async () => {
  await db.insert(users).values({
    id: testUserId,
    name: "Discovery Matcher Test User",
    email: `${testUserId}@example.test`,
  });
  const [developer] = await db
    .insert(developers)
    .values({ name: `Discovery Matcher Test Developer ${randomUUID()}` })
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

describe("matchPublishedProperties", () => {
  const buyerRange = { minInr: 30_000_000, maxInr: 40_000_000 };

  it("returns a published property whose current price is within range", async () => {
    const { propertyId } = await publishPricedProperty({
      city: "Ahmedabad",
      bhkTypeKey: "3bhk",
      priceInr: "35000000",
    });
    const result = await matchPublishedProperties(db, serviceDb, {
      ...buyerRange,
      page: 1,
      pageSize: 20,
    });
    expect(result.data.map((row) => row.id)).toContain(propertyId);
  });

  it("excludes a published property priced outside the range", async () => {
    const { propertyId } = await publishPricedProperty({
      city: "Ahmedabad",
      bhkTypeKey: "3bhk",
      priceInr: "10000000",
    });
    const result = await matchPublishedProperties(db, serviceDb, {
      ...buyerRange,
      page: 1,
      pageSize: 20,
    });
    expect(result.data.map((row) => row.id)).not.toContain(propertyId);
  });

  it("narrows matched results by city", async () => {
    const { propertyId } = await publishPricedProperty({
      city: "Gandhinagar",
      bhkTypeKey: "3bhk",
      priceInr: "35000000",
    });
    const wrongCity = await matchPublishedProperties(db, serviceDb, {
      ...buyerRange,
      city: "Ahmedabad",
      page: 1,
      pageSize: 20,
    });
    expect(wrongCity.data.map((row) => row.id)).not.toContain(propertyId);

    const rightCity = await matchPublishedProperties(db, serviceDb, {
      ...buyerRange,
      city: "Gandhinagar",
      page: 1,
      pageSize: 20,
    });
    expect(rightCity.data.map((row) => row.id)).toContain(propertyId);
  });

  it("narrows matched results by bhk", async () => {
    const { propertyId } = await publishPricedProperty({
      city: "Ahmedabad",
      bhkTypeKey: "4bhk",
      priceInr: "35000000",
    });
    const wrongBhk = await matchPublishedProperties(db, serviceDb, {
      ...buyerRange,
      bhk: "2bhk",
      page: 1,
      pageSize: 20,
    });
    expect(wrongBhk.data.map((row) => row.id)).not.toContain(propertyId);

    const rightBhk = await matchPublishedProperties(db, serviceDb, {
      ...buyerRange,
      bhk: "4bhk",
      page: 1,
      pageSize: 20,
    });
    expect(rightBhk.data.map((row) => row.id)).toContain(propertyId);
  });

  it("returns an honest empty result when nothing matches, not an error", async () => {
    const result = await matchPublishedProperties(db, serviceDb, {
      minInr: 1,
      maxInr: 2,
      page: 1,
      pageSize: 20,
    });
    expect(result).toEqual({
      data: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    });
  });

  it("carries no forbidden (price/bound/bucket) keys", async () => {
    await publishPricedProperty({
      city: "Ahmedabad",
      bhkTypeKey: "3bhk",
      priceInr: "35000000",
    });
    const result = await matchPublishedProperties(db, serviceDb, {
      ...buyerRange,
      page: 1,
      pageSize: 20,
    });
    expect(result.data.length).toBeGreaterThan(0);
    expect(findForbiddenKeys(result)).toEqual([]);
  });
});

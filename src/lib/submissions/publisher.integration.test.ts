import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  amenityCatalog,
  developers,
  properties,
  propertyAmenities,
  propertyRevisions,
  propertySpecifications,
  propertySubmissionFields,
  propertySubmissions,
  specificationCatalog,
  unitAreas,
  unitVariants,
} from "@/db/schema/catalog";
import { users } from "@/db/schema/auth";
import { budgetBuckets, unitPriceHistory } from "@/db/schema/private";
import { publishSubmission, SubmissionPublishError } from "./publisher";
import { SubmissionTransitionError } from "./transitions";

if (!process.env.DATABASE_SERVICE_URL) {
  throw new Error("DATABASE_SERVICE_URL is required for this test suite");
}

const serviceClient = postgres(process.env.DATABASE_SERVICE_URL);
const serviceDb = drizzle(serviceClient);

const testUserId = `test-user-${randomUUID()}`;
let developerId: string;

const createdSubmissionIds: string[] = [];
const createdPropertyIds: string[] = [];

const insertSubmission = async (params: {
  propertyId?: string;
  developerId?: string | null;
  status: "draft" | "approved";
  fields: Record<string, { value: unknown; reviewStatus?: string }>;
}): Promise<string> => {
  const [submission] = await db
    .insert(propertySubmissions)
    .values({
      propertyId: params.propertyId ?? null,
      developerId: params.developerId ?? null,
      submittedBy: testUserId,
      reviewedBy: testUserId,
      source: "manual_form",
      status: params.status,
      payload: {},
    })
    .returning({ id: propertySubmissions.id });
  createdSubmissionIds.push(submission.id);

  const fieldEntries = Object.entries(params.fields);
  if (fieldEntries.length > 0) {
    await db.insert(propertySubmissionFields).values(
      fieldEntries.map(([fieldKey, { value, reviewStatus }]) => ({
        submissionId: submission.id,
        fieldKey,
        value,
        reviewStatus: (reviewStatus ?? "confirmed") as
          | "auto_accepted"
          | "needs_review"
          | "confirmed"
          | "edited"
          | "rejected",
      })),
    );
  }

  return submission.id;
};

beforeAll(async () => {
  await db.insert(users).values({
    id: testUserId,
    name: "Submissions Test User",
    email: `${testUserId}@example.test`,
  });
  const [developer] = await db
    .insert(developers)
    .values({ name: `Test Developer ${randomUUID()}` })
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
  await serviceClient.end({ timeout: 5 });
});

describe("publishSubmission", () => {
  it("publishes a new property from an approved submission, backfilling not_stated catalog rows and writing a revision", async () => {
    const propertyName = `Test Skyline Residences ${randomUUID()}`;
    const submissionId = await insertSubmission({
      developerId,
      status: "approved",
      fields: {
        "property.name": { value: propertyName },
        "property.type": { value: "apartment" },
        "property.city": { value: "Ahmedabad" },
        "property.locality": { value: "Test Locality" },
        "property.possession_status": { value: "ready_to_move" },
        "property.amenities": { value: ["swimming_pool", "clubhouse"] },
        "property.specifications.flooring": {
          value: "Vitrified tiles",
        },
        unit_variants: {
          value: [
            {
              variantName: "3 BHK - Type A",
              bhkTypeKey: "3bhk",
              layoutTypeKey: "duplex",
              totalUnitsOfVariant: 24,
              areas: [{ basis: "carpet", areaSqft: 1250 }],
            },
          ],
        },
      },
    });

    const result = await publishSubmission({
      submissionId,
      actorUserId: testUserId,
      actorRole: "owner",
    });
    createdPropertyIds.push(result.propertyId);

    expect(result.isNewProperty).toBe(true);

    const [property] = await db
      .select()
      .from(properties)
      .where(eq(properties.id, result.propertyId));
    expect(property.name).toBe(propertyName);
    expect(property.city).toBe("Ahmedabad");
    expect(property.locality).toBe("Test Locality");
    expect(property.possessionStatus).toBe("ready_to_move");
    expect(property.developerId).toBe(developerId);

    const amenityRows = await db
      .select({
        key: amenityCatalog.key,
        status: propertyAmenities.status,
      })
      .from(propertyAmenities)
      .innerJoin(
        amenityCatalog,
        eq(propertyAmenities.amenityCatalogId, amenityCatalog.id),
      )
      .where(eq(propertyAmenities.propertyId, result.propertyId));
    const amenityStatusByKey = new Map(
      amenityRows.map((row) => [row.key, row.status]),
    );
    expect(amenityStatusByKey.get("swimming_pool")).toBe("available");
    expect(amenityStatusByKey.get("clubhouse")).toBe("available");
    expect(amenityStatusByKey.get("security")).toBe("not_stated");

    const specRows = await db
      .select({
        key: specificationCatalog.key,
        status: propertySpecifications.status,
        valueText: propertySpecifications.valueText,
      })
      .from(propertySpecifications)
      .innerJoin(
        specificationCatalog,
        eq(
          propertySpecifications.specificationCatalogId,
          specificationCatalog.id,
        ),
      )
      .where(eq(propertySpecifications.propertyId, result.propertyId));
    const flooringRow = specRows.find((row) => row.key === "flooring");
    expect(flooringRow?.status).toBe("available");
    expect(flooringRow?.valueText).toBe("Vitrified tiles");
    const untouchedSpec = specRows.find((row) => row.key !== "flooring");
    expect(untouchedSpec?.status).toBe("not_stated");

    const variantRows = await db
      .select()
      .from(unitVariants)
      .where(eq(unitVariants.propertyId, result.propertyId));
    expect(variantRows).toHaveLength(1);
    expect(variantRows[0].variantName).toBe("3 BHK - Type A");
    expect(variantRows[0].totalUnitsOfVariant).toBe(24);

    const areaRows = await db
      .select()
      .from(unitAreas)
      .where(eq(unitAreas.unitVariantId, variantRows[0].id));
    expect(areaRows).toHaveLength(1);
    expect(areaRows[0].basis).toBe("carpet");
    expect(Number(areaRows[0].areaSqft)).toBe(1250);

    const revisionRows = await db
      .select()
      .from(propertyRevisions)
      .where(eq(propertyRevisions.submissionId, submissionId));
    expect(revisionRows).toHaveLength(1);
    expect(revisionRows[0].propertyId).toBe(result.propertyId);

    const [submissionRow] = await db
      .select()
      .from(propertySubmissions)
      .where(eq(propertySubmissions.id, submissionId));
    expect(submissionRow.status).toBe("published");
    expect(submissionRow.propertyId).toBe(result.propertyId);
    expect(submissionRow.publishedAt).not.toBeNull();
  });

  it("blocks publication when a field is still needs_review, with no partial live writes", async () => {
    const propertyName = `Test Blocked Property ${randomUUID()}`;
    const submissionId = await insertSubmission({
      developerId,
      status: "approved",
      fields: {
        "property.name": { value: propertyName },
        "property.type": { value: "apartment" },
        "property.city": { value: "Ahmedabad" },
        "property.locality": {
          value: "Test Locality",
          reviewStatus: "needs_review",
        },
      },
    });

    await expect(
      publishSubmission({
        submissionId,
        actorUserId: testUserId,
        actorRole: "owner",
      }),
    ).rejects.toThrow(SubmissionPublishError);

    const existing = await db
      .select({ id: properties.id })
      .from(properties)
      .where(eq(properties.name, propertyName));
    expect(existing).toHaveLength(0);
  });

  it("rejects publishing from a status other than approved", async () => {
    const submissionId = await insertSubmission({
      developerId,
      status: "draft",
      fields: {},
    });

    await expect(
      publishSubmission({
        submissionId,
        actorUserId: testUserId,
        actorRole: "owner",
      }),
    ).rejects.toThrow(SubmissionTransitionError);
  });

  it("rejects a duplicate publish attempt on an already-published submission", async () => {
    const propertyName = `Test Duplicate Guard ${randomUUID()}`;
    const submissionId = await insertSubmission({
      developerId,
      status: "approved",
      fields: {
        "property.name": { value: propertyName },
        "property.type": { value: "apartment" },
        "property.city": { value: "Ahmedabad" },
        "property.locality": { value: "Test Locality" },
      },
    });

    const first = await publishSubmission({
      submissionId,
      actorUserId: testUserId,
      actorRole: "owner",
    });
    createdPropertyIds.push(first.propertyId);

    await expect(
      publishSubmission({
        submissionId,
        actorUserId: testUserId,
        actorRole: "owner",
      }),
    ).rejects.toThrow(SubmissionTransitionError);
  });

  it("applies an existing-property update as an additive patch, leaving omitted amenities untouched", async () => {
    const propertyName = `Test Additive Base ${randomUUID()}`;
    const baseSubmissionId = await insertSubmission({
      developerId,
      status: "approved",
      fields: {
        "property.name": { value: propertyName },
        "property.type": { value: "apartment" },
        "property.city": { value: "Ahmedabad" },
        "property.locality": { value: "Test Locality" },
        "developer.profile_narrative": {
          value: "A test developer narrative sourced from brochure evidence.",
        },
        "property.total_floors": { value: 21 },
        "property.plot_area_sqft": { value: 108900.5 },
        "property.amenities": { value: ["swimming_pool"] },
        unit_variants: {
          value: [
            {
              variantName: "3 BHK - Type A",
              unitsPerFloor: 4,
            },
          ],
        },
      },
    });
    const baseResult = await publishSubmission({
      submissionId: baseSubmissionId,
      actorUserId: testUserId,
      actorRole: "owner",
    });
    createdPropertyIds.push(baseResult.propertyId);

    const patchSubmissionId = await insertSubmission({
      propertyId: baseResult.propertyId,
      status: "approved",
      fields: {
        "property.total_units": { value: 120 },
        "property.amenities": { value: ["security"] },
      },
    });
    const patchResult = await publishSubmission({
      submissionId: patchSubmissionId,
      actorUserId: testUserId,
      actorRole: "owner",
    });

    expect(patchResult.isNewProperty).toBe(false);
    expect(patchResult.propertyId).toBe(baseResult.propertyId);

    const [property] = await db
      .select()
      .from(properties)
      .where(eq(properties.id, baseResult.propertyId));
    expect(property.totalUnits).toBe(120);
    expect(property.totalFloors).toBe(21);
    expect(Number(property.plotAreaSqft)).toBe(108900.5);
    expect(property.name).toBe(propertyName);

    const [developer] = await db
      .select({ profileNarrative: developers.profileNarrative })
      .from(developers)
      .where(eq(developers.id, developerId));
    expect(developer.profileNarrative).toBe(
      "A test developer narrative sourced from brochure evidence.",
    );

    const [variant] = await db
      .select()
      .from(unitVariants)
      .where(eq(unitVariants.propertyId, baseResult.propertyId));
    expect(variant.unitsPerFloor).toBe(4);

    const amenityRows = await db
      .select({
        key: amenityCatalog.key,
        status: propertyAmenities.status,
      })
      .from(propertyAmenities)
      .innerJoin(
        amenityCatalog,
        eq(propertyAmenities.amenityCatalogId, amenityCatalog.id),
      )
      .where(eq(propertyAmenities.propertyId, baseResult.propertyId));
    const amenityStatusByKey = new Map(
      amenityRows.map((row) => [row.key, row.status]),
    );
    expect(amenityStatusByKey.get("security")).toBe("available");
    expect(amenityStatusByKey.get("swimming_pool")).toBe("available");
    expect(amenityStatusByKey.get("clubhouse")).toBe("not_stated");

    const revisionRows = await db
      .select()
      .from(propertyRevisions)
      .where(eq(propertyRevisions.propertyId, baseResult.propertyId));
    expect(revisionRows).toHaveLength(2);
  });

  it("maps a published unit variant's current price into the correct private budget bucket (deferred Phase 1 proof)", async () => {
    const propertyName = `Test Bucket Mapping ${randomUUID()}`;
    const submissionId = await insertSubmission({
      developerId,
      status: "approved",
      fields: {
        "property.name": { value: propertyName },
        "property.type": { value: "apartment" },
        "property.city": { value: "Ahmedabad" },
        "property.locality": { value: "Test Locality" },
        unit_variants: {
          value: [
            {
              variantName: "3 BHK - Type A",
              bhkTypeKey: "3bhk",
              areas: [{ basis: "carpet", areaSqft: 1400 }],
            },
          ],
        },
      },
    });
    const result = await publishSubmission({
      submissionId,
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
      priceInr: "35000000",
      effectiveFrom: "2026-09-01",
      source: "admin_manual",
      createdBy: testUserId,
    });

    const [expectedBucket] = await serviceDb
      .select({ id: budgetBuckets.id })
      .from(budgetBuckets)
      .where(
        and(
          sql`${budgetBuckets.minInr}::numeric <= 35000000`,
          sql`${budgetBuckets.maxInr}::numeric > 35000000`,
        ),
      );

    const bucketRows = await serviceDb.execute<{
      unit_variant_id: string;
      budget_bucket_id: string;
    }>(
      sql`select unit_variant_id, budget_bucket_id from private.unit_current_bucket where unit_variant_id = ${variant.id}`,
    );
    const mappedRow = Array.from(bucketRows)[0];

    expect(mappedRow).toBeDefined();
    expect(mappedRow?.budget_bucket_id).toBe(expectedBucket.id);
  });
});

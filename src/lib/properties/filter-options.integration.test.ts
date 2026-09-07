import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  amenityCatalog,
  developers,
  properties,
  propertyRevisions,
  propertySubmissionFields,
  propertySubmissions,
} from "@/db/schema/catalog";
import { users } from "@/db/schema/auth";
import { publishSubmission } from "@/lib/submissions/publisher";
import { listFilterOptions, type FilterOptions } from "./filter-options";

/**
 * Database-backed tests for the browse filter vocabularies.
 *
 * The claim under test is that every option is derived from published data, so
 * a fixture cannot prove it — only a real publish can. Properties are created
 * through the real `publishSubmission` transaction rather than by inserting
 * into the catalog tables directly; the one-write-path rule in AGENTS.md binds
 * tests too.
 *
 * These assertions are containment-based, not equality-based. Filter options
 * are global by nature — they are not scoped to a city the way the read-layer
 * tests can be — so a developer's local database may hold other published
 * properties and the vocabularies legitimately include them.
 *
 * Requires `DATABASE_URL`.
 */

const testUserId = `filter-options-user-${randomUUID()}`;
const testCity = `Filter City ${randomUUID().slice(0, 8)}`;
const northLocality = `North ${randomUUID().slice(0, 8)}`;
const southLocality = `South ${randomUUID().slice(0, 8)}`;

let developerId: string;
let options: FilterOptions;
let amenityCatalogSize: number;
const createdSubmissionIds: string[] = [];
const createdPropertyIds: string[] = [];

const seedProperty = async (params: {
  name: string;
  locality: string;
  amenities: string[];
  bhkTypeKeys: string[];
}): Promise<void> => {
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
    "property.name": params.name,
    "property.type": "apartment",
    "property.city": testCity,
    "property.locality": params.locality,
    "property.amenities": params.amenities,
    unit_variants: params.bhkTypeKeys.map((bhkTypeKey, index) => ({
      variantName: `Variant ${index + 1}`,
      bhkTypeKey,
      areas: [{ basis: "carpet", areaSqft: 900 + index * 100 }],
    })),
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
};

beforeAll(async () => {
  await db.insert(users).values({
    id: testUserId,
    name: "Filter Options Test User",
    email: `${testUserId}@example.test`,
  });
  const [developer] = await db
    .insert(developers)
    .values({ name: `Filter Options Developer ${randomUUID()}` })
    .returning({ id: developers.id });
  developerId = developer.id;

  // Both properties share a locality and an amenity, so the query has
  // duplicates to collapse rather than a set that is distinct by accident.
  await seedProperty({
    name: `Filter Alpha ${randomUUID().slice(0, 8)}`,
    locality: northLocality,
    amenities: ["clubhouse"],
    bhkTypeKeys: ["2bhk"],
  });
  await seedProperty({
    name: `Filter Beta ${randomUUID().slice(0, 8)}`,
    locality: northLocality,
    amenities: ["clubhouse"],
    bhkTypeKeys: ["2bhk", "3bhk"],
  });
  await seedProperty({
    name: `Filter Gamma ${randomUUID().slice(0, 8)}`,
    locality: southLocality,
    amenities: [],
    bhkTypeKeys: ["2bhk"],
  });

  amenityCatalogSize = (
    await db.select({ key: amenityCatalog.key }).from(amenityCatalog)
  ).length;
  options = await listFilterOptions(db);
});

afterAll(async () => {
  await db
    .delete(propertyRevisions)
    .where(inArray(propertyRevisions.submissionId, createdSubmissionIds));
  await db
    .delete(propertySubmissions)
    .where(inArray(propertySubmissions.id, createdSubmissionIds));
  await db.delete(properties).where(inArray(properties.id, createdPropertyIds));
  await db.delete(developers).where(eq(developers.id, developerId));
  await db.delete(users).where(eq(users.id, testUserId));
});

const isSortedAscending = (values: string[]): boolean =>
  values.every((value, index) => index === 0 || values[index - 1]! <= value);

describe("listFilterOptions — locations", () => {
  it("offers every city that has a published property", () => {
    expect(options.cities).toContain(testCity);
  });

  it("offers every locality that has a published property", () => {
    expect(options.localities).toEqual(
      expect.arrayContaining([northLocality, southLocality]),
    );
  });

  it("lists a shared locality once, not once per property", () => {
    // Two of the seeded properties are in the same locality. A join without
    // DISTINCT would offer it twice and the select would repeat itself.
    expect(
      options.localities.filter((locality) => locality === northLocality),
    ).toHaveLength(1);
  });

  it("orders options so the controls read predictably", () => {
    expect(isSortedAscending(options.cities)).toBe(true);
    expect(isSortedAscending(options.localities)).toBe(true);
  });
});

describe("listFilterOptions — lookup vocabularies", () => {
  it("offers a property type in use, as key and label", () => {
    expect(options.propertyTypes).toContainEqual({
      key: "apartment",
      label: "Apartment",
    });
  });

  it("offers every configuration a published variant records, once each", () => {
    const keys = options.bhkTypes.map((bhk) => bhk.key);

    expect(keys).toEqual(expect.arrayContaining(["2bhk", "3bhk"]));
    expect(keys.filter((key) => key === "2bhk")).toHaveLength(1);
  });
});

describe("listFilterOptions — amenities", () => {
  it("offers an amenity a published property records as available", () => {
    expect(options.amenities).toContainEqual({
      key: "clubhouse",
      label: "Clubhouse",
    });
  });

  it("offers an available amenity once, however many properties record it", () => {
    expect(
      options.amenities.filter((amenity) => amenity.key === "clubhouse"),
    ).toHaveLength(1);
  });

  it("does not offer the whole amenity catalog", () => {
    // Publishing writes a `property_amenities` row for every catalog amenity —
    // the selected ones as `available` and the rest as `not_stated`. So a query
    // that forgot to filter on status would offer the entire catalog, every
    // entry of which would return an empty result set when chosen. This is the
    // assertion that catches that.
    expect(amenityCatalogSize).toBeGreaterThan(1);
    expect(options.amenities.length).toBeLessThan(amenityCatalogSize);
  });
});

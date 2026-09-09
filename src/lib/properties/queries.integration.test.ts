import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  developers,
  properties,
  propertyRevisions,
  propertySubmissionFields,
  propertySubmissions,
} from "@/db/schema/catalog";
import { users } from "@/db/schema/auth";
import { publishSubmission } from "@/lib/submissions/publisher";
import { getPublishedPropertyBySlug, listPublishedProperties } from "./queries";
import { findForbiddenKeys } from "./no-price";
import { DEFAULT_SORT, type ListPropertiesParams } from "./types";

/**
 * Database-backed tests for the buyer read layer.
 *
 * Every property here is created through the real `publishSubmission`
 * transaction rather than by inserting into the catalog tables directly — the
 * one-write-path rule in AGENTS.md binds tests too. A test that seeded
 * `properties` with a raw INSERT would also be testing a data shape the
 * publisher can never actually produce.
 *
 * The fixtures in `./fixtures.ts` cover shape without a database; this file
 * covers the queries themselves. Requires `DATABASE_URL`.
 */

const testUserId = `read-layer-user-${randomUUID()}`;
// Every property this suite creates shares one unique city, so filter
// assertions are isolated from whatever else lives in the developer's local
// database.
const testCity = `Test City ${randomUUID().slice(0, 8)}`;

let developerId: string;
const createdSubmissionIds: string[] = [];
const createdPropertyIds: string[] = [];

interface SeedPropertyParams {
  name: string;
  locality: string;
  possessionStatus: "under_construction" | "ready_to_move";
  amenities: string[];
  variants: { variantName: string; bhkTypeKey: string; carpetSqft: number }[];
}

const seedProperty = async (params: SeedPropertyParams): Promise<string> => {
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
    "property.possession_status": params.possessionStatus,
    "property.amenities": params.amenities,
    unit_variants: params.variants.map((variant) => ({
      variantName: variant.variantName,
      bhkTypeKey: variant.bhkTypeKey,
      areas: [{ basis: "carpet", areaSqft: variant.carpetSqft }],
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
  return result.propertyId;
};

const listInTestCity = (
  overrides: Partial<ListPropertiesParams> = {},
): ReturnType<typeof listPublishedProperties> =>
  listPublishedProperties(db, {
    page: 1,
    pageSize: 20,
    sort: DEFAULT_SORT,
    city: testCity,
    ...overrides,
  });

beforeAll(async () => {
  await db.insert(users).values({
    id: testUserId,
    name: "Read Layer Test User",
    email: `${testUserId}@example.test`,
  });
  const [developer] = await db
    .insert(developers)
    .values({ name: `Read Layer Developer ${randomUUID()}` })
    .returning({ id: developers.id });
  developerId = developer.id;

  // Seeded oldest-first so `newest` sort has an unambiguous expected order.
  await seedProperty({
    name: `Alpha Residency ${randomUUID().slice(0, 8)}`,
    locality: "North Locality",
    possessionStatus: "ready_to_move",
    amenities: ["clubhouse"],
    variants: [
      { variantName: "2 BHK - A", bhkTypeKey: "2bhk", carpetSqft: 950 },
    ],
  });
  await seedProperty({
    name: `Beta Heights ${randomUUID().slice(0, 8)}`,
    locality: "South Locality",
    possessionStatus: "under_construction",
    amenities: ["clubhouse", "swimming_pool"],
    variants: [
      { variantName: "3 BHK - A", bhkTypeKey: "3bhk", carpetSqft: 1400 },
      { variantName: "3 BHK - B", bhkTypeKey: "3bhk", carpetSqft: 1450 },
    ],
  });
  await seedProperty({
    name: `Gamma Enclave ${randomUUID().slice(0, 8)}`,
    locality: "North Locality",
    possessionStatus: "under_construction",
    amenities: [],
    variants: [
      { variantName: "2 BHK - A", bhkTypeKey: "2bhk", carpetSqft: 900 },
    ],
  });
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

describe("listPublishedProperties", () => {
  it("returns every seeded property with contract-shaped summaries", async () => {
    const result = await listInTestCity();
    expect(result.pagination.total).toBe(3);
    expect(result.data).toHaveLength(3);

    const summary = result.data[0];
    expect(summary).toBeDefined();
    expect(Object.keys(summary!).sort()).toEqual(
      [
        "bhkTypes",
        "city",
        "developer",
        "id",
        "locality",
        "name",
        "possessionDate",
        "possessionStatus",
        "primaryMedia",
        "propertyType",
        "reraRegistered",
        "slug",
      ].sort(),
    );
    expect(summary!.propertyType).toEqual({
      key: "apartment",
      label: expect.any(String),
    });
  });

  it("paginates without losing or repeating rows", async () => {
    const first = await listInTestCity({ page: 1, pageSize: 2 });
    const second = await listInTestCity({ page: 2, pageSize: 2 });

    expect(first.pagination).toMatchObject({
      page: 1,
      pageSize: 2,
      total: 3,
      totalPages: 2,
    });
    expect(first.data).toHaveLength(2);
    expect(second.data).toHaveLength(1);

    const ids = [...first.data, ...second.data].map((row) => row.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("reports a total beyond the page rather than the page length", async () => {
    const result = await listInTestCity({ pageSize: 1 });
    expect(result.data).toHaveLength(1);
    expect(result.pagination.total).toBe(3);
    expect(result.pagination.totalPages).toBe(3);
  });

  it("returns an empty page past the end instead of erroring", async () => {
    const result = await listInTestCity({ page: 99 });
    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(3);
  });

  it("filters by city", async () => {
    const result = await listPublishedProperties(db, {
      page: 1,
      pageSize: 20,
      sort: DEFAULT_SORT,
      city: `${testCity} nonexistent`,
    });
    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
  });

  it("filters by locality", async () => {
    const result = await listInTestCity({ locality: "North Locality" });
    expect(result.pagination.total).toBe(2);
    for (const row of result.data) {
      expect(row.locality).toBe("North Locality");
    }
  });

  it("filters by propertyType key", async () => {
    const matching = await listInTestCity({ propertyType: "apartment" });
    expect(matching.pagination.total).toBe(3);
  });

  it("returns an empty set for an unknown lookup key rather than an error", async () => {
    // An unknown key is a valid query with no matches; only a malformed value
    // is a broken request, and that is the route's job to reject.
    const result = await listInTestCity({ propertyType: "not-a-real-type" });
    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
  });

  it("filters by possessionStatus", async () => {
    const ready = await listInTestCity({ possessionStatus: "ready_to_move" });
    expect(ready.pagination.total).toBe(1);
    expect(ready.data[0]?.possessionStatus).toBe("ready_to_move");

    const under = await listInTestCity({
      possessionStatus: "under_construction",
    });
    expect(under.pagination.total).toBe(2);
  });

  it("filters by bhk, counting a property once however many variants match", async () => {
    const threeBhk = await listInTestCity({ bhk: "3bhk" });
    // Beta Heights has two 3 BHK variants; a join would have counted it twice.
    expect(threeBhk.pagination.total).toBe(1);
    expect(threeBhk.data).toHaveLength(1);

    const twoBhk = await listInTestCity({ bhk: "2bhk" });
    expect(twoBhk.pagination.total).toBe(2);
  });

  it("filters by a single amenity, matching only available ones", async () => {
    const result = await listInTestCity({ amenity: ["clubhouse"] });
    // Gamma Enclave gets a backfilled `not_stated` clubhouse row, which must
    // not match — an unanswered question is not a yes.
    expect(result.pagination.total).toBe(2);
  });

  it("narrows rather than widens when amenity is repeated", async () => {
    const both = await listInTestCity({
      amenity: ["clubhouse", "swimming_pool"],
    });
    expect(both.pagination.total).toBe(1);
    expect(both.data[0]?.name).toMatch(/^Beta Heights/);
  });

  it("returns nothing when one of several amenities cannot match", async () => {
    const result = await listInTestCity({
      amenity: ["clubhouse", "no-such-amenity"],
    });
    expect(result.data).toEqual([]);
  });

  it("sorts by name ascending", async () => {
    const result = await listInTestCity({ sort: "name" });
    const names = result.data.map((row) => row.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(names[0]).toMatch(/^Alpha Residency/);
  });

  it("sorts newest first by default", async () => {
    const result = await listInTestCity({ sort: "newest" });
    expect(result.data[0]?.name).toMatch(/^Gamma Enclave/);
  });

  it("derives bhkTypes from the property's variants without duplicates", async () => {
    const result = await listInTestCity({ sort: "name" });
    const beta = result.data.find((row) => row.name.startsWith("Beta Heights"));
    expect(beta?.bhkTypes.map((bhk) => bhk.key)).toEqual(["3bhk"]);
  });

  it("returns null primaryMedia when a property has no media", async () => {
    const result = await listInTestCity();
    for (const row of result.data) {
      expect(row.primaryMedia).toBeNull();
    }
  });

  it("leaks no excluded data on the wire", async () => {
    const result = await listInTestCity();
    expect(findForbiddenKeys(result)).toEqual([]);
  });
});

describe("getPublishedPropertyBySlug", () => {
  it("returns null for a slug that is not in the live catalog", async () => {
    expect(await getPublishedPropertyBySlug(db, "no-such-property")).toBeNull();
  });

  it("returns a full dossier for a published slug", async () => {
    const listed = await listInTestCity({ sort: "name" });
    const target = listed.data.find((row) => row.name.startsWith("Beta"));
    expect(target).toBeDefined();

    const dossier = await getPublishedPropertyBySlug(db, target!.slug);
    expect(dossier).not.toBeNull();
    expect(dossier!.id).toBe(target!.id);
    expect(dossier!.location.city).toBe(testCity);
    expect(dossier!.propertyType.key).toBe("apartment");
    expect(dossier!.developer.id).toBe(developerId);
    expect(dossier!.unitVariants).toHaveLength(2);
  });

  it("carries per-basis areas without inventing an absent basis", async () => {
    const listed = await listInTestCity({ sort: "name" });
    const dossier = await getPublishedPropertyBySlug(db, listed.data[0]!.slug);
    const variant = dossier!.unitVariants[0];
    expect(variant?.areas).toHaveLength(1);
    expect(variant?.areas[0]?.basis).toBe("carpet");
    expect(typeof variant?.areas[0]?.areaSqft).toBe("string");
  });

  it("returns amenities in every state, not just available ones", async () => {
    const listed = await listInTestCity({ sort: "name" });
    const dossier = await getPublishedPropertyBySlug(db, listed.data[0]!.slug);
    const statuses = new Set(dossier!.amenities.map((a) => a.status));
    // The publisher backfills the whole catalog as `not_stated`, so both a
    // stated and an unstated amenity must be present and distinguishable.
    expect(statuses.has("available")).toBe(true);
    expect(statuses.has("not_stated")).toBe(true);
  });

  it("renders absent optional facts as null rather than omitting them", async () => {
    const listed = await listInTestCity({ sort: "name" });
    const dossier = await getPublishedPropertyBySlug(db, listed.data[0]!.slug);
    expect(dossier!.media).toEqual([]);
    expect(dossier!.rera.registered).toBe(false);
    expect(dossier).toHaveProperty("description");
    expect(dossier!.rera).toHaveProperty("registrationNumber");
    expect(dossier!.location).toHaveProperty("latitude");
  });

  it("leaks no excluded data on the wire", async () => {
    const listed = await listInTestCity({ sort: "name" });
    const dossier = await getPublishedPropertyBySlug(db, listed.data[0]!.slug);
    expect(findForbiddenKeys(dossier)).toEqual([]);
  });
});

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
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
import { findForbiddenKeys } from "@/lib/properties/no-price";
import {
  DOSSIER_CACHE_CONTROL,
  ERROR_CACHE_CONTROL,
  LIST_CACHE_CONTROL,
} from "@/lib/properties/http";
import type {
  PropertyDossier,
  PropertyListResult,
} from "@/lib/properties/types";
import { GET as getProperties } from "./route";
import { GET as getPropertyBySlug } from "./[slug]/route";

/**
 * The two buyer routes exercised end to end: a real request in, a real
 * serialised response body out, against real published data.
 *
 * `src/lib/properties/http.test.ts` covers the parameter contract without a
 * database. What can only be checked here is the wire itself — status codes,
 * cache headers, and the exclusion list asserted against a body that has
 * actually been through `JSON.stringify`, which is the whole point of the
 * price-restraint guarantee.
 *
 * Every property is created through the real `publishSubmission` transaction.
 * The one-write-path rule in AGENTS.md binds tests too.
 */

const testUserId = `api-routes-user-${randomUUID()}`;
// One unique city per run, so filter assertions are isolated from whatever
// else lives in the developer's local database.
const testCity = `Test City ${randomUUID().slice(0, 8)}`;

let developerId: string;
let readyToMoveSlug: string;
const createdSubmissionIds: string[] = [];
const createdPropertyIds: string[] = [];

const listRequest = (query = ""): NextRequest =>
  new NextRequest(`http://localhost/api/v1/properties${query}`);

const slugRequest = (slug: string): NextRequest =>
  new NextRequest(
    `http://localhost/api/v1/properties/${encodeURIComponent(slug)}`,
  );

const slugContext = (
  slug: string,
): RouteContext<"/api/v1/properties/[slug]"> => ({
  params: Promise.resolve({ slug }),
});

const seedProperty = async (params: {
  name: string;
  locality: string;
  possessionStatus: "under_construction" | "ready_to_move";
  amenities: string[];
}): Promise<string> => {
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
    unit_variants: [
      {
        variantName: "2 BHK - A",
        bhkTypeKey: "2bhk",
        areas: [{ basis: "carpet", areaSqft: 950 }],
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
  return result.propertyId;
};

beforeAll(async () => {
  await db.insert(users).values({
    id: testUserId,
    name: "API Routes Test User",
    email: `${testUserId}@example.test`,
  });
  const [developer] = await db
    .insert(developers)
    .values({ name: `API Routes Developer ${randomUUID()}` })
    .returning({ id: developers.id });
  developerId = developer.id;

  const propertyId = await seedProperty({
    name: `Route Alpha ${randomUUID().slice(0, 8)}`,
    locality: "North Locality",
    possessionStatus: "ready_to_move",
    amenities: ["clubhouse"],
  });
  await seedProperty({
    name: `Route Beta ${randomUUID().slice(0, 8)}`,
    locality: "South Locality",
    possessionStatus: "under_construction",
    amenities: [],
  });

  const [row] = await db
    .select({ slug: properties.slug })
    .from(properties)
    .where(eq(properties.id, propertyId));
  readyToMoveSlug = row.slug;
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

describe("GET /api/v1/properties", () => {
  it("returns the contract envelope with the shared-cache policy", async () => {
    const response = await getProperties(
      listRequest(`?city=${encodeURIComponent(testCity)}`),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(LIST_CACHE_CONTROL);
    expect(response.headers.get("Content-Type")).toContain("application/json");

    const body = (await response.json()) as PropertyListResult;
    expect(Object.keys(body).sort()).toEqual(["data", "pagination"]);
    expect(body.pagination).toEqual({
      page: 1,
      pageSize: 20,
      total: 2,
      totalPages: 1,
    });
    expect(body.data).toHaveLength(2);
  });

  it("applies filters, pagination, and sort from the query string", async () => {
    const city = encodeURIComponent(testCity);

    const filtered = await getProperties(
      listRequest(`?city=${city}&possessionStatus=ready_to_move`),
    );
    const filteredBody = (await filtered.json()) as PropertyListResult;
    expect(filteredBody.data).toHaveLength(1);
    expect(filteredBody.data[0]!.slug).toBe(readyToMoveSlug);

    const paged = await getProperties(
      listRequest(`?city=${city}&pageSize=1&page=2&sort=name`),
    );
    const pagedBody = (await paged.json()) as PropertyListResult;
    expect(pagedBody.pagination).toEqual({
      page: 2,
      pageSize: 1,
      total: 2,
      totalPages: 2,
    });
    expect(pagedBody.data).toHaveLength(1);
  });

  it("answers an unknown lookup key with an empty page, not an error", async () => {
    const response = await getProperties(
      listRequest(
        `?city=${encodeURIComponent(testCity)}&propertyType=nonsense`,
      ),
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as PropertyListResult;
    expect(body.data).toEqual([]);
    expect(body.pagination.total).toBe(0);
    expect(body.pagination.totalPages).toBe(0);
  });

  it("rejects a malformed value with 422 naming the parameter, uncached", async () => {
    const response = await getProperties(listRequest("?pageSize=999"));

    expect(response.status).toBe(422);
    expect(response.headers.get("Cache-Control")).toBe(ERROR_CACHE_CONTROL);

    const body = await response.json();
    expect(body.error.code).toBe("invalid_query_parameter");
    expect(body.error.message).toContain("pageSize");
  });

  it("rejects an unknown query parameter with 422", async () => {
    const response = await getProperties(listRequest("?maxPrice=9000000"));
    expect(response.status).toBe(422);

    const body = await response.json();
    expect(body.error.code).toBe("unknown_query_parameter");
    expect(body.error.message).toContain("maxPrice");
  });

  it("carries no excluded data on the wire", async () => {
    const response = await getProperties(
      listRequest(`?city=${encodeURIComponent(testCity)}`),
    );
    // Scanned after serialisation, not on the in-memory object, so anything a
    // future `select()` adds is caught in the shape a buyer would receive.
    expect(findForbiddenKeys(await response.json())).toEqual([]);
  });
});

describe("GET /api/v1/properties/[slug]", () => {
  it("returns the dossier with the longer shared-cache window", async () => {
    const response = await getPropertyBySlug(
      slugRequest(readyToMoveSlug),
      slugContext(readyToMoveSlug),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(DOSSIER_CACHE_CONTROL);

    const body = (await response.json()) as PropertyDossier;
    expect(body.slug).toBe(readyToMoveSlug);
    expect(body.propertyType.key).toBe("apartment");
    expect(body.location.city).toBe(testCity);
    // Absent facts are present as explicit nulls / empty arrays, never omitted.
    expect(body.media).toEqual([]);
    expect(body.rera.registrationNumber).toBeNull();
  });

  it("carries no excluded data on the wire", async () => {
    const response = await getPropertyBySlug(
      slugRequest(readyToMoveSlug),
      slugContext(readyToMoveSlug),
    );
    expect(findForbiddenKeys(await response.json())).toEqual([]);
  });

  it("returns 404 for an unknown slug, uncached", async () => {
    const slug = `no-such-property-${randomUUID()}`;
    const response = await getPropertyBySlug(
      slugRequest(slug),
      slugContext(slug),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe(ERROR_CACHE_CONTROL);

    const body = await response.json();
    expect(body.error.code).toBe("property_not_found");
    // The response must not echo the slug back into a cacheable surface, but it
    // must still be a usable error.
    expect(body.error.message).toBeTruthy();
  });

  it("ignores query parameters, which belong to the listing route", async () => {
    const response = await getPropertyBySlug(
      new NextRequest(
        `http://localhost/api/v1/properties/${readyToMoveSlug}?pageSize=999`,
      ),
      slugContext(readyToMoveSlug),
    );
    expect(response.status).toBe(200);
  });
});

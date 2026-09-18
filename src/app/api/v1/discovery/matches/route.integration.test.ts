import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
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
import { ERROR_CACHE_CONTROL } from "@/lib/properties/http";
import type { ApiErrorBody } from "@/lib/properties/http";
import type { PropertyListResult } from "@/lib/properties/types";
import { POST as postMatches } from "./route";

/**
 * `POST /api/v1/discovery/matches` exercised end to end: a real request in, a
 * real serialised response body out. `src/lib/matching/http.test.ts` covers
 * the body-validation contract without a database;
 * `src/lib/matching/discovery.integration.test.ts` covers the query layer.
 * What's checked here is the wire itself — status codes, cache headers, and
 * the exclusion-list guarantee against a body that has actually gone through
 * `JSON.stringify`.
 */

const testUserId = `discovery-route-user-${randomUUID()}`;
const testCity = `Test City ${randomUUID().slice(0, 8)}`;

let developerId: string;
let propertyId: string;
const createdSubmissionIds: string[] = [];
const createdPropertyIds: string[] = [];

const matchesRequest = (body: unknown): NextRequest =>
  new NextRequest("http://localhost/api/v1/discovery/matches", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  await db.insert(users).values({
    id: testUserId,
    name: "Discovery Route Test User",
    email: `${testUserId}@example.test`,
  });
  const [developer] = await db
    .insert(developers)
    .values({ name: `Discovery Route Test Developer ${randomUUID()}` })
    .returning({ id: developers.id });
  developerId = developer.id;

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

  await db.insert(propertySubmissionFields).values(
    Object.entries({
      "property.name": `Discovery Route Test ${randomUUID()}`,
      "property.type": "apartment",
      "property.city": testCity,
      "property.locality": "Test Locality",
      unit_variants: [
        {
          variantName: "Test Variant",
          bhkTypeKey: "3bhk",
          areas: [{ basis: "carpet", areaSqft: 1400 }],
        },
      ],
    }).map(([fieldKey, value]) => ({
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
  propertyId = result.propertyId;
  createdPropertyIds.push(propertyId);

  const [variant] = await db
    .select()
    .from(unitVariants)
    .where(eq(unitVariants.propertyId, propertyId));

  await serviceDb.insert(unitPriceHistory).values({
    unitVariantId: variant.id,
    priceInr: "35000000",
    effectiveFrom: "2026-09-01",
    source: "admin_manual",
    createdBy: testUserId,
  });
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

describe("POST /api/v1/discovery/matches", () => {
  it("200s with matched published properties and never caches", async () => {
    const response = await postMatches(
      matchesRequest({
        minInr: 30_000_000,
        maxInr: 40_000_000,
        city: testCity,
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const body = (await response.json()) as PropertyListResult;
    expect(body.data.map((row) => row.id)).toContain(propertyId);
    expect(findForbiddenKeys(body)).toEqual([]);
  });

  it("422s on an invalid body without touching the database", async () => {
    const response = await postMatches(
      matchesRequest({ minInr: 4_000_000, maxInr: 3_000_000 }),
    );
    expect(response.status).toBe(422);
    expect(response.headers.get("Cache-Control")).toBe(ERROR_CACHE_CONTROL);

    const body = (await response.json()) as ApiErrorBody;
    expect(body.error.code).toBe("invalid_request_body");
  });

  it("422s on malformed JSON", async () => {
    const request = new NextRequest(
      "http://localhost/api/v1/discovery/matches",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      },
    );
    const response = await postMatches(request);
    expect(response.status).toBe(422);
  });
});

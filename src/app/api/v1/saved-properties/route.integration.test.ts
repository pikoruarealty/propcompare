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
  savedProperties,
} from "@/db/schema/catalog";
import { users } from "@/db/schema/auth";
import { publishSubmission } from "@/lib/submissions/publisher";
import { findForbiddenKeys } from "@/lib/properties/no-price";
import type { ApiErrorBody } from "@/lib/properties/http";
import { signUpTestBuyer } from "@/lib/buyer/test-support";
import { GET, POST, DELETE } from "./route";

const submitterUserId = `saved-properties-submitter-${randomUUID()}`;
let developerId: string;
let propertyId: string;
let buyerAUserId: string;
let buyerACookie: string;
let buyerBUserId: string;
let buyerBCookie: string;

const createdSubmissionIds: string[] = [];
const createdPropertyIds: string[] = [];
const createdBuyerIds: string[] = [];

const request = (cookie: string, method: string, body?: unknown): NextRequest =>
  new NextRequest("http://localhost/api/v1/saved-properties", {
    method,
    headers: { cookie, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

beforeAll(async () => {
  await db.insert(users).values({
    id: submitterUserId,
    name: "Saved Properties Submitter",
    email: `${submitterUserId}@example.test`,
  });
  const [developer] = await db
    .insert(developers)
    .values({ name: `Saved Properties Test Developer ${randomUUID()}` })
    .returning({ id: developers.id });
  developerId = developer.id;

  const [submission] = await db
    .insert(propertySubmissions)
    .values({
      developerId,
      submittedBy: submitterUserId,
      reviewedBy: submitterUserId,
      source: "manual_form",
      status: "approved",
      payload: {},
    })
    .returning({ id: propertySubmissions.id });
  createdSubmissionIds.push(submission.id);

  await db.insert(propertySubmissionFields).values(
    Object.entries({
      "property.name": `Saved Properties Test ${randomUUID()}`,
      "property.type": "apartment",
      "property.city": "Ahmedabad",
      "property.locality": "Test Locality",
    }).map(([fieldKey, value]) => ({
      submissionId: submission.id,
      fieldKey,
      value,
      reviewStatus: "confirmed" as const,
    })),
  );

  const result = await publishSubmission({
    submissionId: submission.id,
    actorUserId: submitterUserId,
    actorRole: "owner",
  });
  propertyId = result.propertyId;
  createdPropertyIds.push(propertyId);

  const buyerA = await signUpTestBuyer(
    `saved-buyer-a-${randomUUID()}@example.test`,
  );
  buyerAUserId = buyerA.userId;
  buyerACookie = buyerA.cookie;
  createdBuyerIds.push(buyerAUserId);

  const buyerB = await signUpTestBuyer(
    `saved-buyer-b-${randomUUID()}@example.test`,
  );
  buyerBUserId = buyerB.userId;
  buyerBCookie = buyerB.cookie;
  createdBuyerIds.push(buyerBUserId);
});

afterAll(async () => {
  await db
    .delete(savedProperties)
    .where(inArray(savedProperties.userId, createdBuyerIds));
  await db
    .delete(propertyRevisions)
    .where(inArray(propertyRevisions.submissionId, createdSubmissionIds));
  await db
    .delete(propertySubmissions)
    .where(inArray(propertySubmissions.id, createdSubmissionIds));
  await db.delete(properties).where(inArray(properties.id, createdPropertyIds));
  await db.delete(developers).where(eq(developers.id, developerId));
  await db
    .delete(users)
    .where(inArray(users.id, [submitterUserId, ...createdBuyerIds]));
});

describe("POST /api/v1/saved-properties", () => {
  it("401s with no session", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/v1/saved-properties", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ propertyId }),
      }),
    );
    expect(response.status).toBe(401);
  });

  it("404s on a nonexistent property", async () => {
    const response = await POST(
      request(buyerACookie, "POST", { propertyId: randomUUID() }),
    );
    expect(response.status).toBe(404);
    const body = (await response.json()) as ApiErrorBody;
    expect(body.error.code).toBe("property_not_found");
  });

  it("saves a property and is idempotent on a repeat save", async () => {
    const first = await POST(request(buyerACookie, "POST", { propertyId }));
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.property.id).toBe(propertyId);
    expect(findForbiddenKeys(firstBody)).toEqual([]);

    const second = await POST(request(buyerACookie, "POST", { propertyId }));
    const secondBody = await second.json();
    expect(secondBody.savedAt).toBe(firstBody.savedAt);
  });
});

describe("GET /api/v1/saved-properties", () => {
  it("401s with no session", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/v1/saved-properties"),
    );
    expect(response.status).toBe(401);
  });

  it("lists only the caller's saved properties", async () => {
    const response = await GET(request(buyerACookie, "GET"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(
      body.data.map((entry: { property: { id: string } }) => entry.property.id),
    ).toContain(propertyId);

    const otherBuyerResponse = await GET(request(buyerBCookie, "GET"));
    const otherBody = await otherBuyerResponse.json();
    expect(otherBody.data).toEqual([]);
  });
});

describe("DELETE /api/v1/saved-properties", () => {
  it("404s when the property was never saved", async () => {
    const response = await DELETE(
      request(buyerBCookie, "DELETE", { propertyId }),
    );
    expect(response.status).toBe(404);
    const body = (await response.json()) as ApiErrorBody;
    expect(body.error.code).toBe("saved_property_not_found");
  });

  it("removes a saved property", async () => {
    const response = await DELETE(
      request(buyerACookie, "DELETE", { propertyId }),
    );
    expect(response.status).toBe(204);

    const listed = await GET(request(buyerACookie, "GET"));
    const body = await listed.json();
    expect(body.data).toEqual([]);
  });
});

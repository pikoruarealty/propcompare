import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  developers,
  enquiries,
  properties,
  propertyRevisions,
  propertySubmissionFields,
  propertySubmissions,
  unitVariants,
} from "@/db/schema/catalog";
import { users } from "@/db/schema/auth";
import { publishSubmission } from "@/lib/submissions/publisher";
import { findForbiddenKeys } from "@/lib/properties/no-price";
import type { ApiErrorBody } from "@/lib/properties/http";
import { signUpTestBuyer } from "@/lib/buyer/test-support";
import { POST } from "./route";

const submitterUserId = `enquiries-submitter-${randomUUID()}`;
let developerId: string;
let propertyId: string;
let unitVariantId: string;
let otherPropertyId: string;
let buyerUserId: string;
let buyerCookie: string;

const createdSubmissionIds: string[] = [];
const createdPropertyIds: string[] = [];
const createdBuyerIds: string[] = [];

const request = (cookie: string, body: unknown): NextRequest =>
  new NextRequest("http://localhost/api/v1/enquiries", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const publishTestProperty = async (): Promise<{
  propertyId: string;
  unitVariantId: string;
}> => {
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
      "property.name": `Enquiries Test ${randomUUID()}`,
      "property.type": "apartment",
      "property.city": "Ahmedabad",
      "property.locality": "Test Locality",
      unit_variants: [
        {
          variantName: "Test Variant",
          bhkTypeKey: "2bhk",
          areas: [{ basis: "carpet", areaSqft: 1200 }],
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
    actorUserId: submitterUserId,
    actorRole: "owner",
  });
  createdPropertyIds.push(result.propertyId);

  const [variant] = await db
    .select()
    .from(unitVariants)
    .where(eq(unitVariants.propertyId, result.propertyId));

  return { propertyId: result.propertyId, unitVariantId: variant.id };
};

beforeAll(async () => {
  await db.insert(users).values({
    id: submitterUserId,
    name: "Enquiries Submitter",
    email: `${submitterUserId}@example.test`,
  });
  const [developer] = await db
    .insert(developers)
    .values({ name: `Enquiries Test Developer ${randomUUID()}` })
    .returning({ id: developers.id });
  developerId = developer.id;

  const property = await publishTestProperty();
  propertyId = property.propertyId;
  unitVariantId = property.unitVariantId;

  const otherProperty = await publishTestProperty();
  otherPropertyId = otherProperty.propertyId;

  const buyer = await signUpTestBuyer(
    `enquiries-buyer-${randomUUID()}@example.test`,
  );
  buyerUserId = buyer.userId;
  buyerCookie = buyer.cookie;
  createdBuyerIds.push(buyerUserId);
});

afterAll(async () => {
  await db.delete(enquiries).where(inArray(enquiries.userId, createdBuyerIds));
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

describe("POST /api/v1/enquiries", () => {
  it("401s with no session", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/v1/enquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ propertyId }),
      }),
    );
    expect(response.status).toBe(401);
  });

  it("404s on a nonexistent property", async () => {
    const response = await POST(
      request(buyerCookie, { propertyId: randomUUID() }),
    );
    expect(response.status).toBe(404);
    const body = (await response.json()) as ApiErrorBody;
    expect(body.error.code).toBe("property_not_found");
  });

  it("404s when the unit variant doesn't belong to the property", async () => {
    const response = await POST(
      request(buyerCookie, { propertyId: otherPropertyId, unitVariantId }),
    );
    expect(response.status).toBe(404);
    const body = (await response.json()) as ApiErrorBody;
    expect(body.error.code).toBe("unit_variant_not_found");
  });

  it("creates an enquiry with status new and no forbidden keys", async () => {
    const response = await POST(
      request(buyerCookie, {
        propertyId,
        unitVariantId,
        message: "Interested in this unit",
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("new");
    expect(body.propertyId).toBe(propertyId);
    expect(body.unitVariantId).toBe(unitVariantId);
    expect(body.message).toBe("Interested in this unit");
    expect(findForbiddenKeys(body)).toEqual([]);
  });

  it("creates an enquiry with only a property, no unit variant or message", async () => {
    const response = await POST(
      request(buyerCookie, { propertyId: otherPropertyId }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.unitVariantId).toBeNull();
    expect(body.message).toBeNull();
  });
});

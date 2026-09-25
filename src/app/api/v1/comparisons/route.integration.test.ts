import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  comparisonItems,
  comparisons,
  developers,
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
import { GET, POST } from "./route";
import { DELETE } from "./[id]/route";

const submitterUserId = `comparisons-submitter-${randomUUID()}`;
let developerId: string;
let propertyAId: string;
let propertyAVariantId: string;
let propertyBId: string;
let buyerUserId: string;
let buyerCookie: string;
let otherBuyerCookie: string;

const createdSubmissionIds: string[] = [];
const createdPropertyIds: string[] = [];
const createdBuyerIds: string[] = [];

const request = (cookie: string, body: unknown): NextRequest =>
  new NextRequest("http://localhost/api/v1/comparisons", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const publishTestProperty = async (
  bhkTypeKey: string,
): Promise<{ propertyId: string; unitVariantId: string }> => {
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
      "property.name": `Comparisons Test ${randomUUID()}`,
      "property.type": "apartment",
      "property.city": "Ahmedabad",
      "property.locality": "Test Locality",
      unit_variants: [
        {
          variantName: "Test Variant",
          bhkTypeKey,
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
    name: "Comparisons Submitter",
    email: `${submitterUserId}@example.test`,
  });
  const [developer] = await db
    .insert(developers)
    .values({ name: `Comparisons Test Developer ${randomUUID()}` })
    .returning({ id: developers.id });
  developerId = developer.id;

  const propertyA = await publishTestProperty("2bhk");
  propertyAId = propertyA.propertyId;
  propertyAVariantId = propertyA.unitVariantId;

  const propertyB = await publishTestProperty("3bhk");
  propertyBId = propertyB.propertyId;

  const buyer = await signUpTestBuyer(
    `comparisons-buyer-${randomUUID()}@example.test`,
  );
  buyerUserId = buyer.userId;
  buyerCookie = buyer.cookie;
  createdBuyerIds.push(buyerUserId);

  const otherBuyer = await signUpTestBuyer(
    `comparisons-other-buyer-${randomUUID()}@example.test`,
  );
  otherBuyerCookie = otherBuyer.cookie;
  createdBuyerIds.push(otherBuyer.userId);
});

afterAll(async () => {
  await db
    .delete(comparisonItems)
    .where(
      inArray(
        comparisonItems.comparisonId,
        db
          .select({ id: comparisons.id })
          .from(comparisons)
          .where(inArray(comparisons.userId, createdBuyerIds)),
      ),
    );
  await db
    .delete(comparisons)
    .where(inArray(comparisons.userId, createdBuyerIds));
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

describe("POST /api/v1/comparisons", () => {
  it("401s with no session", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/v1/comparisons", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: [{ propertyId: propertyAId }] }),
      }),
    );
    expect(response.status).toBe(401);
  });

  it("404s on a nonexistent property", async () => {
    const response = await POST(
      request(buyerCookie, { items: [{ propertyId: randomUUID() }] }),
    );
    expect(response.status).toBe(404);
    const body = (await response.json()) as ApiErrorBody;
    expect(body.error.code).toBe("property_not_found");
  });

  it("404s when a unit variant doesn't belong to the given property", async () => {
    const response = await POST(
      request(buyerCookie, {
        items: [{ propertyId: propertyBId, unitVariantId: propertyAVariantId }],
      }),
    );
    expect(response.status).toBe(404);
    const body = (await response.json()) as ApiErrorBody;
    expect(body.error.code).toBe("unit_variant_not_found");
  });

  it("creates a comparison with ordered items and no forbidden keys", async () => {
    const response = await POST(
      request(buyerCookie, {
        items: [
          { propertyId: propertyBId },
          { propertyId: propertyAId, unitVariantId: propertyAVariantId },
        ],
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(
      body.items.map((item: { propertyId: string }) => item.propertyId),
    ).toEqual([propertyBId, propertyAId]);
    expect(body.items[0].displayOrder).toBe(0);
    expect(body.items[1].displayOrder).toBe(1);
    expect(findForbiddenKeys(body)).toEqual([]);
  });

  it("returns the comparison already saved when the same one is saved again, in any order", async () => {
    const items = [
      { propertyId: propertyBId },
      { propertyId: propertyAId, unitVariantId: propertyAVariantId },
    ];
    const first = await (await POST(request(buyerCookie, { items }))).json();
    const again = await (
      await POST(request(buyerCookie, { items: [...items].reverse() }))
    ).json();

    expect(again.id).toBe(first.id);
    const list = await (
      await GET(
        new NextRequest("http://localhost/api/v1/comparisons", {
          headers: { cookie: buyerCookie },
        }),
      )
    ).json();
    expect(
      list.data.filter((c: { id: string }) => c.id === first.id),
    ).toHaveLength(1);
  });
});

describe("GET /api/v1/comparisons", () => {
  it("401s with no session", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/v1/comparisons"),
    );
    expect(response.status).toBe(401);
  });

  it("lists only the caller's comparisons", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/v1/comparisons", {
        headers: { cookie: buyerCookie },
      }),
    );
    const body = await response.json();
    expect(body.data.length).toBeGreaterThan(0);

    const otherResponse = await GET(
      new NextRequest("http://localhost/api/v1/comparisons", {
        headers: { cookie: otherBuyerCookie },
      }),
    );
    const otherBody = await otherResponse.json();
    expect(otherBody.data).toEqual([]);
  });
});

describe("DELETE /api/v1/comparisons/{id}", () => {
  const remove = (id: string, cookie?: string) =>
    DELETE(
      new NextRequest(`http://localhost/api/v1/comparisons/${id}`, {
        method: "DELETE",
        headers: cookie ? { cookie } : {},
      }),
      { params: Promise.resolve({ id }) },
    );
  const listIds = async (cookie: string): Promise<string[]> => {
    const body = await (
      await GET(
        new NextRequest("http://localhost/api/v1/comparisons", {
          headers: { cookie },
        }),
      )
    ).json();
    return body.data.map((c: { id: string }) => c.id);
  };

  it("401s with no session", async () => {
    expect((await remove(randomUUID())).status).toBe(401);
  });

  it("404s on an unknown or malformed id", async () => {
    expect((await remove(randomUUID(), buyerCookie)).status).toBe(404);
    expect((await remove("not-a-uuid", buyerCookie)).status).toBe(404);
  });

  it("removes the caller's own comparison, and only that one", async () => {
    const saved = await (
      await POST(request(buyerCookie, { items: [{ propertyId: propertyAId }] }))
    ).json();
    expect(await listIds(buyerCookie)).toContain(saved.id);

    const response = await remove(saved.id, buyerCookie);
    expect(response.status).toBe(204);

    const remaining = await listIds(buyerCookie);
    expect(remaining).not.toContain(saved.id);
    expect(remaining.length).toBeGreaterThan(0);
  });

  it("404s on another buyer's comparison and leaves it in place", async () => {
    const saved = await (
      await POST(request(buyerCookie, { items: [{ propertyId: propertyBId }] }))
    ).json();

    expect((await remove(saved.id, otherBuyerCookie)).status).toBe(404);
    expect(await listIds(buyerCookie)).toContain(saved.id);
  });
});

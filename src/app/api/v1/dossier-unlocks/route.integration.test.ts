import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  developers,
  dossierUnlocks,
  properties,
  propertyRevisions,
  propertySubmissionFields,
  propertySubmissions,
} from "@/db/schema/catalog";
import { users } from "@/db/schema/auth";
import { publishSubmission } from "@/lib/submissions/publisher";
import { findForbiddenKeys } from "@/lib/properties/no-price";
import type { ApiErrorBody } from "@/lib/properties/http";
import {
  signUpTestBuyer,
  verifyTestBuyerPhone,
} from "@/lib/buyer/test-support";
import { POST } from "./route";

const submitterUserId = `dossier-unlocks-submitter-${randomUUID()}`;
let developerId: string;
let propertyId: string;
let verifiedBuyerUserId: string;
let verifiedBuyerCookie: string;
let unverifiedBuyerCookie: string;

const createdSubmissionIds: string[] = [];
const createdPropertyIds: string[] = [];
const createdBuyerIds: string[] = [];

const request = (cookie: string, body: unknown): NextRequest =>
  new NextRequest("http://localhost/api/v1/dossier-unlocks", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  await db.insert(users).values({
    id: submitterUserId,
    name: "Dossier Unlocks Submitter",
    email: `${submitterUserId}@example.test`,
  });
  const [developer] = await db
    .insert(developers)
    .values({ name: `Dossier Unlocks Test Developer ${randomUUID()}` })
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
      "property.name": `Dossier Unlocks Test ${randomUUID()}`,
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

  const verifiedBuyer = await signUpTestBuyer(
    `dossier-verified-buyer-${randomUUID()}@example.test`,
  );
  verifiedBuyerUserId = verifiedBuyer.userId;
  verifiedBuyerCookie = verifiedBuyer.cookie;
  createdBuyerIds.push(verifiedBuyerUserId);
  await verifyTestBuyerPhone(verifiedBuyerUserId);

  const unverifiedBuyer = await signUpTestBuyer(
    `dossier-unverified-buyer-${randomUUID()}@example.test`,
  );
  unverifiedBuyerCookie = unverifiedBuyer.cookie;
  createdBuyerIds.push(unverifiedBuyer.userId);
});

afterAll(async () => {
  await db
    .delete(dossierUnlocks)
    .where(inArray(dossierUnlocks.userId, createdBuyerIds));
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

describe("POST /api/v1/dossier-unlocks", () => {
  it("401s with no session", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/v1/dossier-unlocks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ propertyId }),
      }),
    );
    expect(response.status).toBe(401);
  });

  it("403s when the session's phone is unverified", async () => {
    const response = await POST(request(unverifiedBuyerCookie, { propertyId }));
    expect(response.status).toBe(403);
    const body = (await response.json()) as ApiErrorBody;
    expect(body.error.code).toBe("phone_not_verified");
  });

  it("404s on a nonexistent property", async () => {
    const response = await POST(
      request(verifiedBuyerCookie, { propertyId: randomUUID() }),
    );
    expect(response.status).toBe(404);
  });

  it("unlocks a dossier and is idempotent on a repeat call", async () => {
    const first = await POST(request(verifiedBuyerCookie, { propertyId }));
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.propertyId).toBe(propertyId);
    expect(findForbiddenKeys(firstBody)).toEqual([]);

    const second = await POST(request(verifiedBuyerCookie, { propertyId }));
    const secondBody = await second.json();
    expect(secondBody.otpVerifiedAt).toBe(firstBody.otpVerifiedAt);
  });
});

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { users } from "@/db/schema/auth";
import {
  developers,
  properties,
  propertyRevisions,
  propertySubmissionFields,
  propertySubmissions,
  reraFetchJobs,
} from "@/db/schema/catalog";
import { publishSubmission } from "@/lib/submissions/publisher";
import { listFailingReraChecks } from "./health";

const userId = `rera-health-${randomUUID()}`;
let developerId: string;
const submissionIds: string[] = [];
const propertyIds: string[] = [];

const publishedProperty = async () => {
  const number = `PR/GJ/TEST/${randomUUID().toUpperCase()}`;
  const [submission] = await db
    .insert(propertySubmissions)
    .values({
      developerId,
      submittedBy: userId,
      reviewedBy: userId,
      source: "manual_form",
      status: "approved",
      payload: {},
    })
    .returning({ id: propertySubmissions.id });
  submissionIds.push(submission.id);
  await db.insert(propertySubmissionFields).values(
    Object.entries({
      "property.name": `Health Test Tower ${randomUUID()}`,
      "property.type": "apartment",
      "property.city": "Ahmedabad",
      "property.locality": "Health Test Locality",
      "property.rera_registration_number": number,
    }).map(([fieldKey, value]) => ({
      submissionId: submission.id,
      fieldKey,
      value,
      reviewStatus: "confirmed" as const,
    })),
  );
  const result = await publishSubmission({
    submissionId: submission.id,
    actorUserId: userId,
    actorRole: "owner",
  });
  propertyIds.push(result.propertyId);
  return { propertyId: result.propertyId, number };
};

let clock = Date.UTC(2026, 8, 1);
const attempt = (
  propertyId: string,
  number: string,
  status: "succeeded" | "failed" | "running",
  error?: string,
) => {
  clock += 60_000;
  return db.insert(reraFetchJobs).values({
    propertyId,
    reraRegistrationNumber: number,
    status,
    error: error ?? null,
    runAt: new Date(clock),
    createdAt: new Date(clock),
  });
};

const failingFor = async (propertyId: string) =>
  (await listFailingReraChecks(db)).find(
    (check) => check.propertyId === propertyId,
  );

beforeAll(async () => {
  await db.insert(users).values({
    id: userId,
    name: "RERA Health Test",
    email: `${userId}@example.test`,
  });
  const [developer] = await db
    .insert(developers)
    .values({ name: `RERA Health Developer ${randomUUID()}` })
    .returning({ id: developers.id });
  developerId = developer.id;
});

afterAll(async () => {
  await db
    .delete(reraFetchJobs)
    .where(inArray(reraFetchJobs.propertyId, propertyIds));
  await db
    .delete(propertyRevisions)
    .where(inArray(propertyRevisions.submissionId, submissionIds));
  await db
    .delete(propertySubmissions)
    .where(inArray(propertySubmissions.id, submissionIds));
  await db.delete(properties).where(inArray(properties.id, propertyIds));
  await db.delete(developers).where(eq(developers.id, developerId));
  await db.delete(users).where(eq(users.id, userId));
});

describe("listing RERA checks that keep failing", () => {
  it("says nothing about a property never checked, or with one failure", async () => {
    const never = await publishedProperty();
    expect(await failingFor(never.propertyId)).toBeUndefined();

    const once = await publishedProperty();
    await attempt(once.propertyId, once.number, "failed", "no answer");
    expect(await failingFor(once.propertyId)).toBeUndefined();
  });

  it("reports two or more failures in a row, with the latest reason and the last time it worked", async () => {
    const { propertyId, number } = await publishedProperty();
    await attempt(propertyId, number, "succeeded");
    await attempt(propertyId, number, "failed", "first");
    await attempt(propertyId, number, "failed", "GujRERA did not answer.");

    const check = await failingFor(propertyId);
    expect(check).toMatchObject({
      consecutiveFailures: 2,
      lastError: "GujRERA did not answer.",
    });
    expect(check?.lastSuccessAt).toBeInstanceOf(Date);
    expect(check?.submissionId).not.toBeNull();
  });

  it("stops reporting once a check works again, and reports never-worked as such", async () => {
    const recovered = await publishedProperty();
    await attempt(recovered.propertyId, recovered.number, "failed", "x");
    await attempt(recovered.propertyId, recovered.number, "failed", "y");
    await attempt(recovered.propertyId, recovered.number, "succeeded");
    expect(await failingFor(recovered.propertyId)).toBeUndefined();

    const never = await publishedProperty();
    await attempt(never.propertyId, never.number, "failed", "a");
    await attempt(never.propertyId, never.number, "failed", "b");
    expect((await failingFor(never.propertyId))?.lastSuccessAt).toBeNull();
  });

  it("ignores a check still running", async () => {
    const { propertyId, number } = await publishedProperty();
    await attempt(propertyId, number, "failed", "a");
    await attempt(propertyId, number, "failed", "b");
    await attempt(propertyId, number, "running");
    expect((await failingFor(propertyId))?.consecutiveFailures).toBe(2);
  });
});

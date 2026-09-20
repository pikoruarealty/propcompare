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
import { getPublishedPropertyBySlug } from "./queries";

const userId = `rera-source-${randomUUID()}`;
let developerId: string;
const submissionIds: string[] = [];
const propertyIds: string[] = [];

/** What a stored fetch holds: the normalized record, never a raw response. */
const record = (overrides: Record<string, unknown> = {}) => ({
  record: {
    regulatorCode: "gujrera",
    registrationNumber: "",
    projectName: "Whatever RERA calls it",
    promoterName: "Sun VN Developers LLP",
    completionDate: "2027-04-30",
    totalUnits: 76,
    constructionProgressPercent: 67.71875,
    ...overrides,
  },
});

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
      "property.name": `Source Test Tower ${randomUUID()}`,
      "property.type": "apartment",
      "property.city": "Ahmedabad",
      "property.locality": "Source Test Locality",
      "property.rera_registration_number": number,
      "property.total_units": 76,
      "property.possession_date": "2027-04-30",
      "property.rera_construction_progress_percent": 67.72,
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
  const [row] = await db
    .select({ slug: properties.slug })
    .from(properties)
    .where(eq(properties.id, result.propertyId));
  return { propertyId: result.propertyId, number, slug: row.slug, submission };
};

const check = (
  values: Partial<typeof reraFetchJobs.$inferInsert> & {
    reraRegistrationNumber: string;
  },
) => db.insert(reraFetchJobs).values({ status: "succeeded", ...values });

beforeAll(async () => {
  await db.insert(users).values({
    id: userId,
    name: "RERA Source Test",
    email: `${userId}@example.test`,
  });
  const [developer] = await db
    .insert(developers)
    .values({ name: `RERA Source Developer ${randomUUID()}` })
    .returning({ id: developers.id });
  developerId = developer.id;
});

afterAll(async () => {
  if (propertyIds.length > 0) {
    await db
      .delete(reraFetchJobs)
      .where(inArray(reraFetchJobs.propertyId, propertyIds));
  }
  if (submissionIds.length > 0) {
    await db
      .delete(reraFetchJobs)
      .where(inArray(reraFetchJobs.submissionId, submissionIds));
    await db
      .delete(propertyRevisions)
      .where(inArray(propertyRevisions.submissionId, submissionIds));
    await db
      .delete(propertySubmissions)
      .where(inArray(propertySubmissions.id, submissionIds));
  }
  if (propertyIds.length > 0) {
    await db.delete(properties).where(inArray(properties.id, propertyIds));
  }
  await db.delete(developers).where(eq(developers.id, developerId));
  await db.delete(users).where(eq(users.id, userId));
});

describe("the dossier's regulator source", () => {
  it("credits nothing for a property whose RERA record was never checked", async () => {
    const { slug } = await publishedProperty();
    const dossier = await getPublishedPropertyBySlug(db, slug);
    expect(dossier?.rera).toMatchObject({
      lastCheckedAt: null,
      sourcedFacts: [],
    });
  });

  it("credits the facts the last successful check stated exactly, with when it ran", async () => {
    const { propertyId, number, slug } = await publishedProperty();
    const ranAt = new Date("2026-09-20T06:30:00Z");
    await check({
      propertyId,
      reraRegistrationNumber: number,
      runAt: ranAt,
      fetchedPayload: record({ registrationNumber: number }),
    });

    const dossier = await getPublishedPropertyBySlug(db, slug);
    expect(dossier?.rera.lastCheckedAt).toBe(ranAt.toISOString());
    expect(dossier?.rera.sourcedFacts).toEqual([
      "registration_number",
      "construction_progress",
      "possession_date",
      "total_units",
    ]);
    // Only dates and named facts leave the query: nothing of the stored record.
    expect(JSON.stringify(dossier)).not.toMatch(
      /promoter|Whatever RERA calls/i,
    );
  });

  it("does not credit a fact that RERA states differently from what is published", async () => {
    const { propertyId, number, slug } = await publishedProperty();
    await check({
      propertyId,
      reraRegistrationNumber: number,
      runAt: new Date("2026-09-20T06:30:00Z"),
      fetchedPayload: record({
        registrationNumber: number,
        completionDate: "2028-01-31",
        totalUnits: 90,
      }),
    });
    const dossier = await getPublishedPropertyBySlug(db, slug);
    expect(dossier?.rera.sourcedFacts).toEqual([
      "registration_number",
      "construction_progress",
    ]);
  });

  it("uses the latest successful check, ignoring failures and older checks", async () => {
    const { propertyId, number, slug } = await publishedProperty();
    await check({
      propertyId,
      reraRegistrationNumber: number,
      runAt: new Date("2026-06-01T00:00:00Z"),
      fetchedPayload: record({ registrationNumber: number }),
    });
    await check({
      propertyId,
      reraRegistrationNumber: number,
      runAt: new Date("2026-09-01T00:00:00Z"),
      fetchedPayload: record({
        registrationNumber: number,
        totalUnits: 90,
      }),
    });
    // The newest attempt failed: it says nothing about the record.
    await check({
      propertyId,
      reraRegistrationNumber: number,
      status: "failed",
      runAt: new Date("2026-09-15T00:00:00Z"),
      error: "GujRERA did not answer.",
    });

    const dossier = await getPublishedPropertyBySlug(db, slug);
    expect(dossier?.rera.lastCheckedAt).toBe("2026-09-01T00:00:00.000Z");
    expect(dossier?.rera.sourcedFacts).not.toContain("total_units");
  });

  it("counts a check made on the draft before the property existed", async () => {
    const { submission, number, slug } = await publishedProperty();
    await check({
      submissionId: submission.id,
      reraRegistrationNumber: number,
      runAt: new Date("2026-09-19T00:00:00Z"),
      fetchedPayload: record({ registrationNumber: number }),
    });
    const dossier = await getPublishedPropertyBySlug(db, slug);
    expect(dossier?.rera.lastCheckedAt).toBe("2026-09-19T00:00:00.000Z");
    expect(dossier?.rera.sourcedFacts).toContain("registration_number");
  });
});

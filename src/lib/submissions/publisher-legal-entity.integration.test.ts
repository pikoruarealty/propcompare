import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { users } from "@/db/schema/auth";
import {
  developerLegalEntities,
  developers,
  properties,
  propertyRevisions,
  propertySubmissionFields,
  propertySubmissions,
} from "@/db/schema/catalog";
import { publishSubmission, SubmissionPublishError } from "./publisher";

const testUserId = `publisher-entity-user-${randomUUID()}`;
let developerId: string;
let otherDeveloperId: string;
const createdSubmissionIds: string[] = [];
const createdPropertyIds: string[] = [];

const approvedSubmission = async (
  fields: Record<string, unknown>,
): Promise<string> => {
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
    Object.entries(fields).map(([fieldKey, value]) => ({
      submissionId: submission.id,
      fieldKey,
      value,
      reviewStatus: "confirmed" as const,
    })),
  );
  return submission.id;
};

const baseFields = (name: string) => ({
  "property.name": name,
  "property.type": "apartment",
  "property.city": "Ahmedabad",
  "property.locality": "Legal Entity Locality",
});

beforeAll(async () => {
  await db.insert(users).values({
    id: testUserId,
    name: "Publisher Entity Test",
    email: `${testUserId}@example.test`,
  });
  const created = await db
    .insert(developers)
    .values([
      { name: `Publisher Entity Developer ${randomUUID()}` },
      { name: `Publisher Entity Other ${randomUUID()}` },
    ])
    .returning({ id: developers.id });
  developerId = created[0].id;
  otherDeveloperId = created[1].id;
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
  await db.delete(developers).where(eq(developers.id, otherDeveloperId));
  await db.delete(users).where(eq(users.id, testUserId));
});

describe("publishSubmission: promoter legal entity", () => {
  it("links the property to the chosen legal entity of its developer", async () => {
    const [entity] = await db
      .insert(developerLegalEntities)
      .values({
        developerId,
        legalName: `Publisher Test Realty ${randomUUID()}`,
        entityType: "company",
      })
      .returning({ id: developerLegalEntities.id });
    const submissionId = await approvedSubmission({
      ...baseFields(`Entity Linked Tower ${randomUUID()}`),
      "property.legal_entity_id": entity.id,
    });

    const result = await publishSubmission({
      submissionId,
      actorUserId: testUserId,
      actorRole: "owner",
    });
    createdPropertyIds.push(result.propertyId);

    const [property] = await db
      .select({ legalEntityId: properties.legalEntityId })
      .from(properties)
      .where(eq(properties.id, result.propertyId));
    expect(property.legalEntityId).toBe(entity.id);
  });

  it("publishes without an entity when none is chosen", async () => {
    const submissionId = await approvedSubmission(
      baseFields(`Entity Free Tower ${randomUUID()}`),
    );
    const result = await publishSubmission({
      submissionId,
      actorUserId: testUserId,
      actorRole: "owner",
    });
    createdPropertyIds.push(result.propertyId);
    const [property] = await db
      .select({ legalEntityId: properties.legalEntityId })
      .from(properties)
      .where(eq(properties.id, result.propertyId));
    expect(property.legalEntityId).toBeNull();
  });

  it("refuses another developer's legal entity and publishes nothing", async () => {
    const [foreignEntity] = await db
      .insert(developerLegalEntities)
      .values({
        developerId: otherDeveloperId,
        legalName: `Foreign Realty ${randomUUID()}`,
        entityType: "llp",
      })
      .returning({ id: developerLegalEntities.id });
    const name = `Foreign Entity Tower ${randomUUID()}`;
    const submissionId = await approvedSubmission({
      ...baseFields(name),
      "property.legal_entity_id": foreignEntity.id,
    });

    await expect(
      publishSubmission({
        submissionId,
        actorUserId: testUserId,
        actorRole: "owner",
      }),
    ).rejects.toThrow(SubmissionPublishError);

    expect(
      await db.select().from(properties).where(eq(properties.name, name)),
    ).toEqual([]);
    const [submission] = await db
      .select({ status: propertySubmissions.status })
      .from(propertySubmissions)
      .where(eq(propertySubmissions.id, submissionId));
    expect(submission.status).toBe("approved");
  });
});

describe("publishSubmission: dry run", () => {
  it("runs the real path and reports the outcome, but keeps nothing", async () => {
    const name = `Dry Run Tower ${randomUUID()}`;
    const submissionId = await approvedSubmission(baseFields(name));

    const result = await publishSubmission({
      submissionId,
      actorUserId: testUserId,
      actorRole: "owner",
      dryRun: true,
    });

    expect(result).toMatchObject({
      isNewProperty: true,
      revisionId: "dry-run",
    });
    expect(
      await db.select().from(properties).where(eq(properties.name, name)),
    ).toEqual([]);
    const [submission] = await db
      .select({ status: propertySubmissions.status })
      .from(propertySubmissions)
      .where(eq(propertySubmissions.id, submissionId));
    expect(submission.status).toBe("approved");
  });

  it("still fails a dry run for the reasons a real publish would", async () => {
    const submissionId = await approvedSubmission({
      "property.name": `Incomplete Tower ${randomUUID()}`,
    });
    await expect(
      publishSubmission({
        submissionId,
        actorUserId: testUserId,
        actorRole: "owner",
        dryRun: true,
      }),
    ).rejects.toThrow(/requires property\.name, property\.type/);
  });
});

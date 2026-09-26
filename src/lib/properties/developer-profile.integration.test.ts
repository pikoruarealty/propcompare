import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { users } from "@/db/schema/auth";
import {
  developers,
  properties,
  propertyRevisions,
  propertySubmissionFields,
  propertySubmissions,
} from "@/db/schema/catalog";
import { publishSubmission } from "@/lib/submissions/publisher";
import { getPublicDeveloper } from "./developer-profile";
import { findForbiddenKeys } from "./no-price";

/**
 * The public developer profile against the real database: a developer with a
 * listed property shows that project, an unknown id is absent, and no
 * price-shaped key is present.
 *
 * The listed property is this file's own, published through the one write path,
 * so the test does not depend on what a database happens to contain (a freshly
 * seeded one has no property at all).
 */
const suffix = randomUUID();
const userId = `profile-user-${suffix}`;
let developerId: string;
let propertyId: string;
let submissionId: string;

beforeAll(async () => {
  await db
    .insert(users)
    .values({ id: userId, name: userId, email: `${userId}@example.test` });
  const [developer] = await db
    .insert(developers)
    .values({ name: `Profile Listed Developer ${suffix}` })
    .returning({ id: developers.id });
  developerId = developer.id;

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
  submissionId = submission.id;
  await db.insert(propertySubmissionFields).values(
    Object.entries({
      "property.name": `Profile Tower ${suffix}`,
      "property.type": "apartment",
      "property.city": "Ahmedabad",
      "property.locality": "Profile Locality",
    }).map(([fieldKey, value]) => ({
      submissionId,
      fieldKey,
      value,
      reviewStatus: "confirmed" as const,
    })),
  );
  propertyId = (
    await publishSubmission({
      submissionId,
      actorUserId: userId,
      actorRole: "owner",
    })
  ).propertyId;
});

afterAll(async () => {
  await db
    .delete(propertyRevisions)
    .where(eq(propertyRevisions.submissionId, submissionId));
  await db
    .delete(propertySubmissions)
    .where(eq(propertySubmissions.id, submissionId));
  await db.delete(properties).where(eq(properties.id, propertyId));
  await db.delete(developers).where(eq(developers.id, developerId));
  await db.delete(users).where(eq(users.id, userId));
});

describe("getPublicDeveloper", () => {
  it("returns a developer with only their listed projects", async () => {
    const developer = await getPublicDeveloper(db, developerId);

    expect(developer).not.toBeNull();
    expect(developer?.properties.map((property) => property.id)).toEqual([
      propertyId,
    ]);
    for (const property of developer?.properties ?? []) {
      expect(property.developer.id).toBe(developerId);
    }
    expect(findForbiddenKeys(developer)).toEqual([]);
  });

  it("returns null for an id no developer has", async () => {
    expect(await getPublicDeveloper(db, randomUUID())).toBeNull();
  });

  it("shows a developer with no published project as having none", async () => {
    // Its own developer, so other test files creating and deleting developers at
    // the same moment cannot affect the result.
    const [created] = await db
      .insert(developers)
      .values({ name: `Profile test ${randomUUID()}` })
      .returning({ id: developers.id });
    try {
      const developer = await getPublicDeveloper(db, created.id);
      expect(developer?.properties).toEqual([]);
    } finally {
      await db.delete(developers).where(eq(developers.id, created.id));
    }
  });
});

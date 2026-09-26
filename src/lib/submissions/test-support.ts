import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema/auth";
import {
  developers,
  properties,
  propertyRevisions,
  propertySubmissionFields,
  propertySubmissions,
} from "@/db/schema/catalog";
import { publishSubmission } from "./publisher";

/**
 * Listed properties for an integration test, published through the one write
 * path (`publishSubmission`) under a throwaway developer and owner, so a test
 * never depends on what else a database happens to contain (a freshly seeded
 * one has no property at all) or on another test file's fixtures existing at
 * the same moment. `remove` deletes everything it made.
 */
export interface TestPortfolio {
  developerId: string;
  /** The throwaway owner that published them, to act on them in a test. */
  ownerUserId: string;
  properties: { id: string; slug: string; name: string }[];
  remove: () => Promise<void>;
}

export const publishTestPortfolio = async (
  label: string,
  count = 1,
  /**
   * Where the properties are. The default is a locality named for the label in
   * Ahmedabad; a test that counts properties near one another passes its own
   * city, so it does not depend on what else the database holds there.
   */
  where: { city?: string; locality?: string } = {},
): Promise<TestPortfolio> => {
  const suffix = randomUUID();
  const userId = `${label}-owner-${suffix}`;
  await db
    .insert(users)
    .values({ id: userId, name: userId, email: `${userId}@example.test` });
  const [developer] = await db
    .insert(developers)
    .values({ name: `${label} developer ${suffix}` })
    .returning({ id: developers.id });

  const submissionIds: string[] = [];
  const propertyIds: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const [submission] = await db
      .insert(propertySubmissions)
      .values({
        developerId: developer.id,
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
        "property.name": `${label} Tower ${index + 1} ${suffix}`,
        "property.type": "apartment",
        "property.city": where.city ?? "Ahmedabad",
        "property.locality": where.locality ?? `${label} Locality`,
      }).map(([fieldKey, value]) => ({
        submissionId: submission.id,
        fieldKey,
        value,
        reviewStatus: "confirmed" as const,
      })),
    );
    const { propertyId } = await publishSubmission({
      submissionId: submission.id,
      actorUserId: userId,
      actorRole: "owner",
    });
    propertyIds.push(propertyId);
  }

  const published = await db
    .select({ id: properties.id, slug: properties.slug, name: properties.name })
    .from(properties)
    .where(inArray(properties.id, propertyIds))
    .orderBy(properties.id);

  return {
    developerId: developer.id,
    ownerUserId: userId,
    properties: published,
    remove: async () => {
      // Its own submissions, and any later edit a test made to its properties
      // (an unlisting is an edit submission of its own).
      const later = await db
        .select({ id: propertySubmissions.id })
        .from(propertySubmissions)
        .where(inArray(propertySubmissions.propertyId, propertyIds));
      const allIds = [
        ...new Set([...submissionIds, ...later.map((row) => row.id)]),
      ];
      await db
        .delete(propertyRevisions)
        .where(inArray(propertyRevisions.submissionId, allIds));
      await db
        .delete(propertySubmissions)
        .where(inArray(propertySubmissions.id, allIds));
      await db.delete(properties).where(inArray(properties.id, propertyIds));
      await db.delete(developers).where(eq(developers.id, developer.id));
      await db.delete(users).where(eq(users.id, userId));
    },
  };
};

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { users } from "@/db/schema/auth";
import {
  developers,
  developerUsers,
  properties,
  propertyRevisions,
  propertySubmissionFields,
  propertySubmissions,
} from "@/db/schema/catalog";
import { publishSubmission } from "@/lib/submissions/publisher";
import { listDevelopers } from "./profiles";

const suffix = randomUUID();
const userIds = [`count-user-a-${suffix}`, `count-user-b-${suffix}`];
let busyDeveloperId: string;
let quietDeveloperId: string;
let propertyId: string;
let submissionId: string;

beforeAll(async () => {
  await db.insert(users).values(
    userIds.map((id) => ({
      id,
      name: id,
      email: `${id}@example.test`,
    })),
  );
  const created = await db
    .insert(developers)
    .values([
      { name: `Count Busy Developer ${suffix}` },
      { name: `Count Quiet Developer ${suffix}` },
    ])
    .returning({ id: developers.id });
  busyDeveloperId = created[0].id;
  quietDeveloperId = created[1].id;

  await db
    .insert(developerUsers)
    .values(
      userIds.map((userId) => ({ developerId: busyDeveloperId, userId })),
    );

  // One genuinely published property, through the one write path.
  const [submission] = await db
    .insert(propertySubmissions)
    .values({
      developerId: busyDeveloperId,
      submittedBy: userIds[0],
      reviewedBy: userIds[0],
      source: "manual_form",
      status: "approved",
      payload: {},
    })
    .returning({ id: propertySubmissions.id });
  submissionId = submission.id;
  await db.insert(propertySubmissionFields).values(
    Object.entries({
      "property.name": `Count Tower ${suffix}`,
      "property.type": "apartment",
      "property.city": "Ahmedabad",
      "property.locality": "Count Locality",
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
      actorUserId: userIds[0],
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
  await db
    .delete(developers)
    .where(inArray(developers.id, [busyDeveloperId, quietDeveloperId]));
  await db.delete(users).where(inArray(users.id, userIds));
});

describe("developer list counts", () => {
  it("counts the properties in our database and the linked users, per developer", async () => {
    const listed = await listDevelopers(db);
    const busy = listed.find((d) => d.id === busyDeveloperId);
    const quiet = listed.find((d) => d.id === quietDeveloperId);

    // A regression test: the counts once came back 0 for everyone because the
    // subquery compared its own columns with each other.
    expect(busy).toMatchObject({ properties: 1, linkedUsers: 2 });
    expect(quiet).toMatchObject({ properties: 0, linkedUsers: 0 });
  });
});

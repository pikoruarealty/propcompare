import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { users } from "@/db/schema/auth";
import {
  developers,
  properties,
  propertyMedia,
  propertyRevisions,
  propertySubmissionFields,
  propertySubmissionMedia,
  propertySubmissions,
} from "@/db/schema/catalog";
import { publishNow, PublishNowError } from "./publish-now";
import { editSubmissionField } from "./reconciliation";

/**
 * An owner publishing from wherever the submission is, and the situation that
 * locked an admin out: approved before the pictures were looked at.
 */

const suffix = randomUUID();
const adminId = `publish-now-${suffix}`;
let developerId: string;
const submissionIds: string[] = [];
const propertyIds: string[] = [];

const newSubmission = async (
  status: "draft" | "submitted" | "in_review" | "approved",
  pictures: { reviewStatus: "needs_review" | "confirmed" }[] = [],
) => {
  const [row] = await db
    .insert(propertySubmissions)
    .values({
      developerId,
      submittedBy: adminId,
      source: "manual_form",
      status,
      payload: {},
    })
    .returning({ id: propertySubmissions.id });
  submissionIds.push(row.id);
  for (const [key, value] of Object.entries({
    "property.name": `Publish Now Tower ${randomUUID()}`,
    "property.type": "apartment",
    "property.city": "Ahmedabad",
    "property.locality": "Publish Now Locality",
  })) {
    await editSubmissionField(db, {
      submissionId: row.id,
      fieldKey: key,
      value,
    });
  }
  for (const [index, picture] of pictures.entries()) {
    await db.insert(propertySubmissionMedia).values({
      submissionId: row.id,
      mediaType: "photo",
      sourceKind: "own",
      gcsPath: `synthetic/${suffix}-${row.id}-${index}.png`,
      attribution: "Test",
      displayOrder: index,
      isPublic: false,
      reviewStatus: picture.reviewStatus,
    });
  }
  return row.id;
};

const statusOf = async (id: string) =>
  (
    await db
      .select({ status: propertySubmissions.status })
      .from(propertySubmissions)
      .where(eq(propertySubmissions.id, id))
  )[0].status;

beforeAll(async () => {
  await db.insert(users).values({
    id: adminId,
    name: adminId,
    email: `${adminId}@example.test`,
  });
  const [developer] = await db
    .insert(developers)
    .values({ name: `Publish Now Developer ${suffix}` })
    .returning({ id: developers.id });
  developerId = developer.id;
});

afterAll(async () => {
  await db
    .delete(propertyMedia)
    .where(inArray(propertyMedia.propertyId, propertyIds));
  await db
    .delete(propertyRevisions)
    .where(inArray(propertyRevisions.submissionId, submissionIds));
  await db
    .delete(propertySubmissions)
    .where(inArray(propertySubmissions.id, submissionIds));
  await db.delete(properties).where(inArray(properties.id, propertyIds));
  await db.delete(developers).where(eq(developers.id, developerId));
  await db.delete(users).where(eq(users.id, adminId));
});

describe("publishNow", () => {
  it.each(["draft", "submitted", "in_review", "approved"] as const)(
    "publishes a submission that is %s, in one step",
    async (status) => {
      const id = await newSubmission(status);
      const result = await publishNow(db, {
        submissionId: id,
        actorUserId: adminId,
      });
      propertyIds.push(result.propertyId);
      expect(await statusOf(id)).toBe("published");
      const [property] = await db
        .select({ id: properties.id })
        .from(properties)
        .where(eq(properties.id, result.propertyId));
      expect(property).toBeDefined();
    },
  );

  it("still records who moved it through each stage", async () => {
    const id = await newSubmission("draft");
    const result = await publishNow(db, {
      submissionId: id,
      actorUserId: adminId,
    });
    propertyIds.push(result.propertyId);
    const [row] = await db
      .select()
      .from(propertySubmissions)
      .where(eq(propertySubmissions.id, id));
    expect(row.submittedAt).toBeInstanceOf(Date);
    expect(row.reviewedBy).toBe(adminId);
    expect(row.publishedAt).toBeInstanceOf(Date);
  });

  it("refuses, with the counts, while values or pictures are still waiting, and changes nothing", async () => {
    const id = await newSubmission("in_review", [
      { reviewStatus: "needs_review" },
    ]);
    await db
      .update(propertySubmissionFields)
      .set({ reviewStatus: "needs_review" })
      .where(
        and(
          eq(propertySubmissionFields.submissionId, id),
          eq(propertySubmissionFields.fieldKey, "property.city"),
        ),
      );

    await expect(
      publishNow(db, { submissionId: id, actorUserId: adminId }),
    ).rejects.toMatchObject({
      code: "unconfirmed",
      pending: { fields: 1, pictures: 1 },
    });
    expect(await statusOf(id)).toBe("in_review");
  });

  it("with the decision to confirm the rest, confirms them as they stand (pictures public) and publishes", async () => {
    const id = await newSubmission("in_review", [
      { reviewStatus: "needs_review" },
    ]);
    await db
      .update(propertySubmissionFields)
      .set({ reviewStatus: "needs_review" })
      .where(eq(propertySubmissionFields.submissionId, id));

    const result = await publishNow(db, {
      submissionId: id,
      actorUserId: adminId,
      confirmRemaining: true,
    });
    propertyIds.push(result.propertyId);

    expect(await statusOf(id)).toBe("published");
    const live = await db
      .select({ gcsPath: propertyMedia.gcsPath })
      .from(propertyMedia)
      .where(eq(propertyMedia.propertyId, result.propertyId));
    expect(live).toHaveLength(1);
  });

  it("does not publish a picture the admin rejected", async () => {
    const id = await newSubmission("approved", [
      { reviewStatus: "confirmed" },
      { reviewStatus: "needs_review" },
    ]);
    await db
      .update(propertySubmissionMedia)
      .set({ reviewStatus: "confirmed", isPublic: true })
      .where(
        eq(propertySubmissionMedia.gcsPath, `synthetic/${suffix}-${id}-0.png`),
      );
    await db
      .update(propertySubmissionMedia)
      .set({ reviewStatus: "rejected" })
      .where(
        eq(propertySubmissionMedia.gcsPath, `synthetic/${suffix}-${id}-1.png`),
      );

    const result = await publishNow(db, {
      submissionId: id,
      actorUserId: adminId,
    });
    propertyIds.push(result.propertyId);
    const live = await db
      .select({ gcsPath: propertyMedia.gcsPath })
      .from(propertyMedia)
      .where(eq(propertyMedia.propertyId, result.propertyId));
    expect(live.map((row) => row.gcsPath)).toEqual([
      `synthetic/${suffix}-${id}-0.png`,
    ]);
  });

  it("can fix an approved submission and publish it, so nothing is stuck", async () => {
    const id = await newSubmission("approved", [
      { reviewStatus: "needs_review" },
    ]);
    // The picture was never reviewed and the submission is already approved: the
    // admin can still edit a field and decide on the picture, then publish.
    await editSubmissionField(db, {
      submissionId: id,
      fieldKey: "property.locality",
      value: "Fixed after approval",
    });
    const result = await publishNow(db, {
      submissionId: id,
      actorUserId: adminId,
      confirmRemaining: true,
    });
    propertyIds.push(result.propertyId);
    const [property] = await db
      .select({ locality: properties.locality })
      .from(properties)
      .where(eq(properties.id, result.propertyId));
    expect(property.locality).toBe("Fixed after approval");
  });

  it("refuses one that is already published, and one that does not exist", async () => {
    const id = await newSubmission("draft");
    const result = await publishNow(db, {
      submissionId: id,
      actorUserId: adminId,
    });
    propertyIds.push(result.propertyId);
    await expect(
      publishNow(db, { submissionId: id, actorUserId: adminId }),
    ).rejects.toMatchObject({ code: "invalid_state" });
    await expect(
      publishNow(db, { submissionId: randomUUID(), actorUserId: adminId }),
    ).rejects.toBeInstanceOf(PublishNowError);
    await expect(
      publishNow(db, { submissionId: "nope", actorUserId: adminId }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

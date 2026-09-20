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
} from "@/db/schema/catalog";
import { createEditSubmission } from "./edit-property";
import { publishSubmission } from "./publisher";
import { getSubmissionDetail, listSubmissionQueue } from "./queue";

const suffix = randomUUID();
const userId = `queue-versions-${suffix}`;
const name = `Queue Versions Tower ${suffix}`;
let developerId: string;
let propertyId: string;
let originalId: string;
const submissionIds: string[] = [];

const idsShown = async (status?: Parameters<typeof listSubmissionQueue>[1]) =>
  (await listSubmissionQueue(db, status)).map((row) => row.id);

const publishEdit = async (fields: Record<string, unknown>) => {
  const { submissionId } = await createEditSubmission(db, {
    propertyId,
    submittedBy: userId,
  });
  submissionIds.push(submissionId);
  await db.insert(propertySubmissionFields).values(
    Object.entries(fields).map(([fieldKey, value]) => ({
      submissionId,
      fieldKey,
      value,
      reviewStatus: "confirmed" as const,
    })),
  );
  await db
    .update(propertySubmissions)
    .set({ status: "approved", reviewedBy: userId })
    .where(eq(propertySubmissions.id, submissionId));
  await publishSubmission({
    submissionId,
    actorUserId: userId,
    actorRole: "owner",
  });
  return submissionId;
};

beforeAll(async () => {
  await db
    .insert(users)
    .values({ id: userId, name: userId, email: `${userId}@example.test` });
  const [developer] = await db
    .insert(developers)
    .values({ name: `Queue Versions Developer ${suffix}` })
    .returning({ id: developers.id });
  developerId = developer.id;

  const [original] = await db
    .insert(propertySubmissions)
    .values({
      developerId,
      submittedBy: userId,
      reviewedBy: userId,
      source: "ocr_brochure",
      status: "approved",
      payload: {},
    })
    .returning({ id: propertySubmissions.id });
  originalId = original.id;
  submissionIds.push(originalId);
  await db.insert(propertySubmissionFields).values(
    Object.entries({
      "property.name": name,
      "property.type": "apartment",
      "property.city": "Ahmedabad",
      "property.locality": "Versions Locality",
    }).map(([fieldKey, value]) => ({
      submissionId: originalId,
      fieldKey,
      value,
      reviewStatus: "confirmed" as const,
    })),
  );
  propertyId = (
    await publishSubmission({
      submissionId: originalId,
      actorUserId: userId,
      actorRole: "owner",
    })
  ).propertyId;
});

afterAll(async () => {
  await db
    .delete(propertyRevisions)
    .where(inArray(propertyRevisions.submissionId, submissionIds));
  await db
    .delete(propertySubmissions)
    .where(inArray(propertySubmissions.id, submissionIds));
  await db.delete(properties).where(eq(properties.id, propertyId));
  await db.delete(developers).where(eq(developers.id, developerId));
  await db.delete(users).where(eq(users.id, userId));
});

describe("the queue treats a property and its edits as one thing", () => {
  it("shows the brochure that created a property as its original, not an edit", async () => {
    const row = (await listSubmissionQueue(db)).find(
      (item) => item.id === originalId,
    );

    expect(row).toMatchObject({
      propertyId,
      isEdit: false,
      status: "published",
    });
  });

  it("marks an open edit as an edit, and shows one row for the property, not two", async () => {
    const { submissionId: editId } = await createEditSubmission(db, {
      propertyId,
      submittedBy: userId,
    });
    submissionIds.push(editId);

    const rows = (await listSubmissionQueue(db)).filter(
      (item) => item.propertyId === propertyId,
    );

    expect(rows.map((row) => row.id)).toEqual([editId]);
    expect(rows[0]).toMatchObject({ isEdit: true, status: "draft" });
    // The original is hidden from the list but still opens by id.
    expect(await idsShown()).not.toContain(originalId);
    expect(
      (await listSubmissionQueue(db, { id: originalId }))[0],
    ).toMatchObject({ id: originalId, isEdit: false });

    // Reject it: the property's row goes back to the published original.
    await db
      .update(propertySubmissions)
      .set({ status: "rejected" })
      .where(eq(propertySubmissions.id, editId));
    expect(await idsShown()).toContain(originalId);
    expect(await idsShown()).not.toContain(editId);
  });

  it("lists a rejected edit only under the Rejected filter", async () => {
    const rejected = await listSubmissionQueue(db, { status: "rejected" });

    expect(
      rejected.filter((row) => row.propertyId === propertyId),
    ).toHaveLength(1);
    const all = await listSubmissionQueue(db);
    expect(all.filter((row) => row.propertyId === propertyId)).toHaveLength(1);
  });

  it("after an edit is published, that edit is the row, labelled an edit", async () => {
    const editId = await publishEdit({ "property.total_units": 40 });

    const rows = (await listSubmissionQueue(db)).filter(
      (item) => item.propertyId === propertyId,
    );

    expect(rows.map((row) => row.id)).toEqual([editId]);
    expect(rows[0]).toMatchObject({ isEdit: true, status: "published" });
    expect(
      (await listSubmissionQueue(db, { status: "published" })).filter(
        (item) => item.propertyId === propertyId,
      ),
    ).toHaveLength(1);
  });

  it("keeps every version reachable from the submission, oldest first", async () => {
    const latest = (await listSubmissionQueue(db)).find(
      (item) => item.propertyId === propertyId,
    )!;

    const detail = await getSubmissionDetail(db, latest.id);

    expect(detail?.versions.map((version) => version.kind)).toEqual([
      "original",
      "edit",
      "edit",
    ]);
    expect(detail?.versions[0].id).toBe(originalId);
    expect(detail?.versions.map((version) => version.status)).toEqual([
      "published",
      "rejected",
      "published",
    ]);
  });

  it("records what each published edit changed, and nothing for one never published", async () => {
    const latest = (await listSubmissionQueue(db)).find(
      (item) => item.propertyId === propertyId,
    )!;

    const detail = await getSubmissionDetail(db, latest.id);

    const [original, rejected, published] = detail!.versions;
    expect(original.publishedAt).toBeInstanceOf(Date);
    expect(original.changes).toEqual([]);
    expect(rejected.publishedAt).toBeNull();
    expect(rejected.changes).toEqual([]);
    expect(published.publishedAt).toBeInstanceOf(Date);
    expect(published.changes).toEqual([
      {
        fieldKey: "property.total_units",
        label: expect.any(String),
        from: null,
        to: "40",
        complex: false,
      },
    ]);
  });

  it("leaves a new property with no versions", async () => {
    const [draft] = await db
      .insert(propertySubmissions)
      .values({
        developerId,
        source: "manual_form",
        status: "draft",
        payload: {},
      })
      .returning({ id: propertySubmissions.id });
    submissionIds.push(draft.id);

    const detail = await getSubmissionDetail(db, draft.id);
    const row = (await listSubmissionQueue(db)).find(
      (item) => item.id === draft.id,
    );

    expect(detail?.versions).toEqual([]);
    expect(row).toMatchObject({ propertyId: null, isEdit: false });
  });
});

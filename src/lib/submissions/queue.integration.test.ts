import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  developers,
  propertySubmissionFields,
  propertySubmissions,
} from "@/db/schema/catalog";
import { getSubmissionDetail, listSubmissionQueue } from "./queue";

let developerId: string;
let submissionId: string;

afterAll(async () => {
  if (submissionId) {
    await db
      .delete(propertySubmissions)
      .where(eq(propertySubmissions.id, submissionId));
  }
  if (developerId) {
    await db.delete(developers).where(eq(developers.id, developerId));
  }
});

describe("submission queue read model", () => {
  it("shows a draft with names taken from its field candidates", async () => {
    const [developer] = await db
      .insert(developers)
      .values({ name: `Queue Test Developer ${randomUUID()}` })
      .returning({ id: developers.id });
    developerId = developer.id;

    const [submission] = await db
      .insert(propertySubmissions)
      .values({
        developerId,
        source: "manual_form",
        status: "draft",
        payload: {},
      })
      .returning({ id: propertySubmissions.id });
    submissionId = submission.id;

    await db.insert(propertySubmissionFields).values([
      { submissionId, fieldKey: "property.name", value: "Queue Test Tower" },
      { submissionId, fieldKey: "property.city", value: "Ahmedabad" },
    ]);

    const queue = await listSubmissionQueue(db);
    const item = queue.find((row) => row.id === submissionId);
    expect(item).toMatchObject({
      status: "draft",
      source: "manual_form",
      propertyName: "Queue Test Tower",
      city: "Ahmedabad",
      locality: null,
      fieldCount: 2,
      needsReviewCount: 2,
    });
    expect(item?.developerName).toMatch(/Queue Test Developer/);

    expect(
      (await listSubmissionQueue(db, { status: "published" })).some(
        (row) => row.id === submissionId,
      ),
    ).toBe(false);

    const detail = await getSubmissionDetail(db, submissionId);
    expect(detail?.fields.map((f) => f.fieldKey)).toEqual([
      "property.city",
      "property.name",
    ]);
  });

  it("returns null for an unknown or malformed id", async () => {
    expect(await getSubmissionDetail(db, randomUUID())).toBeNull();
    expect(await getSubmissionDetail(db, "nope")).toBeNull();
  });
});

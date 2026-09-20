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
import { createEditSubmission, EditPropertyError } from "./edit-property";
import { loadLiveValues } from "./live-values";
import { publishSubmission } from "./publisher";

const userId = `edit-property-${randomUUID()}`;
let developerId: string;
let propertyId: string;
const submissionIds: string[] = [];

const propertyName = `Edit Test Tower ${randomUUID()}`;

const draftFor = async () => {
  const { submissionId } = await createEditSubmission(db, {
    propertyId,
    submittedBy: userId,
  });
  submissionIds.push(submissionId);
  return submissionId;
};

beforeAll(async () => {
  await db.insert(users).values({
    id: userId,
    name: "Edit Property Test",
    email: `${userId}@example.test`,
  });
  const [developer] = await db
    .insert(developers)
    .values({ name: `Edit Property Developer ${randomUUID()}` })
    .returning({ id: developers.id });
  developerId = developer.id;

  // A genuinely published property, through the one write path.
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
      "property.name": propertyName,
      "property.type": "apartment",
      "property.city": "Ahmedabad",
      "property.locality": "Edit Locality",
      "property.total_units": 40,
      "property.rera_construction_progress_percent": 12.5,
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
  propertyId = result.propertyId;
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

describe("loadLiveValues", () => {
  it("reads the simple published values by field key, leaving out what is not held", async () => {
    const live = await loadLiveValues(db, propertyId);

    expect(live).toMatchObject({
      "property.name": propertyName,
      "property.type": "apartment",
      "property.city": "Ahmedabad",
      "property.locality": "Edit Locality",
      "property.total_units": 40,
      "property.rera_construction_progress_percent": 12.5,
    });
    // Not held: absent, never null and never invented.
    expect(live).not.toHaveProperty("property.rera_registration_number");
    expect(live).not.toHaveProperty("property.possession_date");
    expect(live).not.toHaveProperty("property.legal_entity_id");
  });

  it("returns nothing for a property that does not exist", async () => {
    expect(await loadLiveValues(db, randomUUID())).toEqual({});
  });
});

describe("createEditSubmission", () => {
  it("starts an empty draft bound to the property and its developer, and changes nothing live", async () => {
    const before = await loadLiveValues(db, propertyId);

    const submissionId = await draftFor();

    const [submission] = await db
      .select()
      .from(propertySubmissions)
      .where(eq(propertySubmissions.id, submissionId));
    expect(submission).toMatchObject({
      propertyId,
      developerId,
      status: "draft",
      source: "manual_form",
      submittedBy: userId,
    });
    const fields = await db
      .select()
      .from(propertySubmissionFields)
      .where(eq(propertySubmissionFields.submissionId, submissionId));
    expect(fields).toHaveLength(0);
    expect(await loadLiveValues(db, propertyId)).toEqual(before);
  });

  it("allows only one open edit per property, and names the one that is open", async () => {
    const error = await createEditSubmission(db, {
      propertyId,
      submittedBy: userId,
    }).catch((cause) => cause);

    expect(error).toBeInstanceOf(EditPropertyError);
    expect(error.code).toBe("edit_already_open");
    expect(submissionIds).toContain(error.submissionId);
  });

  it("refuses a property that does not exist, or an id that is not one", async () => {
    await expect(
      createEditSubmission(db, {
        propertyId: randomUUID(),
        submittedBy: userId,
      }),
    ).rejects.toMatchObject({ code: "property_not_found" });
    await expect(
      createEditSubmission(db, { propertyId: "nope", submittedBy: userId }),
    ).rejects.toMatchObject({ code: "property_not_found" });
  });

  it("publishes only what the edit contains, keeping everything else", async () => {
    // The open edit from the first test.
    const editId = submissionIds[1];
    await db.insert(propertySubmissionFields).values([
      {
        submissionId: editId,
        fieldKey: "property.rera_registration_number",
        value: `PR/GJ/EDIT/${randomUUID()}`,
        reviewStatus: "confirmed",
      },
      {
        submissionId: editId,
        fieldKey: "property.possession_date",
        value: "2028-03-31",
        reviewStatus: "confirmed",
      },
    ]);
    await db
      .update(propertySubmissions)
      .set({ status: "approved", reviewedBy: userId })
      .where(eq(propertySubmissions.id, editId));

    const result = await publishSubmission({
      submissionId: editId,
      actorUserId: userId,
      actorRole: "owner",
    });

    expect(result).toMatchObject({ propertyId, isNewProperty: false });
    const live = await loadLiveValues(db, propertyId);
    expect(live["property.possession_date"]).toBe("2028-03-31");
    expect(live["property.rera_registration_number"]).toMatch(
      /^PR\/GJ\/EDIT\//,
    );
    // Untouched by the edit.
    expect(live["property.name"]).toBe(propertyName);
    expect(live["property.total_units"]).toBe(40);
    expect(live["property.rera_construction_progress_percent"]).toBe(12.5);
  });

  it("allows a new edit once the earlier one is published", async () => {
    const next = await draftFor();

    expect(next).toBeTruthy();
    expect(submissionIds).toHaveLength(3);
  });
});

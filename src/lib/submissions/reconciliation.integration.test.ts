import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { users } from "@/db/schema/auth";
import {
  developers,
  propertySubmissionFieldEvidence,
  propertySubmissionFields,
  propertySubmissions,
  sourceDocuments,
} from "@/db/schema/catalog";
import {
  confirmPendingFields,
  createManualSubmission,
  editSubmissionField,
  ReconciliationError,
  reviewSubmissionField,
  transitionSubmission,
} from "./reconciliation";

const userId = `recon-test-${randomUUID()}`;
let developerId: string;
let sourceDocumentId: string;
const submissionIds: string[] = [];

const newDraft = async () => {
  const { submissionId } = await createManualSubmission(db, {
    developerId,
    submittedBy: userId,
  });
  submissionIds.push(submissionId);
  return submissionId;
};

const statusOf = async (id: string) =>
  (
    await db
      .select({ status: propertySubmissions.status })
      .from(propertySubmissions)
      .where(eq(propertySubmissions.id, id))
  )[0].status;

const fieldsOf = (id: string) =>
  db
    .select()
    .from(propertySubmissionFields)
    .where(eq(propertySubmissionFields.submissionId, id));

beforeAll(async () => {
  await db.insert(users).values({
    id: userId,
    name: "Reconciliation Test",
    email: `${userId}@example.test`,
  });
  const [developer] = await db
    .insert(developers)
    .values({ name: `Reconciliation Test Developer ${randomUUID()}` })
    .returning({ id: developers.id });
  developerId = developer.id;
  const [document] = await db
    .insert(sourceDocuments)
    .values({
      documentType: "brochure_pdf",
      gcsPath: "synthetic/recon.pdf",
      uploadedBy: userId,
      pageCount: 3,
    })
    .returning({ id: sourceDocuments.id });
  sourceDocumentId = document.id;
});

afterAll(async () => {
  for (const id of submissionIds) {
    await db.delete(propertySubmissions).where(eq(propertySubmissions.id, id));
  }
  await db
    .delete(sourceDocuments)
    .where(eq(sourceDocuments.id, sourceDocumentId));
  await db.delete(developers).where(eq(developers.id, developerId));
  await db.delete(users).where(eq(users.id, userId));
});

describe("createManualSubmission", () => {
  it("creates an empty manual-form draft for the developer, with no invented fields", async () => {
    const id = await newDraft();
    const [row] = await db
      .select()
      .from(propertySubmissions)
      .where(eq(propertySubmissions.id, id));
    expect(row).toMatchObject({
      source: "manual_form",
      status: "draft",
      developerId,
      submittedBy: userId,
    });
    expect(await fieldsOf(id)).toEqual([]);
  });

  it.each([randomUUID(), "not-a-uuid"])(
    "refuses an unknown or malformed developer (%s)",
    async (bad) => {
      await expect(
        createManualSubmission(db, { developerId: bad, submittedBy: userId }),
      ).rejects.toMatchObject({ code: "developer_not_found" });
    },
  );
});

describe("editSubmissionField", () => {
  it("stores a validated value as an edited candidate with no OCR confidence", async () => {
    const id = await newDraft();
    await editSubmissionField(db, {
      submissionId: id,
      fieldKey: "property.name",
      value: "  Test Tower  ",
    });
    const [field] = await fieldsOf(id);
    expect(field).toMatchObject({
      fieldKey: "property.name",
      reviewStatus: "edited",
      confidence: null,
    });
    expect(field.value).toBe("Test Tower");
  });

  it("replaces an OCR candidate and drops its evidence so it cannot support the new value", async () => {
    const id = await newDraft();
    const [ocr] = await db
      .insert(propertySubmissionFields)
      .values({
        submissionId: id,
        fieldKey: "property.total_units",
        value: 100,
        confidence: "0.9",
      })
      .returning({ id: propertySubmissionFields.id });
    await db.insert(propertySubmissionFieldEvidence).values({
      submissionFieldId: ocr.id,
      sourceDocumentId,
      sourcePage: 2,
      sourceSnippet: "100 homes",
    });

    await editSubmissionField(db, {
      submissionId: id,
      fieldKey: "property.total_units",
      value: 120,
    });

    const [field] = await fieldsOf(id);
    expect(field.value).toBe(120);
    expect(field.reviewStatus).toBe("edited");
    expect(field.confidence).toBeNull();
    expect(
      await db
        .select()
        .from(propertySubmissionFieldEvidence)
        .where(eq(propertySubmissionFieldEvidence.submissionFieldId, field.id)),
    ).toEqual([]);
  });

  it("enforces the field contract", async () => {
    const id = await newDraft();
    await expect(
      editSubmissionField(db, {
        submissionId: id,
        fieldKey: "property.total_units",
        value: "many",
      }),
    ).rejects.toMatchObject({ code: "invalid_value" });
    await expect(
      editSubmissionField(db, {
        submissionId: id,
        fieldKey: "property.possession_status",
        value: "someday",
      }),
    ).rejects.toMatchObject({ code: "invalid_value" });
    await expect(
      editSubmissionField(db, {
        submissionId: id,
        fieldKey: "property.price",
        value: 1,
      }),
    ).rejects.toMatchObject({ code: "field_not_found" });
    expect(await fieldsOf(id)).toEqual([]);
  });

  it("edits at every stage before publication, and not after", async () => {
    const id = await newDraft();
    // Draft, waiting, in review, changes requested and approved are all workable:
    // an admin who moved on too early can still fix things.
    for (const status of [
      "draft",
      "submitted",
      "in_review",
      "changes_requested",
      "approved",
    ] as const) {
      await db
        .update(propertySubmissions)
        .set({ status })
        .where(eq(propertySubmissions.id, id));
      await expect(
        editSubmissionField(db, {
          submissionId: id,
          fieldKey: "property.name",
          value: `Edited while ${status}`,
        }),
      ).resolves.toBeUndefined();
    }

    for (const status of ["published", "rejected"] as const) {
      await db
        .update(propertySubmissions)
        .set({ status })
        .where(eq(propertySubmissions.id, id));
      await expect(
        editSubmissionField(db, {
          submissionId: id,
          fieldKey: "property.name",
          value: "Too late",
        }),
      ).rejects.toMatchObject({ code: "invalid_state" });
    }

    await expect(
      editSubmissionField(db, {
        submissionId: randomUUID(),
        fieldKey: "property.name",
        value: "x",
      }),
    ).rejects.toMatchObject({ code: "submission_not_found" });
  });
});

describe("reviewSubmissionField", () => {
  it("confirms or rejects a candidate at any stage before publication, and not after", async () => {
    const id = await newDraft();
    await editSubmissionField(db, {
      submissionId: id,
      fieldKey: "property.name",
      value: "Reviewed Tower",
    });
    await db
      .update(propertySubmissions)
      .set({ status: "published" })
      .where(eq(propertySubmissions.id, id));
    await expect(
      reviewSubmissionField(db, {
        submissionId: id,
        fieldKey: "property.name",
        reviewStatus: "confirmed",
      }),
    ).rejects.toMatchObject({ code: "invalid_state" });

    await db
      .update(propertySubmissions)
      .set({ status: "draft" })
      .where(eq(propertySubmissions.id, id));
    await reviewSubmissionField(db, {
      submissionId: id,
      fieldKey: "property.name",
      reviewStatus: "confirmed",
    });
    expect((await fieldsOf(id))[0].reviewStatus).toBe("confirmed");

    await expect(
      reviewSubmissionField(db, {
        submissionId: id,
        fieldKey: "property.city",
        reviewStatus: "rejected",
      }),
    ).rejects.toMatchObject({ code: "field_not_found" });
  });
});

describe("transitionSubmission", () => {
  it("walks the state machine and records who did what", async () => {
    const id = await newDraft();
    await transitionSubmission(db, {
      submissionId: id,
      action: "submit",
      actorUserId: userId,
      actorRole: "owner",
    });
    expect(await statusOf(id)).toBe("submitted");
    await transitionSubmission(db, {
      submissionId: id,
      action: "start_review",
      actorUserId: userId,
      actorRole: "verifier",
    });
    await transitionSubmission(db, {
      submissionId: id,
      action: "approve",
      actorUserId: userId,
      actorRole: "verifier",
    });
    const [row] = await db
      .select()
      .from(propertySubmissions)
      .where(eq(propertySubmissions.id, id));
    expect(row.status).toBe("approved");
    expect(row.submittedBy).toBe(userId);
    expect(row.reviewedBy).toBe(userId);
    expect(row.submittedAt).not.toBeNull();
    expect(row.reviewedAt).not.toBeNull();
  });

  it("refuses an action the role or the current status does not allow", async () => {
    const id = await newDraft();
    await expect(
      transitionSubmission(db, {
        submissionId: id,
        action: "submit",
        actorUserId: userId,
        actorRole: "verifier",
      }),
    ).rejects.toMatchObject({ code: "transition_not_allowed" });
    await expect(
      transitionSubmission(db, {
        submissionId: id,
        action: "approve",
        actorUserId: userId,
        actorRole: "owner",
      }),
    ).rejects.toMatchObject({ code: "transition_not_allowed" });
    expect(await statusOf(id)).toBe("draft");

    await expect(
      transitionSubmission(db, {
        submissionId: randomUUID(),
        action: "submit",
        actorUserId: userId,
        actorRole: "owner",
      }),
    ).rejects.toBeInstanceOf(ReconciliationError);
  });

  it("does not let two simultaneous submits both win", async () => {
    const id = await newDraft();
    const results = await Promise.allSettled([
      transitionSubmission(db, {
        submissionId: id,
        action: "submit",
        actorUserId: userId,
        actorRole: "owner",
      }),
      transitionSubmission(db, {
        submissionId: id,
        action: "submit",
        actorUserId: userId,
        actorRole: "owner",
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await statusOf(id)).toBe("submitted");
  });
});

describe("confirmPendingFields", () => {
  it("confirms only the values still waiting, and not once published", async () => {
    const id = await newDraft();
    await editSubmissionField(db, {
      submissionId: id,
      fieldKey: "property.name",
      value: "Bulk Tower",
    });
    await editSubmissionField(db, {
      submissionId: id,
      fieldKey: "property.city",
      value: "Ahmedabad",
    });
    await db
      .update(propertySubmissions)
      .set({ status: "published" })
      .where(eq(propertySubmissions.id, id));
    await expect(confirmPendingFields(db, id)).rejects.toMatchObject({
      code: "invalid_state",
    });

    // Extracted values arrive as needs_review (a manual edit records "edited").
    await db
      .update(propertySubmissionFields)
      .set({ reviewStatus: "needs_review" })
      .where(eq(propertySubmissionFields.submissionId, id));
    await db
      .update(propertySubmissions)
      .set({ status: "in_review" })
      .where(eq(propertySubmissions.id, id));
    await reviewSubmissionField(db, {
      submissionId: id,
      fieldKey: "property.city",
      reviewStatus: "rejected",
    });

    expect(await confirmPendingFields(db, id)).toBe(1);
    const byKey = new Map(
      (await fieldsOf(id)).map((f) => [f.fieldKey, f.reviewStatus]),
    );
    expect(byKey.get("property.name")).toBe("confirmed");
    expect(byKey.get("property.city")).toBe("rejected");
    expect(await confirmPendingFields(db, id)).toBe(0);
  });
});

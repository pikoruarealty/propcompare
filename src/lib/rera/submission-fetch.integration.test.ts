import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
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
  reraFetchJobs,
} from "@/db/schema/catalog";
import { publishSubmission } from "@/lib/submissions/publisher";
import { createManualSubmission } from "@/lib/submissions/reconciliation";
import { createGujreraAdapter } from "./gujrera";
import {
  detailResponse,
  inventoryResponse,
  KIMANA_NUMBER,
  POISON,
  progressResponse,
  quartersResponse,
  searchResponse,
  summaryResponse,
} from "./gujrera.fixtures";
import { createRegulatorRegistry } from "./registry";
import {
  applyReraValues,
  fetchReraForSubmission,
  getReraState,
  ReraFetchError,
} from "./submission-fetch";

const userId = `rera-fetch-${randomUUID()}`;
let developerId: string;
let entityId: string;
const submissionIds: string[] = [];
const propertyIds: string[] = [];

/** GujRERA stand-in answering with the saved Kimana shapes. */
const stubRegistry = (overrides: Record<string, unknown> = {}) => {
  const routes: Record<string, unknown> = {
    "/project_reg/public/global-search": searchResponse(),
    "/project_reg/public/getproject-details/17929": detailResponse,
    "/project_reg/public/alldatabyprojectid/17929": summaryResponse,
    "/formone/public/getfrom-one-progs-rept-projectid/17929": progressResponse,
    "/formthree/public/get-fromthree-a-details-byid/417562": inventoryResponse,
    "/quarter/public/getprojectqtrs/17929": quartersResponse,
    ...overrides,
  };
  return createRegulatorRegistry([
    createGujreraAdapter({
      delayMs: 0,
      fetchImpl: async (url) => {
        const body = routes[new URL(url).pathname];
        return body === undefined
          ? new Response("nope", { status: 404 })
          : new Response(JSON.stringify(body));
      },
    }),
  ]);
};

const newDraft = async () => {
  const { submissionId } = await createManualSubmission(db, {
    developerId,
    submittedBy: userId,
  });
  submissionIds.push(submissionId);
  return submissionId;
};

const fieldsOf = async (submissionId: string) =>
  Object.fromEntries(
    (
      await db
        .select()
        .from(propertySubmissionFields)
        .where(eq(propertySubmissionFields.submissionId, submissionId))
    ).map((field) => [field.fieldKey, field]),
  );

/** A property that is genuinely published (through the one write path), and an
 * edit draft bound to it, as the edit flow will create. */
const publishedProperty = async (reraNumber: string | null) => {
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
      "property.name": `RERA Test Tower ${randomUUID()}`,
      "property.type": "apartment",
      "property.city": "Ahmedabad",
      "property.locality": "RERA Test Locality",
      ...(reraNumber
        ? { "property.rera_registration_number": reraNumber }
        : {}),
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
  return result.propertyId;
};

beforeAll(async () => {
  await db.insert(users).values({
    id: userId,
    name: "RERA Fetch Test",
    email: `${userId}@example.test`,
  });
  const [developer] = await db
    .insert(developers)
    .values({ name: `RERA Fetch Developer ${randomUUID()}` })
    .returning({ id: developers.id });
  developerId = developer.id;
  const [entity] = await db
    .insert(developerLegalEntities)
    .values({
      developerId,
      legalName: "Sun VN Developers LLP",
      entityType: "llp",
    })
    .returning({ id: developerLegalEntities.id });
  entityId = entity.id;
});

afterAll(async () => {
  await db.delete(reraFetchJobs).where(eq(reraFetchJobs.requestedBy, userId));
  if (submissionIds.length > 0) {
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

describe("fetching a RERA record for a submission", () => {
  it("records the fetch, keeps only the normalized record, and writes nothing to the draft", async () => {
    const submissionId = await newDraft();

    const result = await fetchReraForSubmission(db, {
      submissionId,
      registrationNumber: KIMANA_NUMBER,
      requestedBy: userId,
      registry: stubRegistry(),
    });

    expect(result.record.projectName).toBe("The Kimana Towers");
    expect(result.comparison.map((item) => item.status)).toEqual([
      "not_held",
      "not_held",
      "not_held",
      "not_held",
      "not_held",
      "not_held",
    ]);
    // Looking is not applying.
    expect(await fieldsOf(submissionId)).toEqual({});

    const [job] = await db
      .select()
      .from(reraFetchJobs)
      .where(eq(reraFetchJobs.id, result.jobId));
    expect(job).toMatchObject({
      status: "succeeded",
      regulatorCode: "gujrera",
      externalProjectId: "17929",
      submissionId,
      requestedBy: userId,
      error: null,
    });
    // No price, no contact detail, and no raw response anywhere in the job.
    const stored = JSON.stringify(job);
    expect(stored).not.toContain(String(POISON));
    expect(stored).not.toMatch(/mincost|maxcost|estimatedCost|unitConsider/i);
    expect(stored).not.toMatch(/poison@|promoterEmail/i);
  });

  it("proposes the developer's matching legal entity", async () => {
    const submissionId = await newDraft();

    const { comparison } = await fetchReraForSubmission(db, {
      submissionId,
      registrationNumber: KIMANA_NUMBER,
      requestedBy: userId,
      registry: stubRegistry(),
    });

    expect(
      comparison.find((item) => item.fieldKey === "property.legal_entity_id"),
    ).toMatchObject({ proposedValue: entityId, status: "not_held" });
  });

  it("records a failure with its reason and changes nothing", async () => {
    const submissionId = await newDraft();

    await expect(
      fetchReraForSubmission(db, {
        submissionId,
        registrationNumber: KIMANA_NUMBER,
        requestedBy: userId,
        registry: stubRegistry({
          "/project_reg/public/global-search": searchResponse([]),
        }),
      }),
    ).rejects.toMatchObject({ code: "not_found" });

    const jobs = await db
      .select()
      .from(reraFetchJobs)
      .where(eq(reraFetchJobs.submissionId, submissionId));
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe("failed");
    expect(jobs[0].error).toMatch(/no registered project/i);
    expect(jobs[0].fetchedPayload).toBeNull();
    expect(await fieldsOf(submissionId)).toEqual({});
  });

  it("refuses a number that is not one we can check, without a lookup record", async () => {
    const submissionId = await newDraft();

    await expect(
      fetchReraForSubmission(db, {
        submissionId,
        registrationNumber: "P52100012345",
        requestedBy: userId,
        registry: stubRegistry(),
      }),
    ).rejects.toMatchObject({ code: "no_regulator" });
    expect(
      await db
        .select()
        .from(reraFetchJobs)
        .where(eq(reraFetchJobs.submissionId, submissionId)),
    ).toHaveLength(0);
  });

  it("refuses a number another property already holds", async () => {
    const other = `PR/GJ/TEST/${randomUUID()}`;
    await publishedProperty(other);
    const submissionId = await newDraft();

    await expect(
      fetchReraForSubmission(db, {
        submissionId,
        registrationNumber: other.toLowerCase(),
        requestedBy: userId,
        registry: stubRegistry(),
      }),
    ).rejects.toMatchObject({ code: "duplicate_number" });
  });

  it("does not object to the property's own number when editing it", async () => {
    const number = `PR/GJ/TEST/${randomUUID()}`;
    const propertyId = await publishedProperty(number);
    const [edit] = await db
      .insert(propertySubmissions)
      .values({
        propertyId,
        developerId,
        submittedBy: userId,
        source: "manual_form",
        status: "draft",
        payload: {},
      })
      .returning({ id: propertySubmissions.id });
    submissionIds.push(edit.id);

    // Reaches the regulator (and stops there: the stand-in has no such project).
    await expect(
      fetchReraForSubmission(db, {
        submissionId: edit.id,
        registrationNumber: number,
        requestedBy: userId,
        registry: stubRegistry({
          "/project_reg/public/global-search": searchResponse([]),
        }),
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("only works on a submission that can still be edited", async () => {
    const submissionId = await newDraft();
    await db
      .update(propertySubmissions)
      .set({ status: "in_review" })
      .where(eq(propertySubmissions.id, submissionId));

    await expect(
      fetchReraForSubmission(db, {
        submissionId,
        registrationNumber: KIMANA_NUMBER,
        requestedBy: userId,
        registry: stubRegistry(),
      }),
    ).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("says a missing submission is missing", async () => {
    await expect(
      fetchReraForSubmission(db, {
        submissionId: randomUUID(),
        registrationNumber: KIMANA_NUMBER,
        requestedBy: userId,
        registry: stubRegistry(),
      }),
    ).rejects.toBeInstanceOf(ReraFetchError);
  });
});

describe("using RERA's values", () => {
  it("writes each value as a confirmed field, replacing a differing hand entry", async () => {
    const submissionId = await newDraft();
    await db.insert(propertySubmissionFields).values({
      submissionId,
      fieldKey: "property.name",
      value: "THE KIMANA TOWERS",
      reviewStatus: "edited",
    });
    const { jobId, comparison } = await fetchReraForSubmission(db, {
      submissionId,
      registrationNumber: KIMANA_NUMBER,
      requestedBy: userId,
      registry: stubRegistry(),
    });
    expect(
      comparison.find((item) => item.fieldKey === "property.name")?.status,
    ).toBe("differs");

    const { applied } = await applyReraValues(db, { submissionId, jobId });

    expect(applied).toEqual([
      "property.rera_registration_number",
      "property.name",
      "property.possession_date",
      "property.total_units",
      "property.rera_construction_progress_percent",
      "property.legal_entity_id",
    ]);
    const fields = await fieldsOf(submissionId);
    expect(fields["property.name"].value).toBe("The Kimana Towers");
    expect(fields["property.possession_date"].value).toBe("2027-04-30");
    expect(fields["property.total_units"].value).toBe(76);
    expect(fields["property.rera_construction_progress_percent"].value).toBe(
      67.71875,
    );
    expect(fields["property.legal_entity_id"].value).toBe(entityId);
    expect(fields["property.rera_registration_number"].value).toBe(
      KIMANA_NUMBER,
    );
    for (const field of Object.values(fields)) {
      expect(field.reviewStatus).toBe("confirmed");
    }
  });

  it("shows a later edit as different from RERA, without blocking it", async () => {
    const submissionId = await newDraft();
    const { jobId } = await fetchReraForSubmission(db, {
      submissionId,
      registrationNumber: KIMANA_NUMBER,
      requestedBy: userId,
      registry: stubRegistry(),
    });
    await applyReraValues(db, { submissionId, jobId });

    const before = await getReraState(db, submissionId);
    expect(before.comparison.every((item) => item.status === "same")).toBe(
      true,
    );
    expect(before.lastFetch?.jobId).toBe(jobId);

    // An admin keeps their own possession date.
    await db
      .update(propertySubmissionFields)
      .set({ value: "2028-01-31", reviewStatus: "edited" })
      .where(
        and(
          eq(propertySubmissionFields.submissionId, submissionId),
          eq(propertySubmissionFields.fieldKey, "property.possession_date"),
        ),
      );

    const after = await getReraState(db, submissionId);
    const date = after.comparison.find(
      (item) => item.fieldKey === "property.possession_date",
    );
    expect(date?.status).toBe("differs");
    expect(date?.reraValue).toBe("2027-04-30");
    expect(date?.currentValue).toBe("2028-01-31");
  });

  it("refuses to apply when nothing differs", async () => {
    const submissionId = await newDraft();
    const { jobId } = await fetchReraForSubmission(db, {
      submissionId,
      registrationNumber: KIMANA_NUMBER,
      requestedBy: userId,
      registry: stubRegistry(),
    });
    await applyReraValues(db, { submissionId, jobId });

    await expect(
      applyReraValues(db, { submissionId, jobId }),
    ).rejects.toMatchObject({ code: "nothing_to_apply" });
  });

  it("will not apply another submission's fetch", async () => {
    const first = await newDraft();
    const second = await newDraft();
    const { jobId } = await fetchReraForSubmission(db, {
      submissionId: first,
      registrationNumber: KIMANA_NUMBER,
      requestedBy: userId,
      registry: stubRegistry(),
    });

    await expect(
      applyReraValues(db, { submissionId: second, jobId }),
    ).rejects.toMatchObject({ code: "job_not_found" });
    expect(await fieldsOf(second)).toEqual({});
  });

  it("will not apply to a submission that is no longer editable", async () => {
    const submissionId = await newDraft();
    const { jobId } = await fetchReraForSubmission(db, {
      submissionId,
      registrationNumber: KIMANA_NUMBER,
      requestedBy: userId,
      registry: stubRegistry(),
    });
    await db
      .update(propertySubmissions)
      .set({ status: "approved" })
      .where(eq(propertySubmissions.id, submissionId));

    await expect(
      applyReraValues(db, { submissionId, jobId }),
    ).rejects.toMatchObject({ code: "invalid_state" });
  });
});

describe("an edit of an already-published property", () => {
  it("compares RERA with the live values, and fills what the property lacks", async () => {
    const propertyId = await publishedProperty(null);
    const [edit] = await db
      .insert(propertySubmissions)
      .values({
        propertyId,
        developerId,
        submittedBy: userId,
        source: "manual_form",
        status: "draft",
        payload: {},
      })
      .returning({ id: propertySubmissions.id });
    submissionIds.push(edit.id);

    const { jobId, comparison } = await fetchReraForSubmission(db, {
      submissionId: edit.id,
      registrationNumber: KIMANA_NUMBER,
      requestedBy: userId,
      registry: stubRegistry(),
    });
    const byKey = Object.fromEntries(comparison.map((c) => [c.fieldKey, c]));
    // The live property has a name (different from RERA's), and no possession
    // date, unit count, RERA number or progress.
    expect(byKey["property.name"].status).toBe("differs");
    expect(byKey["property.name"].currentValue).toMatch(/^RERA Test Tower/);
    expect(byKey["property.possession_date"].status).toBe("not_held");
    expect(byKey["property.rera_registration_number"].status).toBe("not_held");

    await applyReraValues(db, { submissionId: edit.id, jobId });

    // Applying changed only the draft; the live property is untouched.
    const [live] = await db
      .select({
        name: properties.name,
        reraNumber: properties.reraRegistrationNumber,
      })
      .from(properties)
      .where(eq(properties.id, propertyId));
    expect(live.name).toMatch(/^RERA Test Tower/);
    expect(live.reraNumber).toBeNull();
  });
});

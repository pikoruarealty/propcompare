import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { serviceDb } from "@/db/service";
import { reraPriceRanges } from "@/db/schema/private";
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
import { createGujreraAdapter } from "./gujrera";
import {
  detailResponse,
  formOneResponse,
  inventoryResponse,
  latestFilingRoutes,
  kimanaSearchHit,
  progressResponse,
  quartersResponse,
  searchResponse,
  summaryResponse,
} from "./gujrera.fixtures";
import {
  claimNextDueRefresh,
  recoverStaleReraJobs,
  runNextDueRefresh,
} from "./refresh";
import { createRegulatorRegistry } from "./registry";

const userId = `rera-refresh-${randomUUID()}`;
// Never a real registration number: the local database can hold the real project.
const testNumber = () => `PR/GJ/TEST/${randomUUID().toUpperCase()}`;
let developerId: string;
const submissionIds: string[] = [];
const propertyIds: string[] = [];

const DAY_MS = 24 * 60 * 60 * 1000;
const day = (iso: string) => new Date(`${iso}T12:00:00Z`);
// Q-14 (30 June 2026) is filed in the fixture: settled on the first date, and
// the next quarter's window has closed with no filing on the second.
const SETTLED = day("2026-09-20");
const DUE = day("2026-11-01");

const stubRegistry = (
  number: string,
  overrides: Record<string, unknown> = {},
) => {
  const routes: Record<string, unknown> = {
    "/project_reg/public/global-search": searchResponse([
      { ...kimanaSearchHit, regNo: number },
    ]),
    "/project_reg/public/getproject-details/17929": detailResponse,
    "/project_reg/public/alldatabyprojectid/17929": summaryResponse,
    "/formone/public/getfrom-one-progs-rept-projectid/17929": progressResponse,
    "/formthree/public/get-fromthree-a-details-byid/417562": inventoryResponse,
    "/quarter/public/getprojectqtrs/17929": quartersResponse,
    "/formone/public/getfrom-one-byformone-id/278008": formOneResponse,
    ...latestFilingRoutes,
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

/** A property published through the one write path, with its own RERA number. */
const publishedProperty = async () => {
  const number = testNumber();
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
      "property.name": `Refresh Test Tower ${randomUUID()}`,
      "property.type": "apartment",
      "property.city": "Ahmedabad",
      "property.locality": "Refresh Test Locality",
      "property.rera_registration_number": number,
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
  return { propertyId: result.propertyId, number };
};

const scheduledDrafts = async (propertyId: string) =>
  (
    await db
      .select()
      .from(propertySubmissions)
      .where(eq(propertySubmissions.propertyId, propertyId))
  ).filter((submission) => submission.source === "rera_scrape");

beforeAll(async () => {
  await db.insert(users).values({
    id: userId,
    name: "RERA Refresh Test",
    email: `${userId}@example.test`,
  });
  const [developer] = await db
    .insert(developers)
    .values({ name: `RERA Refresh Developer ${randomUUID()}` })
    .returning({ id: developers.id });
  developerId = developer.id;
  await db.insert(developerLegalEntities).values({
    developerId,
    legalName: "Sun VN Developers LLP",
    entityType: "llp",
  });
});

afterAll(async () => {
  // The price range each check keeps in the private schema (test numbers only).
  await serviceDb
    .delete(reraPriceRanges)
    .where(like(reraPriceRanges.registrationNumber, "PR/GJ/TEST/%"));
  if (propertyIds.length > 0) {
    await db
      .delete(reraFetchJobs)
      .where(inArray(reraFetchJobs.propertyId, propertyIds));
    const edits = await db
      .select({ id: propertySubmissions.id })
      .from(propertySubmissions)
      .where(inArray(propertySubmissions.propertyId, propertyIds));
    submissionIds.push(...edits.map((edit) => edit.id));
  }
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

describe("the scheduled RERA refresh", () => {
  it("proposes RERA's values as a reviewable draft and never touches the live listing", async () => {
    const { propertyId, number } = await publishedProperty();
    const [before] = await db
      .select()
      .from(properties)
      .where(eq(properties.id, propertyId));

    const result = await runNextDueRefresh(
      {
        database: db,
        registry: stubRegistry(number),
        onlyPropertyIds: [propertyId],
      },
      DUE,
    );

    expect(result.outcome).toBe("proposed");
    const [proposal] = await scheduledDrafts(propertyId);
    expect(proposal).toMatchObject({
      status: "draft",
      submittedBy: null,
      developerId,
    });
    const fields = await db
      .select()
      .from(propertySubmissionFields)
      .where(eq(propertySubmissionFields.submissionId, proposal.id));
    expect(fields.map((field) => field.fieldKey)).toContain("property.name");
    // Nobody has seen these yet.
    expect(fields.every((field) => field.reviewStatus === "needs_review")).toBe(
      true,
    );

    const [job] = await db
      .select()
      .from(reraFetchJobs)
      .where(eq(reraFetchJobs.propertyId, propertyId));
    expect(job).toMatchObject({
      status: "succeeded",
      submissionId: proposal.id,
      requestedBy: null,
    });
    // The live row is exactly as it was.
    const [after] = await db
      .select()
      .from(properties)
      .where(eq(properties.id, propertyId));
    expect(after).toEqual(before);
  });

  it("does not open a second draft while an edit is open, and records the check anyway", async () => {
    const { propertyId, number } = await publishedProperty();
    const deps = {
      database: db,
      registry: stubRegistry(number),
      onlyPropertyIds: [propertyId],
    };
    expect((await runNextDueRefresh(deps, DUE)).outcome).toBe("proposed");

    const later = new Date(DUE.getTime() + 8 * DAY_MS);
    expect((await runNextDueRefresh(deps, later)).outcome).toBe("edit_open");
    expect(await scheduledDrafts(propertyId)).toHaveLength(1);
    expect(
      await db
        .select()
        .from(reraFetchJobs)
        .where(eq(reraFetchJobs.propertyId, propertyId)),
    ).toHaveLength(2);
  });

  it("does not raise the same change again after an admin rejected it, but raises a changed one", async () => {
    const { propertyId, number } = await publishedProperty();
    const deps = {
      database: db,
      registry: stubRegistry(number),
      onlyPropertyIds: [propertyId],
    };
    await runNextDueRefresh(deps, DUE);
    await db
      .update(propertySubmissions)
      .set({ status: "rejected" })
      .where(eq(propertySubmissions.propertyId, propertyId));

    const later = new Date(DUE.getTime() + 8 * DAY_MS);
    expect((await runNextDueRefresh(deps, later)).outcome).toBe(
      "already_declined",
    );

    // RERA now says something different: that is a new proposal.
    const detail = detailResponse.data;
    const changed = stubRegistry(number, {
      "/project_reg/public/getproject-details/17929": {
        ...detailResponse,
        data: {
          ...detail,
          projectDetail: {
            ...detail.projectDetail,
            projectName: "Kimana Towers Phase Two",
          },
        },
      },
    });
    const muchLater = new Date(DUE.getTime() + 16 * DAY_MS);
    const result = await runNextDueRefresh(
      { database: db, registry: changed, onlyPropertyIds: [propertyId] },
      muchLater,
    );
    expect(result.outcome).toBe("proposed");
  });

  it("records a failure with its reason, proposes nothing, and backs off", async () => {
    const { propertyId, number } = await publishedProperty();
    const deps = {
      database: db,
      registry: stubRegistry(number, {
        "/project_reg/public/global-search": searchResponse([]),
      }),
      onlyPropertyIds: [propertyId],
    };

    expect((await runNextDueRefresh(deps, DUE)).outcome).toBe("failed");
    const [job] = await db
      .select()
      .from(reraFetchJobs)
      .where(eq(reraFetchJobs.propertyId, propertyId));
    expect(job.status).toBe("failed");
    expect(job.error).toMatch(/no registered project/i);
    expect(job.fetchedPayload).toBeNull();
    expect(await scheduledDrafts(propertyId)).toHaveLength(0);

    // Not retried straight away; retried after a day.
    expect((await runNextDueRefresh(deps, DUE)).outcome).toBe("idle");
    const nextDay = new Date(DUE.getTime() + 25 * 60 * 60 * 1000);
    expect((await runNextDueRefresh(deps, nextDay)).outcome).toBe("failed");
  });

  it("finds nothing due once the last good record shows the closed quarter's filing", async () => {
    const { propertyId, number } = await publishedProperty();
    const deps = {
      database: db,
      registry: stubRegistry(number),
      onlyPropertyIds: [propertyId],
    };
    // Never checked, so due; the record shows Q-14 filed.
    await runNextDueRefresh(deps, SETTLED);
    const laterInQuarter = new Date(SETTLED.getTime() + 5 * DAY_MS);
    expect((await runNextDueRefresh(deps, laterInQuarter)).outcome).toBe(
      "idle",
    );
  });

  it("never lets two workers claim the same property", async () => {
    const { propertyId, number } = await publishedProperty();
    const options = {
      now: DUE,
      registry: stubRegistry(number),
      onlyPropertyIds: [propertyId],
    };
    const claims = await Promise.all(
      Array.from({ length: 4 }, () => claimNextDueRefresh(db, options)),
    );
    expect(claims.filter((claim) => claim !== null)).toHaveLength(1);
    expect(
      await db
        .select()
        .from(reraFetchJobs)
        .where(eq(reraFetchJobs.propertyId, propertyId)),
    ).toHaveLength(1);
  });

  it("skips a property whose number no registered regulator issues", async () => {
    const { propertyId, number } = await publishedProperty();
    await db
      .update(properties)
      .set({ reraRegistrationNumber: `P52100${Date.now()}` })
      .where(eq(properties.id, propertyId));
    expect(
      await claimNextDueRefresh(db, {
        now: DUE,
        registry: stubRegistry(number),
        onlyPropertyIds: [propertyId],
      }),
    ).toBeNull();
  });

  it("fails a check left running by a process that died", async () => {
    const { propertyId, number } = await publishedProperty();
    const [job] = await db
      .insert(reraFetchJobs)
      .values({
        propertyId,
        reraRegistrationNumber: number,
        status: "running",
        runAt: new Date(DUE.getTime() - 60 * 60 * 1000),
      })
      .returning({ id: reraFetchJobs.id });
    expect(await recoverStaleReraJobs(db, DUE)).toBeGreaterThanOrEqual(1);
    const [after] = await db
      .select()
      .from(reraFetchJobs)
      .where(eq(reraFetchJobs.id, job.id));
    expect(after.status).toBe("failed");
    expect(after.error).toMatch(/interrupted/i);
  });
});

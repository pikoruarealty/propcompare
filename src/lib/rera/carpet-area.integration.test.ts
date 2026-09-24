import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, like } from "drizzle-orm";
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
  unitAreas,
  unitVariants,
} from "@/db/schema/catalog";
import { createEditSubmission } from "@/lib/submissions/edit-property";
import { loadLiveValues } from "@/lib/submissions/live-values";
import { publishSubmission } from "@/lib/submissions/publisher";
import { reviewSubmissionField } from "@/lib/submissions/reconciliation";
import { createGujreraAdapter } from "./gujrera";
import {
  detailResponse,
  flatListResponse,
  formOneResponse,
  inventoryResponse,
  latestFilingRoutes,
  kimanaSearchHit,
  progressResponse,
  quartersResponse,
  searchResponse,
  summaryResponse,
} from "./gujrera.fixtures";
import { runNextDueRefresh } from "./refresh";
import { createRegulatorRegistry } from "./registry";
import { applyReraValues, fetchReraForSubmission } from "./submission-fetch";

const userId = `rera-carpet-${randomUUID()}`;
let developerId: string;
const submissionIds: string[] = [];
const propertyIds: string[] = [];

const rooms = (areaSqft: number) => ({
  rooms: [{ name: "All rooms", areaSqft }],
  balconies: [{ name: "Balcony", areaSqft: 80 }],
});

const stubRegistry = (number: string) => {
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
    "/formthree/public/get-inv-details-for-view": flatListResponse,
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

const publish = async (submissionId: string) => {
  await db
    .update(propertySubmissions)
    .set({ status: "approved", reviewedBy: userId })
    .where(eq(propertySubmissions.id, submissionId));
  return publishSubmission({
    submissionId,
    actorUserId: userId,
    actorRole: "owner",
  });
};

/** A published property with Kimana-like unit types: two in block A, one in B. */
const publishedProperty = async () => {
  const number = `PR/GJ/TEST/${randomUUID().toUpperCase()}`;
  const [submission] = await db
    .insert(propertySubmissions)
    .values({
      developerId,
      submittedBy: userId,
      source: "manual_form",
      status: "draft",
      payload: {},
    })
    .returning({ id: propertySubmissions.id });
  submissionIds.push(submission.id);
  await db.insert(propertySubmissionFields).values(
    Object.entries({
      "property.name": `Carpet Test Tower ${randomUUID()}`,
      "property.type": "apartment",
      "property.city": "Ahmedabad",
      "property.locality": "Carpet Test Locality",
      "property.rera_registration_number": number,
      unit_variants: [
        {
          variantName: "Block A - 3rd Floor",
          totalUnitsOfVariant: 2,
          dimensions: rooms(3980),
          areas: [{ basis: "super_built_up", areaSqft: 5200 }],
        },
        {
          variantName: "Block A Penthouse",
          totalUnitsOfVariant: 2,
          dimensions: rooms(5268),
        },
        {
          variantName: "Block B - 3rd Floor",
          dimensions: rooms(3516),
          // A carpet area we already hold, and it differs from RERA's.
          areas: [{ basis: "carpet", areaSqft: 3000 }],
        },
      ],
    }).map(([fieldKey, value]) => ({
      submissionId: submission.id,
      fieldKey,
      value,
      reviewStatus: "confirmed" as const,
    })),
  );
  const result = await publish(submission.id);
  propertyIds.push(result.propertyId);
  return { propertyId: result.propertyId, number };
};

const areasByVariant = async (propertyId: string) => {
  const rows = await db
    .select({
      name: unitVariants.variantName,
      basis: unitAreas.basis,
      areaSqft: unitAreas.areaSqft,
    })
    .from(unitAreas)
    .innerJoin(unitVariants, eq(unitVariants.id, unitAreas.unitVariantId))
    .where(eq(unitVariants.propertyId, propertyId));
  const out: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    (out[row.name] ??= {})[row.basis] = Number(row.areaSqft);
  }
  return out;
};

beforeAll(async () => {
  await db.insert(users).values({
    id: userId,
    name: "RERA Carpet Test",
    email: `${userId}@example.test`,
  });
  const [developer] = await db
    .insert(developers)
    .values({ name: `RERA Carpet Developer ${randomUUID()}` })
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

describe("RERA carpet area on a published property", () => {
  it("offers RERA's carpet area per unit type, writes it as the carpet basis, and changes nothing else", async () => {
    const { propertyId, number } = await publishedProperty();
    const { submissionId } = await createEditSubmission(db, {
      propertyId,
      submittedBy: userId,
    });
    submissionIds.push(submissionId);

    const fetched = await fetchReraForSubmission(db, {
      submissionId,
      registrationNumber: number,
      requestedBy: userId,
      registry: stubRegistry(number),
    });
    expect(fetched.record.carpetGroups).toHaveLength(4);
    const item = fetched.comparison.find(
      (entry) => entry.fieldKey === "unit_variants",
    )!;
    expect(item.status).toBe("differs");
    expect(
      item.unitRows?.map((row) => [row.variantName, row.reraSqft]),
    ).toEqual([
      ["Block A - 3rd Floor", 3977.7],
      ["Block A Penthouse", 6163.31],
      ["Block B - 3rd Floor", 2984.4],
    ]);
    // Looking is not applying.
    expect(await areasByVariant(propertyId)).toEqual({
      "Block A - 3rd Floor": { super_built_up: 5200 },
      "Block B - 3rd Floor": { carpet: 3000 },
    });

    const { applied } = await applyReraValues(db, {
      submissionId,
      jobId: fetched.jobId,
    });
    expect(applied).toContain("unit_variants");
    // The proposed pin and map link wait for someone to look at the map.
    for (const fieldKey of [
      "property.latitude",
      "property.longitude",
      "property.google_maps_url",
    ]) {
      await reviewSubmissionField(db, {
        submissionId,
        fieldKey,
        reviewStatus: "confirmed",
      });
    }

    // The publish path is the only thing that changes the live listing.
    expect((await areasByVariant(propertyId))["Block B - 3rd Floor"]).toEqual({
      carpet: 3000,
    });
    await publish(submissionId);

    expect(await areasByVariant(propertyId)).toEqual({
      "Block A - 3rd Floor": { super_built_up: 5200, carpet: 3977.7 },
      "Block A Penthouse": { carpet: 6163.31 },
      "Block B - 3rd Floor": { carpet: 2984.4 },
    });
    // Rooms, counts and names are carried through untouched.
    const live = (await loadLiveValues(db, propertyId)).unit_variants as {
      variantName: string;
      totalUnitsOfVariant?: number;
      dimensions?: unknown;
    }[];
    const byName = Object.fromEntries(live.map((v) => [v.variantName, v]));
    expect(byName["Block A - 3rd Floor"].dimensions).toEqual(rooms(3980));
    expect(byName["Block A Penthouse"].totalUnitsOfVariant).toBe(2);
    expect(live).toHaveLength(3);
  });

  it("is proposed by the scheduled refresh as a needs-review draft, and is quiet once published", async () => {
    const { propertyId, number } = await publishedProperty();
    const deps = {
      database: db,
      registry: stubRegistry(number),
      onlyPropertyIds: [propertyId],
    };
    const due = new Date("2026-11-01T12:00:00Z");

    expect((await runNextDueRefresh(deps, due)).outcome).toBe("proposed");
    const [draft] = await db
      .select({ id: propertySubmissions.id })
      .from(propertySubmissions)
      .where(
        and(
          eq(propertySubmissions.propertyId, propertyId),
          eq(propertySubmissions.source, "rera_scrape"),
        ),
      );
    const [field] = await db
      .select()
      .from(propertySubmissionFields)
      .where(
        and(
          eq(propertySubmissionFields.submissionId, draft.id),
          eq(propertySubmissionFields.fieldKey, "unit_variants"),
        ),
      );
    expect(field.reviewStatus).toBe("needs_review");
    // The live listing is unchanged until it is reviewed and published.
    expect(
      (await areasByVariant(propertyId))["Block A Penthouse"],
    ).toBeUndefined();
  });

  it("does not bring back a unit type that was removed", async () => {
    const { propertyId } = await publishedProperty();
    const { submissionId } = await createEditSubmission(db, {
      propertyId,
      submittedBy: userId,
    });
    submissionIds.push(submissionId);
    await db.insert(propertySubmissionFields).values({
      submissionId,
      fieldKey: "unit_variants_removed",
      value: ["Block B - 3rd Floor"],
      reviewStatus: "confirmed",
    });
    await publish(submissionId);

    const live = (await loadLiveValues(db, propertyId)).unit_variants as {
      variantName: string;
    }[];
    expect(live.map((variant) => variant.variantName)).toEqual([
      "Block A - 3rd Floor",
      "Block A Penthouse",
    ]);
    // The row is kept (soft removal), only hidden.
    expect(
      await db
        .select({ id: unitVariants.id })
        .from(unitVariants)
        .where(
          and(
            eq(unitVariants.propertyId, propertyId),
            isNull(unitVariants.removedAt),
          ),
        ),
    ).toHaveLength(2);
  });
});

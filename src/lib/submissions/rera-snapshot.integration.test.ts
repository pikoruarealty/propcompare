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
import { getPublishedPropertyBySlug } from "@/lib/properties/queries";
import { buildReraSnapshot } from "@/lib/rera/snapshot";
import type { RegulatorRecord } from "@/lib/rera/types";
import { createEditSubmission } from "./edit-property";
import { loadLiveValues } from "./live-values";
import { publishSubmission } from "./publisher";

/**
 * The regulator's project facts and the project's position on a published
 * property (schema v17): written by the publish transaction alone, read back as
 * live values so a later RERA check sees what is held.
 */

const suffix = randomUUID();
const adminId = `snapshot-${suffix}`;
let developerId: string;
let propertyId: string;
const submissionIds: string[] = [];

const record = {
  regulatorCode: "gujrera",
  carpetGroups: [
    {
      block: "A",
      carpetAreaSqm: 285,
      flatCount: 28,
      firstFlat: "A-204",
      lastFlat: "A-3004",
      bookedCount: 5,
    },
  ],
  details: {
    version: 1,
    layoutLandAreaSqm: 7628,
    openAreaSqm: 3131.1,
    coveredAreaSqm: 4496.9,
    coveredParkingAreaSqm: null,
    filing: {
      quarter: "Q-14",
      periodEndsOn: "2026-06-30",
      source: "quarterly_filing",
      progressPercent: 93.7,
      blocks: [],
    },
    inventory: {
      totalUnits: 76,
      bookedUnits: 63,
      availableUnits: 13,
      asOn: "2026-07-03",
    },
    filings: { listed: 18, submitted: 17 },
    planPassingAuthority: "AUDA",
    registeredOn: "2022-11-11",
    architects: [],
    engineers: [],
    contractors: [],
    boundary: [],
    centre: null,
  },
} as unknown as RegulatorRecord;

const publish = async (fields: Record<string, unknown>, bindTo?: string) => {
  let submissionId: string;
  if (bindTo) {
    ({ submissionId } = await createEditSubmission(db, {
      propertyId: bindTo,
      submittedBy: adminId,
    }));
  } else {
    [{ id: submissionId }] = await db
      .insert(propertySubmissions)
      .values({
        developerId,
        submittedBy: adminId,
        source: "manual_form",
        status: "draft",
        payload: {},
      })
      .returning({ id: propertySubmissions.id });
  }
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
    .set({ status: "approved", reviewedBy: adminId })
    .where(eq(propertySubmissions.id, submissionId));
  try {
    return await publishSubmission({
      submissionId,
      actorUserId: adminId,
      actorRole: "owner",
    });
  } catch (cause) {
    await db
      .update(propertySubmissions)
      .set({ status: "rejected" })
      .where(eq(propertySubmissions.id, submissionId));
    throw cause;
  }
};

beforeAll(async () => {
  await db.insert(users).values({
    id: adminId,
    name: adminId,
    email: `${adminId}@example.test`,
  });
  const [developer] = await db
    .insert(developers)
    .values({ name: `Snapshot Developer ${suffix}` })
    .returning({ id: developers.id });
  developerId = developer.id;
});

afterAll(async () => {
  const edits = await db
    .select({ id: propertySubmissions.id })
    .from(propertySubmissions)
    .where(eq(propertySubmissions.propertyId, propertyId));
  submissionIds.push(...edits.map((edit) => edit.id));
  await db
    .delete(propertyRevisions)
    .where(inArray(propertyRevisions.submissionId, submissionIds));
  await db
    .delete(propertySubmissions)
    .where(inArray(propertySubmissions.id, submissionIds));
  await db.delete(properties).where(eq(properties.id, propertyId));
  await db.delete(developers).where(eq(developers.id, developerId));
  await db.delete(users).where(eq(users.id, adminId));
});

describe("RERA facts and position on a published property", () => {
  it("publishes the snapshot and the coordinates, and reads them back as live values", async () => {
    const snapshot = buildReraSnapshot(record)!;
    const result = await publish({
      "property.name": `Snapshot Tower ${suffix}`,
      "property.type": "apartment",
      "property.city": "Ahmedabad",
      "property.locality": "Snapshot Locality",
      "property.rera_snapshot": snapshot,
      "property.latitude": 23.0272712,
      "property.longitude": 72.4894294,
      "property.pincode": "380015",
      "property.rera_project_land_area_sqft": 82107.11,
    });
    propertyId = result.propertyId;

    const [row] = await db
      .select({
        snapshot: properties.reraSnapshot,
        latitude: properties.latitude,
        longitude: properties.longitude,
      })
      .from(properties)
      .where(eq(properties.id, propertyId));
    expect(row.snapshot).toEqual(snapshot);
    expect(Number(row.latitude)).toBeCloseTo(23.0272712, 6);
    expect(Number(row.longitude)).toBeCloseTo(72.4894294, 6);

    const live = await loadLiveValues(db, propertyId);
    expect(live["property.rera_snapshot"]).toEqual(snapshot);
    expect(live["property.latitude"]).toBeCloseTo(23.0272712, 6);
    expect(live["property.longitude"]).toBeCloseTo(72.4894294, 6);
  });

  it("shows the buyer the facts and the regulator's carpet-area range in square feet", async () => {
    const withRange = buildReraSnapshot({
      ...record,
      details: {
        ...record.details!,
        carpetAreaRangeSqm: { min: 153.13, max: 533.17 },
      },
    } as RegulatorRecord)!;
    await publish({ "property.rera_snapshot": withRange }, propertyId);
    const [{ slug }] = await db
      .select({ slug: properties.slug })
      .from(properties)
      .where(eq(properties.id, propertyId));

    const dossier = (await getPublishedPropertyBySlug(db, slug))!;

    expect(dossier.rera.facts?.openAreaSqm).toBe(3131.1);
    // 153.13 and 533.17 square metres, converted once.
    expect(dossier.rera.carpetAreaRangeMinSqft).toBe("1648.28");
    expect(dossier.rera.carpetAreaRangeMaxSqft).toBe("5738.99");
  });

  it("does not show a stored object that is not a snapshot of the current shape", async () => {
    await db
      .update(properties)
      .set({ reraSnapshot: { version: 99, junk: true } })
      .where(eq(properties.id, propertyId));
    const [{ slug }] = await db
      .select({ slug: properties.slug })
      .from(properties)
      .where(eq(properties.id, propertyId));

    const dossier = (await getPublishedPropertyBySlug(db, slug))!;

    expect(dossier.rera.facts).toBeNull();
    // Put a real one back for the tests that follow.
    await publish(
      { "property.rera_snapshot": buildReraSnapshot(record)! },
      propertyId,
    );
  });

  it("reads back the fields it published but used not to report", async () => {
    const live = await loadLiveValues(db, propertyId);

    expect(live["property.pincode"]).toBe("380015");
    expect(live["property.rera_project_land_area_sqft"]).toBeCloseTo(
      82107.11,
      2,
    );
  });

  it("leaves the snapshot and position alone when an edit does not mention them", async () => {
    await publish({ "property.locality": "Snapshot Locality Two" }, propertyId);

    const live = await loadLiveValues(db, propertyId);
    expect(live["property.rera_snapshot"]).toBeDefined();
    expect(live["property.latitude"]).toBeCloseTo(23.0272712, 6);
  });

  it("replaces the snapshot when an edit carries a newer one", async () => {
    const newer = buildReraSnapshot({
      ...record,
      details: {
        ...record.details!,
        inventory: {
          totalUnits: 76,
          bookedUnits: 70,
          availableUnits: 6,
          asOn: "2026-10-05",
        },
      },
    } as RegulatorRecord)!;
    await publish({ "property.rera_snapshot": newer }, propertyId);

    const live = await loadLiveValues(db, propertyId);
    expect(
      (
        live["property.rera_snapshot"] as {
          inventory: { availableUnits: number };
        }
      ).inventory.availableUnits,
    ).toBe(6);
  });

  it("refuses a snapshot that carries money or contact details", async () => {
    const dirty = { ...buildReraSnapshot(record)!, projectCost: 1_000_000 };
    await expect(
      publish({ "property.rera_snapshot": dirty }, propertyId),
    ).rejects.toThrow(/no money or contact detail/);
  });

  it("refuses a position outside India", async () => {
    await expect(
      publish({ "property.latitude": 51.5 }, propertyId),
    ).rejects.toThrow(/latitude in India/);
    await expect(
      publish({ "property.longitude": 2.35 }, propertyId),
    ).rejects.toThrow(/longitude in India/);
  });
});

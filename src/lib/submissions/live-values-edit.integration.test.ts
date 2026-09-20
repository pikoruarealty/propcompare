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
import { loadLiveValues } from "./live-values";
import { publishSubmission } from "./publisher";

const suffix = randomUUID();
const userId = `live-values-${suffix}`;
const developerName = `Live Values Developer ${suffix}`;
let developerId: string;
let propertyId: string;
const submissionIds: string[] = [];

const rooms = [
  { name: "Living", lengthFt: 16, widthFt: 12 },
  { name: "Bedroom", lengthFt: 12, widthFt: 11 },
  { name: "Bedroom", lengthFt: 11, widthFt: 10 },
];

const publish = async (
  fields: Record<string, unknown>,
  bind: { propertyId?: string } = {},
) => {
  let submissionId: string;
  if (bind.propertyId) {
    ({ submissionId } = await createEditSubmission(db, {
      propertyId: bind.propertyId,
      submittedBy: userId,
    }));
  } else {
    [{ id: submissionId }] = await db
      .insert(propertySubmissions)
      .values({
        developerId,
        submittedBy: userId,
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
    .set({ status: "approved", reviewedBy: userId })
    .where(eq(propertySubmissions.id, submissionId));
  return publishSubmission({
    submissionId,
    actorUserId: userId,
    actorRole: "owner",
  });
};

beforeAll(async () => {
  await db
    .insert(users)
    .values({ id: userId, name: userId, email: `${userId}@example.test` });
  const [developer] = await db
    .insert(developers)
    .values({ name: developerName, profileNarrative: "About the developer." })
    .returning({ id: developers.id });
  developerId = developer.id;

  propertyId = (
    await publish({
      "property.name": `Live Values Tower ${suffix}`,
      "property.type": "apartment",
      "property.city": "Ahmedabad",
      "property.locality": "Live Locality",
      "property.amenities": ["swimming_pool", "security"],
      "property.specifications.flooring": "Vitrified tiles",
      unit_variants: [
        {
          variantName: "Type A",
          bhkTypeKey: "3bhk",
          totalUnitsOfVariant: 20,
          unitsPerFloor: 2,
          dimensions: { rooms },
          areas: [
            { basis: "carpet", areaSqft: 1200.5 },
            { basis: "super_built_up", areaSqft: 1700 },
          ],
        },
        { variantName: "Type B", totalUnitsOfVariant: 8 },
      ],
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

describe("loadLiveValues — the whole published listing", () => {
  it("reads the amenity set, specifications, developer and unit types", async () => {
    const live = await loadLiveValues(db, propertyId);

    expect(live["property.amenities"]).toEqual(["security", "swimming_pool"]);
    expect(live["property.specifications.flooring"]).toBe("Vitrified tiles");
    expect(live["developer.name"]).toBe(developerName);
    expect(live["developer.profile_narrative"]).toBe("About the developer.");

    const variants = live["unit_variants"] as Record<string, unknown>[];
    expect(variants.map((v) => v.variantName)).toEqual(["Type A", "Type B"]);
    expect(variants[0]).toMatchObject({
      variantName: "Type A",
      bhkTypeKey: "3bhk",
      totalUnitsOfVariant: 20,
      unitsPerFloor: 2,
      dimensions: { rooms },
    });
    expect(variants[0].areas).toEqual(
      expect.arrayContaining([
        { basis: "carpet", areaSqft: 1200.5 },
        { basis: "super_built_up", areaSqft: 1700 },
      ]),
    );
    // A type with nothing else published carries only what is published.
    expect(variants[1]).toEqual({
      variantName: "Type B",
      totalUnitsOfVariant: 8,
      areas: [],
    });
  });

  it("leaves out what is not published rather than inventing it", async () => {
    const live = await loadLiveValues(db, propertyId);

    expect(live).not.toHaveProperty("property.specifications.ceiling_height");
    expect(live).not.toHaveProperty("property.possession_date");
  });
});

describe("editing a published unit type", () => {
  it("changes only what is edited, from the published values, and renames the developer", async () => {
    const live = await loadLiveValues(db, propertyId);
    const [typeA, typeB] = live["unit_variants"] as {
      variantName: string;
      dimensions: { rooms: typeof rooms };
    }[];

    // The editor starts from the published unit types; the admin corrects one
    // room and one area, and renames the developer.
    const edited = {
      ...typeA,
      dimensions: {
        rooms: typeA.dimensions.rooms.map((room, index) =>
          index === 1 ? { ...room, lengthFt: 13 } : room,
        ),
      },
      areas: [
        { basis: "carpet", areaSqft: 1250 },
        { basis: "super_built_up", areaSqft: 1700 },
      ],
    };
    await publish(
      {
        unit_variants: [edited],
        "developer.name": "Live Values Brand",
      },
      { propertyId },
    );

    const after = await loadLiveValues(db, propertyId);
    const variants = after["unit_variants"] as Record<string, unknown>[];
    const a = variants.find((v) => v.variantName === "Type A")!;
    expect(a).toMatchObject({
      bhkTypeKey: "3bhk",
      totalUnitsOfVariant: 20,
      unitsPerFloor: 2,
    });
    expect((a.dimensions as { rooms: typeof rooms }).rooms[1]).toEqual({
      name: "Bedroom",
      lengthFt: 13,
      widthFt: 11,
    });
    expect(a.areas).toEqual(
      expect.arrayContaining([
        { basis: "carpet", areaSqft: 1250 },
        { basis: "super_built_up", areaSqft: 1700 },
      ]),
    );
    // Type B was not sent and is untouched.
    expect(variants.find((v) => v.variantName === "Type B")).toEqual(typeB);
    // Everything else is as it was.
    expect(after["property.amenities"]).toEqual(["security", "swimming_pool"]);
    expect(after["property.specifications.flooring"]).toBe("Vitrified tiles");
    // The developer was renamed.
    expect(after["developer.name"]).toBe("Live Values Brand");
  });

  it("does not rename a developer when a new property proposes a name", async () => {
    const before = (await loadLiveValues(db, propertyId))["developer.name"];

    await publish({
      "property.name": `Second Tower ${suffix}`,
      "property.type": "apartment",
      "property.city": "Ahmedabad",
      "property.locality": "Second Locality",
      // A brochure prints a legal name; that must not overwrite the brand.
      "developer.name": "Printed Legal Name LLP",
    }).then((result) => {
      propertyIds.push(result.propertyId);
    });

    expect((await loadLiveValues(db, propertyId))["developer.name"]).toBe(
      before,
    );
  });
});

const propertyIds: string[] = [];
afterAll(async () => {
  if (propertyIds.length > 0) {
    await db
      .delete(propertyRevisions)
      .where(inArray(propertyRevisions.propertyId, propertyIds));
    await db
      .delete(propertySubmissions)
      .where(inArray(propertySubmissions.propertyId, propertyIds));
    await db.delete(properties).where(inArray(properties.id, propertyIds));
  }
});

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { users } from "@/db/schema/auth";
import {
  amenityCatalog,
  developers,
  properties,
  propertyAmenities,
  propertyRevisions,
  propertySubmissionFields,
  propertySubmissionMedia,
  propertySubmissions,
  unitVariants,
} from "@/db/schema/catalog";
import { unitPriceHistory } from "@/db/schema/private";
import { serviceDb, serviceDbClient } from "@/db/service";
import { createEnquiry } from "@/lib/buyer/enquiries";
import { createComparison } from "@/lib/buyer/comparisons";
import { unlockDossier } from "@/lib/buyer/dossier-unlocks";
import {
  listSavedProperties,
  saveProperty,
} from "@/lib/buyer/saved-properties";
import { matchPublishedProperties } from "@/lib/matching/discovery";
import { createEditSubmission } from "@/lib/submissions/edit-property";
import { loadLiveValues } from "@/lib/submissions/live-values";
import {
  publishSubmission,
  SubmissionPublishError,
} from "@/lib/submissions/publisher";
import { listFilterOptions } from "./filter-options";
import {
  getPublishedMediaForServing,
  getPublishedMediaObjectPath,
  getPublishedPropertyBySlug,
  listPublishedProperties,
} from "./queries";

/**
 * Unlisting, deleting and removing are soft and must hide a thing from EVERY buyer
 * surface at once, never from some. Everything here goes through the real publish
 * path, and prices are written with the service connection as in the matcher tests.
 */

const suffix = randomUUID();
const adminId = `visibility-admin-${suffix}`;
const buyerId = `visibility-buyer-${suffix}`;
const city = `Visibility City ${suffix}`;
let developerId: string;
let propertyId: string;
let slug: string;
let typeA: string;
let typeB: string;
const submissionIds: string[] = [];

const range = { minInr: 24_000_000, maxInr: 48_000_000 } as const;

const submit = async (
  fields: Record<string, unknown>,
  bind?: { propertyId: string },
  media: { unitVariantName: string | null; caption: string }[] = [],
) => {
  let submissionId: string;
  if (bind) {
    ({ submissionId } = await createEditSubmission(db, {
      propertyId: bind.propertyId,
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
  if (media.length > 0) {
    await db.insert(propertySubmissionMedia).values(
      media.map((item, index) => ({
        submissionId,
        mediaType: "photo" as const,
        sourceKind: "own" as const,
        gcsPath: `synthetic/${suffix}-${index}.png`,
        caption: item.caption,
        attribution: "Test",
        displayOrder: index,
        isPublic: true,
        reviewStatus: "confirmed" as const,
        unitVariantName: item.unitVariantName,
      })),
    );
  }
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
    // A refused publish must not leave an open edit that blocks the next one.
    await db
      .update(propertySubmissions)
      .set({ status: "rejected" })
      .where(eq(propertySubmissions.id, submissionId));
    throw cause;
  }
};

const edit = (fields: Record<string, unknown>) =>
  submit(fields, { propertyId });

const listed = async () =>
  (
    await listPublishedProperties(db, {
      page: 1,
      pageSize: 50,
      city,
      sort: "newest",
    })
  ).data.map((row) => row.id);

beforeAll(async () => {
  await db.insert(users).values(
    [adminId, buyerId].map((id) => ({
      id,
      name: id,
      email: `${id}@example.test`,
    })),
  );
  const [developer] = await db
    .insert(developers)
    .values({ name: `Visibility Developer ${suffix}` })
    .returning({ id: developers.id });
  developerId = developer.id;

  const result = await submit(
    {
      "property.name": `Visibility Tower ${suffix}`,
      "property.type": "apartment",
      "property.city": city,
      "property.locality": "Visibility Locality",
      "property.amenities": ["swimming_pool", "security"],
      unit_variants: [
        { variantName: "Type A", bhkTypeKey: "3bhk" },
        { variantName: "Type B", bhkTypeKey: "2bhk" },
      ],
    },
    undefined,
    [
      { unitVariantName: null, caption: "Exterior" },
      { unitVariantName: "Type B", caption: "Type B plan" },
    ],
  );
  propertyId = result.propertyId;
  const [property] = await db
    .select({ slug: properties.slug })
    .from(properties)
    .where(eq(properties.id, propertyId));
  slug = property.slug;
  const variants = await db
    .select({ id: unitVariants.id, name: unitVariants.variantName })
    .from(unitVariants)
    .where(eq(unitVariants.propertyId, propertyId));
  typeA = variants.find((v) => v.name === "Type A")!.id;
  typeB = variants.find((v) => v.name === "Type B")!.id;
  for (const unitVariantId of [typeA, typeB]) {
    await serviceDb.insert(unitPriceHistory).values({
      unitVariantId,
      priceInr: "36000000",
      effectiveFrom: "2026-09-01",
      source: "admin_manual",
      createdBy: adminId,
    });
  }
});

afterAll(async () => {
  await serviceDb
    .delete(unitPriceHistory)
    .where(eq(unitPriceHistory.createdBy, adminId));
  await db
    .delete(propertyRevisions)
    .where(inArray(propertyRevisions.submissionId, submissionIds));
  await db
    .delete(propertySubmissions)
    .where(inArray(propertySubmissions.id, submissionIds));
  await db.delete(properties).where(eq(properties.id, propertyId));
  await db.delete(developers).where(eq(developers.id, developerId));
  await db.delete(users).where(inArray(users.id, [adminId, buyerId]));
  await serviceDbClient.end({ timeout: 5 });
});

/** Every way a buyer can reach the property, asked at once. */
const reach = async () => {
  const dossier = await getPublishedPropertyBySlug(db, slug);
  const media = dossier?.media ?? [];
  const match = await matchPublishedProperties(db, serviceDb, {
    ...range,
    city,
    page: 1,
    pageSize: 50,
  });
  const saved = (await listSavedProperties(db, buyerId, 1, 50)).data;
  return {
    inList: (await listed()).includes(propertyId),
    inFilterCities: (await listFilterOptions(db)).cities.includes(city),
    dossier: dossier !== null,
    variants: dossier?.unitVariants.map((v) => v.variantName) ?? [],
    media: media.map((m) => m.caption),
    mediaServed: await Promise.all(
      media.map(
        async (m) => (await getPublishedMediaForServing(db, m.id)) !== null,
      ),
    ),
    matched: match.data.some((row) => row.id === propertyId),
    savedList: saved.some((entry) => entry.property.id === propertyId),
  };
};

describe("a listed property is reachable everywhere", () => {
  it("shows in browse, filters, the dossier, media, matching and saved lists", async () => {
    expect((await saveProperty(db, buyerId, propertyId))?.property.id).toBe(
      propertyId,
    );

    const seen = await reach();

    expect(seen).toMatchObject({
      inList: true,
      inFilterCities: true,
      dossier: true,
      matched: true,
      savedList: true,
    });
    expect(seen.variants.sort()).toEqual(["Type A", "Type B"]);
    expect(seen.media.sort()).toEqual(["Exterior", "Type B plan"]);
    expect(seen.mediaServed).toEqual([true, true]);
  });
});

describe("removing a unit type", () => {
  it("hides it, and the pictures tied to it, from every buyer surface but keeps the rows", async () => {
    await edit({ unit_variants_removed: ["Type B"] });

    const seen = await reach();
    expect(seen.variants).toEqual(["Type A"]);
    expect(seen.media).toEqual(["Exterior"]);
    // The property is otherwise unchanged and still found.
    expect(seen).toMatchObject({ inList: true, dossier: true, matched: true });

    // Nothing was deleted: the type, and its private price history, are still there.
    const [row] = await db
      .select({ removedAt: unitVariants.removedAt })
      .from(unitVariants)
      .where(eq(unitVariants.id, typeB));
    expect(row.removedAt).toBeInstanceOf(Date);
    expect(
      await serviceDb
        .select({ id: unitPriceHistory.id })
        .from(unitPriceHistory)
        .where(eq(unitPriceHistory.unitVariantId, typeB)),
    ).toHaveLength(1);
  });

  it("no longer offers the removed type as a filter, or lets a buyer pick it", async () => {
    // (The global list of filter options is shared with every other test, so only
    // this property's own city is asserted.)
    expect(
      (
        await listPublishedProperties(db, {
          page: 1,
          pageSize: 50,
          city,
          bhk: "2bhk",
          sort: "newest",
        })
      ).data,
    ).toHaveLength(0);
    expect(
      (
        await listPublishedProperties(db, {
          page: 1,
          pageSize: 50,
          city,
          bhk: "3bhk",
          sort: "newest",
        })
      ).data,
    ).toHaveLength(1);

    expect(
      await createEnquiry(db, buyerId, { propertyId, unitVariantId: typeB }),
    ).toEqual({ reason: "unit_variant_not_found" });
    expect(
      await createComparison(db, buyerId, [
        { propertyId, unitVariantId: typeB },
      ]),
    ).toMatchObject({ reason: "unit_variant_not_found" });
    // The live type still works.
    expect(
      await createEnquiry(db, buyerId, { propertyId, unitVariantId: typeA }),
    ).not.toHaveProperty("reason");
  });

  it("does not match a buyer's budget on a removed type's price", async () => {
    // Only Type B is in this band now; Type A's price is moved out of it.
    await serviceDb
      .update(unitPriceHistory)
      .set({ priceInr: "90000000" })
      .where(eq(unitPriceHistory.unitVariantId, typeA));

    const match = await matchPublishedProperties(db, serviceDb, {
      ...range,
      city,
      page: 1,
      pageSize: 50,
    });
    expect(match.data.some((row) => row.id === propertyId)).toBe(false);

    await serviceDb
      .update(unitPriceHistory)
      .set({ priceInr: "36000000" })
      .where(eq(unitPriceHistory.unitVariantId, typeA));
  });

  it("brings the type back when a later edit lists it again", async () => {
    await edit({
      unit_variants: [{ variantName: "Type B", bhkTypeKey: "2bhk" }],
    });

    const seen = await reach();
    expect(seen.variants.sort()).toEqual(["Type A", "Type B"]);
    const [row] = await db
      .select({ removedAt: unitVariants.removedAt })
      .from(unitVariants)
      .where(eq(unitVariants.id, typeB));
    expect(row.removedAt).toBeNull();
  });

  it("refuses to remove and keep the same type, or one that does not exist", async () => {
    await expect(
      edit({
        unit_variants: [{ variantName: "Type A", bhkTypeKey: "3bhk" }],
        unit_variants_removed: ["type a"],
      }),
    ).rejects.toBeInstanceOf(SubmissionPublishError);
    await expect(
      edit({ unit_variants_removed: ["No such type"] }),
    ).rejects.toThrow(/not a live unit type/);
  });
});

describe("removing an amenity", () => {
  const amenityKeys = async () =>
    (await loadLiveValues(db, propertyId))["property.amenities"] as
      string[] | undefined;

  it("takes it off the listing and leaves the others, as not stated", async () => {
    await edit({ "property.amenities_removed": ["security"] });

    expect(await amenityKeys()).toEqual(["swimming_pool"]);
    const [row] = await db
      .select({ status: propertyAmenities.status })
      .from(propertyAmenities)
      .innerJoin(
        amenityCatalog,
        eq(amenityCatalog.id, propertyAmenities.amenityCatalogId),
      )
      .where(eq(amenityCatalog.key, "security"));
    // Not stated, never "not offered": the admin only stopped claiming it.
    expect(["not_stated"]).toContain(row.status);
  });

  it("refuses to keep and remove the same amenity", async () => {
    await expect(
      edit({
        "property.amenities": ["swimming_pool"],
        "property.amenities_removed": ["swimming_pool"],
      }),
    ).rejects.toThrow(/both kept and removed/);
  });
});

describe("unlisting and deleting are soft, and complete", () => {
  it.each(["unlisted", "deleted"] as const)(
    "%s: gone from every buyer surface, and back when listed again",
    async (status) => {
      const mediaIds = (await getPublishedPropertyBySlug(db, slug))!.media.map(
        (m) => m.id,
      );
      await edit({ "property.listing_status": status });

      const gone = await reach();
      expect(gone.inList).toBe(false);
      expect(gone.dossier).toBe(false);
      expect(gone.matched).toBe(false);
      expect(gone.savedList).toBe(false);
      expect(gone.inFilterCities).toBe(false);
      for (const id of mediaIds) {
        expect(await getPublishedMediaForServing(db, id)).toBeNull();
        expect(await getPublishedMediaObjectPath(db, id)).toBeNull();
      }

      // A buyer can no longer act on it.
      expect(await saveProperty(db, buyerId, propertyId)).toBeNull();
      expect(await unlockDossier(db, buyerId, propertyId)).toBeNull();
      expect(await createEnquiry(db, buyerId, { propertyId })).toEqual({
        reason: "property_not_found",
      });
      expect(
        await createComparison(db, buyerId, [{ propertyId }]),
      ).toMatchObject({
        reason: "property_not_found",
      });

      // Nothing was deleted, and the change is recorded.
      const [row] = await db
        .select({
          status: properties.listingStatus,
          changedAt: properties.listingStatusChangedAt,
        })
        .from(properties)
        .where(eq(properties.id, propertyId));
      expect(row.status).toBe(status);
      expect(row.changedAt).toBeInstanceOf(Date);

      await edit({ "property.listing_status": "listed" });
      const back = await reach();
      expect(back).toMatchObject({
        inList: true,
        dossier: true,
        matched: true,
        savedList: true,
        inFilterCities: true,
      });
      expect(back.variants.sort()).toEqual(["Type A", "Type B"]);
    },
  );

  it("its pictures are not served while it is unlisted", async () => {
    const before = await getPublishedPropertyBySlug(db, slug);
    const mediaId = before!.media[0].id;
    expect(await getPublishedMediaForServing(db, mediaId)).not.toBeNull();

    await edit({ "property.listing_status": "unlisted" });
    expect(await getPublishedMediaForServing(db, mediaId)).toBeNull();
    expect(await getPublishedMediaObjectPath(db, mediaId)).toBeNull();

    await edit({ "property.listing_status": "listed" });
    expect(await getPublishedMediaForServing(db, mediaId)).not.toBeNull();
  });

  it("only an existing property can be given a listing status or removals", async () => {
    await expect(
      submit({
        "property.name": `Never ${suffix}`,
        "property.type": "apartment",
        "property.city": city,
        "property.locality": "Nowhere",
        "property.listing_status": "unlisted",
      }),
    ).rejects.toThrow(/existing property only/);
  });

  it("rejects a status that is not one of the three", async () => {
    await expect(
      edit({ "property.listing_status": "hidden" }),
    ).rejects.toThrow();
  });
});

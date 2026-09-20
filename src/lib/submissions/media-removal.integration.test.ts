import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { users } from "@/db/schema/auth";
import {
  developers,
  properties,
  propertyMedia,
  propertyRevisions,
  propertySubmissionFields,
  propertySubmissionMedia,
  propertySubmissions,
} from "@/db/schema/catalog";
import {
  getPublishedMediaForServing,
  getPublishedPropertyBySlug,
  listPublishedProperties,
} from "@/lib/properties/queries";
import { createEditSubmission } from "./edit-property";
import { publishSubmission } from "./publisher";
import { getSubmissionDetail } from "./queue";
import { editSubmissionField } from "./reconciliation";

/**
 * Taking a published picture off a listing (schema v9): soft, through an edit that
 * is reviewed and published, hidden from every buyer surface at once, and never
 * possible for a picture that is not a live picture of the same property.
 */

const suffix = randomUUID();
const adminId = `media-removal-${suffix}`;
const city = `Media Removal City ${suffix}`;
let developerId: string;
let propertyId: string;
let slug: string;
let otherPropertyId: string;
const submissionIds: string[] = [];

const paths = ["hero", "second", "plan"].map(
  (name) => `synthetic/${suffix}-${name}.png`,
);

const publish = async (
  fields: Record<string, unknown>,
  media: { path: string; type?: "photo" | "floor_plan" }[] = [],
  bindTo?: string,
) => {
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
  if (Object.keys(fields).length > 0) {
    await db.insert(propertySubmissionFields).values(
      Object.entries(fields).map(([fieldKey, value]) => ({
        submissionId,
        fieldKey,
        value,
        reviewStatus: "confirmed" as const,
      })),
    );
  }
  if (media.length > 0) {
    await db.insert(propertySubmissionMedia).values(
      media.map((item, index) => ({
        submissionId,
        mediaType: item.type ?? ("photo" as const),
        sourceKind: "own" as const,
        gcsPath: item.path,
        caption: `Picture ${index}`,
        attribution: "Test",
        displayOrder: index,
        isPublic: true,
        reviewStatus: "confirmed" as const,
        unitVariantName: null,
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
    await db
      .update(propertySubmissions)
      .set({ status: "rejected" })
      .where(eq(propertySubmissions.id, submissionId));
    throw cause;
  }
};

const idOf = async (path: string) =>
  (
    await db
      .select({ id: propertyMedia.id })
      .from(propertyMedia)
      .where(eq(propertyMedia.gcsPath, path))
  )[0].id;

const liveIds = async () =>
  (await getPublishedPropertyBySlug(db, slug))!.media.map((media) => media.id);

const cardMediaId = async () =>
  (
    await listPublishedProperties(db, {
      page: 1,
      pageSize: 50,
      city,
      sort: "newest",
    })
  ).data.find((row) => row.id === propertyId)?.primaryMedia?.id ?? null;

let heroId: string;
let secondId: string;
let planId: string;

beforeAll(async () => {
  await db.insert(users).values({
    id: adminId,
    name: adminId,
    email: `${adminId}@example.test`,
  });
  const [developer] = await db
    .insert(developers)
    .values({ name: `Media Removal Developer ${suffix}` })
    .returning({ id: developers.id });
  developerId = developer.id;

  const base = (name: string) => ({
    "property.name": name,
    "property.type": "apartment",
    "property.city": city,
    "property.locality": "Media Removal Locality",
  });
  ({ propertyId } = await publish(base(`Media Removal Tower ${suffix}`), [
    { path: paths[0] },
    { path: paths[1] },
    { path: paths[2], type: "floor_plan" },
  ]));
  ({ propertyId: otherPropertyId } = await publish(
    base(`Media Removal Other ${suffix}`),
    [{ path: `synthetic/${suffix}-other.png` }],
  ));
  slug = (
    await db
      .select({ slug: properties.slug })
      .from(properties)
      .where(eq(properties.id, propertyId))
  )[0].slug;
  [heroId, secondId, planId] = await Promise.all(paths.map(idOf));
  // The first picture is the primary one.
  await db
    .update(propertyMedia)
    .set({ isPrimary: true })
    .where(eq(propertyMedia.id, heroId));
});

afterAll(async () => {
  const ids = [propertyId, otherPropertyId];
  await db.delete(propertyMedia).where(inArray(propertyMedia.propertyId, ids));
  const edits = await db
    .select({ id: propertySubmissions.id })
    .from(propertySubmissions)
    .where(inArray(propertySubmissions.propertyId, ids));
  submissionIds.push(...edits.map((edit) => edit.id));
  await db
    .delete(propertyRevisions)
    .where(inArray(propertyRevisions.submissionId, submissionIds));
  await db
    .delete(propertySubmissions)
    .where(inArray(propertySubmissions.id, submissionIds));
  await db.delete(properties).where(inArray(properties.id, ids));
  await db.delete(developers).where(eq(developers.id, developerId));
  await db.delete(users).where(eq(users.id, adminId));
});

describe("taking a published picture off a listing", () => {
  it("shows an edit the property's live pictures, so one can be chosen", async () => {
    const { submissionId } = await createEditSubmission(db, {
      propertyId,
      submittedBy: adminId,
    });
    submissionIds.push(submissionId);
    const detail = await getSubmissionDetail(db, submissionId);
    expect(detail?.publishedMedia.map((media) => media.id).sort()).toEqual(
      [heroId, secondId, planId].sort(),
    );
    await db
      .update(propertySubmissions)
      .set({ status: "rejected" })
      .where(eq(propertySubmissions.id, submissionId));
  });

  it("rejects a value that is not a list of picture ids, before anything is saved", async () => {
    const { submissionId } = await createEditSubmission(db, {
      propertyId,
      submittedBy: adminId,
    });
    submissionIds.push(submissionId);
    for (const value of ["nope", [1], ["not-an-id"]]) {
      await expect(
        editSubmissionField(db, {
          submissionId,
          fieldKey: "property.media_removed",
          value,
        }),
      ).rejects.toMatchObject({ code: "invalid_value" });
    }
    const dup = randomUUID();
    await expect(
      editSubmissionField(db, {
        submissionId,
        fieldKey: "property.media_removed",
        value: [dup, dup],
      }),
    ).rejects.toMatchObject({ code: "invalid_value" });
    await db
      .update(propertySubmissions)
      .set({ status: "rejected" })
      .where(eq(propertySubmissions.id, submissionId));
  });

  it("hides the picture from the dossier and the media route, keeps the row, and demotes a removed primary on the card", async () => {
    expect(await cardMediaId()).toBe(heroId);

    await publish({ "property.media_removed": [heroId] }, [], propertyId);

    // Soft: the row is still there, only marked.
    const [row] = await db
      .select()
      .from(propertyMedia)
      .where(eq(propertyMedia.id, heroId));
    expect(row.removedAt).toBeInstanceOf(Date);
    expect(await liveIds()).not.toContain(heroId);
    expect(await liveIds()).toEqual(expect.arrayContaining([secondId, planId]));
    expect(await getPublishedMediaForServing(db, heroId)).toBeNull();
    // The card falls back to the next best picture (a photo before a plan).
    expect(await cardMediaId()).toBe(secondId);
  });

  it("no longer offers a removed picture to the next edit", async () => {
    const { submissionId } = await createEditSubmission(db, {
      propertyId,
      submittedBy: adminId,
    });
    submissionIds.push(submissionId);
    const detail = await getSubmissionDetail(db, submissionId);
    expect(detail?.publishedMedia.map((media) => media.id)).not.toContain(
      heroId,
    );
    await db
      .update(propertySubmissions)
      .set({ status: "rejected" })
      .where(eq(propertySubmissions.id, submissionId));
  });

  it("refuses a picture that is already removed, one that is not this property's, and one that does not exist, and changes nothing", async () => {
    const otherPicture = (
      await db
        .select({ id: propertyMedia.id })
        .from(propertyMedia)
        .where(eq(propertyMedia.propertyId, otherPropertyId))
    )[0].id;

    for (const bad of [heroId, otherPicture, randomUUID()]) {
      await expect(
        // A valid one alongside: the whole publish is refused, so it survives.
        publish({ "property.media_removed": [planId, bad] }, [], propertyId),
      ).rejects.toThrow(/not a live picture of this property/);
    }
    expect(await liveIds()).toContain(planId);
    const [other] = await db
      .select()
      .from(propertyMedia)
      .where(eq(propertyMedia.id, otherPicture));
    expect(other.removedAt).toBeNull();
  });

  it("replaces a picture: the old one comes off and the new one goes live in the same edit", async () => {
    const fresh = `synthetic/${suffix}-fresh.png`;
    await publish(
      { "property.media_removed": [secondId] },
      [{ path: fresh }],
      propertyId,
    );
    const freshId = await idOf(fresh);
    const live = await liveIds();
    expect(live).toContain(freshId);
    expect(live).not.toContain(secondId);
    expect(await cardMediaId()).toBe(freshId);
  });

  it("is refused for a new property", async () => {
    await expect(
      publish({
        "property.name": `Media Removal New ${suffix}`,
        "property.type": "apartment",
        "property.city": city,
        "property.locality": "Anywhere",
        "property.media_removed": [randomUUID()],
      }),
    ).rejects.toThrow(/existing property only/);
  });

  it("leaves the pictures of every other property alone", async () => {
    const remaining = await db
      .select({ id: propertyMedia.id, removedAt: propertyMedia.removedAt })
      .from(propertyMedia)
      .where(and(eq(propertyMedia.propertyId, otherPropertyId)));
    expect(remaining.every((row) => row.removedAt === null)).toBe(true);
  });
});

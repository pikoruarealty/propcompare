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
import { listPublishedProperties } from "@/lib/properties/queries";
import { createEditSubmission } from "./edit-property";
import { publishSubmission } from "./publisher";

/**
 * The project's main photo (schema v14): chosen by an admin as a field, applied
 * by the publish transaction, exactly one per property, always a photo that is
 * live after the publish.
 */

const suffix = randomUUID();
const adminId = `main-photo-${suffix}`;
const city = `Main Photo City ${suffix}`;
let developerId: string;
const propertyIds: string[] = [];
const submissionIds: string[] = [];

interface NewMedia {
  path: string;
  type?: "photo" | "floor_plan";
  isPublic?: boolean;
  reviewStatus?: "confirmed" | "needs_review";
}

/** Runs one submission to a publish. `mainPhoto` may name one of `media` by its
 * position, or be a literal id. */
const publish = async (options: {
  fields?: Record<string, unknown>;
  media?: NewMedia[];
  mainPhoto?: number | string;
  bindTo?: string;
}) => {
  let submissionId: string;
  if (options.bindTo) {
    ({ submissionId } = await createEditSubmission(db, {
      propertyId: options.bindTo,
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

  const mediaIds: string[] = [];
  for (const [index, item] of (options.media ?? []).entries()) {
    const [row] = await db
      .insert(propertySubmissionMedia)
      .values({
        submissionId,
        mediaType: item.type ?? "photo",
        sourceKind: "own",
        gcsPath: item.path,
        caption: `Picture ${index}`,
        attribution: "Test",
        displayOrder: index,
        isPublic: item.isPublic ?? true,
        reviewStatus: item.reviewStatus ?? "confirmed",
      })
      .returning({ id: propertySubmissionMedia.id });
    mediaIds.push(row.id);
  }
  const fields: Record<string, unknown> = { ...options.fields };
  if (options.mainPhoto !== undefined) {
    fields["property.main_photo"] =
      typeof options.mainPhoto === "number"
        ? mediaIds[options.mainPhoto]
        : options.mainPhoto;
  }
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
  await db
    .update(propertySubmissions)
    .set({ status: "approved", reviewedBy: adminId })
    .where(eq(propertySubmissions.id, submissionId));
  try {
    const result = await publishSubmission({
      submissionId,
      actorUserId: adminId,
      actorRole: "owner",
    });
    if (!propertyIds.includes(result.propertyId)) {
      propertyIds.push(result.propertyId);
    }
    return { ...result, mediaIds };
  } catch (cause) {
    await db
      .update(propertySubmissions)
      .set({ status: "rejected" })
      .where(eq(propertySubmissions.id, submissionId));
    throw cause;
  }
};

const base = (name: string) => ({
  "property.name": name,
  "property.type": "apartment",
  "property.city": city,
  "property.locality": "Main Photo Locality",
});

const primaries = async (propertyId: string) =>
  (
    await db
      .select({ id: propertyMedia.id, path: propertyMedia.gcsPath })
      .from(propertyMedia)
      .where(
        and(
          eq(propertyMedia.propertyId, propertyId),
          eq(propertyMedia.isPrimary, true),
        ),
      )
  ).map((row) => row.path);

const liveIdOf = async (propertyId: string, path: string) =>
  (
    await db
      .select({ id: propertyMedia.id })
      .from(propertyMedia)
      .where(
        and(
          eq(propertyMedia.propertyId, propertyId),
          eq(propertyMedia.gcsPath, path),
        ),
      )
  )[0].id;

const cardMediaPath = async (propertyId: string) =>
  (
    await listPublishedProperties(db, {
      page: 1,
      pageSize: 50,
      city,
      sort: "newest",
    })
  ).data.find((row) => row.id === propertyId)?.primaryMedia?.gcsPath ?? null;

const p = (name: string) => `synthetic/${suffix}-${name}.png`;

beforeAll(async () => {
  await db.insert(users).values({
    id: adminId,
    name: adminId,
    email: `${adminId}@example.test`,
  });
  const [developer] = await db
    .insert(developers)
    .values({ name: `Main Photo Developer ${suffix}` })
    .returning({ id: developers.id });
  developerId = developer.id;
});

afterAll(async () => {
  await db
    .delete(propertyMedia)
    .where(inArray(propertyMedia.propertyId, propertyIds));
  const edits = await db
    .select({ id: propertySubmissions.id })
    .from(propertySubmissions)
    .where(inArray(propertySubmissions.propertyId, propertyIds));
  submissionIds.push(...edits.map((edit) => edit.id));
  await db
    .delete(propertyRevisions)
    .where(inArray(propertyRevisions.submissionId, submissionIds));
  await db
    .delete(propertySubmissions)
    .where(inArray(propertySubmissions.id, submissionIds));
  await db.delete(properties).where(inArray(properties.id, propertyIds));
  await db.delete(developers).where(eq(developers.id, developerId));
  await db.delete(users).where(eq(users.id, adminId));
});

describe("the project's main photo", () => {
  let propertyId: string;

  it("is applied at first publish, and is what the listing card shows", async () => {
    const result = await publish({
      fields: base(`Main Photo Tower ${suffix}`),
      media: [
        { path: p("plan"), type: "floor_plan" },
        { path: p("first") },
        { path: p("second") },
      ],
      mainPhoto: 2,
    });
    propertyId = result.propertyId;
    expect(await primaries(propertyId)).toEqual([p("second")]);
    expect(await cardMediaPath(propertyId)).toBe(p("second"));
  });

  it("moves to another live photo in an edit, leaving exactly one", async () => {
    const chosen = await liveIdOf(propertyId, p("first"));
    await publish({ bindTo: propertyId, mainPhoto: chosen });
    expect(await primaries(propertyId)).toEqual([p("first")]);
  });

  it("can be a new photo the edit adds, replacing the old one", async () => {
    await publish({
      bindTo: propertyId,
      media: [{ path: p("third") }],
      mainPhoto: 0,
    });
    expect(await primaries(propertyId)).toEqual([p("third")]);
  });

  it("refuses a floor plan, another property's picture, a removed one, and an unapproved one", async () => {
    const plan = await liveIdOf(propertyId, p("plan"));
    await expect(
      publish({ bindTo: propertyId, mainPhoto: plan }),
    ).rejects.toThrow(/not a live photo/);

    const other = await publish({
      fields: base(`Main Photo Other ${suffix}`),
      media: [{ path: p("other") }],
    });
    const otherPicture = await liveIdOf(other.propertyId, p("other"));
    await expect(
      publish({ bindTo: propertyId, mainPhoto: otherPicture }),
    ).rejects.toThrow(/not a live photo/);

    const first = await liveIdOf(propertyId, p("first"));
    await expect(
      publish({
        bindTo: propertyId,
        fields: { "property.media_removed": [first] },
        mainPhoto: first,
      }),
    ).rejects.toThrow(/not a live photo/);

    await expect(
      publish({
        bindTo: propertyId,
        media: [{ path: p("private"), isPublic: false }],
        mainPhoto: 0,
      }),
    ).rejects.toThrow(/approved, public photo/);
    await expect(
      publish({
        bindTo: propertyId,
        media: [{ path: p("plan2"), type: "floor_plan" }],
        mainPhoto: 0,
      }),
    ).rejects.toThrow(/approved, public photo/);

    // Every refusal left the main photo as it was.
    expect(await primaries(propertyId)).toEqual([p("third")]);
  });

  it("never lets a property have two, even from a stray write", async () => {
    const first = await liveIdOf(propertyId, p("first"));
    await expect(
      db
        .update(propertyMedia)
        .set({ isPrimary: true })
        .where(eq(propertyMedia.id, first)),
    ).rejects.toThrow();
  });
});

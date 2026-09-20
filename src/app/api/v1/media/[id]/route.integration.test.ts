import "dotenv/config";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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
import { createEditSubmission } from "@/lib/submissions/edit-property";
import { changeListingStatus } from "@/lib/submissions/listing";
import { publishSubmission } from "@/lib/submissions/publisher";

/**
 * The media route against a real database and the real publish path, with only
 * storage stubbed (no bucket or key needed): a published picture redirects to a
 * fresh signed link for its own stored object, and a picture that is not live for
 * buyers (unknown, unlisted property, removed unit type, or a malformed id) is a
 * plain 404, never a redirect and never a server error.
 */

const signed = vi.fn(async (path: string) => `https://signed.example/${path}`);
vi.mock("@/lib/storage", () => ({
  storageAdapter: { getSignedReadUrl: (path: string) => signed(path) },
}));

const { GET } = await import("./route");

const suffix = randomUUID();
const adminId = `media-route-${suffix}`;
let developerId: string;
let propertyId: string;
const submissionIds: string[] = [];

const call = (id: string) =>
  GET(new NextRequest(`http://localhost/api/v1/media/${id}`), {
    params: Promise.resolve({ id }),
  } as RouteContext<"/api/v1/media/[id]">);

const publish = async (
  fields: Record<string, unknown>,
  media: { path: string; unitVariantName: string | null }[] = [],
  bind?: string,
) => {
  let submissionId: string;
  if (bind) {
    ({ submissionId } = await createEditSubmission(db, {
      propertyId: bind,
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
        gcsPath: item.path,
        caption: `Picture ${index}`,
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
  return publishSubmission({
    submissionId,
    actorUserId: adminId,
    actorRole: "owner",
  });
};

const mediaIdFor = async (path: string) => {
  const [row] = await db
    .select({ id: propertyMedia.id })
    .from(propertyMedia)
    .where(eq(propertyMedia.gcsPath, path));
  return row.id;
};

const paths = {
  whole: `synthetic/${suffix}-whole.png`,
  typeA: `synthetic/${suffix}-a.png`,
  typeB: `synthetic/${suffix}-b.png`,
};
let wholeId: string;
let typeAId: string;
let typeBId: string;

beforeAll(async () => {
  await db.insert(users).values({
    id: adminId,
    name: adminId,
    email: `${adminId}@example.test`,
  });
  const [developer] = await db
    .insert(developers)
    .values({ name: `Media Route Developer ${suffix}` })
    .returning({ id: developers.id });
  developerId = developer.id;

  ({ propertyId } = await publish(
    {
      "property.name": `Media Route Tower ${suffix}`,
      "property.type": "apartment",
      "property.city": "Ahmedabad",
      "property.locality": "Media Route Locality",
      unit_variants: [{ variantName: "Type A" }, { variantName: "Type B" }],
    },
    [
      { path: paths.whole, unitVariantName: null },
      { path: paths.typeA, unitVariantName: "Type A" },
      { path: paths.typeB, unitVariantName: "Type B" },
    ],
  ));
  wholeId = await mediaIdFor(paths.whole);
  typeAId = await mediaIdFor(paths.typeA);
  typeBId = await mediaIdFor(paths.typeB);
});

afterAll(async () => {
  await db
    .delete(propertyMedia)
    .where(eq(propertyMedia.propertyId, propertyId));
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

describe("GET /api/v1/media/{id} against published pictures", () => {
  it("redirects a live picture to a fresh signed link for its own stored object, uncached", async () => {
    const response = await call(wholeId);

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      `https://signed.example/${paths.whole}`,
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(signed).toHaveBeenLastCalledWith(paths.whole);
  });

  it("answers 404 for an id that is not a picture, and for one that is not even an id", async () => {
    for (const id of [randomUUID(), "not-an-id", "1", "' or 1=1 --"]) {
      const response = await call(id);
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("media_not_found");
    }
  });

  it("stops serving a picture of a removed unit type but keeps the others", async () => {
    expect((await call(typeBId)).status).toBe(302);

    await publish({ unit_variants_removed: ["Type B"] }, [], propertyId);

    expect((await call(typeBId)).status).toBe(404);
    expect((await call(typeAId)).status).toBe(302);
    expect((await call(wholeId)).status).toBe(302);
  });

  it("stops serving every picture of an unlisted property, and serves them again once it is listed", async () => {
    await changeListingStatus(db, {
      propertyId,
      status: "unlisted",
      actorUserId: adminId,
    });
    expect((await call(wholeId)).status).toBe(404);
    expect((await call(typeAId)).status).toBe(404);

    await changeListingStatus(db, {
      propertyId,
      status: "listed",
      actorUserId: adminId,
    });
    expect((await call(wholeId)).status).toBe(302);
  });

  it("stops serving the pictures of a deleted property", async () => {
    await changeListingStatus(db, {
      propertyId,
      status: "deleted",
      actorUserId: adminId,
    });
    expect((await call(wholeId)).status).toBe(404);
    await changeListingStatus(db, {
      propertyId,
      status: "listed",
      actorUserId: adminId,
    });
  });
});

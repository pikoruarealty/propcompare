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
import {
  getPublishedPropertyBySlug,
  listPublishedProperties,
} from "@/lib/properties/queries";
import { createEditSubmission } from "./edit-property";
import { changeListingStatus, ListingChangeError } from "./listing";
import { publishSubmission } from "./publisher";
import { getSubmissionDetail } from "./queue";

const suffix = randomUUID();
const adminId = `listing-admin-${suffix}`;
const city = `Listing City ${suffix}`;
let developerId: string;
let propertyId: string;
let slug: string;
let originalId: string;

const isListed = async () =>
  (
    await listPublishedProperties(db, {
      page: 1,
      pageSize: 50,
      city,
      sort: "newest",
    })
  ).data.some((row) => row.id === propertyId);

const allSubmissionIds = async () =>
  (
    await db
      .select({ id: propertySubmissions.id })
      .from(propertySubmissions)
      .where(eq(propertySubmissions.propertyId, propertyId))
  ).map((row) => row.id);

beforeAll(async () => {
  await db.insert(users).values({
    id: adminId,
    name: adminId,
    email: `${adminId}@example.test`,
  });
  const [developer] = await db
    .insert(developers)
    .values({ name: `Listing Developer ${suffix}` })
    .returning({ id: developers.id });
  developerId = developer.id;

  const [submission] = await db
    .insert(propertySubmissions)
    .values({
      developerId,
      submittedBy: adminId,
      reviewedBy: adminId,
      source: "manual_form",
      status: "approved",
      payload: {},
    })
    .returning({ id: propertySubmissions.id });
  originalId = submission.id;
  await db.insert(propertySubmissionFields).values(
    Object.entries({
      "property.name": `Listing Tower ${suffix}`,
      "property.type": "apartment",
      "property.city": city,
      "property.locality": "Listing Locality",
    }).map(([fieldKey, value]) => ({
      submissionId: originalId,
      fieldKey,
      value,
      reviewStatus: "confirmed" as const,
    })),
  );
  propertyId = (
    await publishSubmission({
      submissionId: originalId,
      actorUserId: adminId,
      actorRole: "owner",
    })
  ).propertyId;
  slug = (
    await db
      .select({ slug: properties.slug })
      .from(properties)
      .where(eq(properties.id, propertyId))
  )[0].slug;
});

afterAll(async () => {
  const ids = await allSubmissionIds();
  await db
    .delete(propertyRevisions)
    .where(inArray(propertyRevisions.submissionId, ids));
  await db
    .delete(propertySubmissions)
    .where(inArray(propertySubmissions.id, ids));
  await db.delete(properties).where(eq(properties.id, propertyId));
  await db.delete(developers).where(eq(developers.id, developerId));
  await db.delete(users).where(eq(users.id, adminId));
});

describe("changeListingStatus", () => {
  it("unlists a property, taking it through review and publish like any change", async () => {
    expect(await isListed()).toBe(true);

    const result = await changeListingStatus(db, {
      propertyId,
      status: "unlisted",
      actorUserId: adminId,
    });

    expect(result).toEqual({ propertyId, status: "unlisted" });
    expect(await isListed()).toBe(false);
    expect(await getPublishedPropertyBySlug(db, slug)).toBeNull();

    // It is a recorded version, reviewed and published, not a silent flag.
    const detail = await getSubmissionDetail(db, originalId);
    expect(detail?.versions.map((v) => [v.kind, v.status])).toEqual([
      ["original", "published"],
      ["edit", "published"],
    ]);
    const [edit] = (
      await db
        .select()
        .from(propertySubmissions)
        .where(eq(propertySubmissions.propertyId, propertyId))
    ).filter((row) => row.id !== originalId);
    expect(edit).toMatchObject({
      status: "published",
      submittedBy: adminId,
      reviewedBy: adminId,
    });
    expect(edit.submittedAt).toBeInstanceOf(Date);
    expect(edit.reviewedAt).toBeInstanceOf(Date);
    expect(edit.publishedAt).toBeInstanceOf(Date);
  });

  it("does nothing, and creates nothing, when the status would not change", async () => {
    const before = (await allSubmissionIds()).length;

    await expect(
      changeListingStatus(db, {
        propertyId,
        status: "unlisted",
        actorUserId: adminId,
      }),
    ).rejects.toMatchObject({ code: "no_change" });

    expect((await allSubmissionIds()).length).toBe(before);
  });

  it("soft-deletes, then restores, then lists again", async () => {
    await changeListingStatus(db, {
      propertyId,
      status: "deleted",
      actorUserId: adminId,
    });
    expect(await isListed()).toBe(false);
    const [deleted] = await db
      .select({ status: properties.listingStatus })
      .from(properties)
      .where(eq(properties.id, propertyId));
    // Soft: the row is still there.
    expect(deleted.status).toBe("deleted");

    await changeListingStatus(db, {
      propertyId,
      status: "listed",
      actorUserId: adminId,
    });
    expect(await isListed()).toBe(true);
    expect(await getPublishedPropertyBySlug(db, slug)).not.toBeNull();
  });

  it("will not run over an edit already in progress, and points at it", async () => {
    const { submissionId } = await createEditSubmission(db, {
      propertyId,
      submittedBy: adminId,
    });

    const error = await changeListingStatus(db, {
      propertyId,
      status: "unlisted",
      actorUserId: adminId,
    }).catch((cause) => cause);

    expect(error).toBeInstanceOf(ListingChangeError);
    expect(error.code).toBe("edit_already_open");
    expect(error.submissionId).toBe(submissionId);
    expect(await isListed()).toBe(true);

    await db
      .update(propertySubmissions)
      .set({ status: "rejected" })
      .where(eq(propertySubmissions.id, submissionId));
  });

  it.each([
    ["hidden", "invalid_status"],
    ["", "invalid_status"],
    ["LISTED", "invalid_status"],
  ])("refuses the status %j", async (status, code) => {
    await expect(
      changeListingStatus(db, { propertyId, status, actorUserId: adminId }),
    ).rejects.toMatchObject({ code });
  });

  it("says a missing property is missing", async () => {
    await expect(
      changeListingStatus(db, {
        propertyId: randomUUID(),
        status: "unlisted",
        actorUserId: adminId,
      }),
    ).rejects.toMatchObject({ code: "property_not_found" });
    await expect(
      changeListingStatus(db, {
        propertyId: "nope",
        status: "unlisted",
        actorUserId: adminId,
      }),
    ).rejects.toMatchObject({ code: "property_not_found" });
  });
});

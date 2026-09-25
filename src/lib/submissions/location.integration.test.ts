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
  propertySpecifications,
  propertySubmissionFields,
  propertySubmissions,
} from "@/db/schema/catalog";
import { getPublishedPropertyBySlug } from "@/lib/properties/queries";
import { createEditSubmission } from "./edit-property";
import { publishSubmission } from "./publisher";

/**
 * The location facts (schema v15): a Google Maps link set by an admin, and what
 * is near the project, shown with the location and never among the
 * specifications.
 */

const suffix = randomUUID();
const adminId = `location-${suffix}`;
let developerId: string;
let propertyId: string;
let slug: string;
const submissionIds: string[] = [];

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

const MAP =
  "https://www.google.com/maps/place/Location+Tower/@23.0369,72.5079,17z";

beforeAll(async () => {
  await db.insert(users).values({
    id: adminId,
    name: adminId,
    email: `${adminId}@example.test`,
  });
  const [developer] = await db
    .insert(developers)
    .values({ name: `Location Developer ${suffix}` })
    .returning({ id: developers.id });
  developerId = developer.id;
});

afterAll(async () => {
  await db
    .delete(propertySpecifications)
    .where(eq(propertySpecifications.propertyId, propertyId));
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

describe("location facts on a published property", () => {
  it("publishes the map link, and reads what is nearby as lists kept out of the specifications", async () => {
    const result = await publish({
      "property.name": `Location Tower ${suffix}`,
      "property.type": "apartment",
      "property.city": "Ahmedabad",
      "property.locality": "Location Locality",
      "property.google_maps_url": MAP,
      "property.specifications.nearby_connectivity":
        "Thaltej Metro Station 1.1 Km; Airport 16.2 Km",
      "property.specifications.nearby_hospitals":
        "Apex Heart Institute 650 Mtr",
      "property.specifications.flooring": "Vitrified tiles",
    });
    propertyId = result.propertyId;
    [{ slug }] = await db
      .select({ slug: properties.slug })
      .from(properties)
      .where(eq(properties.id, propertyId));

    const dossier = (await getPublishedPropertyBySlug(db, slug))!;
    expect(dossier.location.mapUrl).toBe(MAP);
    expect(dossier.location.nearby).toEqual({
      connectivity: ["Thaltej Metro Station 1.1 Km", "Airport 16.2 Km"],
      hospitals: ["Apex Heart Institute 650 Mtr"],
      schools: [],
      plotNumber: null,
    });
    const keys = dossier.specifications.map((spec) => spec.key);
    expect(keys).toContain("flooring");
    for (const moved of [
      "nearby_connectivity",
      "nearby_hospitals",
      "nearby_schools",
      "plot_no",
    ]) {
      expect(keys).not.toContain(moved);
    }
  });

  it("changes the link in an edit, and leaves it alone when an edit does not mention it", async () => {
    const other = "https://maps.app.goo.gl/AbCdEf123";
    await publish({ "property.google_maps_url": other }, propertyId);
    expect((await getPublishedPropertyBySlug(db, slug))!.location.mapUrl).toBe(
      other,
    );
    await publish({ "property.pincode": "380015" }, propertyId);
    expect((await getPublishedPropertyBySlug(db, slug))!.location.mapUrl).toBe(
      other,
    );
  });

  it("refuses a link that is not an https Google Maps link", async () => {
    await expect(
      publish(
        { "property.google_maps_url": "https://evil.example/maps" },
        propertyId,
      ),
    ).rejects.toThrow(/Google Maps link/);
    await expect(
      publish(
        { "property.google_maps_url": "javascript:alert(1)" },
        propertyId,
      ),
    ).rejects.toThrow(/Google Maps link/);
  });
});

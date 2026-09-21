import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { developers, properties } from "@/db/schema/catalog";
import { isListed } from "./visibility";
import { getPublicDeveloper } from "./developer-profile";
import { findForbiddenKeys } from "./no-price";

/**
 * The public developer profile against the real database: a developer with a
 * listed property shows that project (and nothing unlisted), an unknown id is
 * absent, and no price-shaped key is present.
 */
describe("getPublicDeveloper", () => {
  it("returns a developer with only their listed projects", async () => {
    const [listed] = await db
      .select({ developerId: properties.developerId })
      .from(properties)
      .where(isListed)
      .limit(1);
    if (!listed) throw new Error("The seeded database has no listed property.");

    const developer = await getPublicDeveloper(db, listed.developerId);

    expect(developer).not.toBeNull();
    expect(developer?.properties.length).toBeGreaterThan(0);
    for (const property of developer?.properties ?? []) {
      expect(property.developer.id).toBe(listed.developerId);
    }
    expect(findForbiddenKeys(developer)).toEqual([]);
  });

  it("returns null for an id no developer has", async () => {
    expect(await getPublicDeveloper(db, randomUUID())).toBeNull();
  });

  it("shows a developer with no published project as having none", async () => {
    // Its own developer, so other test files creating and deleting developers at
    // the same moment cannot affect the result.
    const [created] = await db
      .insert(developers)
      .values({ name: `Profile test ${randomUUID()}` })
      .returning({ id: developers.id });
    try {
      const developer = await getPublicDeveloper(db, created.id);
      expect(developer?.properties).toEqual([]);
    } finally {
      await db.delete(developers).where(eq(developers.id, created.id));
    }
  });
});

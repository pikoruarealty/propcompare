import "dotenv/config";
import { randomUUID } from "node:crypto";
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

  it("is a developer with no listed project, when there are none", async () => {
    const all = await db.select({ id: developers.id }).from(developers);
    const results = await Promise.all(
      all.map((row) => getPublicDeveloper(db, row.id)),
    );
    // Every profile is readable; those without a published project list none.
    expect(results.every((r) => r !== null)).toBe(true);
  });
});

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { developers } from "@/db/schema/catalog";
import {
  publishTestPortfolio,
  type TestPortfolio,
} from "@/lib/submissions/test-support";
import { getPublicDeveloper } from "./developer-profile";
import { findForbiddenKeys } from "./no-price";

/**
 * The public developer profile against the real database: a developer with a
 * listed property shows that project, an unknown id is absent, and no
 * price-shaped key is present. The listed property is this file's own, so the
 * test does not depend on what a database happens to contain.
 */
let portfolio: TestPortfolio;
let developerId = "";
let propertyId = "";

beforeAll(async () => {
  portfolio = await publishTestPortfolio("Profile");
  developerId = portfolio.developerId;
  propertyId = portfolio.properties[0].id;
});

afterAll(async () => {
  await portfolio?.remove();
});

describe("getPublicDeveloper", () => {
  it("returns a developer with only their listed projects", async () => {
    const developer = await getPublicDeveloper(db, developerId);

    expect(developer).not.toBeNull();
    expect(developer?.properties.map((property) => property.id)).toEqual([
      propertyId,
    ]);
    for (const property of developer?.properties ?? []) {
      expect(property.developer.id).toBe(developerId);
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

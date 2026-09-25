import "dotenv/config";
import { inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { propertySchemaFields } from "@/db/schema/catalog";

/**
 * Two specifications were switched off in schema v18 because the regulator now
 * states the fact as a number (open area, and density from land area and units).
 * They are deactivated, not deleted, so the change can be reversed.
 */
describe("retired contract fields", () => {
  it("keeps open space and density in the table, switched off", async () => {
    const rows = await db
      .select({
        fieldKey: propertySchemaFields.fieldKey,
        isActive: propertySchemaFields.isActive,
      })
      .from(propertySchemaFields)
      .where(
        inArray(propertySchemaFields.fieldKey, [
          "property.specifications.open_space",
          "property.specifications.density_units_per_acre",
        ]),
      );

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.isActive === false)).toBe(true);
  });

  it("leaves the neighbouring specifications on", async () => {
    const [podium] = await db
      .select({ isActive: propertySchemaFields.isActive })
      .from(propertySchemaFields)
      .where(
        inArray(propertySchemaFields.fieldKey, [
          "property.specifications.podium_structure",
        ]),
      );

    expect(podium?.isActive).toBe(true);
  });
});

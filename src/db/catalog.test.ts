import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  properties,
  propertySchemaFields,
  propertySubmissionFields,
} from "./schema/catalog";
import { budgetBuckets, unitPriceHistory } from "./schema/private";

describe("the canonical data model", () => {
  it("keeps exact price columns out of the public property catalog", () => {
    expect(getTableName(properties)).toBe("properties");
    expect(getTableColumns(properties)).not.toHaveProperty("priceInr");
    expect(getTableColumns(unitPriceHistory)).toHaveProperty("priceInr");
  });

  it("uses the versioned field key as the submission-provenance contract", () => {
    expect(getTableColumns(propertySchemaFields)).toHaveProperty("fieldKey");
    expect(getTableColumns(propertySubmissionFields)).toHaveProperty(
      "fieldKey",
    );
  });

  it("keeps budget boundaries in the private schema", () => {
    expect(getTableConfig(budgetBuckets).schema).toBe("private");
  });
});

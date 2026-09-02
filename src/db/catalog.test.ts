import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  ocrExtractionJobs,
  properties,
  propertySchemaFields,
  propertySubmissionFieldEvidence,
  propertySubmissionFields,
  sourceDocuments,
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

  it("stores OCR status per attempt and field provenance as many-page evidence", () => {
    expect(getTableColumns(sourceDocuments)).not.toHaveProperty("ocrStatus");
    expect(getTableColumns(ocrExtractionJobs)).toHaveProperty(
      "routingManifest",
    );
    expect(getTableColumns(ocrExtractionJobs)).toHaveProperty("status");
    expect(getTableColumns(propertySubmissionFields)).not.toHaveProperty(
      "sourcePage",
    );
    expect(getTableColumns(propertySubmissionFieldEvidence)).toHaveProperty(
      "sourcePage",
    );
    expect(getTableColumns(propertySubmissionFieldEvidence)).toHaveProperty(
      "valuePath",
    );
  });

  it("keeps budget boundaries in the private schema", () => {
    expect(getTableConfig(budgetBuckets).schema).toBe("private");
  });
});

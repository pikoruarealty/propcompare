import { describe, expect, it } from "vitest";
import { richDossierFixture } from "./fixtures";
import { densityText, landAreaOf, landAreaText, unitsPerAcre } from "./density";
import type { PropertyDossier } from "./types";

const dossier = (
  overrides: Partial<PropertyDossier> & {
    reraLand?: string | null;
  } = {},
): PropertyDossier => {
  const { reraLand, ...rest } = overrides;
  return {
    ...richDossierFixture,
    plotAreaSqft: null,
    totalUnits: 100,
    ...rest,
    rera: {
      ...richDossierFixture.rera,
      projectLandAreaSqft: reraLand === undefined ? null : reraLand,
    },
  };
};

describe("density and land area", () => {
  it("uses the property's own plot area first", () => {
    const d = dossier({ plotAreaSqft: "87120.00", reraLand: "43560.00" });

    expect(landAreaOf(d)).toEqual({ sqft: 87120, fromRera: false });
    expect(landAreaText(landAreaOf(d)!)).toBe("87,120 sq ft (2.00 acres)");
    expect(densityText(d)).toBe("50 units per acre");
  });

  it("falls back to the regulator's land area, and says so", () => {
    const d = dossier({ reraLand: "87120.00" });

    expect(landAreaOf(d)).toEqual({ sqft: 87120, fromRera: true });
    expect(densityText(d)).toBe("50 units per acre (land area per RERA)");
  });

  it("is not stated when either input is missing", () => {
    expect(densityText(dossier({ reraLand: null }))).toBeNull();
    expect(
      densityText(dossier({ reraLand: "87120.00", totalUnits: null })),
    ).toBeNull();
    expect(
      unitsPerAcre(dossier({ reraLand: "0", totalUnits: 100 })),
    ).toBeNull();
  });

  it("rounds to one decimal", () => {
    // Kimana: 76 units on 82,107.11 sq ft is 40.3 to the acre.
    expect(densityText(dossier({ reraLand: "82107.11", totalUnits: 76 }))).toBe(
      "40.3 units per acre (land area per RERA)",
    );
  });
});

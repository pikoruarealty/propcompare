import { describe, expect, it } from "vitest";
import type {
  DossierAmenity,
  DossierUnitVariant,
  PropertyDossier,
} from "@/lib/properties/types";
import { richDossierFixture } from "@/lib/properties/fixtures";
import { buildComparison } from "./model";

/**
 * The comparison rows worked out from stated inputs (`docs/tasklists/
 * 2026-09-23-comparison-derived-metrics.md`): land area, density, units per
 * floor, efficiency, balcony share, the developer's completed projects, and the
 * category headings over amenities and specifications. The rule they share: a
 * missing input reads "not stated", never a smaller or wrong number.
 */

let counter = 0;

const variant = (
  name: string,
  bhk: string | null,
  carpet: number | null,
  extra: Partial<DossierUnitVariant> = {},
): DossierUnitVariant => ({
  id: `derived-variant-${(counter += 1)}`,
  variantName: name,
  bhkType: bhk
    ? { key: bhk, label: bhk.toUpperCase().replace("BHK", " BHK") }
    : null,
  layoutType: null,
  unitsPerFloor: null,
  totalUnitsOfVariant: null,
  dimensions: null,
  areas: carpet === null ? [] : [{ basis: "carpet", areaSqft: String(carpet) }],
  amenities: [],
  ...extra,
});

const property = (
  slug: string,
  overrides: Partial<PropertyDossier> = {},
): PropertyDossier => ({
  ...richDossierFixture,
  id: `id-${slug}`,
  slug,
  name: `Tower ${slug.toUpperCase()}`,
  developer: {
    ...richDossierFixture.developer,
    name: `Dev ${slug}`,
    completedProjectsCount: 0,
  },
  possession: {
    status: "under_construction",
    possessionDate: "2028-06-30",
    launchDate: null,
  },
  rera: {
    ...richDossierFixture.rera,
    registered: true,
    registrationNumber: `PR/${slug}`,
    lastCheckedAt: null,
    sourcedFacts: [],
    constructionProgressPercent: null,
    projectLandAreaSqft: null,
  },
  totalTowers: null,
  totalUnits: null,
  plotAreaSqft: null,
  unitVariants: [variant("3 BHK", "3bhk", 1200)],
  amenities: [],
  specifications: [],
  media: [],
  ...overrides,
});

const rowOf = (model: ReturnType<typeof buildComparison>, key: string) =>
  model.groups.flatMap((group) => group.rows).find((row) => row.key === key);

const withAreas = (carpet: number | null, superBuiltUp: number | null) =>
  property("x", {
    unitVariants: [
      {
        ...variant("Type", "3bhk", carpet),
        areas: [
          ...(carpet === null
            ? []
            : [{ basis: "carpet" as const, areaSqft: String(carpet) }]),
          ...(superBuiltUp === null
            ? []
            : [
                {
                  basis: "super_built_up" as const,
                  areaSqft: String(superBuiltUp),
                },
              ]),
        ],
      },
    ],
  });

describe("land area and units per acre", () => {
  it("states the plot area in square feet and acres, and works out units per acre", () => {
    const model = buildComparison([
      property("a", { plotAreaSqft: "130680.00", totalUnits: 90 }),
      property("b", { plotAreaSqft: "87120.00", totalUnits: 120 }),
    ]);

    expect(rowOf(model, "land_area")?.cells.map((c) => c.text)).toEqual([
      "130,680 sq ft (3.00 acres)",
      "87,120 sq ft (2.00 acres)",
    ]);
    expect(rowOf(model, "units_per_acre")?.cells.map((c) => c.text)).toEqual([
      "30 units per acre",
      "60 units per acre",
    ]);
    expect(rowOf(model, "units_per_acre")?.status).toBe("differs");
  });

  it("falls back to RERA's registered land area, and says so", () => {
    const a = property("a", { totalUnits: 100 });
    a.rera.projectLandAreaSqft = "87120.00";
    const b = property("b", { plotAreaSqft: "87120.00", totalUnits: 100 });

    const model = buildComparison([a, b]);

    expect(rowOf(model, "land_area")?.cells.map((c) => c.text)).toEqual([
      "87,120 sq ft (2.00 acres), per RERA",
      "87,120 sq ft (2.00 acres)",
    ]);
    expect(rowOf(model, "units_per_acre")?.cells.map((c) => c.text)).toEqual([
      "50 units per acre (land area per RERA)",
      "50 units per acre",
    ]);
  });

  it("prefers the property's own plot area over RERA's", () => {
    const a = property("a", { plotAreaSqft: "130680.00", totalUnits: 30 });
    a.rera.projectLandAreaSqft = "87120.00";

    const row = rowOf(buildComparison([a, property("b")]), "land_area");

    expect(row?.cells[0].text).toBe("130,680 sq ft (3.00 acres)");
  });

  it("says not stated, never a wrong number, when the land area or the unit count is missing", () => {
    const noLand = property("a", { totalUnits: 100 });
    const noUnits = property("b", { plotAreaSqft: "87120.00" });
    const full = property("c", { plotAreaSqft: "87120.00", totalUnits: 100 });

    const model = buildComparison([noLand, noUnits, full]);

    expect(rowOf(model, "units_per_acre")?.cells.map((c) => c.state)).toEqual([
      "not_stated",
      "not_stated",
      "value",
    ]);
    expect(rowOf(model, "units_per_acre")?.status).toBe("gap");
    expect(rowOf(model, "land_area")?.cells.map((c) => c.state)).toEqual([
      "not_stated",
      "value",
      "value",
    ]);
  });

  it("shows neither row when nobody states the inputs", () => {
    const model = buildComparison([property("a"), property("b")]);

    expect(rowOf(model, "land_area")).toBeUndefined();
    expect(rowOf(model, "units_per_acre")).toBeUndefined();
  });
});

describe("efficiency", () => {
  it("is carpet as a share of super built-up area, to one decimal", () => {
    const model = buildComparison([
      withAreas(1000, 1250),
      withAreas(900, 1200),
    ]);

    expect(rowOf(model, "efficiency")?.cells.map((c) => c.text)).toEqual([
      "80%",
      "75%",
    ]);
  });

  it("needs both areas, and refuses a carpet larger than super built-up", () => {
    const model = buildComparison([
      withAreas(1000, 1250),
      withAreas(1000, null),
      withAreas(1300, 1250),
    ]);

    expect(rowOf(model, "efficiency")?.cells.map((c) => c.state)).toEqual([
      "value",
      "not_stated",
      "not_stated",
    ]);
  });

  it("is not shown when no unit type states super built-up area", () => {
    const model = buildComparison([
      withAreas(1000, null),
      withAreas(900, null),
    ]);

    expect(rowOf(model, "efficiency")).toBeUndefined();
  });
});

describe("balcony share of carpet area", () => {
  const withBalconies = (
    carpet: number | null,
    rooms: Record<string, unknown>[],
  ) =>
    property("x", {
      unitVariants: [
        { ...variant("Type", "3bhk", carpet), dimensions: { rooms } },
      ],
    });

  it("adds up the balcony rooms, using a printed area over the two sides, and divides by carpet", () => {
    const model = buildComparison([
      withBalconies(1000, [
        { name: "Balcony 1", lengthFt: 10, widthFt: 5 },
        { name: "Terrace", lengthFt: 10, widthFt: 10, areaSqft: 60 },
        { name: "Living", lengthFt: 20, widthFt: 15 },
      ]),
      withBalconies(1000, [{ name: "Balcony", lengthFt: 10, widthFt: 10 }]),
    ]);

    // 50 + 60 = 110 of 1000, and 100 of 1000.
    expect(rowOf(model, "balcony_ratio")?.cells.map((c) => c.text)).toEqual([
      "11%",
      "10%",
    ]);
  });

  it("says not stated when there is no balcony room or no carpet area", () => {
    const model = buildComparison([
      withBalconies(1000, [{ name: "Living", lengthFt: 20, widthFt: 15 }]),
      withBalconies(null, [{ name: "Balcony", lengthFt: 10, widthFt: 10 }]),
      withBalconies(1000, [{ name: "Balcony", lengthFt: 10, widthFt: 10 }]),
    ]);

    expect(rowOf(model, "balcony_ratio")?.cells.map((c) => c.state)).toEqual([
      "not_stated",
      "not_stated",
      "value",
    ]);
  });
});

describe("units per floor", () => {
  it("is the chosen unit type's own stated value, never a sum across unit types", () => {
    const a = property("a", {
      unitVariants: [
        variant("Typical", "3bhk", 1200, { unitsPerFloor: 2 }),
        variant("Third floor", "3bhk", 1200, { unitsPerFloor: 2 }),
      ],
    });
    const b = property("b", {
      unitVariants: [variant("Typical", "3bhk", 1200, { unitsPerFloor: 4 })],
    });

    const row = rowOf(buildComparison([a, b]), "units_per_floor");

    expect(row?.cells.map((c) => c.text)).toEqual(["2", "4"]);
  });

  it("says not stated when the unit type states none", () => {
    const row = rowOf(
      buildComparison([
        property("a", {
          unitVariants: [variant("T", "3bhk", 1200, { unitsPerFloor: 2 })],
        }),
        property("b", { unitVariants: [variant("T", "3bhk", 1200)] }),
      ]),
      "units_per_floor",
    );

    expect(row?.cells.map((c) => c.state)).toEqual(["value", "not_stated"]);
  });
});

describe("units per floor for the whole floor", () => {
  it("is worked out from units, towers and floors, apart from a unit type's own count", () => {
    const a = property("a", {
      totalUnits: 580,
      totalTowers: 5,
      totalFloors: 31,
      unitVariants: [variant("Typical", "3bhk", 1200, { unitsPerFloor: 2 })],
    });
    const b = property("b", {
      totalUnits: 76,
      totalTowers: null,
      totalFloors: null,
      unitVariants: [variant("Typical", "3bhk", 1200, { unitsPerFloor: 2 })],
    });
    const model = buildComparison([a, b]);

    const whole = rowOf(model, "floor_units");
    expect(whole?.label).toBe("Units per floor (calculated)");
    expect(whole?.cells.map((c) => c.text)).toEqual(["about 3.7", null]);
    expect(whole?.cells.map((c) => c.state)).toEqual(["value", "not_stated"]);

    // The unit type's own stated count is a different row, and says so.
    const own = rowOf(model, "units_per_floor");
    expect(own?.label).toBe("This unit type's units per floor");
    expect(own?.cells.map((c) => c.text)).toEqual(["2", "2"]);
  });

  it("has no row when no property has the three inputs", () => {
    const model = buildComparison([
      property("a", { totalUnits: 10, totalTowers: null, totalFloors: 5 }),
      property("b", { totalUnits: null, totalTowers: 1, totalFloors: 5 }),
    ]);
    expect(rowOf(model, "floor_units")).toBeUndefined();
  });
});

describe("the developer's completed projects", () => {
  it("shows the count listed here, including none, and says it is only those listed", () => {
    const a = property("a");
    const b = property("b");
    a.developer.completedProjectsCount = 3;
    b.developer.completedProjectsCount = 0;

    const row = rowOf(buildComparison([a, b]), "developer_completed");

    expect(row?.label).toMatch(/listed here/);
    expect(row?.cells.map((c) => c.text)).toEqual(["3", "0"]);
  });
});

describe("the new rows", () => {
  it("carry no price, score or ranking word", () => {
    const model = buildComparison([
      property("a", { plotAreaSqft: "130680.00", totalUnits: 90 }),
      property("b", { plotAreaSqft: "87120.00", totalUnits: 120 }),
    ]);
    const words = [
      "land_area",
      "units_per_acre",
      "units_per_floor",
      "efficiency",
      "balcony_ratio",
      "developer_completed",
    ].flatMap((key) => {
      const row = rowOf(model, key);
      return row ? [row.label, ...row.cells.map((c) => c.text ?? "")] : [];
    });

    expect(words.length).toBeGreaterThan(0);
    expect(words.join(" ")).not.toMatch(/price|score|rank|best|worst|winner/i);
  });
});

describe("amenity and specification categories", () => {
  const amenityIn = (
    key: string,
    category: string,
    status: DossierAmenity["status"] = "available",
  ): DossierAmenity => ({ key, label: key, category, status });

  it("carry their catalog category, sorted so a category's rows sit together, hiding none", () => {
    const a = property("a", {
      amenities: [
        amenityIn("gym", "lifestyle"),
        amenityIn("cctv", "safety"),
        amenityIn("pool", "lifestyle"),
        amenityIn("lift", "safety", "explicitly_not_offered"),
      ],
    });
    const b = property("b", { amenities: [amenityIn("gym", "lifestyle")] });

    const group = buildComparison([a, b]).groups.find(
      (g) => g.key === "amenities",
    );

    expect(group?.rows.map((r) => [r.category, r.label])).toEqual([
      ["lifestyle", "gym"],
      ["lifestyle", "pool"],
      ["safety", "cctv"],
      ["safety", "lift"],
    ]);
  });

  it("puts the same category on specification rows", () => {
    const spec = (key: string, category: string) => ({
      key,
      label: key,
      category,
      valueText: "yes",
      status: "available" as const,
    });
    const a = property("a", {
      specifications: [spec("flooring", "finish_quality")],
    });
    const b = property("b", {
      specifications: [spec("flooring", "finish_quality")],
    });

    const group = buildComparison([a, b]).groups.find(
      (g) => g.key === "specifications",
    );

    expect(group?.rows[0].category).toBe("finish_quality");
  });
});
